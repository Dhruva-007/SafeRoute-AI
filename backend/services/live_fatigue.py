"""
Live Fatigue Service
====================
Phase 4 — Live Tour Monitoring Service Layer

Sits between the route handler and the ModelManager.
Provides:
    - Alert threshold evaluation
    - Trend detection (improving / worsening / stable)
    - Contextual recommendations based on score + context
    - Structured LiveFatigueResult for frontend consumption

This service is stateless — all session context is provided
per-request by the client.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ─── Alert thresholds ─────────────────────────────────────────────────────────

ALERT_THRESHOLD_CAUTION  = 50   # score ≥ 50 → CAUTION alert
ALERT_THRESHOLD_WARNING  = 65   # score ≥ 65 → WARNING alert
ALERT_THRESHOLD_CRITICAL = 80   # score ≥ 80 → CRITICAL alert

# ─── Recommendation bank ─────────────────────────────────────────────────────

_RECOMMENDATIONS: dict[str, list[str]] = {
    "LOW": [
        "You're managing well. Maintain your current pace.",
        "Hydration check: have you had water in the last 30 minutes?",
        "Good energy levels — ideal time for exploring.",
    ],
    "MEDIUM": [
        "Consider reducing your walking pace by 20%.",
        "Look for a shaded rest area within the next 10-15 minutes.",
        "Hydrate and have a light snack if you haven't recently.",
        "Your next scheduled activity may benefit from a shorter visit.",
    ],
    "HIGH": [
        "Rest is strongly recommended — find seating immediately.",
        "Seek shade or an air-conditioned space to cool down.",
        "Drink water slowly — at least 500ml before continuing.",
        "Consider shortening today's remaining itinerary.",
        "If symptoms persist, contact your group or emergency services.",
    ],
}

_ALERT_MESSAGES: dict[str, dict[str, str]] = {
    "CAUTION": {
        "title":   "Fatigue Building",
        "message": "Your fatigue level is increasing. Consider slowing your pace.",
        "action":  "Plan a rest within the next 20 minutes.",
    },
    "WARNING": {
        "title":   "High Fatigue Detected",
        "message": "Your current activity level is causing significant fatigue.",
        "action":  "Find a rest spot now. Rehydrate before continuing.",
    },
    "CRITICAL": {
        "title":   "Critical Fatigue Level",
        "message": "Your fatigue is at a critical level. Stop activity immediately.",
        "action":  "Sit down, hydrate, and rest for at least 20 minutes.",
    },
}


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class AlertInfo:
    """Alert data if score exceeds a threshold."""
    severity: str        # "CAUTION" | "WARNING" | "CRITICAL"
    title:    str
    message:  str
    action:   str


@dataclass
class LiveFatigueResult:
    """
    Complete live fatigue assessment result.
    Returned by LiveFatigueService.assess() and serialized for the API.
    """
    # Core prediction
    score:            float
    score_int:        int
    level:            str
    confidence:       float

    # Context
    alert:            AlertInfo | None
    recommendations:  list[str]
    features_used:    dict[str, Any]
    engine:           str = "xgboost-v1"


# ─── Service ──────────────────────────────────────────────────────────────────

class LiveFatigueService:
    """
    High-level live fatigue assessment service.

    Wraps ModelManager + FeatureBuilder and adds:
        - Alert threshold evaluation
        - Contextual recommendations
        - Structured output
    """

    def assess(
        self,
        prediction_result: dict[str, Any],
        features_used:     dict[str, Any],
    ) -> LiveFatigueResult:
        """
        Build a complete LiveFatigueResult from a raw model prediction.

        Args:
            prediction_result: Output from ModelManager.predict()
            features_used:     Feature vector used for the prediction

        Returns:
            LiveFatigueResult with alert, recommendations, and full context
        """
        score     = prediction_result["score"]
        score_int = prediction_result["score_int"]
        level     = prediction_result["level"]
        confidence = prediction_result["confidence"]

        alert = self._evaluate_alert(score_int)
        recommendations = self._get_recommendations(level)

        return LiveFatigueResult(
            score=score,
            score_int=score_int,
            level=level,
            confidence=confidence,
            alert=alert,
            recommendations=recommendations,
            features_used=features_used,
        )

    def _evaluate_alert(self, score: int) -> AlertInfo | None:
        """
        Evaluate whether the score crosses an alert threshold.
        Returns the highest applicable alert, or None.
        """
        if score >= ALERT_THRESHOLD_CRITICAL:
            info = _ALERT_MESSAGES["CRITICAL"]
            return AlertInfo(severity="CRITICAL", **info)
        if score >= ALERT_THRESHOLD_WARNING:
            info = _ALERT_MESSAGES["WARNING"]
            return AlertInfo(severity="WARNING", **info)
        if score >= ALERT_THRESHOLD_CAUTION:
            info = _ALERT_MESSAGES["CAUTION"]
            return AlertInfo(severity="CAUTION", **info)
        return None

    def _get_recommendations(self, level: str) -> list[str]:
        """Return recommendations appropriate for the fatigue level."""
        return _RECOMMENDATIONS.get(level, _RECOMMENDATIONS["LOW"])


# ─── Singleton ────────────────────────────────────────────────────────────────

_live_fatigue_service: LiveFatigueService | None = None


def get_live_fatigue_service() -> LiveFatigueService:
    global _live_fatigue_service
    if _live_fatigue_service is None:
        _live_fatigue_service = LiveFatigueService()
    return _live_fatigue_service