"""
Weather service using Open-Meteo (free, no API key required).
Provides daily forecasts for Hyderabad with caching to avoid rate limits.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date, datetime

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Known city coordinates (Hyderabad-only for now, extensible later)
# ---------------------------------------------------------------------------

CITY_COORDINATES = {
    "hyderabad": (17.385, 78.4867),
}

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# In-memory cache: { cache_key: (timestamp, payload) }
_CACHE: dict[str, tuple[float, dict]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


# ---------------------------------------------------------------------------
# Open-Meteo WMO weather code mapping
# Reference: https://open-meteo.com/en/docs
# ---------------------------------------------------------------------------

WEATHER_CODE_MAP = {
    0: ("Clear sky", "clear"),
    1: ("Mainly clear", "clear"),
    2: ("Partly cloudy", "partly_cloudy"),
    3: ("Overcast", "cloudy"),
    45: ("Foggy", "fog"),
    48: ("Depositing rime fog", "fog"),
    51: ("Light drizzle", "drizzle"),
    53: ("Moderate drizzle", "drizzle"),
    55: ("Dense drizzle", "drizzle"),
    56: ("Light freezing drizzle", "drizzle"),
    57: ("Dense freezing drizzle", "drizzle"),
    61: ("Slight rain", "rain"),
    63: ("Moderate rain", "rain"),
    65: ("Heavy rain", "heavy_rain"),
    66: ("Light freezing rain", "rain"),
    67: ("Heavy freezing rain", "heavy_rain"),
    71: ("Slight snow", "snow"),
    73: ("Moderate snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Slight rain showers", "rain"),
    81: ("Moderate rain showers", "rain"),
    82: ("Violent rain showers", "heavy_rain"),
    85: ("Slight snow showers", "snow"),
    86: ("Heavy snow showers", "snow"),
    95: ("Thunderstorm", "thunderstorm"),
    96: ("Thunderstorm with hail", "thunderstorm"),
    99: ("Severe thunderstorm with hail", "thunderstorm"),
}


@dataclass
class DailyForecast:
    """Forecast for a single day."""
    date: str            # YYYY-MM-DD
    temp_max: float      # Celsius
    temp_min: float      # Celsius
    condition: str       # Human-readable
    condition_code: str  # Internal code: clear | rain | etc.
    precipitation_mm: float
    precipitation_probability: int  # 0-100
    weather_code: int    # WMO code


class WeatherService:
    """
    Open-Meteo backed weather forecast service.
    """

    def __init__(self) -> None:
        logger.info("WeatherService initialised")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_forecast(
        self,
        city: str,
        start_date: str,
        end_date: str,
    ) -> list[DailyForecast]:
        """
        Fetch daily forecast for the given city and date range.

        Args:
            city:       City name (case-insensitive). Must be in CITY_COORDINATES.
            start_date: ISO date string YYYY-MM-DD
            end_date:   ISO date string YYYY-MM-DD

        Returns:
            List of DailyForecast objects, one per day.
        """
        city_lower = city.lower().strip()
        if city_lower not in CITY_COORDINATES:
            raise ValueError(
                f"Unknown city '{city}'. Supported: {list(CITY_COORDINATES.keys())}"
            )

        # Check cache
        cache_key = f"{city_lower}|{start_date}|{end_date}"
        cached = self._get_from_cache(cache_key)
        if cached is not None:
            logger.info(
                "Weather cache hit | city=%s | range=%s..%s",
                city_lower, start_date, end_date,
            )
            return cached

        # Fetch from Open-Meteo
        lat, lon = CITY_COORDINATES[city_lower]
        forecasts = await self._fetch_open_meteo(lat, lon, start_date, end_date)

        self._save_to_cache(cache_key, forecasts)
        return forecasts

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    async def _fetch_open_meteo(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[DailyForecast]:
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": (
                "weather_code,"
                "temperature_2m_max,"
                "temperature_2m_min,"
                "precipitation_sum,"
                "precipitation_probability_max"
            ),
            "timezone": "Asia/Kolkata",
            "start_date": start_date,
            "end_date": end_date,
        }

        logger.info(
            "Calling Open-Meteo | lat=%s | lon=%s | range=%s..%s",
            lat, lon, start_date, end_date,
        )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
        except httpx.RequestError as exc:
            logger.exception("Open-Meteo network error: %s", exc)
            raise RuntimeError(f"Weather service unavailable: {exc}") from exc

        if response.status_code != 200:
            logger.error(
                "Open-Meteo error | status=%d | body=%s",
                response.status_code, response.text,
            )
            raise RuntimeError(
                f"Open-Meteo returned {response.status_code}"
            )

        data = response.json()
        daily = data.get("daily", {})

        dates = daily.get("time", [])
        weather_codes = daily.get("weather_code", [])
        temp_maxes = daily.get("temperature_2m_max", [])
        temp_mins = daily.get("temperature_2m_min", [])
        precip_sums = daily.get("precipitation_sum", [])
        precip_probs = daily.get("precipitation_probability_max", [])

        forecasts: list[DailyForecast] = []
        for i, d in enumerate(dates):
            code = int(weather_codes[i]) if i < len(weather_codes) else 0
            condition, condition_code = WEATHER_CODE_MAP.get(
                code, ("Unknown", "unknown")
            )

            forecasts.append(DailyForecast(
                date=d,
                temp_max=round(float(temp_maxes[i]), 1) if i < len(temp_maxes) else 0.0,
                temp_min=round(float(temp_mins[i]), 1) if i < len(temp_mins) else 0.0,
                condition=condition,
                condition_code=condition_code,
                precipitation_mm=round(float(precip_sums[i]), 1) if i < len(precip_sums) else 0.0,
                precipitation_probability=int(precip_probs[i]) if i < len(precip_probs) and precip_probs[i] is not None else 0,
                weather_code=code,
            ))

        logger.info(
            "Open-Meteo returned %d daily forecasts", len(forecasts)
        )
        return forecasts

    def _get_from_cache(self, key: str) -> list[DailyForecast] | None:
        entry = _CACHE.get(key)
        if entry is None:
            return None
        ts, payload = entry
        if time.time() - ts > CACHE_TTL_SECONDS:
            _CACHE.pop(key, None)
            return None
        return [DailyForecast(**f) for f in payload]

    def _save_to_cache(self, key: str, forecasts: list[DailyForecast]) -> None:
        _CACHE[key] = (
            time.time(),
            [f.__dict__ for f in forecasts],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_weather_service: WeatherService | None = None


def get_weather_service() -> WeatherService:
    global _weather_service
    if _weather_service is None:
        _weather_service = WeatherService()
    return _weather_service