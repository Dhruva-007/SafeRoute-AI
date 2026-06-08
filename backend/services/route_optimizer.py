"""
Route Optimizer for SafeRoute AI.

Given a list of BuiltActivity objects for a single day,
reorders them to minimize total travel distance using a
Nearest Neighbor heuristic with Haversine distance.

Also assigns suggested visit times based on activity durations
and travel buffers.

This runs AFTER DayBuilder and BEFORE the LLM description generator.
The LLM receives pre-ordered activities with suggested times.

Algorithm:
  1. Select the best "morning anchor" place to start the day
  2. Use Nearest Neighbor to build the route:
     - From current location, pick the geographically closest unvisited place
  3. Assign time slots starting at 9:00 AM:
     - Each slot = activity duration + TRAVEL_BUFFER_MINUTES between places
  4. Return RouteOptimizedDay with ordered activities and time slots
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from services.day_builder import BuiltActivity, BuiltDay

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Default day start time (24h format)
DAY_START_HOUR   = 9
DAY_START_MINUTE = 0

# Travel buffer between activities (minutes)
# Accounts for: walking to transport, travel time, entry queue
TRAVEL_BUFFER_MINUTES = 30

# Lunch break buffer (minutes) — added when a food place is encountered
LUNCH_BUFFER_MINUTES = 0  # food duration already includes eating time

# Late-afternoon threshold: activities starting after this hour
# get a "best in morning" note if their best_time says morning
AFTERNOON_HOUR = 14

# Morning preference score bonuses for anchor selection
MORNING_ANCHOR_BONUSES = {
    "outdoor_dry":    10,   # outdoor places are better in the morning
    "any":             5,
    "indoor":          0,   # indoor places are fine any time
    "avoid_extreme_heat": 15,  # must go early to avoid afternoon heat
}

WALKING_ORDER_PREFERENCE = {
    "low":      0,    # low walk places are fine any time
    "moderate": 5,    # moderate walk better earlier
    "high":     10,   # high walk must be morning (before heat)
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RouteOptimizedDay:
    """
    A single day with activities reordered for minimum travel distance
    and annotated with suggested visit times.
    """
    day_number:         int
    primary_zone_id:    str
    primary_zone_name:  str
    activities:         list[BuiltActivity]
    total_distance_km:  float       # estimated total travel distance
    total_duration_h:   float       # total activity + travel time
    route_notes:        list[str]   # human-readable route notes
    borrowed_from_zones: list[str]  = field(default_factory=list)

    @property
    def activity_count(self) -> int:
        return len(self.activities)

    @property
    def place_names(self) -> list[str]:
        return [a.name for a in self.activities]

    @property
    def start_time(self) -> str:
        if self.activities:
            return self.activities[0].suggested_start_time
        return "09:00 AM"

    @property
    def end_time(self) -> str:
        if self.activities:
            return self.activities[-1].suggested_end_time
        return "06:00 PM"

    def to_dict(self) -> dict:
        return {
            "day_number":         self.day_number,
            "primary_zone_id":    self.primary_zone_id,
            "primary_zone_name":  self.primary_zone_name,
            "activities":         [a.to_dict() for a in self.activities],
            "total_distance_km":  round(self.total_distance_km, 2),
            "total_duration_h":   round(self.total_duration_h, 2),
            "route_notes":        self.route_notes,
            "borrowed_from_zones": self.borrowed_from_zones,
            "start_time":         self.start_time,
            "end_time":           self.end_time,
            "activity_count":     self.activity_count,
        }

    def __repr__(self) -> str:
        return (
            f"RouteOptimizedDay(day={self.day_number}, "
            f"zone={self.primary_zone_id}, "
            f"activities={self.activity_count}, "
            f"distance={self.total_distance_km:.1f}km)"
        )


# ---------------------------------------------------------------------------
# Route Optimizer
# ---------------------------------------------------------------------------

class RouteOptimizer:
    """
    Optimizes the visit order within a single day using Nearest Neighbor.

    Designed for small sets (3-5 activities) where Nearest Neighbor
    produces near-optimal solutions without the complexity of TSP solvers.

    Also handles time slot assignment and route note generation.
    """

    def __init__(self) -> None:
        logger.info("RouteOptimizer initialised")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def optimize_day(self, built_day: BuiltDay) -> RouteOptimizedDay:
        """
        Optimize the route for a single BuiltDay.

        Args:
            built_day: A BuiltDay from DayBuilder with unordered activities.

        Returns:
            RouteOptimizedDay with activities in optimal visit order
            and suggested start/end times assigned.
        """
        activities = built_day.activities

        if not activities:
            return RouteOptimizedDay(
                day_number=built_day.day_number,
                primary_zone_id=built_day.primary_zone_id,
                primary_zone_name=built_day.primary_zone_name,
                activities=[],
                total_distance_km=0.0,
                total_duration_h=0.0,
                route_notes=["No activities planned for this day."],
                borrowed_from_zones=built_day.borrowed_from_zones,
            )

        if len(activities) == 1:
            # Single activity — just assign time slot
            optimized = list(activities)
            self._assign_time_slots(optimized)
            return RouteOptimizedDay(
                day_number=built_day.day_number,
                primary_zone_id=built_day.primary_zone_id,
                primary_zone_name=built_day.primary_zone_name,
                activities=optimized,
                total_distance_km=0.0,
                total_duration_h=optimized[0].duration_hours,
                route_notes=["Single activity day."],
                borrowed_from_zones=built_day.borrowed_from_zones,
            )

        # Step 1: Select morning anchor (starting point)
        anchor_idx = self._select_morning_anchor(activities)

        # Step 2: Nearest neighbor route from anchor
        ordered = self._nearest_neighbor_route(activities, anchor_idx)

        # Step 3: Assign time slots
        self._assign_time_slots(ordered)

        # Step 4: Calculate total route distance
        total_distance = self._calculate_route_distance(ordered)

        # Step 5: Generate route notes
        route_notes = self._generate_route_notes(
            ordered, built_day.primary_zone_id
        )

        # Step 6: Set visit_order on activities
        for i, activity in enumerate(ordered):
            activity.visit_order = i + 1

        optimized_day = RouteOptimizedDay(
            day_number=built_day.day_number,
            primary_zone_id=built_day.primary_zone_id,
            primary_zone_name=built_day.primary_zone_name,
            activities=ordered,
            total_distance_km=total_distance,
            total_duration_h=self._calculate_total_duration(ordered),
            route_notes=route_notes,
            borrowed_from_zones=built_day.borrowed_from_zones,
        )

        logger.info(
            "Route optimized | day=%d | zone=%s | activities=%d | "
            "distance=%.1fkm | start=%s | end=%s",
            optimized_day.day_number,
            optimized_day.primary_zone_id,
            optimized_day.activity_count,
            optimized_day.total_distance_km,
            optimized_day.start_time,
            optimized_day.end_time,
        )

        return optimized_day

    def optimize_itinerary(
        self, built_days: list[BuiltDay]
    ) -> list[RouteOptimizedDay]:
        """
        Optimize routes for all days in an itinerary.

        Args:
            built_days: List of BuiltDay objects from DayBuilder.

        Returns:
            List of RouteOptimizedDay objects, one per day.
        """
        optimized_days = []

        for built_day in built_days:
            optimized = self.optimize_day(built_day)
            optimized_days.append(optimized)

        logger.info(
            "Itinerary route optimization complete | days=%d | "
            "total_activities=%d | total_distance=%.1fkm",
            len(optimized_days),
            sum(d.activity_count for d in optimized_days),
            sum(d.total_distance_km for d in optimized_days),
        )

        return optimized_days

    # ------------------------------------------------------------------
    # Step 1: Morning anchor selection
    # ------------------------------------------------------------------

    def _select_morning_anchor(
        self, activities: list[BuiltActivity]
    ) -> int:
        """
        Select the best activity to start the day.

        Morning anchor selection criteria (highest score wins):
        1. High walking intensity → must go early before heat
        2. Outdoor weather preference → better in cooler morning
        3. Must-visit status
        4. Recommendation score
        5. Avoid making food/restaurant the first activity

        Returns the index of the best anchor in the activities list.
        """
        best_idx   = 0
        best_score = float("-inf")

        for i, act in enumerate(activities):
            anchor_score = 0.0

            # Avoid starting with food
            if act.is_food:
                anchor_score -= 50.0
                continue

            # Prefer high walking intensity early (before heat)
            walk_bonus = WALKING_ORDER_PREFERENCE.get(
                act.walking_intensity, 0
            )
            anchor_score += walk_bonus

            # Prefer outdoor places in the morning
            weather_bonus = MORNING_ANCHOR_BONUSES.get(
                act.weather_preference, 0
            )
            anchor_score += weather_bonus

            # Must-visit preference
            if act.must_visit:
                anchor_score += 20.0

            # Recommendation score (normalized)
            anchor_score += act.score * 0.01

            # Prefer S-tier
            if act.recommendation_tier == "S":
                anchor_score += 15.0
            elif act.recommendation_tier == "A":
                anchor_score += 8.0

            if anchor_score > best_score:
                best_score = anchor_score
                best_idx   = i

        logger.debug(
            "Morning anchor selected: %s (index=%d)",
            activities[best_idx].name,
            best_idx,
        )
        return best_idx

    # ------------------------------------------------------------------
    # Step 2: Nearest Neighbor route building
    # ------------------------------------------------------------------

    def _nearest_neighbor_route(
        self,
        activities: list[BuiltActivity],
        start_idx: int,
    ) -> list[BuiltActivity]:
        """
        Build route using Nearest Neighbor heuristic.

        Starting from start_idx, at each step picks the geographically
        closest unvisited activity.

        Time complexity: O(n²) — acceptable for n ≤ 5.

        Returns ordered list of activities.
        """
        remaining = list(activities)
        ordered:   list[BuiltActivity] = []

        # Start with the anchor
        current = remaining.pop(start_idx)
        ordered.append(current)

        while remaining:
            # Find closest unvisited activity
            best_dist  = float("inf")
            best_idx   = 0

            for i, candidate in enumerate(remaining):
                dist = haversine_km(
                    current.lat, current.lon,
                    candidate.lat, candidate.lon,
                )
                if dist < best_dist:
                    best_dist = dist
                    best_idx  = i

            current = remaining.pop(best_idx)
            ordered.append(current)

            logger.debug(
                "  → %s (%.2f km from previous)",
                current.name,
                best_dist,
            )

        return ordered

    # ------------------------------------------------------------------
    # Step 3: Time slot assignment
    # ------------------------------------------------------------------

    def _assign_time_slots(
        self, ordered: list[BuiltActivity]
    ) -> None:
        """
        Assign suggested start and end times to each activity.

        Schedule:
          - Day starts at DAY_START_HOUR:DAY_START_MINUTE (9:00 AM)
          - Each activity occupies its duration_hours
          - TRAVEL_BUFFER_MINUTES added between each activity

        Times are stored as strings on each BuiltActivity:
          suggested_start_time: "09:00 AM"
          suggested_end_time:   "11:30 AM"
        """
        current_time = datetime(2000, 1, 1, DAY_START_HOUR, DAY_START_MINUTE)

        for i, activity in enumerate(ordered):
            start = current_time
            end   = start + timedelta(hours=activity.duration_hours)

            activity.suggested_start_time = self._fmt_time(start)
            activity.suggested_end_time   = self._fmt_time(end)

            # Advance clock: activity duration + travel buffer
            if i < len(ordered) - 1:
                current_time = end + timedelta(
                    minutes=TRAVEL_BUFFER_MINUTES
                )
            else:
                current_time = end

    def _fmt_time(self, dt: datetime) -> str:
        """Format datetime to '09:00 AM' style."""
        return dt.strftime("%I:%M %p").lstrip("0")

    # ------------------------------------------------------------------
    # Step 4: Distance calculation
    # ------------------------------------------------------------------

    def _calculate_route_distance(
        self, ordered: list[BuiltActivity]
    ) -> float:
        """
        Calculate total Haversine distance of the ordered route in km.
        """
        total = 0.0
        for i in range(len(ordered) - 1):
            a = ordered[i]
            b = ordered[i + 1]
            total += haversine_km(a.lat, a.lon, b.lat, b.lon)
        return total

    def _calculate_total_duration(
        self, ordered: list[BuiltActivity]
    ) -> float:
        """
        Calculate total day duration including travel buffers.
        """
        activity_time = sum(a.duration_hours for a in ordered)
        travel_time   = (
            (len(ordered) - 1) * TRAVEL_BUFFER_MINUTES / 60.0
        )
        return activity_time + travel_time

    # ------------------------------------------------------------------
    # Step 5: Route notes
    # ------------------------------------------------------------------

    def _generate_route_notes(
        self,
        ordered: list[BuiltActivity],
        zone_id: str,
    ) -> list[str]:
        """
        Generate human-readable route notes for the day.
        These help the LLM write better day summaries.
        """
        notes: list[str] = []

        if not ordered:
            return notes

        # Note the starting area
        first = ordered[0]
        notes.append(
            f"Start at {first.neighborhood} with {first.name}."
        )

        # Note high walking intensity activities
        high_walk = [a for a in ordered if a.walking_intensity == "high"]
        if high_walk:
            names = ", ".join(a.name for a in high_walk)
            notes.append(
                f"Wear comfortable footwear — {names} involves "
                f"significant walking."
            )

        # Note outdoor activities that are weather-sensitive
        outdoor_sensitive = [
            a for a in ordered
            if a.weather_preference == "outdoor_dry"
        ]
        if outdoor_sensitive:
            names = ", ".join(a.name for a in outdoor_sensitive)
            notes.append(
                f"{names} — best visited in dry weather. "
                f"Check forecast before visiting."
            )

        # Note food places and their positions
        food_places = [a for a in ordered if a.is_food]
        for food in food_places:
            notes.append(
                f"{food.name} — scheduled at {food.suggested_start_time} "
                f"for a meal break."
            )

        # Note total estimated distance
        dist = self._calculate_route_distance(ordered)
        notes.append(
            f"Total travel distance within zone: approximately {dist:.1f} km."
        )

        # Note if day ends late
        last = ordered[-1]
        notes.append(
            f"Day ends at approximately {last.suggested_end_time}."
        )

        return notes


# ---------------------------------------------------------------------------
# Haversine distance helper
# ---------------------------------------------------------------------------

def haversine_km(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> float:
    """
    Calculate great-circle distance between two coordinates in km.
    """
    R    = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a    = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_route_optimizer: RouteOptimizer | None = None


def get_route_optimizer() -> RouteOptimizer:
    """Returns singleton RouteOptimizer."""
    global _route_optimizer
    if _route_optimizer is None:
        _route_optimizer = RouteOptimizer()
    return _route_optimizer