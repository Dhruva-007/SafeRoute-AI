"""
Fatigue prediction routes.

Endpoints:
    POST /fatigue/score-activity          (existing — rule-based, planning)
    GET  /fatigue/trip/{trip_id}/current  (existing — rule-based, saved trip)
    POST /fatigue/live-predict            (NEW — XGBoost, live tour monitoring)
    GET  /fatigue/model/health            (NEW — model health check)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models.trip_storage import get_trip_store
from services.fatigue import get_fatigue_service
from services.feature_builder import RawLiveMetrics, get_feature_builder
from services.live_fatigue import get_live_fatigue_service
from services.model_manager import ModelNotLoadedError, get_model_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fatigue", tags=["Fatigue"])


# ─────────────────────────────────────────────────────────────────────────────
# Existing request / response models (UNCHANGED)
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# NEW — Live prediction request / response models
# ─────────────────────────────────────────────────────────────────────────────

class LivePredictRequest(BaseModel):
    """
    Live travel metrics sent by the client during an active tour.

    All fields are optional — the server applies safe defaults for
    any missing values so the client can send partial data gracefully.
    """
    # GPS position
    latitude:             float = Field(
        default=17.3850,
        description="GPS latitude (decimal degrees)",
    )
    longitude:            float = Field(
        default=78.4867,
        description="GPS longitude (decimal degrees)",
    )
    elevation:            float = Field(
        default=542.0,
        description="Elevation above sea level (metres)",
    )

    # Time context
    hour:                 int | None = Field(
        default=None,
        ge=0,
        le=23,
        description="Local hour (0-23). Derived from server time if omitted.",
    )

    # Environment
    temperature_c:        float = Field(
        default=28.0,
        description="Ambient temperature (°C)",
    )

    # Group
    group_size:           int = Field(
        default=1,
        ge=1,
        le=50,
        description="Number of travellers",
    )

    # Movement — per-update deltas
    dist_delta_km:        float = Field(
        default=0.0,
        ge=0.0,
        description="Distance since last GPS update (km)",
    )
    time_delta_seconds:   float = Field(
        default=30.0,
        ge=0.0,
        description="Seconds elapsed since last update",
    )

    # Session totals accumulated client-side
    total_distance_km:    float = Field(
        default=0.0,
        ge=0.0,
        description="Total session distance walked (km)",
    )
    total_elevation_gain: float = Field(
        default=0.0,
        ge=0.0,
        description="Cumulative elevation gain this session (metres)",
    )

    # Derived movement (optional — computed server-side if omitted)
    speed_kmh:            float | None = Field(
        default=None,
        ge=0.0,
        description="Current speed (km/h). Computed from deltas if omitted.",
    )
    grade:                float = Field(
        default=0.0,
        description="Slope grade percentage (rise/run × 100)",
    )

    # Terrain — inferred from grade/speed if not provided
    terrain:              str | None = Field(
        default=None,
        description="Terrain type. Inferred if omitted.",
    )

    # Optional session context
    session_start_iso:    str | None = Field(
        default=None,
        description="ISO8601 session start time",
    )


class AlertInfoResponse(BaseModel):
    """Alert information when fatigue exceeds a threshold."""
    severity: str  # "CAUTION" | "WARNING" | "CRITICAL"
    title:    str
    message:  str
    action:   str


class LivePredictResponse(BaseModel):
    """
    XGBoost fatigue prediction result for live tour monitoring.
    Includes model output, alert state, and recommendations.
    """
    # Core prediction
    score:           float = Field(description="Raw fatigue score (0-100 continuous)")
    score_int:       int   = Field(description="Rounded fatigue score (0-100 integer)")
    level:           str   = Field(description="Fatigue level: LOW | MEDIUM | HIGH")
    confidence:      float = Field(description="Prediction confidence (0.0-1.0)")

    # Alert engine output
    alert:           AlertInfoResponse | None = Field(
        default=None,
        description="Alert if score exceeds a threshold. None if score is safe.",
    )
    recommendations: list[str] = Field(
        description="Contextual recommendations based on fatigue level",
    )

    # Features used (for transparency / debugging)
    features_used:   dict = Field(description="Feature vector sent to model")

    # Engine identifier
    engine:          str = Field(
        default="xgboost-v1",
        description="Prediction engine version",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Existing routes (UNCHANGED)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/score-activity",
    response_model=ScoreActivityResponse,
    summary="Score a single activity (rule-based, planning)",
)
async def score_activity(
    payload: ScoreActivityRequest,
) -> ScoreActivityResponse:
    """
    Compute the fatigue score for a single activity in isolation.
    Uses the rule-based engine. Used during trip planning preview.
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
    summary="Get saved trip fatigue for current activity (rule-based)",
)
async def trip_current_fatigue(
    trip_id: str,
    day: int = 1,
    activity_index: int = 0,
) -> TripFatigueResponse:
    """
    Get the pre-computed fatigue score for a specific activity within
    a saved trip. Returns scores stamped at planning time (rule-based).
    """
    store = get_trip_store()
    trip = store.get(trip_id)
    if trip is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trip {trip_id} not found",
        )

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


