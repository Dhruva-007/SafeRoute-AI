"""
JSON-file-based trip persistence.
Each saved trip is stored as a separate file in backend/data/trips/.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

TRIPS_DIR = Path(__file__).resolve().parent.parent / "data" / "trips"


def _ensure_trips_dir() -> None:
    TRIPS_DIR.mkdir(parents=True, exist_ok=True)


class SavedTrip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z"
    )
    user_id: str | None = None
    destination: str
    start_date: str
    end_date: str
    number_of_travelers: int
    budget_level: str
    interests: list[str]
    summary: str = ""
    estimated_budget: str = ""
    duration_days: int = 0
    days: list[dict] = Field(default_factory=list)
    status: str = "planned"

    share_token: str | None = None
    share_expires_at: str | None = None
    share_created_at: str | None = None


class TripStore:
    def __init__(self) -> None:
        _ensure_trips_dir()
        logger.info("TripStore initialised | dir=%s", TRIPS_DIR)

    def save(self, trip: SavedTrip) -> SavedTrip:
        _ensure_trips_dir()
        filepath = TRIPS_DIR / f"{trip.id}.json"
        with filepath.open("w", encoding="utf-8") as f:
            f.write(trip.model_dump_json(indent=2))
        logger.info("Trip saved | id=%s | destination=%s", trip.id, trip.destination)
        return trip

    def get(self, trip_id: str) -> SavedTrip | None:
        filepath = TRIPS_DIR / f"{trip_id}.json"
        if not filepath.exists():
            return None
        with filepath.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return SavedTrip(**data)

    def list_all(self, user_id: str | None = None) -> list[SavedTrip]:
        _ensure_trips_dir()
        trips: list[SavedTrip] = []
        for filepath in sorted(
            TRIPS_DIR.glob("*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ):
            try:
                with filepath.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                trip = SavedTrip(**data)
                if user_id is not None and trip.user_id != user_id:
                    continue
                trips.append(trip)
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning("Skipping corrupt trip file %s: %s", filepath, exc)
        return trips

    def delete(self, trip_id: str) -> bool:
        filepath = TRIPS_DIR / f"{trip_id}.json"
        if filepath.exists():
            filepath.unlink()
            logger.info("Trip deleted | id=%s", trip_id)
            return True
        return False

    def delete_all_for_user(self, user_id: str) -> int:
        """Delete every trip owned by the given user. Returns count deleted."""
        _ensure_trips_dir()
        count = 0
        for filepath in TRIPS_DIR.glob("*.json"):
            try:
                with filepath.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("user_id") == user_id:
                    filepath.unlink()
                    count += 1
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to process trip file %s: %s", filepath, exc)
        logger.info("Deleted %d trips for user_id=%s", count, user_id)
        return count

    def update_status(self, trip_id: str, status: str) -> SavedTrip | None:
        trip = self.get(trip_id)
        if trip is None:
            return None
        trip.status = status
        return self.save(trip)

    def find_by_share_token(self, token: str) -> SavedTrip | None:
        if not token or not token.strip():
            return None
        for trip in self.list_all():
            if trip.share_token == token:
                if trip.share_expires_at:
                    try:
                        expires = datetime.fromisoformat(
                            trip.share_expires_at.replace("Z", "+00:00")
                        )
                        if datetime.now(expires.tzinfo) > expires:
                            return None
                    except (ValueError, AttributeError):
                        pass
                return trip
        return None

    def revoke_share(self, trip_id: str) -> SavedTrip | None:
        trip = self.get(trip_id)
        if trip is None:
            return None
        trip.share_token = None
        trip.share_expires_at = None
        trip.share_created_at = None
        return self.save(trip)


_trip_store: TripStore | None = None


def get_trip_store() -> TripStore:
    global _trip_store
    if _trip_store is None:
        _trip_store = TripStore()
    return _trip_store