"""Trip persistence routes."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.trip_storage import SavedTrip, get_trip_store
from services.auth import get_auth_service
from services.editor import get_editor_service
from services.planner import get_planner
from services.retriever import get_retriever

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trips", tags=["Trips"])


# ---------------------------------------------------------------------------
# Auth helper — extracts user_id from token if present
# Trips are NOT strictly auth-gated (shared trips must remain public)
# but we use the token when available to filter by user
# ---------------------------------------------------------------------------

def _get_optional_user_id(authorization: Optional[str]) -> Optional[str]:
    """
    Extract user_id from Bearer token if provided.
    Returns None if no token or token is invalid.
    Does NOT raise — trips endpoints are optionally authenticated.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    auth_service = get_auth_service()
    user = auth_service.get_user_from_token(token)
    return user.id if user else None


class StatusUpdateRequest(BaseModel):
    status: str


@router.post(
    "",
    response_model=SavedTrip,
    summary="Save a trip plan",
)
async def save_trip(
    trip: SavedTrip,
    authorization: Optional[str] = Header(default=None),
) -> SavedTrip:
    """Save a generated trip itinerary. Associates with user if authenticated."""
    user_id = _get_optional_user_id(authorization)

    # Attach the authenticated user's ID to the trip
    if user_id:
        trip.user_id = user_id

    store = get_trip_store()
    return store.save(trip)


@router.get(
    "",
    response_model=list[SavedTrip],
    summary="List saved trips",
)
async def list_trips(
    authorization: Optional[str] = Header(default=None),
) -> list[SavedTrip]:
    """
    Return saved trips.
    - Authenticated: returns only this user's trips
    - Unauthenticated: returns trips with no user_id (legacy)
    """
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()
    return store.list_all(user_id=user_id)


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
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    return trip


@router.patch(
    "/{trip_id}/status",
    response_model=SavedTrip,
    summary="Update trip status",
)
async def update_trip_status(
    trip_id: str,
    payload: StatusUpdateRequest,
    authorization: Optional[str] = Header(default=None),
) -> SavedTrip:
    """Update a trip's status: planned | active | completed."""
    if payload.status not in ("planned", "active", "completed"):
        raise HTTPException(
            status_code=422,
            detail="status must be one of: planned, active, completed",
        )

    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()

    # Ownership check
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    updated = store.update_status(trip_id, payload.status)
    return updated


@router.delete(
    "/{trip_id}",
    summary="Delete a trip",
)
async def delete_trip(
    trip_id: str,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    """Delete a trip by ID. Only the owner can delete."""
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()

    # Ownership check
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    store.delete(trip_id)
    return JSONResponse(content={"status": "deleted", "trip_id": trip_id})


# ---------------------------------------------------------------------------
# Editor routes
# ---------------------------------------------------------------------------

class UpdateActivityRequest(BaseModel):
    time: str | None = None
    place: str | None = None
    description: str | None = None
    estimated_cost: str | None = None


class AddActivityRequest(BaseModel):
    time: str = "TBD"
    place: str = "Unknown"
    description: str = ""
    estimated_cost: str = "₹0"
    position: int | None = None


class ReorderDayRequest(BaseModel):
    new_order: list[int]


class RegenerateDayResponse(BaseModel):
    trip: SavedTrip
    regenerated_day: int


@router.patch(
    "/{trip_id}/days/{day_number}/activities/{activity_index}",
    response_model=SavedTrip,
    summary="Update a single activity",
)
async def update_activity(
    trip_id: str,
    day_number: int,
    activity_index: int,
    payload: UpdateActivityRequest,
    authorization: Optional[str] = Header(default=None),
) -> SavedTrip:
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    editor = get_editor_service()
    try:
        return editor.update_activity(
            trip_id=trip_id,
            day_number=day_number,
            activity_index=activity_index,
            updates=payload.model_dump(exclude_none=True),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post(
    "/{trip_id}/days/{day_number}/activities",
    response_model=SavedTrip,
    summary="Add a new activity to a day",
)
async def add_activity(
    trip_id: str,
    day_number: int,
    payload: AddActivityRequest,
    authorization: Optional[str] = Header(default=None),
) -> SavedTrip:
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    editor = get_editor_service()
    try:
        return editor.add_activity(
            trip_id=trip_id,
            day_number=day_number,
            activity={
                "time": payload.time,
                "place": payload.place,
                "description": payload.description,
                "estimated_cost": payload.estimated_cost,
            },
            position=payload.position,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete(
    "/{trip_id}/days/{day_number}/activities/{activity_index}",
    response_model=SavedTrip,
    summary="Delete an activity from a day",
)
async def delete_activity(
    trip_id: str,
    day_number: int,
    activity_index: int,
    authorization: Optional[str] = Header(default=None),
) -> SavedTrip:
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    editor = get_editor_service()
    try:
        return editor.delete_activity(
            trip_id=trip_id,
            day_number=day_number,
            activity_index=activity_index,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.patch(
    "/{trip_id}/days/{day_number}/reorder",
    response_model=SavedTrip,
    summary="Reorder activities within a day",
)
async def reorder_day(
    trip_id: str,
    day_number: int,
    payload: ReorderDayRequest,
    authorization: Optional[str] = Header(default=None),
) -> SavedTrip:
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    editor = get_editor_service()
    try:
        return editor.reorder_day(
            trip_id=trip_id,
            day_number=day_number,
            new_order=payload.new_order,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post(
    "/{trip_id}/days/{day_number}/regenerate",
    response_model=RegenerateDayResponse,
    summary="AI-regenerate a single day",
)
async def regenerate_day(
    trip_id: str,
    day_number: int,
    authorization: Optional[str] = Header(default=None),
) -> RegenerateDayResponse:
    user_id = _get_optional_user_id(authorization)
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    if trip.user_id and user_id != trip.user_id:
        raise HTTPException(status_code=403, detail="You do not own this trip.")

    planner = get_planner()
    editor = get_editor_service()

    try:
        new_activities = await planner.regenerate_day(
            existing_trip_dict=trip.model_dump(),
            day_number=day_number,
        )
        updated_trip = editor.replace_day(
            trip_id=trip_id,
            day_number=day_number,
            new_activities=new_activities,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        error_msg = str(exc)
        if "429" in error_msg or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="AI service temporarily busy. Try again in a moment.",
            )
        raise HTTPException(status_code=502, detail=error_msg)

    return RegenerateDayResponse(trip=updated_trip, regenerated_day=day_number)


# ---------------------------------------------------------------------------
# Alternatives route
# ---------------------------------------------------------------------------

@router.get(
    "/alternatives/search",
    summary="Find alternative places similar to a given one",
)
async def find_alternatives(
    place: str,
    category: str | None = None,
    budget: str | None = None,
    limit: int = 5,
) -> dict:
    if not place.strip():
        raise HTTPException(status_code=422, detail="place is required")

    retriever = get_retriever()
    try:
        docs = retriever.get_alternatives(
            place_name=place,
            category=category,
            budget=budget,
            n_results=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "place": place,
        "alternatives": [
            {
                "name": d.name,
                "category": d.category,
                "budget_level": d.budget_level,
                "recommended_duration_hours": d.recommended_duration_hours,
                "best_time": d.best_time,
                "tags": d.tags,
                "description": d.description[:300],
            }
            for d in docs
        ],
    }