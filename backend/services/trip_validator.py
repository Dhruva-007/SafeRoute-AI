"""
trip_validator.py
=================
Phase 9 — Trip Validation Layer

Runs after FatigueOptimizer and before LLM description generation.

Checks:
    1. No duplicate places across the trip
    2. All places exist in the dataset (places.json)
    3. Daily duration within acceptable range (3h minimum, 14h maximum)
    4. Budget respected (place cost tiers match user budget)
    5. Weather compatibility (outdoor places on bad weather days)
    6. Fatigue balance (days still over cap are flagged)
    7. Route order valid (geographic ordering, not chaotic jumps)
    8. Nearby clustering valid (day's places are in same/adjacent zones)

Output:
    ValidationReport
        .passed:  bool         — True if all critical checks pass
        .checks:  list[Check]  — one per validation rule
        .warnings: list[str]   — non-critical issues
        .errors:   list[str]   — critical failures

The planner does NOT stop on validation failure.
The report is logged and attached to the response for observability.

Integration point:
    Fatigue Optimizer
    ↓
    Trip Validator   ← HERE (Phase 9)
    ↓
    LLM Descriptions
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from math import asin, cos, radians, sin, sqrt
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_PLACES_JSON_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "places.json"
)

# ---------------------------------------------------------------------------
# Budget Tier Definitions
# These match the cost strings in your dataset.
# ---------------------------------------------------------------------------

BUDGET_TIERS: dict[str, set[str]] = {
    "budget": {"free", "budget", "low", "₹0", "₹50", "₹100", "₹150", "₹200"},
    "mid-range": {"free", "budget", "low", "mid-range", "moderate",
                  "₹0", "₹50", "₹100", "₹150", "₹200", "₹300", "₹500"},
    "luxury": {"free", "budget", "low", "mid-range", "moderate",
               "luxury", "high", "premium",
               "₹0", "₹50", "₹100", "₹150", "₹200",
               "₹300", "₹500", "₹1000", "₹2000"},
}

# Also accept any budget tier for these generic labels
ALWAYS_ACCEPTABLE_COSTS = {"free", "₹0"}

# ---------------------------------------------------------------------------
# Duration Thresholds (hours per day)
# ---------------------------------------------------------------------------

MIN_DAILY_HOURS = 2.0    # Below this: too short, likely data issue
MAX_DAILY_HOURS = 14.0   # Above this: physically impossible

# ---------------------------------------------------------------------------
# Route Validation Thresholds
# ---------------------------------------------------------------------------

# Maximum acceptable distance jump between consecutive activities (km)
# Hyderabad is ~100km across — a single jump > 30km within one day is suspicious
MAX_CONSECUTIVE_DISTANCE_KM = 30.0

# Maximum total daily travel distance (km) — sum of all legs
MAX_DAILY_TRAVEL_KM = 60.0

# ---------------------------------------------------------------------------
# Clustering Validation
# ---------------------------------------------------------------------------

# Maximum distance (km) between any two activities in the same day
# Activities within same zone should be close together
MAX_INTRADAY_SPREAD_KM = 25.0

# ---------------------------------------------------------------------------
# Weather Compatibility
# ---------------------------------------------------------------------------

# WeatherClass values that require indoor preference
INDOOR_REQUIRED_WEATHER = {"RAIN", "EXTREME_HEAT"}

# WeatherClass values where outdoor is mildly discouraged
INDOOR_PREFERRED_WEATHER = {"HOT"}


# ---------------------------------------------------------------------------
# Check Result
# ---------------------------------------------------------------------------

class CheckStatus(str, Enum):
    PASS    = "PASS"
    FAIL    = "FAIL"
    WARNING = "WARNING"
    SKIP    = "SKIP"   # check skipped (missing data)


@dataclass
class CheckResult:
    """Result of a single validation check."""
    name:    str
    status:  CheckStatus
    message: str
    details: list[str] = field(default_factory=list)


@dataclass
class ValidationReport:
    """
    Full validation report for a complete trip itinerary.

    .passed = True only if all CRITICAL checks pass.
    WARNING-level failures do not set passed=False.
    """
    passed:        bool
    checks:        list[CheckResult]
    warnings:      list[str]
    errors:        list[str]
    total_places:  int
    total_days:    int

    @property
    def pass_count(self) -> int:
        return sum(1 for c in self.checks if c.status == CheckStatus.PASS)

    @property
    def fail_count(self) -> int:
        return sum(1 for c in self.checks if c.status == CheckStatus.FAIL)

    @property
    def warning_count(self) -> int:
        return sum(1 for c in self.checks if c.status == CheckStatus.WARNING)

    def summary_line(self) -> str:
        return (
            f"Validation: {'PASS' if self.passed else 'FAIL'} | "
            f"{self.pass_count} passed | "
            f"{self.fail_count} failed | "
            f"{self.warning_count} warnings"
        )


# ---------------------------------------------------------------------------
# Dataset Loader
# ---------------------------------------------------------------------------

_PLACES_CACHE: list[dict] | None = None


def _load_places() -> list[dict]:
    """Load places.json dataset. Cached after first load."""
    global _PLACES_CACHE
    if _PLACES_CACHE is not None:
        return _PLACES_CACHE

    path = os.path.abspath(_PLACES_JSON_PATH)
    if not os.path.exists(path):
        logger.warning(
            "places.json not found at %s. "
            "Dataset existence check will be skipped.",
            path,
        )
        _PLACES_CACHE = []
        return _PLACES_CACHE

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        # Handle both list format and dict format
        if isinstance(data, list):
            _PLACES_CACHE = data
        elif isinstance(data, dict):
            # May be wrapped: {"places": [...]}
            _PLACES_CACHE = data.get("places", list(data.values()))
        else:
            _PLACES_CACHE = []

        logger.info(
            "Validator: loaded %d places from dataset.", len(_PLACES_CACHE)
        )
    except Exception as exc:
        logger.warning("Validator: could not load places.json: %s", exc)
        _PLACES_CACHE = []

    return _PLACES_CACHE


def _build_known_names() -> set[str]:
    """Build a set of normalised known place names from the dataset."""
    places = _load_places()
    return {str(p.get("name", "")).strip().lower() for p in places if p.get("name")}


def _build_known_zones() -> dict[str, str]:
    """Build a mapping of place name → zone_id from the dataset."""
    places = _load_places()
    result: dict[str, str] = {}
    for p in places:
        name    = str(p.get("name", "")).strip().lower()
        zone_id = str(p.get("zone_id") or p.get("cluster_id") or "")
        if name and zone_id:
            result[name] = zone_id
    return result


# ---------------------------------------------------------------------------
# Haversine Distance
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance between two points in kilometres."""
    R    = 6371.0
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    dphi = radians(lat2 - lat1)
    dlam = radians(lon2 - lon1)
    a    = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlam / 2) ** 2
    return R * 2 * asin(sqrt(a))


