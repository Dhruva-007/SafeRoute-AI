"""Fatigue prediction routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models.trip_storage import get_trip_store
from services.fatigue import get_fatigue_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fatigue", tags=["Fatigue"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ActivityInput(BaseModel):
    time: str
    place: str
    description: str = ""
    estimated_cost: str = ""


class ScoreActivityRequest(BaseModel):
    activity: ActivityInput
    prior_activities_today: int = Field(default=0, ge=0, le=20)


class ScoreActivityResponse(BaseModel):
    score: int
    level: str
    factors: dict


class TripFatigueResponse(BaseModel):
    trip_id: str
    current_day: int
    current_activity_index: int
    current_activity: dict
    fatigue_score: int
    fatigue_level: str
    day_average: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/score-activity",
    response_model=ScoreActivityResponse,
    summary="Score a single activity",
)
async def score_activity(
    payload: ScoreActivityRequest,
) -> ScoreActivityResponse:
    """
    Compute the fatigue score for a single activity in isolation.
    Useful for client-side simulations.
    """
    service = get_fatigue_service()
    score = service.score_activity(
        activity=payload.activity.model_dump(),
        prior_activities_today=payload.prior_activities_today,
    )
    return ScoreActivityResponse(
        score=score.score,
        level=score.level,
        factors=score.factors,
    )


@router.get(
    "/trip/{trip_id}/current",
    response_model=TripFatigueResponse,
    summary="Get live fatigue for a trip's current activity",
)
async def trip_current_fatigue(
    trip_id: str,
    day: int = 1,
    activity_index: int = 0,
) -> TripFatigueResponse:
    """
    Get the fatigue score for a specific activity within a saved trip.

    Used by the live FatiguePredictor to display fatigue for the
    user's current planned activity. The frontend polls this endpoint
    on a cooldown.
    """
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trip {trip_id} not found",
        )

    # Locate the day
    day_obj = None
    for d in trip.days:
        if d.get("day") == day:
            day_obj = d
            break

    if day_obj is None:
        raise HTTPException(
            status_code=404,
            detail=f"Day {day} not found in trip {trip_id}",
        )

    activities = day_obj.get("activities", [])
    if not activities:
        raise HTTPException(
            status_code=404,
            detail=f"No activities on day {day}",
        )

    # Clamp activity index
    idx = max(0, min(activity_index, len(activities) - 1))
    activity = activities[idx]

    return TripFatigueResponse(
        trip_id=trip_id,
        current_day=day,
        current_activity_index=idx,
        current_activity=activity,
        fatigue_score=int(activity.get("fatigue_score", 0)),
        fatigue_level=str(activity.get("fatigue_level", "LOW")),
        day_average=int(day_obj.get("day_fatigue_average", 0)),
    )