# ─────────────────────────────────────────────────────────────────────────────
# NEW — XGBoost live prediction endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/live-predict",
    response_model=LivePredictResponse,
    summary="XGBoost live fatigue prediction during active tour",
    responses={
        200: {"description": "Fatigue prediction from XGBoost model"},
        503: {"description": "ML model not loaded"},
        422: {"description": "Invalid input data"},
        500: {"description": "Prediction failed"},
    },
)
async def live_predict(
    payload: LivePredictRequest,
) -> LivePredictResponse:
    """
    Run XGBoost fatigue prediction on live travel metrics.

    Called by the frontend every 30 seconds during active tracking.
    Accepts GPS position, session totals, and environmental data.
    Returns fatigue score, level, confidence, alert, and recommendations.

    This endpoint is stateless — the client accumulates session totals
    and sends them with every request. No server-side session storage.
    """
    # ── Build raw metrics from request ────────────────────────────────
    raw = RawLiveMetrics(
        latitude=payload.latitude,
        longitude=payload.longitude,
        elevation=payload.elevation,
        hour=payload.hour,
        temperature_c=payload.temperature_c,
        group_size=payload.group_size,
        dist_delta_km=payload.dist_delta_km,
        time_delta_seconds=payload.time_delta_seconds,
        total_distance_km=payload.total_distance_km,
        total_elevation_gain=payload.total_elevation_gain,
        speed_kmh=payload.speed_kmh,
        grade=payload.grade,
        terrain=payload.terrain,
        session_start_iso=payload.session_start_iso,
    )

    # ── Build feature vector ──────────────────────────────────────────
    builder = get_feature_builder()
    try:
        vector = builder.build(raw)
    except Exception as exc:
        logger.exception("Feature building failed: %s", exc)
        raise HTTPException(
            status_code=422,
            detail=f"Feature engineering failed: {str(exc)}",
        )

    # ── Run XGBoost inference ─────────────────────────────────────────
    manager = get_model_manager()
    try:
        prediction = manager.predict(vector.to_dict())
    except ModelNotLoadedError as exc:
        logger.error("Model not loaded during prediction request: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Fatigue ML model is not available. "
                "Check server startup logs for model loading errors."
            ),
        )
    except Exception as exc:
        logger.exception("XGBoost prediction failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Prediction engine error: {str(exc)}",
        )

    # ── Run alert assessment via LiveFatigueService ───────────────────
    live_service = get_live_fatigue_service()
    assessment = live_service.assess(
        prediction_result=prediction,
        features_used=vector.to_dict(),
    )

    # ── Build alert response model ────────────────────────────────────
    alert_response: AlertInfoResponse | None = None
    if assessment.alert is not None:
        alert_response = AlertInfoResponse(
            severity=assessment.alert.severity,
            title=assessment.alert.title,
            message=assessment.alert.message,
            action=assessment.alert.action,
        )

    logger.info(
        "live-predict | score=%d | level=%s | confidence=%.2f | "
        "alert=%s | lat=%.4f lon=%.4f | speed=%.1f kmh | "
        "terrain=%s | total_dist=%.2f km",
        assessment.score_int,
        assessment.level,
        assessment.confidence,
        assessment.alert.severity if assessment.alert else "none",
        vector.latitude,
        vector.longitude,
        vector.speed_kmh,
        vector.terrain,
        vector.total_distance,
    )

    return LivePredictResponse(
        score=assessment.score,
        score_int=assessment.score_int,
        level=assessment.level,
        confidence=assessment.confidence,
        alert=alert_response,
        recommendations=assessment.recommendations,
        features_used=assessment.features_used,
        engine=assessment.engine,
    )


# ─────────────────────────────────────────────────────────────────────────────
# NEW — Model health check endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/model/health",
    summary="XGBoost model health check",
    tags=["System"],
)
async def model_health() -> dict:
    """
    Verify the XGBoost fatigue model is loaded and producing predictions.
    Runs a synthetic test prediction and returns the result.
    """
    manager = get_model_manager()
    return manager.health_check()