# ---------------------------------------------------------------------------
# Helper: Extract Fields from Activity
# ---------------------------------------------------------------------------

def _get_field(activity: Any, *keys: str, default: Any = None) -> Any:
    """Extract a field from either a dict or an object with attributes."""
    for key in keys:
        if isinstance(activity, dict):
            if key in activity:
                return activity[key]
        else:
            if hasattr(activity, key):
                return getattr(activity, key)
    return default


def _get_name(activity: Any) -> str:
    return str(_get_field(activity, "name", "place", default="Unknown")).strip()


def _get_lat(activity: Any) -> float | None:
    val = _get_field(activity, "lat", "latitude", default=None)
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _get_lon(activity: Any) -> float | None:
    val = _get_field(activity, "lon", "longitude", default=None)
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _get_duration(activity: Any) -> float:
    val = _get_field(activity, "duration_hours", "duration", default=1.0)
    if isinstance(val, (int, float)):
        return float(val)
    # Try to parse "2-3 hours" style
    try:
        s = str(val).lower()
        if "-" in s:
            parts = s.replace("hours", "").replace("h", "").split("-")
            return (float(parts[0].strip()) + float(parts[1].strip())) / 2
        return float(s.replace("hours", "").replace("h", "").strip())
    except (ValueError, IndexError):
        return 1.0


def _get_cost(activity: Any) -> str:
    val = _get_field(activity, "cost", "avg_cost_per_person",
                     "estimated_cost", default="")
    return str(val).lower().strip()


def _get_indoor(activity: Any) -> bool:
    val = _get_field(activity, "indoor", default=None)
    if val is None:
        # Infer from category
        cat = str(_get_field(activity, "category", default="")).lower()
        return any(k in cat for k in ("museum", "cafe", "restaurant", "mall", "gallery"))
    return bool(val)


