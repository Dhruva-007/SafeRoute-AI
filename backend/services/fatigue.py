"""
Fatigue Prediction Service.

Current implementation: rule-based formula scoring activities by
distance, duration, intensity, and time of day.

Designed to be swapped out for an ML model later — the public API
(score_activity, score_itinerary) will remain stable.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants for the rule-based scoring engine
# ---------------------------------------------------------------------------

# Keyword → intensity weight mapping
HIGH_INTENSITY_KEYWORDS = {
    "trek", "trekking", "hike", "hiking", "climb", "climbing",
    "rappelling", "zip line", "kayak", "cycling", "fort trek",
    "boulder", "rock climbing", "go-karting", "adventure",
}

MEDIUM_INTENSITY_KEYWORDS = {
    "walk", "walking", "tour", "explore", "shopping", "market",
    "museum", "palace", "temple", "garden", "park", "boat",
    "promenade", "bazaar",
}

LOW_INTENSITY_KEYWORDS = {
    "lunch", "dinner", "breakfast", "cafe", "restaurant", "food",
    "spa", "hammam", "relaxation", "rest", "tea", "coffee",
    "view", "viewpoint", "show", "performance",
}

# Time-of-day fatigue multiplier
# Activities late in the day accumulate fatigue from earlier ones
TIME_FATIGUE_MULTIPLIER = {
    "morning": 1.0,    # 5am-11am
    "midday": 1.15,    # 11am-2pm
    "afternoon": 1.25, # 2pm-5pm
    "evening": 1.40,   # 5pm-9pm
    "night": 1.50,     # 9pm-late
}

# Cumulative day fatigue — each activity adds to the day's running score
DAY_ACCUMULATION_FACTOR = 0.15  # per prior activity in the same day

# Weather impact on fatigue (added to score)
WEATHER_FATIGUE_BONUS = {
    "clear":          0,
    "partly_cloudy":  0,
    "cloudy":         -2,    # slightly easier
    "fog":            +3,
    "drizzle":        +5,
    "rain":           +8,
    "heavy_rain":     +15,
    "thunderstorm":   +18,
    "snow":           +12,
    "unknown":        0,
}

# Heat / cold impact on fatigue (added to score)
def _temperature_fatigue_bonus(temp_max_c: float) -> float:
    """
    Temperature deviation from ideal 22°C increases fatigue.
    Heat is more punishing than cold for tourism.
    """
    if temp_max_c >= 38:
        return 18
    if temp_max_c >= 34:
        return 12
    if temp_max_c >= 30:
        return 7
    if temp_max_c >= 26:
        return 3
    if temp_max_c <= 5:
        return 8
    if temp_max_c <= 10:
        return 4
    return 0

@dataclass
class FatigueScore:
    """Computed fatigue for a single activity."""
    score: int                      # 0-100
    level: str                      # "LOW" | "MEDIUM" | "HIGH"
    factors: dict[str, float]       # breakdown for transparency


class FatigueService:
    """
    Rule-based fatigue prediction engine.

    Public API (stable across implementations):
        - score_activity(activity, prior_activities_today=None) -> FatigueScore
        - score_itinerary(days) -> list[list[FatigueScore]]
    """

    def __init__(self) -> None:
        logger.info("FatigueService initialised (rule-based v1)")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def score_activity(
        self,
        activity: dict,
        prior_activities_today: int = 0,
        weather: dict | None = None,
    ) -> FatigueScore:
        """
        Score a single activity from 0-100.

        Args:
            activity: Dict with keys: time, place, description, estimated_cost
            prior_activities_today: How many activities came before this
                                    one on the same day (for accumulation)

        Returns:
            FatigueScore with numeric score, level, and factor breakdown.
        """
        text = self._activity_text(activity)
        intensity_score = self._compute_intensity(text)
        duration_score = self._compute_duration(activity)
        time_multiplier = self._compute_time_multiplier(activity)
        accumulation = self._compute_accumulation(prior_activities_today)

        raw_score = (intensity_score + duration_score) * time_multiplier
        weather_bonus = self._weather_bonus(weather)
        final_score = raw_score + accumulation + weather_bonus

        # Clamp 5-95
        final_score = max(5, min(95, int(round(final_score))))

        level = self._score_to_level(final_score)

        factors = {
            "intensity": round(intensity_score, 2),
            "duration": round(duration_score, 2),
            "time_multiplier": round(time_multiplier, 2),
            "accumulation": round(accumulation, 2),
            "weather": round(weather_bonus, 2),
        }

        return FatigueScore(
            score=final_score,
            level=level,
            factors=factors,
        )

    def score_itinerary(self, days: list[dict], weather_by_date: dict[str, dict] | None = None) -> list[dict]:
        """
        Score every activity across every day of an itinerary.

        Returns the input days structure with `fatigue_score` and
        `fatigue_level` keys added to each activity.

        Args:
            days: list of day dicts, each containing an 'activities' list

        Returns:
            Same structure with fatigue annotations added.
        """
        annotated_days = []

        weather_by_date = weather_by_date or {}

        for day_obj in days:
            annotated_activities = []
            activities = day_obj.get("activities", [])
            day_date = day_obj.get("date")
            day_weather = weather_by_date.get(day_date)

            for idx, activity in enumerate(activities):
                fatigue = self.score_activity(
                    activity=activity,
                    prior_activities_today=idx,
                    weather=day_weather,
                )

                annotated = dict(activity)
                annotated["fatigue_score"] = fatigue.score
                annotated["fatigue_level"] = fatigue.level
                annotated_activities.append(annotated)

            annotated_day = dict(day_obj)
            annotated_day["activities"] = annotated_activities
            annotated_day["day_fatigue_average"] = self._day_average(
                annotated_activities
            )
            annotated_days.append(annotated_day)

        return annotated_days

    # ------------------------------------------------------------------
    # Private — scoring components
    # ------------------------------------------------------------------

    def _activity_text(self, activity: dict) -> str:
        """Combine place and description into one searchable string."""
        place = str(activity.get("place", "")).lower()
        desc = str(activity.get("description", "")).lower()
        return f"{place} {desc}"

    def _compute_intensity(self, text: str) -> float:
        """
        Score based on keyword matches.
        Returns 0-50 raw score.
        """
        high_hits = sum(1 for kw in HIGH_INTENSITY_KEYWORDS if kw in text)
        medium_hits = sum(1 for kw in MEDIUM_INTENSITY_KEYWORDS if kw in text)
        low_hits = sum(1 for kw in LOW_INTENSITY_KEYWORDS if kw in text)

        if high_hits > 0:
            return 40.0 + min(10, high_hits * 3)
        if medium_hits > 0:
            return 20.0 + min(10, medium_hits * 2)
        if low_hits > 0:
            return 8.0 + min(7, low_hits * 1.5)

        return 18.0  # neutral default

    def _compute_duration(self, activity: dict) -> float:
        """
        Estimate activity duration from the time field.
        Returns 0-25 raw score based on duration in hours.
        """
        time_str = str(activity.get("time", ""))
        duration_hours = self._parse_duration(time_str)

        # Cap at 6 hours for scoring purposes
        capped = min(duration_hours, 6.0)
        return (capped / 6.0) * 25.0

    def _compute_time_multiplier(self, activity: dict) -> float:
        """
        Activities later in the day carry more accumulated fatigue.
        """
        time_str = str(activity.get("time", ""))
        period = self._classify_time_of_day(time_str)
        return TIME_FATIGUE_MULTIPLIER.get(period, 1.0)

    def _compute_accumulation(self, prior_count: int) -> float:
        """
        Each prior activity in the same day adds to fatigue.
        Returns 0-20 raw score.
        """
        return min(20, prior_count * DAY_ACCUMULATION_FACTOR * 20)

    def _score_to_level(self, score: int) -> str:
        if score < 35:
            return "LOW"
        if score < 65:
            return "MEDIUM"
        return "HIGH"

    def _day_average(self, activities: list[dict]) -> int:
        """Average fatigue score for the day."""
        if not activities:
            return 0
        scores = [a.get("fatigue_score", 0) for a in activities]
        return int(round(sum(scores) / len(scores)))

    # ------------------------------------------------------------------
    # Private — time string parsing
    # ------------------------------------------------------------------

    def _parse_duration(self, time_str: str) -> float:
        """
        Parse various time string formats to estimate duration in hours.
        Examples:
            "9:00 AM - 12:00 PM"  → 3.0
            "8 AM"                → 1.5 (default)
            "8:00 AM - 11:00 AM"  → 3.0
            "TBD"                 → 1.5
        """
        if not time_str or time_str.upper() == "TBD":
            return 1.5

        # Try to find a range like "9:00 AM - 12:00 PM" or "9 AM - 12 PM"
        range_pattern = re.compile(
            r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*[-–to]+\s*"
            r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?",
            re.IGNORECASE,
        )
        match = range_pattern.search(time_str)
        if match:
            start_h = int(match.group(1))
            start_m = int(match.group(2) or 0)
            start_p = (match.group(3) or "").upper()
            end_h = int(match.group(4))
            end_m = int(match.group(5) or 0)
            end_p = (match.group(6) or "").upper()

            start = self._to_24h(start_h, start_m, start_p)
            end = self._to_24h(end_h, end_m, end_p)

            if end < start:
                end += 12  # handle PM not specified

            duration = end - start
            if 0 < duration <= 12:
                return duration

        return 1.5  # default

    def _to_24h(self, hour: int, minute: int, period: str) -> float:
        """Convert hour with AM/PM to decimal hours in 24h format."""
        h = hour
        if period == "PM" and h != 12:
            h += 12
        elif period == "AM" and h == 12:
            h = 0
        return h + (minute / 60.0)

    def _classify_time_of_day(self, time_str: str) -> str:
        """
        Determine if an activity is morning/midday/afternoon/evening/night
        based on its start time.
        """
        start_pattern = re.compile(
            r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?",
            re.IGNORECASE,
        )
        match = start_pattern.search(time_str)
        if not match:
            return "midday"

        hour = int(match.group(1))
        period = (match.group(3) or "").upper()
        h24 = self._to_24h(hour, int(match.group(2) or 0), period)

        if 5 <= h24 < 11:
            return "morning"
        if 11 <= h24 < 14:
            return "midday"
        if 14 <= h24 < 17:
            return "afternoon"
        if 17 <= h24 < 21:
            return "evening"
        return "night"
    
    def _weather_bonus(self, weather: dict | None) -> float:
        """
        Compute fatigue bonus from weather data.

        Args:
            weather: dict with keys 'condition_code' and 'temp_max'

        Returns:
            Fatigue bonus (can be negative for pleasant weather).
        """
        if not weather:
            return 0.0

        code = weather.get("condition_code", "unknown")
        temp_max = weather.get("temp_max")

        bonus = WEATHER_FATIGUE_BONUS.get(code, 0)

        if temp_max is not None:
            try:
                bonus += _temperature_fatigue_bonus(float(temp_max))
            except (TypeError, ValueError):
                pass

        return float(bonus)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_fatigue_service: FatigueService | None = None


def get_fatigue_service() -> FatigueService:
    global _fatigue_service
    if _fatigue_service is None:
        _fatigue_service = FatigueService()
    return _fatigue_service