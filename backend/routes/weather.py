"""Weather forecast routes."""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.weather import DailyForecast, get_weather_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["Weather"])


class ForecastResponse(BaseModel):
    city: str
    start_date: str
    end_date: str
    days: list[dict]


@router.get(
    "/forecast",
    response_model=ForecastResponse,
    summary="Get daily weather forecast",
)
async def get_forecast(
    city: str = Query(default="Hyderabad", description="City name"),
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
) -> ForecastResponse:
    """
    Returns daily weather forecast for the requested city and date range.

    Uses Open-Meteo (free, no API key needed).
    Results are cached server-side for 1 hour.
    """
    # Validate date format
    try:
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="start_date and end_date must be YYYY-MM-DD",
        )

    if ed < sd:
        raise HTTPException(
            status_code=422,
            detail="end_date must be on or after start_date",
        )

    if (ed - sd).days > 16:
        raise HTTPException(
            status_code=422,
            detail="Forecast range cannot exceed 16 days",
        )

    service = get_weather_service()
    try:
        forecasts = await service.get_forecast(city, start_date, end_date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return ForecastResponse(
        city=city,
        start_date=start_date,
        end_date=end_date,
        days=[f.__dict__ for f in forecasts],
    )