def _get_zone_id(activity: Any) -> str:
    val = _get_field(activity, "zone_id", "cluster_id", default="")
    return str(val).strip()


def _get_walking_intensity(activity: Any) -> str:
    return str(_get_field(activity, "walking_intensity", default="low")).lower()


# ---------------------------------------------------------------------------
# Individual Validation Checks
# ---------------------------------------------------------------------------

def check_no_duplicates(
    days_activities: list[list[Any]],
) -> CheckResult:
    """
    Check 1: No place appears more than once across the entire trip.
    """
    seen:       dict[str, tuple[int, int]] = {}   # name → (day, position)
    duplicates: list[str]                  = []

    for day_idx, activities in enumerate(days_activities):
        for pos, act in enumerate(activities):
            name = _get_name(act).lower()
            if name in seen:
                orig_day, orig_pos = seen[name]
                duplicates.append(
                    f"'{_get_name(act)}' appears on Day {orig_day + 1} "
                    f"and Day {day_idx + 1}"
                )
            else:
                seen[name] = (day_idx, pos)

    if duplicates:
        return CheckResult(
            name="No Duplicate Places",
            status=CheckStatus.FAIL,
            message=f"Found {len(duplicates)} duplicate place(s).",
            details=duplicates,
        )

    return CheckResult(
        name="No Duplicate Places",
        status=CheckStatus.PASS,
        message=f"All {len(seen)} places are unique across the trip.",
    )


def check_places_exist(
    days_activities: list[list[Any]],
    known_names:     set[str],
) -> CheckResult:
    """
    Check 2: All place names exist in the dataset.
    """
    if not known_names:
        return CheckResult(
            name="Places Exist in Dataset",
            status=CheckStatus.SKIP,
            message="Dataset not loaded. Check skipped.",
        )

    unknown: list[str] = []

    for day_idx, activities in enumerate(days_activities):
        for act in activities:
            name = _get_name(act)
            if name.lower() not in known_names:
                unknown.append(f"Day {day_idx + 1}: '{name}'")

    if unknown:
        return CheckResult(
            name="Places Exist in Dataset",
            status=CheckStatus.FAIL,
            message=f"Found {len(unknown)} unknown place(s).",
            details=unknown,
        )

    total = sum(len(acts) for acts in days_activities)
    return CheckResult(
        name="Places Exist in Dataset",
        status=CheckStatus.PASS,
        message=f"All {total} places verified in dataset.",
    )


def check_daily_duration(
    days_activities: list[list[Any]],
) -> CheckResult:
    """
    Check 3: Each day's total duration is within acceptable range.
    """
    issues: list[str] = []

    for day_idx, activities in enumerate(days_activities):
        total_hours = sum(_get_duration(a) for a in activities)

        if total_hours < MIN_DAILY_HOURS and len(activities) > 0:
            issues.append(
                f"Day {day_idx + 1}: {total_hours:.1f}h is below "
                f"minimum {MIN_DAILY_HOURS}h."
            )
        elif total_hours > MAX_DAILY_HOURS:
            issues.append(
                f"Day {day_idx + 1}: {total_hours:.1f}h exceeds "
                f"maximum {MAX_DAILY_HOURS}h."
            )

    if issues:
        return CheckResult(
            name="Daily Duration Valid",
            status=CheckStatus.WARNING,
            message=f"{len(issues)} day(s) have duration concerns.",
            details=issues,
        )

    return CheckResult(
        name="Daily Duration Valid",
        status=CheckStatus.PASS,
        message="All days have valid total durations.",
    )


