"""Trip persistence routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.trip_storage import SavedTrip, get_trip_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trips", tags=["Trips"])


class StatusUpdateRequest(BaseModel):
    status: str


@router.post(
    "",
    response_model=SavedTrip,
    summary="Save a trip plan",
)
async def save_trip(trip: SavedTrip) -> SavedTrip:
    """Save a generated trip itinerary to persistent storage."""
    store = get_trip_store()
    return store.save(trip)


@router.get(
    "",
    response_model=list[SavedTrip],
    summary="List all saved trips",
)
async def list_trips() -> list[SavedTrip]:
    """Return all saved trips, newest first."""
    store = get_trip_store()
    return store.list_all()


@router.get(
    "/{trip_id}",
    response_model=SavedTrip,
    summary="Get a trip by ID",
)
async def get_trip(trip_id: str) -> SavedTrip:
    """Retrieve a single trip by its unique ID."""
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trip {trip_id} not found",
        )
    return trip


@router.patch(
    "/{trip_id}/status",
    response_model=SavedTrip,
    summary="Update trip status",
)
async def update_trip_status(
    trip_id: str,
    payload: StatusUpdateRequest,
) -> SavedTrip:
    """Update a trip's status: planned | active | completed."""
    if payload.status not in ("planned", "active", "completed"):
        raise HTTPException(
            status_code=422,
            detail="status must be one of: planned, active, completed",
        )

    store = get_trip_store()
    trip = store.update_status(trip_id, payload.status)
    if trip is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trip {trip_id} not found",
        )
    return trip


@router.delete(
    "/{trip_id}",
    summary="Delete a trip",
)
async def delete_trip(trip_id: str) -> JSONResponse:
    """Delete a trip by ID."""
    store = get_trip_store()
    deleted = store.delete(trip_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Trip {trip_id} not found",
        )
    return JSONResponse(
        content={"status": "deleted", "trip_id": trip_id}
    )