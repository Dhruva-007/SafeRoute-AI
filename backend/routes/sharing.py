"""Trip sharing routes."""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.trip_storage import SavedTrip
from services.sharing import get_sharing_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sharing"])


class CreateShareRequest(BaseModel):
    expiry: Literal["1d", "7d", "30d", "never"] = "7d"


class ShareResponse(BaseModel):
    trip_id: str
    share_token: str
    share_url: str
    share_expires_at: str | None
    share_created_at: str | None


@router.post(
    "/trips/{trip_id}/share",
    response_model=ShareResponse,
    summary="Create or refresh a share link for a trip",
)
async def create_share(
    trip_id: str,
    payload: CreateShareRequest,
) -> ShareResponse:
    """
    Generate a public share URL for the given trip with the requested expiry.
    Each call creates a fresh token, invalidating any previous one.
    """
    service = get_sharing_service()
    try:
        trip = service.create_share(trip_id, expiry=payload.expiry)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return ShareResponse(
        trip_id=trip.id,
        share_token=trip.share_token,
        share_url=f"/share/{trip.share_token}",
        share_expires_at=trip.share_expires_at,
        share_created_at=trip.share_created_at,
    )


@router.delete(
    "/trips/{trip_id}/share",
    response_model=SavedTrip,
    summary="Revoke a trip's share link",
)
async def revoke_share(trip_id: str) -> SavedTrip:
    """Disable sharing for the given trip."""
    service = get_sharing_service()
    try:
        return service.revoke_share(trip_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get(
    "/trips/shared/{token}",
    response_model=SavedTrip,
    summary="Get a shared trip by public token",
)
async def get_shared_trip(token: str) -> SavedTrip:
    """
    Public endpoint — no auth required.
    Returns the trip if the token is valid and not expired.
    """
    service = get_sharing_service()
    trip = service.get_shared_trip(token)
    if trip is None:
        raise HTTPException(
            status_code=404,
            detail="Share link is invalid or has expired",
        )
    return trip