def check_budget_respected(
    days_activities: list[list[Any]],
    user_budget:     str,
) -> CheckResult:
    """
    Check 4: Place costs are compatible with the user's budget tier.

    Note: Cost data in the dataset is often not a simple string —
    it may be a number (avg_cost_per_person). We apply loose matching
    and only fail on clear luxury places for budget users.
    """
    tier        = user_budget.lower().strip()
    acceptable  = BUDGET_TIERS.get(tier, BUDGET_TIERS["mid-range"])
    violations: list[str] = []

    for day_idx, activities in enumerate(days_activities):
        for act in activities:
            cost = _get_cost(act)

            # If cost is a pure number, check against budget tier limits
            try:
                cost_num = float(cost.replace("₹", "").replace(",", "").strip())
                if tier == "budget" and cost_num > 500:
                    violations.append(
                        f"Day {day_idx + 1}: '{_get_name(act)}' "
                        f"costs ₹{cost_num:.0f} (budget limit ~₹500)."
                    )
                elif tier == "mid-range" and cost_num > 2000:
                    violations.append(
                        f"Day {day_idx + 1}: '{_get_name(act)}' "
                        f"costs ₹{cost_num:.0f} (mid-range limit ~₹2000)."
                    )
                continue
            except ValueError:
                pass

            # String cost check
            if cost and cost not in ALWAYS_ACCEPTABLE_COSTS:
                if tier == "budget" and any(
                    kw in cost for kw in ("luxury", "premium", "high-end")
                ):
                    violations.append(
                        f"Day {day_idx + 1}: '{_get_name(act)}' "
                        f"marked as '{cost}' (exceeds budget tier)."
                    )

    if violations:
        return CheckResult(
            name="Budget Respected",
            status=CheckStatus.WARNING,
            message=f"{len(violations)} potential budget concern(s).",
            details=violations,
        )

    return CheckResult(
        name="Budget Respected",
        status=CheckStatus.PASS,
        message=f"All places compatible with '{user_budget}' budget.",
    )


def check_weather_compatibility(
    days_activities:  list[list[Any]],
    day_weather_list: list[Any] | None,
) -> CheckResult:
    """
    Check 5: Outdoor/high-intensity activities not scheduled on
    rain or extreme heat days.

    day_weather_list: list of DayWeather objects from weather_optimizer.
                      If None, check is skipped.
    """
    if not day_weather_list:
        return CheckResult(
            name="Weather Compatibility",
            status=CheckStatus.SKIP,
            message="No weather data available. Check skipped.",
        )

    issues:   list[str] = []
    warnings: list[str] = []

    for day_idx, activities in enumerate(days_activities):
        if day_idx >= len(day_weather_list):
            break

        dw          = day_weather_list[day_idx]
        weather_cls = str(dw.classification.value if hasattr(dw, 'classification')
                          else dw.get("classification", "CLEAR")).upper()

        for act in activities:
            is_out   = not _get_indoor(act)
            walking  = _get_walking_intensity(act)
            name     = _get_name(act)

            if weather_cls in INDOOR_REQUIRED_WEATHER and is_out:
                if walking == "high":
                    issues.append(
                        f"Day {day_idx + 1} [{weather_cls}]: "
                        f"'{name}' is outdoor high-intensity "
                        f"on a {weather_cls} day."
                    )
                else:
                    warnings.append(
                        f"Day {day_idx + 1} [{weather_cls}]: "
                        f"'{name}' is outdoor on a {weather_cls} day."
                    )

            elif weather_cls in INDOOR_PREFERRED_WEATHER and is_out and walking == "high":
                warnings.append(
                    f"Day {day_idx + 1} [{weather_cls}]: "
                    f"'{name}' is outdoor high-intensity on a HOT day."
                )

    if issues:
        return CheckResult(
            name="Weather Compatibility",
            status=CheckStatus.WARNING,
            message=(
                f"{len(issues)} outdoor activity/weather conflict(s). "
                f"{len(warnings)} additional concern(s)."
            ),
            details=issues + warnings,
        )

    if warnings:
        return CheckResult(
            name="Weather Compatibility",
            status=CheckStatus.WARNING,
            message=f"{len(warnings)} minor weather concern(s).",
            details=warnings,
        )

    return CheckResult(
        name="Weather Compatibility",
        status=CheckStatus.PASS,
        message="All activities compatible with forecasted weather.",
    )


def check_fatigue_balance(
    fatigue_result: Any | None,
) -> CheckResult:
    """
    Check 6: Fatigue is balanced. Days over cap are flagged.

    fatigue_result: FatigueOptimizationResult from fatigue_optimizer.
                    If None, check is skipped.
    """
    if fatigue_result is None:
        return CheckResult(
            name="Fatigue Balance",
            status=CheckStatus.SKIP,
            message="No fatigue data available. Check skipped.",
        )

    over_cap_days = getattr(fatigue_result, "days_over_cap", [])
    warnings      = getattr(fatigue_result, "overall_warnings", [])

    if over_cap_days:
        day_nums = [str(d + 1) for d in over_cap_days]
        return CheckResult(
            name="Fatigue Balance",
            status=CheckStatus.WARNING,
            message=(
                f"Day(s) {', '.join(day_nums)} exceed the fatigue cap "
                f"even after optimization."
            ),
            details=[
                w for w in warnings
                if any(f"Day {d + 1}" in w for d in over_cap_days)
            ],
        )

    return CheckResult(
        name="Fatigue Balance",
        status=CheckStatus.PASS,
        message="All days within fatigue thresholds.",
    )


