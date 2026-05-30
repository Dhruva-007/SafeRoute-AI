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
    status: str = "planned"  # planned | active | completed


class TripStore:
    """File-based CRUD for SavedTrip records."""

    def __init__(self) -> None:
        _ensure_trips_dir()
        logger.info("TripStore initialised | dir=%s", TRIPS_DIR)

    def save(self, trip: SavedTrip) -> SavedTrip:
        _ensure_trips_dir()
        filepath = TRIPS_DIR / f"{trip.id}.json"
        with filepath.open("w", encoding="utf-8") as f:
            f.write(trip.model_dump_json(indent=2))
        logger.info(
            "Trip saved | id=%s | destination=%s",
            trip.id,
            trip.destination,
        )
        return trip

    def get(self, trip_id: str) -> SavedTrip | None:
        filepath = TRIPS_DIR / f"{trip_id}.json"
        if not filepath.exists():
            return None
        with filepath.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return SavedTrip(**data)

    def list_all(self) -> list[SavedTrip]:
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
                trips.append(SavedTrip(**data))
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning(
                    "Skipping corrupt trip file %s: %s", filepath, exc
                )
        return trips

    def delete(self, trip_id: str) -> bool:
        filepath = TRIPS_DIR / f"{trip_id}.json"
        if filepath.exists():
            filepath.unlink()
            logger.info("Trip deleted | id=%s", trip_id)
            return True
        return False

    def update_status(self, trip_id: str, status: str) -> SavedTrip | None:
        trip = self.get(trip_id)
        if trip is None:
            return None
        trip.status = status
        return self.save(trip)


_trip_store: TripStore | None = None


def get_trip_store() -> TripStore:
    global _trip_store
    if _trip_store is None:
        _trip_store = TripStore()
    return _trip_store