"""
fatigue_optimizer.py
====================
Phase 8 — Fatigue-Aware Planning

Responsibilities:
    1. Score each place/activity by fatigue level
    2. Detect bad daily combinations (too many high-fatigue places)
    3. Detect back-to-back high-intensity sequences
    4. Reorder or flag days that exceed fatigue thresholds
    5. Ensure each day has at least one recovery/rest activity

This module operates on RouteOptimizedDay objects AFTER route
optimization and BEFORE LLM description generation.

It does NOT remove must-visit places.
It does NOT break geographic clustering.
It REORDERS within a day first, then flags if still unbalanced.

Integration point in planner.py:
    Route Optimizer
    ↓
    Fatigue Optimizer   ← HERE
    ↓
    LLM Descriptions

Fatigue Score per activity:
    walking_intensity = high     → 3.0
    walking_intensity = medium   → 1.5
    walking_intensity = low      → 0.5
    walking_intensity = minimal  → 0.0
    duration > 3h                → +1.5
    duration > 2h                → +1.0
    duration > 1h                → +0.5
    category = Adventure         → +1.0
    category = Nature & Parks    → +0.5
    indoor = True                → -0.5  (air-conditioned rest)

Daily fatigue cap: 8.0
Max high-intensity places per day: 2
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Fatigue Thresholds
# ---------------------------------------------------------------------------

# Maximum total fatigue score allowed per day
DAILY_FATIGUE_CAP = 8.0

# Maximum number of HIGH walking intensity places allowed in one day
MAX_HIGH_INTENSITY_PER_DAY = 2

# Fatigue score at or above this = HIGH fatigue activity
HIGH_FATIGUE_THRESHOLD = 3.5

# Fatigue score below this = LOW fatigue activity (recovery)
LOW_FATIGUE_THRESHOLD = 1.5


# ---------------------------------------------------------------------------
# Walking Intensity Weights
# ---------------------------------------------------------------------------

WALKING_WEIGHTS: dict[str, float] = {
    "high":    3.0,
    "medium":  1.5,
    "low":     0.5,
    "minimal": 0.0,
    "none":    0.0,
}

# Category fatigue bonuses
CATEGORY_WEIGHTS: dict[str, float] = {
    "Adventure":       1.0,
    "Nature & Parks":  0.5,
    "Historical Sites": 0.25,
}

# Category fatigue reductions (restful categories)
CATEGORY_REDUCTIONS: dict[str, float] = {
    "Cafes & Restaurants": -0.5,
    "Shopping":            -0.25,
    "Museums & Galleries": -0.25,
}


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class ActivityFatigue:
    """Fatigue analysis for a single activity."""
    name:              str
    fatigue_score:     float
    walking_intensity: str
    duration_hours:    float
    is_high_fatigue:   bool    # score >= HIGH_FATIGUE_THRESHOLD
    is_low_fatigue:    bool    # score <  LOW_FATIGUE_THRESHOLD
    is_must_visit:     bool


@dataclass
class DayFatigueReport:
    """Fatigue analysis for a single day."""
    day_index:           int
    total_fatigue:       float
    activity_fatigues:   list[ActivityFatigue]
    high_fatigue_count:  int
    has_recovery:        bool      # at least one low-fatigue activity
    exceeds_daily_cap:   bool
    has_consecutive_high: bool     # two high-fatigue places back-to-back
    warnings:            list[str]


@dataclass
class FatigueOptimizationResult:
    """Full result from the fatigue optimizer for an entire trip."""
    day_reports:        list[DayFatigueReport]
    overall_warnings:   list[str]
    days_reordered:     list[int]   # 0-based day indices that were reordered
    days_over_cap:      list[int]   # 0-based day indices still over cap after optimization
    optimization_applied: bool


# ---------------------------------------------------------------------------
# Fatigue Scoring
# ---------------------------------------------------------------------------

def _get_walking_intensity(activity: Any) -> str:
    """
    Extract walking_intensity from either a BuiltActivity object
    or a plain dict.
    """
    if isinstance(activity, dict):
        return str(activity.get("walking_intensity") or "low").lower().strip()
    return str(getattr(activity, "walking_intensity", "low") or "low").lower().strip()


def _get_duration_hours(activity: Any) -> float:
    """
    Extract duration_hours from either a BuiltActivity object or dict.
    Handles string formats like '2-3 hours' by taking the midpoint.
    """
    if isinstance(activity, dict):
        raw = activity.get("duration_hours") or activity.get("duration") or 1.0
    else:
        raw = getattr(activity, "duration_hours", 1.0) or 1.0

    if isinstance(raw, (int, float)):
        return float(raw)

    # Handle string formats: "2-3 hours", "1.5h", "90 minutes"
    raw_str = str(raw).lower().strip()

    # Try "X-Y hours" format
    if "-" in raw_str:
        parts = raw_str.replace("hours", "").replace("h", "").strip().split("-")
        try:
            low  = float(parts[0].strip())
            high = float(parts[1].strip())
            return (low + high) / 2.0
        except (ValueError, IndexError):
            pass

    # Try "X minutes"
    if "minute" in raw_str:
        try:
            mins = float(raw_str.replace("minutes", "").replace("min", "").strip())
            return mins / 60.0
        except ValueError:
            pass

    # Try plain number
    try:
        return float(
            raw_str.replace("hours", "").replace("hour", "")
                   .replace("h", "").strip()
        )
    except ValueError:
        return 1.0


def _get_category(activity: Any) -> str:
    if isinstance(activity, dict):
        return str(activity.get("category") or "").strip()
    return str(getattr(activity, "category", "") or "").strip()


def _get_indoor(activity: Any) -> bool:
    if isinstance(activity, dict):
        return bool(activity.get("indoor", False))
    return bool(getattr(activity, "indoor", False))


def _get_must_visit(activity: Any) -> bool:
    if isinstance(activity, dict):
        return bool(activity.get("must_visit", False))
    return bool(getattr(activity, "must_visit", False))


def _get_name(activity: Any) -> str:
    if isinstance(activity, dict):
        return str(activity.get("name") or activity.get("place") or "Unknown")
    return str(getattr(activity, "name", "Unknown") or "Unknown")


def score_activity_fatigue(activity: Any) -> ActivityFatigue:
    """
    Compute fatigue score for a single activity.

    Works with both BuiltActivity objects (from day_builder.py)
    and plain dicts (for testing).

    Returns:
        ActivityFatigue with computed score and classification.
    """
    name       = _get_name(activity)
    walking    = _get_walking_intensity(activity)
    duration   = _get_duration_hours(activity)
    category   = _get_category(activity)
    is_indoor  = _get_indoor(activity)
    must_visit = _get_must_visit(activity)

    # Base score from walking intensity
    score = WALKING_WEIGHTS.get(walking, 0.5)

    # Duration bonus
    if duration > 3.0:
        score += 1.5
    elif duration > 2.0:
        score += 1.0
    elif duration > 1.0:
        score += 0.5

    # Category bonus/reduction
    score += CATEGORY_WEIGHTS.get(category, 0.0)
    score += CATEGORY_REDUCTIONS.get(category, 0.0)

    # Indoor reduction (air-conditioned, seated, restful)
    if is_indoor:
        score -= 0.5

    # Clamp to non-negative
    score = max(0.0, score)

    return ActivityFatigue(
        name=name,
        fatigue_score=round(score, 2),
        walking_intensity=walking,
        duration_hours=duration,
        is_high_fatigue=score >= HIGH_FATIGUE_THRESHOLD,
        is_low_fatigue=score < LOW_FATIGUE_THRESHOLD,
        is_must_visit=must_visit,
    )


# ---------------------------------------------------------------------------
# Day Analysis
# ---------------------------------------------------------------------------

def analyse_day_fatigue(
    activities: list[Any],
    day_index:  int,
) -> DayFatigueReport:
    """
    Analyse fatigue for all activities in a single day.

    Args:
        activities: List of BuiltActivity objects or dicts
        day_index:  0-based day index

    Returns:
        DayFatigueReport with full fatigue breakdown.
    """
    activity_fatigues: list[ActivityFatigue] = []
    warnings: list[str] = []

    for act in activities:
        af = score_activity_fatigue(act)
        activity_fatigues.append(af)

    total_fatigue   = sum(af.fatigue_score for af in activity_fatigues)
    high_count      = sum(1 for af in activity_fatigues if af.is_high_fatigue)
    has_recovery    = any(af.is_low_fatigue for af in activity_fatigues)
    exceeds_cap     = total_fatigue > DAILY_FATIGUE_CAP

    # Check for consecutive high-fatigue activities
    has_consecutive = False
    for i in range(len(activity_fatigues) - 1):
        if (
            activity_fatigues[i].is_high_fatigue
            and activity_fatigues[i + 1].is_high_fatigue
        ):
            has_consecutive = True
            break

    # Build warnings
    if exceeds_cap:
        warnings.append(
            f"Day {day_index + 1}: Total fatigue {total_fatigue:.1f} "
            f"exceeds cap of {DAILY_FATIGUE_CAP:.1f}."
        )
    if high_count > MAX_HIGH_INTENSITY_PER_DAY:
        warnings.append(
            f"Day {day_index + 1}: {high_count} high-intensity activities "
            f"(max allowed: {MAX_HIGH_INTENSITY_PER_DAY})."
        )
    if has_consecutive:
        warnings.append(
            f"Day {day_index + 1}: Consecutive high-intensity activities detected."
        )
    if not has_recovery and len(activities) > 1:
        warnings.append(
            f"Day {day_index + 1}: No recovery/rest activity in day. "
            "Consider adding a cafe or museum."
        )

    return DayFatigueReport(
        day_index=day_index,
        total_fatigue=round(total_fatigue, 2),
        activity_fatigues=activity_fatigues,
        high_fatigue_count=high_count,
        has_recovery=has_recovery,
        exceeds_daily_cap=exceeds_cap,
        has_consecutive_high=has_consecutive,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Reordering Logic
# ---------------------------------------------------------------------------

def _reorder_to_break_consecutive(
    activities: list[Any],
    fatigues:   list[ActivityFatigue],
) -> tuple[list[Any], bool]:
    """
    Reorder activities to avoid back-to-back high-fatigue places.

    Strategy:
        Find the first consecutive high-high pair.
        Find the nearest low-fatigue activity.
        Insert the low-fatigue activity between the pair.

    Returns:
        (reordered_activities, was_reordered)
    """
    if len(activities) < 3:
        return activities, False

    # Find first consecutive high-high pair
    consecutive_idx = -1
    for i in range(len(fatigues) - 1):
        if fatigues[i].is_high_fatigue and fatigues[i + 1].is_high_fatigue:
            consecutive_idx = i
            break

    if consecutive_idx == -1:
        return activities, False

    # Find the first low-fatigue activity that is NOT in the pair
    low_idx = -1
    for i, af in enumerate(fatigues):
        if af.is_low_fatigue and i != consecutive_idx and i != consecutive_idx + 1:
            low_idx = i
            break

    if low_idx == -1:
        # No low-fatigue activity to insert — cannot reorder
        return activities, False

    # Build new order: insert low_idx activity between consecutive pair
    new_order: list[Any] = []
    low_activity = activities[low_idx]

    for i, act in enumerate(activities):
        if i == low_idx:
            continue   # will be inserted elsewhere
        new_order.append(act)
        # Insert low-fatigue activity right after the first of the consecutive pair
        if i == consecutive_idx:
            new_order.append(low_activity)

    logger.debug(
        "Broke consecutive high-fatigue pair at index %d "
        "by inserting '%s'.",
        consecutive_idx,
        fatigues[low_idx].name,
    )

    return new_order, True


def _reorder_high_intensity_spread(
    activities: list[Any],
    fatigues:   list[ActivityFatigue],
) -> tuple[list[Any], bool]:
    """
    Spread high-intensity activities across the day so they are
    not clustered at the start or back-to-back.

    Strategy:
        Sort by fatigue score: high → low → high → low (alternating).
        This creates a natural rhythm: intense → rest → intense → rest.

    Note: This is a soft reorder — must-visit places keep their
    relative priority but may shift position.

    Returns:
        (reordered_activities, was_reordered)
    """
    if len(activities) <= 2:
        return activities, False

    # Separate into high and low/medium fatigue groups
    high_fatigue = [
        (i, act, fatigues[i])
        for i, act in enumerate(activities)
        if fatigues[i].is_high_fatigue
    ]
    low_medium = [
        (i, act, fatigues[i])
        for i, act in enumerate(activities)
        if not fatigues[i].is_high_fatigue
    ]

    if len(high_fatigue) <= 1:
        # Only 0 or 1 high fatigue activity — nothing to spread
        return activities, False

    # Interleave: high, low, high, low, ...
    new_order: list[Any] = []
    hi_iter = iter(high_fatigue)
    lo_iter = iter(low_medium)

    hi_exhausted = False
    lo_exhausted = False

    while not hi_exhausted or not lo_exhausted:
        if not hi_exhausted:
            try:
                _, act, _ = next(hi_iter)
                new_order.append(act)
            except StopIteration:
                hi_exhausted = True

        if not lo_exhausted:
            try:
                _, act, _ = next(lo_iter)
                new_order.append(act)
            except StopIteration:
                lo_exhausted = True

    if len(new_order) != len(activities):
        return activities, False

    # Check if order actually changed
    original_names = [_get_name(a) for a in activities]
    new_names      = [_get_name(a) for a in new_order]
    changed        = original_names != new_names

    return new_order, changed


# ---------------------------------------------------------------------------
# Main Optimizer Entry Point
# ---------------------------------------------------------------------------

def optimise_day_fatigue(
    activities: list[Any],
    day_index:  int,
) -> tuple[list[Any], DayFatigueReport]:
    """
    Optimise a single day's activity list for fatigue balance.

    Steps:
        1. Analyse current fatigue state
        2. If consecutive high-fatigue pair → reorder to break it
        3. If still too many high-fatigue back-to-back → spread them
        4. Re-analyse after reordering
        5. Return final order + report

    Args:
        activities: List of BuiltActivity objects or dicts
        day_index:  0-based day index for logging

    Returns:
        (optimised_activities, DayFatigueReport after optimisation)
    """
    if not activities:
        return activities, DayFatigueReport(
            day_index=day_index,
            total_fatigue=0.0,
            activity_fatigues=[],
            high_fatigue_count=0,
            has_recovery=True,
            exceeds_daily_cap=False,
            has_consecutive_high=False,
            warnings=[],
        )

    # ── Step 1: Initial analysis ──────────────────────────────────────
    initial_report = analyse_day_fatigue(activities, day_index)

    logger.info(
        "Day %d fatigue analysis: total=%.1f | high=%d | "
        "consecutive=%s | recovery=%s | over_cap=%s",
        day_index + 1,
        initial_report.total_fatigue,
        initial_report.high_fatigue_count,
        initial_report.has_consecutive_high,
        initial_report.has_recovery,
        initial_report.exceeds_daily_cap,
    )

    if initial_report.warnings:
        for w in initial_report.warnings:
            logger.warning("  FATIGUE WARNING: %s", w)

    # ── Step 2: If no issues, return as-is ───────────────────────────
    if (
        not initial_report.has_consecutive_high
        and initial_report.high_fatigue_count <= MAX_HIGH_INTENSITY_PER_DAY
        and not initial_report.exceeds_daily_cap
    ):
        logger.info("Day %d: Fatigue is balanced. No reordering needed.", day_index + 1)
        return activities, initial_report

    # ── Step 3: Try to fix consecutive high-fatigue pairs ────────────
    current_activities = list(activities)
    reordered          = False

    if initial_report.has_consecutive_high:
        current_fatigues = [af for af in initial_report.activity_fatigues]
        current_activities, did_reorder = _reorder_to_break_consecutive(
            current_activities, current_fatigues
        )
        if did_reorder:
            reordered = True
            logger.info(
                "Day %d: Reordered to break consecutive high-fatigue pair.",
                day_index + 1,
            )

    # ── Step 4: If still too many high-intensity back-to-back, spread them ─
    mid_report = analyse_day_fatigue(current_activities, day_index)
    if mid_report.has_consecutive_high or mid_report.high_fatigue_count > MAX_HIGH_INTENSITY_PER_DAY:
        current_fatigues = [af for af in mid_report.activity_fatigues]
        current_activities, did_spread = _reorder_high_intensity_spread(
            current_activities, current_fatigues
        )
        if did_spread:
            reordered = True
            logger.info(
                "Day %d: Spread high-intensity activities to reduce clustering.",
                day_index + 1,
            )

    # ── Step 5: Final analysis after all reordering ───────────────────
    final_report = analyse_day_fatigue(current_activities, day_index)

    if reordered:
        original_names = [_get_name(a) for a in activities]
        final_names    = [_get_name(a) for a in current_activities]
        if original_names != final_names:
            logger.info(
                "Day %d: Activity order changed by fatigue optimizer.",
                day_index + 1,
            )
            logger.info("  Before: %s", original_names)
            logger.info("  After:  %s", final_names)
        else:
            logger.info(
                "Day %d: Fatigue optimizer ran but order unchanged "
                "(best achievable with current activities).",
                day_index + 1,
            )

    # Log final state
    logger.info(
        "Day %d final fatigue: total=%.1f | high=%d | "
        "consecutive=%s | recovery=%s | over_cap=%s",
        day_index + 1,
        final_report.total_fatigue,
        final_report.high_fatigue_count,
        final_report.has_consecutive_high,
        final_report.has_recovery,
        final_report.exceeds_daily_cap,
    )

    return current_activities, final_report


def optimise_trip_fatigue(
    days_activities: list[list[Any]],
) -> FatigueOptimizationResult:
    """
    Main entry point called by the planner.

    Optimises fatigue balance for every day in the trip.

    Args:
        days_activities: List of activity lists, one per day.
                         Each list contains BuiltActivity objects.

    Returns:
        FatigueOptimizationResult containing:
            - Optimised activity lists (access via day_reports)
            - Per-day reports
            - Overall warnings
    """
    logger.info("=" * 60)
    logger.info(
        "FATIGUE OPTIMIZER — Analysing %d-day trip", len(days_activities)
    )
    logger.info("=" * 60)

    day_reports:       list[DayFatigueReport] = []
    overall_warnings:  list[str]              = []
    days_reordered:    list[int]              = []
    days_over_cap:     list[int]              = []
    optimisation_applied = False

    optimised_days: list[list[Any]] = []

    for day_idx, activities in enumerate(days_activities):
        optimised, report = optimise_day_fatigue(activities, day_idx)
        optimised_days.append(optimised)
        day_reports.append(report)

        # Track if this day was reordered
        original_names = [_get_name(a) for a in activities]
        optimised_names = [_get_name(a) for a in optimised]
        if original_names != optimised_names:
            days_reordered.append(day_idx)
            optimisation_applied = True

        # Track if day is still over cap after optimisation
        if report.exceeds_daily_cap:
            days_over_cap.append(day_idx)

        overall_warnings.extend(report.warnings)

    # ── Summary log ───────────────────────────────────────────────────
    logger.info("")
    logger.info("Fatigue Optimization Summary:")
    logger.info("-" * 60)
    for report in day_reports:
        status = "⚠ OVER CAP" if report.exceeds_daily_cap else "✓ OK"
        logger.info(
            "  Day %d: fatigue=%.1f | high=%d | recovery=%s | %s",
            report.day_index + 1,
            report.total_fatigue,
            report.high_fatigue_count,
            "yes" if report.has_recovery else "NO",
            status,
        )
    logger.info("-" * 60)

    if days_reordered:
        logger.info(
            "Days reordered for fatigue balance: %s",
            [d + 1 for d in days_reordered],
        )
    else:
        logger.info("No days required fatigue reordering.")

    if days_over_cap:
        logger.warning(
            "Days still over fatigue cap after optimization: %s",
            [d + 1 for d in days_over_cap],
        )
    else:
        logger.info("All days within fatigue cap.")

    logger.info("=" * 60)

    return FatigueOptimizationResult(
        day_reports=day_reports,
        overall_warnings=overall_warnings,
        days_reordered=days_reordered,
        days_over_cap=days_over_cap,
        optimization_applied=optimisation_applied,
    )


# ---------------------------------------------------------------------------
# Utility: Get Fatigue Context for LLM Prompt
# ---------------------------------------------------------------------------

def get_fatigue_context_for_prompt(
    fatigue_result: FatigueOptimizationResult,
) -> str:
    """
    Generate a concise fatigue context string for the LLM prompt.
    Tells the LLM about pacing, rest points, and intensity rhythm.
    """
    lines = [
        "DAILY FATIGUE PROFILE (for pacing guidance):",
        "-" * 45,
    ]

    for report in fatigue_result.day_reports:
        intensity_desc = _describe_intensity(report)
        recovery_note  = (
            "includes rest point"
            if report.has_recovery
            else "no rest point — mention pacing"
        )
        lines.append(
            f"  Day {report.day_index + 1}: "
            f"[{intensity_desc}] "
            f"fatigue={report.total_fatigue:.1f} | "
            f"{recovery_note}"
        )

    lines.append("-" * 45)

    if fatigue_result.days_over_cap:
        lines.append(
            "⚡ HEAVY DAYS: "
            + ", ".join(f"Day {d+1}" for d in fatigue_result.days_over_cap)
            + " — mention comfortable footwear and hydration."
        )

    return "\n".join(lines)


def _describe_intensity(report: DayFatigueReport) -> str:
    """Return a human-readable intensity label for a day."""
    if report.total_fatigue >= DAILY_FATIGUE_CAP:
        return "INTENSE"
    if report.high_fatigue_count >= 2:
        return "MODERATE-HIGH"
    if report.high_fatigue_count == 1:
        return "MODERATE"
    return "RELAXED"