def check_route_order(
    days_activities: list[list[Any]],
) -> CheckResult:
    """
    Check 7: Within each day, activities are in a geographically
    sensible order (no extreme back-and-forth jumps).

    Uses Haversine distance between consecutive activities.
    Requires lat/lon fields on activities.
    """
    issues: list[str] = []
    skipped_days = 0

    for day_idx, activities in enumerate(days_activities):
        if len(activities) < 2:
            continue

        # Check if coordinates are available
        coords = []
        for act in activities:
            lat = _get_lat(act)
            lon = _get_lon(act)
            if lat is not None and lon is not None:
                coords.append((lat, lon, _get_name(act)))

        if len(coords) < 2:
            skipped_days += 1
            continue

        # Check consecutive distances
        total_travel = 0.0
        for i in range(len(coords) - 1):
            lat1, lon1, name1 = coords[i]
            lat2, lon2, name2 = coords[i + 1]
            dist = _haversine_km(lat1, lon1, lat2, lon2)
            total_travel += dist

            if dist > MAX_CONSECUTIVE_DISTANCE_KM:
                issues.append(
                    f"Day {day_idx + 1}: Large jump {dist:.1f}km "
                    f"from '{name1}' to '{name2}'."
                )

        if total_travel > MAX_DAILY_TRAVEL_KM:
            issues.append(
                f"Day {day_idx + 1}: Total travel {total_travel:.1f}km "
                f"exceeds maximum {MAX_DAILY_TRAVEL_KM}km."
            )

    if skipped_days > 0:
        logger.debug(
            "Route check: skipped %d day(s) due to missing coordinates.",
            skipped_days,
        )

    if issues:
        return CheckResult(
            name="Route Order Valid",
            status=CheckStatus.WARNING,
            message=f"{len(issues)} route concern(s) detected.",
            details=issues,
        )

    return CheckResult(
        name="Route Order Valid",
        status=CheckStatus.PASS,
        message="All daily routes are geographically ordered.",
    )


def check_clustering(
    days_activities: list[list[Any]],
) -> CheckResult:
    """
    Check 8: Activities within a day are geographically clustered
    (not spread across the whole city).

    Uses maximum pairwise distance within each day.
    """
    issues: list[str] = []
    skipped_days = 0

    for day_idx, activities in enumerate(days_activities):
        if len(activities) < 2:
            continue

        coords = []
        for act in activities:
            lat = _get_lat(act)
            lon = _get_lon(act)
            if lat is not None and lon is not None:
                coords.append((lat, lon, _get_name(act)))

        if len(coords) < 2:
            skipped_days += 1
            continue

        # Find maximum pairwise distance (spread)
        max_dist = 0.0
        worst_pair = ("", "")
        for i in range(len(coords)):
            for j in range(i + 1, len(coords)):
                dist = _haversine_km(
                    coords[i][0], coords[i][1],
                    coords[j][0], coords[j][1],
                )
                if dist > max_dist:
                    max_dist   = dist
                    worst_pair = (coords[i][2], coords[j][2])

        if max_dist > MAX_INTRADAY_SPREAD_KM:
            issues.append(
                f"Day {day_idx + 1}: Activities spread {max_dist:.1f}km apart "
                f"('{worst_pair[0]}' ↔ '{worst_pair[1]}')."
            )

    if skipped_days > 0:
        logger.debug(
            "Clustering check: skipped %d day(s) due to missing coordinates.",
            skipped_days,
        )

    if issues:
        return CheckResult(
            name="Nearby Clustering Valid",
            status=CheckStatus.WARNING,
            message=f"{len(issues)} day(s) have wide geographic spread.",
            details=issues,
        )

    return CheckResult(
        name="Nearby Clustering Valid",
        status=CheckStatus.PASS,
        message="All days have well-clustered activities.",
    )


# ---------------------------------------------------------------------------
# Main Validator
# ---------------------------------------------------------------------------

