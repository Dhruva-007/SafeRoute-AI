"""
Trip editor service.

Handles the business logic for editing individual activities,
regenerating single days, swapping activities, and reordering.
Keeps fatigue + weather data consistent after every change.
"""

from __future__ import annotations

import logging
from typing import Any

from models.trip_storage import SavedTrip, get_trip_store
from services.fatigue import get_fatigue_service

logger = logging.getLogger(__name__)


class EditorService:
    """
    Coordinated edits to a saved trip's day/activity structure.
    All public methods reload the trip, mutate, re-score fatigue,
    and persist atomically.
    """

    def __init__(self) -> None:
        self._store = get_trip_store()
        self._fatigue = get_fatigue_service()
        logger.info("EditorService initialised")

    # ------------------------------------------------------------------
    # Activity-level edits
    # ------------------------------------------------------------------

    def update_activity(
        self,
        trip_id: str,
        day_number: int,
        activity_index: int,
        updates: dict[str, Any],
    ) -> SavedTrip:
        """
        Update a single activity's fields (time, place, description, cost).
        Re-scores fatigue for the affected day.
        """
        trip = self._load_or_404(trip_id)
        day_obj = self._find_day(trip, day_number)
        activities = day_obj.get("activities", [])

        if activity_index < 0 or activity_index >= len(activities):
            raise IndexError(
                f"activity_index {activity_index} out of range"
            )

        # Whitelist editable fields only
        editable = {"time", "place", "description", "estimated_cost"}
        for k, v in updates.items():
            if k in editable and v is not None:
                activities[activity_index][k] = str(v)

        self._rescore_day(day_obj)
        return self._store.save(trip)

    def add_activity(
        self,
        trip_id: str,
        day_number: int,
        activity: dict[str, Any],
        position: int | None = None,
    ) -> SavedTrip:
        """
        Insert a new activity into a day at the given position
        (or append if position is None).
        """
        trip = self._load_or_404(trip_id)
        day_obj = self._find_day(trip, day_number)
        activities = day_obj.setdefault("activities", [])

        new_activity = {
            "time": str(activity.get("time", "TBD")),
            "place": str(activity.get("place", "Unknown")),
            "description": str(activity.get("description", "")),
            "estimated_cost": str(activity.get("estimated_cost", "₹0")),
            "fatigue_score": 0,
            "fatigue_level": "LOW",
        }

        if position is None or position > len(activities):
            activities.append(new_activity)
        else:
            activities.insert(max(0, position), new_activity)

        self._rescore_day(day_obj)
        return self._store.save(trip)

    def delete_activity(
        self,
        trip_id: str,
        day_number: int,
        activity_index: int,
    ) -> SavedTrip:
        """Remove an activity from a day."""
        trip = self._load_or_404(trip_id)
        day_obj = self._find_day(trip, day_number)
        activities = day_obj.get("activities", [])

        if activity_index < 0 or activity_index >= len(activities):
            raise IndexError(
                f"activity_index {activity_index} out of range"
            )

        if len(activities) <= 1:
            raise ValueError(
                "Cannot delete the last activity of a day. "
                "Delete the day or regenerate instead."
            )

        activities.pop(activity_index)
        self._rescore_day(day_obj)
        return self._store.save(trip)

    def reorder_day(
        self,
        trip_id: str,
        day_number: int,
        new_order: list[int],
    ) -> SavedTrip:
        """
        Reorder activities within a day.
        new_order is a permutation of the current activity indices.
        """
        trip = self._load_or_404(trip_id)
        day_obj = self._find_day(trip, day_number)
        activities = day_obj.get("activities", [])

        if sorted(new_order) != list(range(len(activities))):
            raise ValueError(
                "new_order must be a valid permutation of "
                f"0..{len(activities) - 1}"
            )

        day_obj["activities"] = [activities[i] for i in new_order]
        self._rescore_day(day_obj)
        return self._store.save(trip)

    # ------------------------------------------------------------------
    # Day-level edits
    # ------------------------------------------------------------------

    def replace_day(
        self,
        trip_id: str,
        day_number: int,
        new_activities: list[dict[str, Any]],
    ) -> SavedTrip:
        """
        Replace all activities of a day.
        Used after AI regeneration of a single day.
        """
        trip = self._load_or_404(trip_id)
        day_obj = self._find_day(trip, day_number)

        cleaned = []
        for act in new_activities:
            cleaned.append({
                "time": str(act.get("time", "TBD")),
                "place": str(act.get("place", "Unknown")),
                "description": str(act.get("description", "")),
                "estimated_cost": str(act.get("estimated_cost", "₹0")),
                "fatigue_score": 0,
                "fatigue_level": "LOW",
            })

        day_obj["activities"] = cleaned
        self._rescore_day(day_obj)
        return self._store.save(trip)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_or_404(self, trip_id: str) -> SavedTrip:
        trip = self._store.get(trip_id)
        if trip is None:
            raise LookupError(f"Trip {trip_id} not found")
        return trip

    def _find_day(self, trip: SavedTrip, day_number: int) -> dict:
        for d in trip.days:
            if d.get("day") == day_number:
                return d
        raise LookupError(
            f"Day {day_number} not found in trip {trip.id}"
        )

    def _rescore_day(self, day_obj: dict) -> None:
        """Recompute fatigue for one day in place."""
        day_weather = day_obj.get("weather")
        weather_by_date = (
            {day_obj.get("date"): day_weather} if day_weather else {}
        )

        rescored = self._fatigue.score_itinerary(
            [day_obj],
            weather_by_date=weather_by_date,
        )
        if rescored:
            day_obj["activities"] = rescored[0]["activities"]
            day_obj["day_fatigue_average"] = rescored[0].get(
                "day_fatigue_average", 0
            )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_editor_service: EditorService | None = None


def get_editor_service() -> EditorService:
    global _editor_service
    if _editor_service is None:
        _editor_service = EditorService()
    return _editor_service