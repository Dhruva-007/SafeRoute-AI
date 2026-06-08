"""
weather_optimizer.py
====================
Phase 7 — Weather-Aware Planning

Integrates with the EXISTING weather.py service.

Input: weather_by_date dict (keyed by date string, values are DailyForecast dicts)
       These dicts contain:
           date, temp_max, temp_min, condition, condition_code,
           precipitation_mm, precipitation_probability, weather_code

Output:
    - Per-day WeatherClass classification
    - Place scoring adjustments
    - Filtered/re-ranked place lists
    - LLM prompt weather context string

WeatherClass values:
    CLEAR        — ideal outdoor conditions
    CLOUDY       — overcast but manageable
    HOT          — high temperature, limit outdoor
    EXTREME_HEAT — dangerous heat, indoor only
    RAIN         — precipitation, indoor preferred

This module does NOT fetch weather.
The planner fetches weather via weather.py.
This module only classifies and applies it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Weather Classifications
# ---------------------------------------------------------------------------

class WeatherClass(str, Enum):
    CLEAR        = "CLEAR"
    CLOUDY       = "CLOUDY"
    HOT          = "HOT"
    EXTREME_HEAT = "EXTREME_HEAT"
    RAIN         = "RAIN"


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

EXTREME_HEAT_TEMP   = 42.0   # °C  — above this = EXTREME_HEAT
HOT_TEMP            = 35.0   # °C  — above this = HOT (if no rain)
RAIN_PROB_THRESHOLD = 40     # %   — at or above this = RAIN
CLOUDY_PROB_LOW     = 20     # %   — between 20-39 = CLOUDY

# condition_code values from weather.py that indicate rain
RAIN_CONDITION_CODES = {
    "rain", "heavy_rain", "drizzle", "thunderstorm", "snow",
}

# condition_code values that indicate cloud/fog (not rain)
CLOUDY_CONDITION_CODES = {
    "cloudy", "partly_cloudy", "fog",
}

# WMO codes that indicate active precipitation (from weather.py WEATHER_CODE_MAP)
RAIN_WMO_CODES = {
    51, 52, 53, 54, 55, 56, 57,   # Drizzle
    61, 62, 63, 64, 65, 66, 67,   # Rain
    80, 81, 82,                    # Rain showers
    85, 86,                        # Snow showers
    95, 96, 99,                    # Thunderstorm
}


# ---------------------------------------------------------------------------
# Place Attribute Sets for Weather Scoring
# ---------------------------------------------------------------------------

# Tags indicating an outdoor place
OUTDOOR_TAGS = {
    "outdoor", "lake", "park", "garden", "heritage", "fort",
    "trekking", "nature", "viewpoint", "open-air", "waterpark",
    "theme park", "zoo", "botanical", "reservoir", "island",
    "open air", "hilltop",
}

# Tags indicating an indoor place
INDOOR_TAGS = {
    "indoor", "museum", "cafe", "restaurant", "mall", "temple",
    "mosque", "church", "gallery", "aquarium", "arcade",
    "shopping", "cinema", "air-conditioned", "air conditioned",
}

# Categories that are primarily outdoor (from your dataset)
OUTDOOR_CATEGORIES = {
    "Nature & Parks",
    "Adventure",
    "Lakes & Reservoirs",
}

# Categories that are primarily indoor (from your dataset)
INDOOR_CATEGORIES = {
    "Museums & Galleries",
    "Shopping",
    "Cafes & Restaurants",
    "Religious Sites",
    "Entertainment",
}

# Historical Sites are mixed — handled by tag inspection
MIXED_CATEGORIES = {
    "Historical Sites",
    "Cultural Sites",
}

# Walking intensity values
HIGH_WALKING   = {"high"}
MEDIUM_WALKING = {"medium"}
LOW_WALKING    = {"low", "minimal", "none"}


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class DayWeather:
    """Weather classification and raw data for a single trip day."""
    day_index:      int           # 0-based
    date:           str           # ISO date string e.g. "2025-01-15"
    classification: WeatherClass
    temp_max:       float         # °C
    temp_min:       float         # °C
    rain_prob:      int           # 0-100 %
    weather_code:   int           # WMO code
    condition:      str           # human-readable from weather.py
    condition_code: str           # internal code from weather.py
    description:    str           # optimizer-generated summary


@dataclass
class WeatherOptimizationResult:
    """Full output from the weather optimizer for an entire trip."""
    day_weather:     list[DayWeather]
    overall_summary: str           # e.g. "2x HOT, 1x RAIN"
    indoor_days:     set[int]      # 0-based day indices needing indoor preference
    has_rain:        bool
    has_extreme:     bool


# ---------------------------------------------------------------------------
# Day Classifier
# ---------------------------------------------------------------------------

def classify_day_weather(
    date:           str,
    day_index:      int,
    temp_max:       float,
    temp_min:       float,
    rain_prob:      int,
    weather_code:   int,
    condition:      str,
    condition_code: str,
) -> DayWeather:
    """
    Classify a single day into one of the five WeatherClass values.

    Priority order (highest wins):
        1. EXTREME_HEAT  — temp >= 42°C
        2. RAIN          — precipitation detected (prob, code, or condition)
        3. HOT           — temp >= 35°C, no rain
        4. CLOUDY        — overcast/fog/partly cloudy
        5. CLEAR         — everything else
    """

    # ── Priority 1: Extreme Heat ─────────────────────────────────────
    if temp_max >= EXTREME_HEAT_TEMP:
        cls = WeatherClass.EXTREME_HEAT
        desc = (
            f"Extreme heat ({temp_max:.0f}°C). "
            "Strongly prefer air-conditioned indoor venues. "
            "Plan outdoor visits before 8 AM or after 6 PM only."
        )

    # ── Priority 2: Rain ─────────────────────────────────────────────
    elif (
        rain_prob >= RAIN_PROB_THRESHOLD
        or weather_code in RAIN_WMO_CODES
        or condition_code in RAIN_CONDITION_CODES
    ):
        cls = WeatherClass.RAIN
        desc = (
            f"Rain expected ({rain_prob}% probability, {condition}). "
            "Indoor venues prioritised. "
            "Avoid lakes, open parks, and hilltop sites."
        )

    # ── Priority 3: Hot ──────────────────────────────────────────────
    elif temp_max >= HOT_TEMP:
        cls = WeatherClass.HOT
        desc = (
            f"Hot day ({temp_max:.0f}°C). "
            "Prefer museums and indoor attractions. "
            "Schedule outdoor visits in early morning or evening."
        )

    # ── Priority 4: Cloudy ───────────────────────────────────────────
    elif (
        condition_code in CLOUDY_CONDITION_CODES
        or rain_prob >= CLOUDY_PROB_LOW
    ):
        cls = WeatherClass.CLOUDY
        desc = (
            f"Cloudy/overcast ({temp_max:.0f}°C, {rain_prob}% rain chance). "
            "Good for outdoor sightseeing. Carry an umbrella."
        )

    # ── Priority 5: Clear ────────────────────────────────────────────
    else:
        cls = WeatherClass.CLEAR
        desc = (
            f"Clear skies ({temp_max:.0f}°C). "
            "Excellent conditions for outdoor sightseeing and heritage walks."
        )

    return DayWeather(
        day_index=day_index,
        date=date,
        classification=cls,
        temp_max=temp_max,
        temp_min=temp_min,
        rain_prob=rain_prob,
        weather_code=weather_code,
        condition=condition,
        condition_code=condition_code,
        description=desc,
    )


# ---------------------------------------------------------------------------
# Place Attribute Helpers
# ---------------------------------------------------------------------------

def _get_tags(place: dict[str, Any]) -> set[str]:
    """Safely extract and normalise tags from a place dict."""
    raw = place.get("tags") or []
    if isinstance(raw, list):
        return {str(t).lower().strip() for t in raw}
    return set()


def _get_category(place: dict[str, Any]) -> str:
    return str(place.get("category") or "").strip()


def _get_subcategory(place: dict[str, Any]) -> str:
    return str(place.get("subcategory") or "").lower().strip()


def _get_walking_intensity(place: dict[str, Any]) -> str:
    """
    Extract walking_intensity. Handles both BuiltActivity dicts
    (which have 'walking_intensity') and raw place dicts.
    """
    return str(place.get("walking_intensity") or "low").lower().strip()


def _is_indoor(place: dict[str, Any]) -> bool:
    """Return True if the place is primarily indoor."""
    tags     = _get_tags(place)
    category = _get_category(place)
    subcat   = _get_subcategory(place)

    # Explicit indoor flag from BuiltActivity
    if "indoor" in place and place["indoor"] is True:
        return True

    if tags & INDOOR_TAGS:
        return True

    if category in INDOOR_CATEGORIES:
        return True

    indoor_subcat_keywords = {
        "museum", "cafe", "restaurant", "mall", "gallery",
        "cinema", "aquarium", "shopping", "indoor",
    }
    if any(kw in subcat for kw in indoor_subcat_keywords):
        return True

    return False


def _is_outdoor(place: dict[str, Any]) -> bool:
    """Return True if the place is primarily outdoor."""
    # If explicitly marked indoor, it's not outdoor
    if "indoor" in place and place["indoor"] is True:
        return False

    tags     = _get_tags(place)
    category = _get_category(place)
    subcat   = _get_subcategory(place)

    if tags & OUTDOOR_TAGS:
        return True

    if category in OUTDOOR_CATEGORIES:
        return True

    outdoor_subcat_keywords = {
        "fort", "lake", "park", "garden", "trek",
        "nature", "reservoir", "zoo", "botanical",
        "outdoor", "hilltop", "viewpoint",
    }
    if any(kw in subcat for kw in outdoor_subcat_keywords):
        return True

    # Historical Sites are outdoor unless tagged indoor
    if category in MIXED_CATEGORIES and "indoor" not in tags:
        return True

    return False


# ---------------------------------------------------------------------------
# Place Weather Score
# ---------------------------------------------------------------------------

def score_place_for_weather(
    place:   dict[str, Any],
    weather: WeatherClass,
) -> float:
    """
    Return a weather compatibility score for a single place.

    Score semantics:
        +2.0  = strongly preferred today
        +1.0  = preferred
         0.0  = neutral
        -1.0  = mildly incompatible
        -2.0  = strongly avoid (triggers hard filter if enabled)

    This score is additive — it nudges the existing recommendation
    ranking without replacing it.
    """
    score     = 0.0
    is_in     = _is_indoor(place)
    is_out    = _is_outdoor(place)
    walking   = _get_walking_intensity(place)
    tags      = _get_tags(place)
    is_high   = walking in HIGH_WALKING
    is_medium = walking in MEDIUM_WALKING

    if weather == WeatherClass.EXTREME_HEAT:
        if is_in:
            score += 2.0
        if is_out:
            score -= 2.0
        if is_high:
            score -= 1.5
        elif is_medium:
            score -= 0.5

    elif weather == WeatherClass.RAIN:
        if is_in:
            score += 1.5
        if is_out:
            score -= 1.5
        # Extra penalty for water/open areas
        if tags & {"lake", "park", "garden", "reservoir", "open-air"}:
            score -= 1.0
        if is_high:
            score -= 0.5

    elif weather == WeatherClass.HOT:
        if is_in:
            score += 1.0
        if is_out and is_high:
            score -= 1.5
        elif is_out and is_medium:
            score -= 0.75
        elif is_out:
            score -= 0.25

    elif weather == WeatherClass.CLOUDY:
        if is_in:
            score += 0.25
        # Outdoor is fine on cloudy days — no penalty

    elif weather == WeatherClass.CLEAR:
        if is_out:
            score += 0.5
        # Indoor is fine on clear days — no penalty

    return score


# ---------------------------------------------------------------------------
# Place Filtering
# ---------------------------------------------------------------------------

def filter_places_for_weather(
    places:      list[dict[str, Any]],
    weather:     WeatherClass,
    hard_filter: bool = False,
) -> list[dict[str, Any]]:
    """
    Score all places for the given weather and re-rank by compatibility.

    Args:
        places:      Candidate place dicts (raw or BuiltActivity-style)
        weather:     WeatherClass for this day
        hard_filter: If True, remove places scoring <= -2.0
                     Only applied for EXTREME_HEAT and RAIN.

    Returns:
        Re-ranked list. Each place gets '_weather_score' field added.
    """
    if not places:
        return []

    scored = []
    for place in places:
        w_score              = score_place_for_weather(place, weather)
        place_copy           = dict(place)
        place_copy["_weather_score"] = w_score
        scored.append(place_copy)

    # Hard filter: remove strongly incompatible places
    if hard_filter and weather in (WeatherClass.EXTREME_HEAT, WeatherClass.RAIN):
        before  = len(scored)
        scored  = [p for p in scored if p["_weather_score"] > -2.0]
        removed = before - len(scored)
        if removed:
            logger.info(
                "Weather hard filter [%s] removed %d incompatible places.",
                weather.value, removed,
            )

    # Sort by weather score descending (stable sort preserves original
    # recommendation ranking for equal scores)
    scored.sort(key=lambda p: p["_weather_score"], reverse=True)

    # Debug log
    for p in scored[:5]:
        ws = p.get("_weather_score", 0.0)
        if ws != 0.0:
            name      = p.get("name") or p.get("place", "Unknown")
            direction = "↑ boosted" if ws > 0 else "↓ penalised"
            logger.debug(
                "  Weather score %s: %s (%+.1f)",
                direction, name, ws,
            )

    return scored


# ---------------------------------------------------------------------------
# Main Optimizer Entry Point
# ---------------------------------------------------------------------------

def optimize_for_weather(
    weather_by_date: dict[str, dict],
    date_list:       list[str],
) -> WeatherOptimizationResult:
    """
    Main entry point called by the planner.

    Args:
        weather_by_date: dict keyed by ISO date string.
                         Each value is a DailyForecast.__dict__ from weather.py:
                         {
                             'date':                    '2025-01-15',
                             'temp_max':                32.5,
                             'temp_min':                22.1,
                             'condition':               'Moderate rain',
                             'condition_code':          'rain',
                             'precipitation_mm':        4.2,
                             'precipitation_probability': 65,
                             'weather_code':            63,
                         }
        date_list:       Ordered list of ISO date strings for the trip.
                         e.g. ['2025-01-15', '2025-01-16', '2025-01-17']

    Returns:
        WeatherOptimizationResult with per-day DayWeather objects.
    """
    logger.info("=" * 60)
    logger.info(
        "WEATHER OPTIMIZER — Classifying %d-day trip forecast",
        len(date_list),
    )
    logger.info("=" * 60)

    day_weather_list: list[DayWeather] = []

    for day_index, date_str in enumerate(date_list):
        forecast = weather_by_date.get(date_str, {})

        if forecast:
            temp_max       = float(forecast.get("temp_max", 30.0))
            temp_min       = float(forecast.get("temp_min", 22.0))
            rain_prob      = int(forecast.get("precipitation_probability", 0))
            weather_code   = int(forecast.get("weather_code", 0))
            condition      = str(forecast.get("condition", "Clear sky"))
            condition_code = str(forecast.get("condition_code", "clear"))
        else:
            # No forecast for this date — use safe defaults
            logger.warning(
                "No forecast data for %s (Day %d). Using clear defaults.",
                date_str, day_index + 1,
            )
            temp_max       = 30.0
            temp_min       = 22.0
            rain_prob      = 0
            weather_code   = 0
            condition      = "Clear sky"
            condition_code = "clear"

        dw = classify_day_weather(
            date=date_str,
            day_index=day_index,
            temp_max=temp_max,
            temp_min=temp_min,
            rain_prob=rain_prob,
            weather_code=weather_code,
            condition=condition,
            condition_code=condition_code,
        )
        day_weather_list.append(dw)

    # ── Log classification table ──────────────────────────────────────
    logger.info("")
    logger.info("Weather Classification Results:")
    logger.info("-" * 60)
    for dw in day_weather_list:
        logger.info(
            "  DAY %d (%s) = %-15s | %s°C | Rain: %d%% | %s",
            dw.day_index + 1,
            dw.date,
            dw.classification.value,
            dw.temp_max,
            dw.rain_prob,
            dw.condition,
        )
    logger.info("-" * 60)

    # ── Determine indoor days ─────────────────────────────────────────
    indoor_days: set[int] = {
        dw.day_index
        for dw in day_weather_list
        if dw.classification in (
            WeatherClass.RAIN,
            WeatherClass.HOT,
            WeatherClass.EXTREME_HEAT,
        )
    }

    if indoor_days:
        logger.info(
            "Indoor preference enabled for day(s): %s",
            ", ".join(str(d + 1) for d in sorted(indoor_days)),
        )
    else:
        logger.info(
            "All days cleared for outdoor activities."
        )

    # ── Overall summary ───────────────────────────────────────────────
    class_counts: dict[str, int] = {}
    for dw in day_weather_list:
        key = dw.classification.value
        class_counts[key] = class_counts.get(key, 0) + 1

    overall_summary = ", ".join(
        f"{count}x {cls}" for cls, count in class_counts.items()
    )
    logger.info("Overall trip weather: %s", overall_summary)
    logger.info("=" * 60)

    classifications = [dw.classification for dw in day_weather_list]
    has_rain    = WeatherClass.RAIN    in classifications
    has_extreme = WeatherClass.EXTREME_HEAT in classifications

    return WeatherOptimizationResult(
        day_weather=day_weather_list,
        overall_summary=overall_summary,
        indoor_days=indoor_days,
        has_rain=has_rain,
        has_extreme=has_extreme,
    )


# ---------------------------------------------------------------------------
# Per-Day Adjuster (called by planner for each day's activity list)
# ---------------------------------------------------------------------------

def adjust_places_for_day(
    places:      list[dict[str, Any]],
    day_weather: DayWeather,
) -> list[dict[str, Any]]:
    """
    Apply weather adjustment to the place list for a specific day.

    In the existing planner, 'places' are BuiltActivity-derived dicts
    that already have fields like 'indoor', 'walking_intensity', etc.

    Args:
        places:      Activity/place dicts for this day
        day_weather: DayWeather classification for this day

    Returns:
        Weather-adjusted and re-ranked place list.
    """
    weather = day_weather.classification

    logger.info(
        "Day %d [%s]: adjusting %d places for %s weather.",
        day_weather.day_index + 1,
        day_weather.date,
        len(places),
        weather.value,
    )

    hard_filter = weather in (WeatherClass.EXTREME_HEAT, WeatherClass.RAIN)
    adjusted    = filter_places_for_weather(places, weather, hard_filter=hard_filter)

    return adjusted


# ---------------------------------------------------------------------------
# LLM Prompt Weather Context Builder
# ---------------------------------------------------------------------------

def get_weather_context_for_prompt(
    weather_result: WeatherOptimizationResult,
) -> str:
    """
    Build a structured weather context string for the LLM prompt.

    This replaces the simple weather string that was previously
    injected into _format_itinerary_for_prompt().
    """
    lines = [
        "WEATHER CONDITIONS (influences place selection):",
        "-" * 50,
    ]

    for dw in weather_result.day_weather:
        lines.append(
            f"  Day {dw.day_index + 1} ({dw.date}): "
            f"[{dw.classification.value}] {dw.description}"
        )

    lines.append("-" * 50)

    if weather_result.has_extreme:
        lines.append(
            "⚠  EXTREME HEAT: Indoor venues selected for affected days. "
            "Mention early morning timing in descriptions."
        )
    if weather_result.has_rain:
        lines.append(
            "🌧  RAIN: Indoor venues prioritised on affected days. "
            "Acknowledge rain-friendly nature of selected venues."
        )
    if not weather_result.has_extreme and not weather_result.has_rain:
        lines.append(
            "✓  Conditions suitable for planned outdoor activities."
        )

    return "\n".join(lines)