def validate_trip(
    days_activities:  list[list[Any]],
    user_budget:      str                = "mid-range",
    day_weather_list: list[Any] | None   = None,
    fatigue_result:   Any | None         = None,
) -> ValidationReport:
    """
    Run all 8 validation checks on the trip itinerary.

    Args:
        days_activities:  List of activity lists (one per day).
                          Activities can be BuiltActivity objects or dicts.
        user_budget:      User's budget tier string.
        day_weather_list: List of DayWeather objects (from weather_optimizer).
                          Pass None if weather optimization was skipped.
        fatigue_result:   FatigueOptimizationResult (from fatigue_optimizer).
                          Pass None if fatigue optimization was skipped.

    Returns:
        ValidationReport — always returned, never raises.
    """
    logger.info("=" * 60)
    logger.info("TRIP VALIDATOR — Running 8 checks")
    logger.info("=" * 60)

    total_places = sum(len(acts) for acts in days_activities)
    total_days   = len(days_activities)

    # Load dataset for existence check
    known_names = _build_known_names()

    # Run all checks
    checks: list[CheckResult] = []

    # ── Check 1: No Duplicates ────────────────────────────────────────
    c1 = check_no_duplicates(days_activities)
    checks.append(c1)
    _log_check(c1)

    # ── Check 2: Places Exist ─────────────────────────────────────────
    c2 = check_places_exist(days_activities, known_names)
    checks.append(c2)
    _log_check(c2)

    # ── Check 3: Daily Duration ───────────────────────────────────────
    c3 = check_daily_duration(days_activities)
    checks.append(c3)
    _log_check(c3)

    # ── Check 4: Budget ───────────────────────────────────────────────
    c4 = check_budget_respected(days_activities, user_budget)
    checks.append(c4)
    _log_check(c4)

    # ── Check 5: Weather Compatibility ────────────────────────────────
    c5 = check_weather_compatibility(days_activities, day_weather_list)
    checks.append(c5)
    _log_check(c5)

    # ── Check 6: Fatigue Balance ──────────────────────────────────────
    c6 = check_fatigue_balance(fatigue_result)
    checks.append(c6)
    _log_check(c6)

    # ── Check 7: Route Order ──────────────────────────────────────────
    c7 = check_route_order(days_activities)
    checks.append(c7)
    _log_check(c7)

    # ── Check 8: Clustering ───────────────────────────────────────────
    c8 = check_clustering(days_activities)
    checks.append(c8)
    _log_check(c8)

    # ── Determine overall pass/fail ───────────────────────────────────
    # CRITICAL checks: 1 (duplicates), 2 (existence)
    # All others: WARNING level — do not block trip
    critical_checks = [c1, c2]
    passed = all(c.status in (CheckStatus.PASS, CheckStatus.SKIP)
                 for c in critical_checks)

    # Collect all warnings and errors
    all_warnings = [
        detail
        for c in checks
        if c.status == CheckStatus.WARNING
        for detail in (c.details or [c.message])
    ]
    all_errors = [
        detail
        for c in checks
        if c.status == CheckStatus.FAIL
        for detail in (c.details or [c.message])
    ]

    report = ValidationReport(
        passed=passed,
        checks=checks,
        warnings=all_warnings,
        errors=all_errors,
        total_places=total_places,
        total_days=total_days,
    )

    # ── Summary log ───────────────────────────────────────────────────
    logger.info("")
    logger.info("Validation Results:")
    logger.info("-" * 60)
    for check in checks:
        status_icon = {"PASS": "✓", "FAIL": "✗", "WARNING": "⚠", "SKIP": "~"}
        icon = status_icon.get(check.status.value, "?")
        logger.info("  %s %s: %s", icon, check.name, check.message)
    logger.info("-" * 60)
    logger.info(report.summary_line())
    logger.info("=" * 60)

    return report


def _log_check(check: CheckResult) -> None:
    """Log a single check result at appropriate level."""
    if check.status == CheckStatus.PASS:
        logger.info("  ✓ %s: %s", check.name, check.message)
    elif check.status == CheckStatus.FAIL:
        logger.error("  ✗ %s: %s", check.name, check.message)
        for d in check.details:
            logger.error("      %s", d)
    elif check.status == CheckStatus.WARNING:
        logger.warning("  ⚠ %s: %s", check.name, check.message)
        for d in check.details:
            logger.warning("      %s", d)
    elif check.status == CheckStatus.SKIP:
        logger.info("  ~ %s: %s", check.name, check.message)