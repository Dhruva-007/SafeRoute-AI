"""
test_trip_validator.py
=======================
Phase 9 — Trip Validation Layer Tests

Pure unit tests — no database, no LLM, no HTTP.
Uses plain dicts to simulate BuiltActivity objects and DayWeather.
"""

import pytest
from unittest.mock import MagicMock

from services.trip_validator import (
    CheckStatus,
    CheckResult,
    ValidationReport,
    check_no_duplicates,
    check_places_exist,
    check_daily_duration,
    check_budget_respected,
    check_weather_compatibility,
    check_fatigue_balance,
    check_route_order,
    check_clustering,
    validate_trip,
    _haversine_km,
    MAX_CONSECUTIVE_DISTANCE_KM,
    MAX_INTRADAY_SPREAD_KM,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_activity(
    name:              str   = "Test Place",
    lat:               float = 17.385,
    lon:               float = 78.486,
    duration_hours:    float = 2.0,
    walking_intensity: str   = "medium",
    indoor:            bool  = False,
    cost:              str   = "₹200",
    category:          str   = "Historical Sites",
    zone_id:           str   = "zone_1",
) -> dict:
    """Create a minimal activity dict for testing."""
    return {
        "name":              name,
        "lat":               lat,
        "lon":               lon,
        "duration_hours":    duration_hours,
        "walking_intensity": walking_intensity,
        "indoor":            indoor,
        "cost":              cost,
        "category":          category,
        "zone_id":           zone_id,
        "must_visit":        False,
    }


def make_day_weather(classification: str = "CLEAR") -> MagicMock:
    """Create a mock DayWeather object."""
    dw = MagicMock()
    dw.classification       = MagicMock()
    dw.classification.value = classification
    return dw


def make_fatigue_result(
    days_over_cap:    list[int] | None = None,
    overall_warnings: list[str] | None = None,
) -> MagicMock:
    """Create a mock FatigueOptimizationResult."""
    fr                  = MagicMock()
    fr.days_over_cap    = days_over_cap or []
    fr.overall_warnings = overall_warnings or []
    return fr


# ---------------------------------------------------------------------------
# Hyderabad-realistic coordinates (for route/clustering tests)
# ---------------------------------------------------------------------------

# Old City cluster (tight)
CHARMINAR_COORD = (17.3616, 78.4747)
MECCA_COORD     = (17.3597, 78.4732)
LAAD_COORD      = (17.3607, 78.4741)

# Golconda cluster
GOLCONDA_COORD  = (17.3833, 78.4011)
QUTB_COORD      = (17.3974, 78.3895)

# HiTech City
HITECH_COORD    = (17.4435, 78.3772)
KBR_COORD       = (17.4239, 78.4281)

# Very far — near Shamirpet
FAR_COORD       = (17.6200, 78.5700)


# ---------------------------------------------------------------------------
# 1. Haversine Distance Tests
# ---------------------------------------------------------------------------

class TestHaversine:

    def test_same_point_is_zero(self):
        dist = _haversine_km(17.385, 78.486, 17.385, 78.486)
        assert dist == 0.0

    def test_charminar_to_golconda_approx_10km(self):
        dist = _haversine_km(
            CHARMINAR_COORD[0], CHARMINAR_COORD[1],
            GOLCONDA_COORD[0],  GOLCONDA_COORD[1],
        )
        assert 8.0 < dist < 14.0, f"Expected ~10km, got {dist:.1f}km"

    def test_old_city_cluster_tight(self):
        """Charminar to Mecca Masjid should be < 1km."""
        dist = _haversine_km(
            CHARMINAR_COORD[0], CHARMINAR_COORD[1],
            MECCA_COORD[0],     MECCA_COORD[1],
        )
        assert dist < 1.0

    def test_old_city_to_hitech_far(self):
        """Old City to HiTech City — meaningfully far across the city (~13.8km)."""
        dist = _haversine_km(
            CHARMINAR_COORD[0], CHARMINAR_COORD[1],
            HITECH_COORD[0],    HITECH_COORD[1],
        )
        assert dist > 10.0  # actual ~13.8km

    def test_returns_float(self):
        dist = _haversine_km(17.385, 78.486, 17.400, 78.500)
        assert isinstance(dist, float)

    def test_symmetric(self):
        d1 = _haversine_km(17.385, 78.486, 17.400, 78.500)
        d2 = _haversine_km(17.400, 78.500, 17.385, 78.486)
        assert abs(d1 - d2) < 0.001


# ---------------------------------------------------------------------------
# 2. check_no_duplicates Tests
# ---------------------------------------------------------------------------

class TestCheckNoDuplicates:

    def test_no_duplicates_passes(self):
        days = [
            [make_activity("Charminar"), make_activity("Golconda Fort")],
            [make_activity("Salar Jung Museum"), make_activity("KBR Park")],
        ]
        result = check_no_duplicates(days)
        assert result.status == CheckStatus.PASS

    def test_duplicate_across_days_fails(self):
        days = [
            [make_activity("Charminar"), make_activity("Golconda Fort")],
            [make_activity("Charminar"), make_activity("KBR Park")],
        ]
        result = check_no_duplicates(days)
        assert result.status == CheckStatus.FAIL

    def test_duplicate_details_contain_place_name(self):
        days = [
            [make_activity("Charminar")],
            [make_activity("Charminar")],
        ]
        result = check_no_duplicates(days)
        assert any("Charminar" in d for d in result.details)

    def test_empty_trip_passes(self):
        result = check_no_duplicates([])
        assert result.status == CheckStatus.PASS

    def test_single_day_no_duplicates_passes(self):
        days   = [[make_activity("Place A"), make_activity("Place B")]]
        result = check_no_duplicates(days)
        assert result.status == CheckStatus.PASS

    def test_multiple_duplicates_detected(self):
        days = [
            [make_activity("A"), make_activity("B")],
            [make_activity("A"), make_activity("B")],
        ]
        result = check_no_duplicates(days)
        assert result.status == CheckStatus.FAIL
        assert len(result.details) == 2

    def test_case_insensitive_duplicate_detection(self):
        """'charminar' and 'Charminar' are the same place."""
        days = [
            [make_activity("Charminar")],
            [make_activity("charminar")],
        ]
        result = check_no_duplicates(days)
        assert result.status == CheckStatus.FAIL

    def test_returns_check_result_instance(self):
        result = check_no_duplicates([[make_activity("A")]])
        assert isinstance(result, CheckResult)


# ---------------------------------------------------------------------------
# 3. check_places_exist Tests
# ---------------------------------------------------------------------------

class TestCheckPlacesExist:

    def test_skips_when_no_known_names(self):
        days   = [[make_activity("Anywhere")]]
        result = check_places_exist(days, known_names=set())
        assert result.status == CheckStatus.SKIP

    def test_passes_when_all_known(self):
        known  = {"charminar", "golconda fort", "salar jung museum"}
        days   = [
            [make_activity("Charminar"), make_activity("Golconda Fort")],
            [make_activity("Salar Jung Museum")],
        ]
        result = check_places_exist(days, known_names=known)
        assert result.status == CheckStatus.PASS

    def test_fails_when_unknown_place(self):
        known  = {"charminar"}
        days   = [[make_activity("Invented Fantasy Place")]]
        result = check_places_exist(days, known_names=known)
        assert result.status == CheckStatus.FAIL

    def test_details_contain_unknown_name(self):
        known  = {"charminar"}
        days   = [[make_activity("Ghost Restaurant")]]
        result = check_places_exist(days, known_names=known)
        assert any("Ghost Restaurant" in d for d in result.details)

    def test_empty_days_passes(self):
        known  = {"charminar"}
        result = check_places_exist([], known_names=known)
        assert result.status == CheckStatus.PASS

    def test_multiple_unknown_all_reported(self):
        known  = {"charminar"}
        days   = [
            [make_activity("Fake Place 1"), make_activity("Fake Place 2")]
        ]
        result = check_places_exist(days, known_names=known)
        assert result.status == CheckStatus.FAIL
        assert len(result.details) == 2


# ---------------------------------------------------------------------------
# 4. check_daily_duration Tests
# ---------------------------------------------------------------------------

class TestCheckDailyDuration:

    def test_valid_durations_pass(self):
        days = [
            [make_activity(duration_hours=2.0),
             make_activity(duration_hours=3.0)],
        ]
        result = check_daily_duration(days)
        assert result.status == CheckStatus.PASS

    def test_too_long_day_warns(self):
        """15h in one day is physically impossible."""
        acts   = [make_activity(duration_hours=5.0) for _ in range(3)]
        result = check_daily_duration([acts])
        assert result.status == CheckStatus.WARNING
        assert any("exceeds maximum" in d for d in result.details)

    def test_too_short_day_warns(self):
        """0.5h is below the 2h minimum."""
        days   = [[make_activity(duration_hours=0.5)]]
        result = check_daily_duration(days)
        assert result.status == CheckStatus.WARNING
        assert any("below minimum" in d for d in result.details)

    def test_empty_day_not_flagged(self):
        result = check_daily_duration([[]])
        assert result.status == CheckStatus.PASS

    def test_exactly_at_max_passes(self):
        """14h exactly should pass (boundary)."""
        acts   = [make_activity(duration_hours=7.0) for _ in range(2)]
        result = check_daily_duration([acts])
        assert result.status == CheckStatus.PASS

    def test_multiple_days_both_reported(self):
        long_day  = [make_activity(duration_hours=5.0)] * 3
        short_day = [make_activity(duration_hours=0.5)]
        result    = check_daily_duration([long_day, short_day])
        assert result.status == CheckStatus.WARNING
        assert len(result.details) == 2


# ---------------------------------------------------------------------------
# 5. check_budget_respected Tests
# ---------------------------------------------------------------------------

class TestCheckBudgetRespected:

    def test_free_place_always_passes(self):
        days   = [[make_activity(cost="free")]]
        result = check_budget_respected(days, "budget")
        assert result.status == CheckStatus.PASS

    def test_budget_user_high_cost_warns(self):
        """₹1000 per person is too expensive for budget tier."""
        days   = [[make_activity(cost="₹1000")]]
        result = check_budget_respected(days, "budget")
        assert result.status == CheckStatus.WARNING

    def test_mid_range_user_moderate_cost_passes(self):
        days   = [[make_activity(cost="₹500")]]
        result = check_budget_respected(days, "mid-range")
        assert result.status == CheckStatus.PASS

    def test_luxury_user_any_cost_passes(self):
        days   = [[make_activity(cost="₹5000")]]
        result = check_budget_respected(days, "luxury")
        assert result.status == CheckStatus.PASS

    def test_budget_user_luxury_label_warns(self):
        days   = [[make_activity(cost="luxury")]]
        result = check_budget_respected(days, "budget")
        assert result.status == CheckStatus.WARNING

    def test_unknown_budget_tier_defaults_gracefully(self):
        days   = [[make_activity(cost="₹200")]]
        result = check_budget_respected(days, "unknown_tier")
        assert isinstance(result, CheckResult)

    def test_zero_cost_always_passes(self):
        days   = [[make_activity(cost="₹0")]]
        result = check_budget_respected(days, "budget")
        assert result.status == CheckStatus.PASS

    def test_returns_check_result(self):
        result = check_budget_respected([[make_activity()]], "mid-range")
        assert isinstance(result, CheckResult)


# ---------------------------------------------------------------------------
# 6. check_weather_compatibility Tests
# ---------------------------------------------------------------------------

class TestCheckWeatherCompatibility:

    def test_skips_when_no_weather(self):
        days   = [[make_activity(indoor=False)]]
        result = check_weather_compatibility(days, day_weather_list=None)
        assert result.status == CheckStatus.SKIP

    def test_indoor_place_on_rain_day_passes(self):
        days   = [[make_activity(indoor=True, walking_intensity="low")]]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("RAIN")]
        )
        assert result.status == CheckStatus.PASS

    def test_outdoor_high_walk_on_rain_day_warns(self):
        days   = [[make_activity(indoor=False, walking_intensity="high")]]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("RAIN")]
        )
        assert result.status == CheckStatus.WARNING

    def test_outdoor_on_extreme_heat_warns(self):
        days   = [[make_activity(indoor=False, walking_intensity="high")]]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("EXTREME_HEAT")]
        )
        assert result.status == CheckStatus.WARNING

    def test_outdoor_on_clear_day_passes(self):
        days   = [[make_activity(indoor=False, walking_intensity="high")]]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("CLEAR")]
        )
        assert result.status == CheckStatus.PASS

    def test_outdoor_on_cloudy_day_passes(self):
        days   = [[make_activity(indoor=False, walking_intensity="medium")]]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("CLOUDY")]
        )
        assert result.status == CheckStatus.PASS

    def test_outdoor_high_walk_on_hot_day_warns(self):
        days   = [[make_activity(indoor=False, walking_intensity="high")]]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("HOT")]
        )
        assert result.status == CheckStatus.WARNING

    def test_more_days_than_weather_handled(self):
        days = [
            [make_activity(indoor=False)],
            [make_activity(indoor=False)],
        ]
        result = check_weather_compatibility(
            days,
            day_weather_list=[make_day_weather("CLEAR")]
        )
        assert isinstance(result, CheckResult)

    def test_empty_days_passes(self):
        result = check_weather_compatibility(
            [], day_weather_list=[make_day_weather("RAIN")]
        )
        assert result.status == CheckStatus.PASS


# ---------------------------------------------------------------------------
# 7. check_fatigue_balance Tests
# ---------------------------------------------------------------------------

class TestCheckFatigueBalance:

    def test_skips_when_no_result(self):
        result = check_fatigue_balance(None)
        assert result.status == CheckStatus.SKIP

    def test_passes_when_no_days_over_cap(self):
        fr     = make_fatigue_result(days_over_cap=[])
        result = check_fatigue_balance(fr)
        assert result.status == CheckStatus.PASS

    def test_warns_when_days_over_cap(self):
        fr     = make_fatigue_result(days_over_cap=[0, 2])
        result = check_fatigue_balance(fr)
        assert result.status == CheckStatus.WARNING

    def test_warning_message_contains_day_number(self):
        """days_over_cap=[1] → 0-based index 1 → Day 2 → '2' appears in message."""
        fr     = make_fatigue_result(days_over_cap=[1])
        result = check_fatigue_balance(fr)
        assert "2" in result.message

    def test_returns_check_result(self):
        result = check_fatigue_balance(make_fatigue_result())
        assert isinstance(result, CheckResult)


# ---------------------------------------------------------------------------
# 8. check_route_order Tests
# ---------------------------------------------------------------------------

class TestCheckRouteOrder:

    def test_tight_cluster_passes(self):
        days = [[
            make_activity("Charminar",    lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1]),
            make_activity("Mecca Masjid", lat=MECCA_COORD[0],     lon=MECCA_COORD[1]),
            make_activity("Laad Bazaar",  lat=LAAD_COORD[0],      lon=LAAD_COORD[1]),
        ]]
        result = check_route_order(days)
        assert result.status == CheckStatus.PASS

    def test_extreme_jump_warns(self):
        days = [[
            make_activity("Charminar", lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1]),
            make_activity("Far Place",  lat=FAR_COORD[0],       lon=FAR_COORD[1]),
        ]]
        result = check_route_order(days)
        assert result.status == CheckStatus.WARNING

    def test_single_activity_day_passes(self):
        days   = [[make_activity("Charminar", lat=17.361, lon=78.474)]]
        result = check_route_order(days)
        assert result.status == CheckStatus.PASS

    def test_no_coordinates_skipped_gracefully(self):
        days = [[
            {"name": "No Coords Place 1"},
            {"name": "No Coords Place 2"},
        ]]
        result = check_route_order(days)
        assert isinstance(result, CheckResult)

    def test_empty_days_passes(self):
        result = check_route_order([])
        assert result.status == CheckStatus.PASS

    def test_returns_check_result(self):
        result = check_route_order([[make_activity()]])
        assert isinstance(result, CheckResult)

    def test_multiple_days_all_checked(self):
        days = [
            [
                make_activity("A", lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1]),
                make_activity("B", lat=MECCA_COORD[0],     lon=MECCA_COORD[1]),
            ],
            [
                make_activity("C", lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1]),
                make_activity("D", lat=FAR_COORD[0],       lon=FAR_COORD[1]),
            ],
        ]
        result = check_route_order(days)
        assert result.status == CheckStatus.WARNING


# ---------------------------------------------------------------------------
# 9. check_clustering Tests
# ---------------------------------------------------------------------------

class TestCheckClustering:

    def test_tight_cluster_passes(self):
        days = [[
            make_activity("A", lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1]),
            make_activity("B", lat=MECCA_COORD[0],     lon=MECCA_COORD[1]),
            make_activity("C", lat=LAAD_COORD[0],      lon=LAAD_COORD[1]),
        ]]
        result = check_clustering(days)
        assert result.status == CheckStatus.PASS

    def test_wide_spread_warns(self):
        days = [[
            make_activity("Charminar", lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1]),
            make_activity("Far Place",  lat=FAR_COORD[0],       lon=FAR_COORD[1]),
        ]]
        result = check_clustering(days)
        assert result.status == CheckStatus.WARNING

    def test_single_activity_passes(self):
        days   = [[make_activity(lat=17.361, lon=78.474)]]
        result = check_clustering(days)
        assert result.status == CheckStatus.PASS

    def test_no_coords_handled_gracefully(self):
        days = [[{"name": "No Coords"}]]
        result = check_clustering(days)
        assert isinstance(result, CheckResult)

    def test_returns_check_result(self):
        result = check_clustering([[make_activity()]])
        assert isinstance(result, CheckResult)

    def test_empty_days_passes(self):
        result = check_clustering([])
        assert result.status == CheckStatus.PASS

    def test_moderate_spread_depends_on_threshold(self):
        """Golconda to HiTech — result depends on actual distance vs threshold."""
        days = [[
            make_activity("Golconda", lat=GOLCONDA_COORD[0], lon=GOLCONDA_COORD[1]),
            make_activity("HiTech",   lat=HITECH_COORD[0],   lon=HITECH_COORD[1]),
        ]]
        dist   = _haversine_km(
            GOLCONDA_COORD[0], GOLCONDA_COORD[1],
            HITECH_COORD[0],   HITECH_COORD[1],
        )
        result = check_clustering(days)
        if dist > MAX_INTRADAY_SPREAD_KM:
            assert result.status == CheckStatus.WARNING
        else:
            assert result.status == CheckStatus.PASS


# ---------------------------------------------------------------------------
# 10. validate_trip Integration Tests
# ---------------------------------------------------------------------------

class TestValidateTrip:

    def _good_trip(self) -> list[list[dict]]:
        return [
            [
                make_activity(
                    "Charminar",
                    lat=CHARMINAR_COORD[0], lon=CHARMINAR_COORD[1],
                    duration_hours=2.0,
                ),
                make_activity(
                    "Mecca Masjid",
                    lat=MECCA_COORD[0], lon=MECCA_COORD[1],
                    duration_hours=1.5,
                ),
            ],
            [
                make_activity(
                    "Golconda Fort",
                    lat=GOLCONDA_COORD[0], lon=GOLCONDA_COORD[1],
                    duration_hours=3.0,
                ),
                make_activity(
                    "Salar Jung Museum",
                    lat=17.371, lon=78.480,
                    duration_hours=2.5,
                    indoor=True,
                ),
            ],
        ]

    def test_returns_validation_report(self):
        report = validate_trip(self._good_trip())
        assert isinstance(report, ValidationReport)

    def test_good_trip_passes(self):
        report = validate_trip(self._good_trip())
        assert report.passed is True

    def test_exactly_8_checks_run(self):
        report = validate_trip(self._good_trip())
        assert len(report.checks) == 8

    def test_total_places_correct(self):
        report = validate_trip(self._good_trip())
        assert report.total_places == 4

    def test_total_days_correct(self):
        report = validate_trip(self._good_trip())
        assert report.total_days == 2

    def test_pass_count_positive(self):
        report = validate_trip(self._good_trip())
        assert report.pass_count > 0

    def test_fail_count_zero_for_good_trip(self):
        report = validate_trip(self._good_trip(), user_budget="mid-range")
        assert report.fail_count == 0

    def test_duplicate_places_fails_trip(self):
        days = [
            [make_activity("Charminar")],
            [make_activity("Charminar")],
        ]
        report = validate_trip(days)
        assert report.passed is False

    def test_summary_line_contains_pass_or_fail(self):
        report  = validate_trip(self._good_trip())
        summary = report.summary_line()
        assert "PASS" in summary or "FAIL" in summary

    def test_weather_check_skipped_when_no_weather(self):
        report = validate_trip(
            self._good_trip(),
            day_weather_list=None,
        )
        weather_check = next(
            c for c in report.checks if "Weather" in c.name
        )
        assert weather_check.status == CheckStatus.SKIP

    def test_fatigue_check_skipped_when_no_fatigue(self):
        report = validate_trip(
            self._good_trip(),
            fatigue_result=None,
        )
        fatigue_check = next(
            c for c in report.checks if "Fatigue" in c.name
        )
        assert fatigue_check.status == CheckStatus.SKIP

    def test_weather_check_runs_when_provided(self):
        report = validate_trip(
            self._good_trip(),
            day_weather_list=[
                make_day_weather("CLEAR"),
                make_day_weather("CLEAR"),
            ],
        )
        weather_check = next(
            c for c in report.checks if "Weather" in c.name
        )
        assert weather_check.status != CheckStatus.SKIP

    def test_fatigue_check_runs_when_provided(self):
        report = validate_trip(
            self._good_trip(),
            fatigue_result=make_fatigue_result(days_over_cap=[]),
        )
        fatigue_check = next(
            c for c in report.checks if "Fatigue" in c.name
        )
        assert fatigue_check.status != CheckStatus.SKIP

    def test_empty_trip_does_not_crash(self):
        report = validate_trip([])
        assert isinstance(report, ValidationReport)

    def test_warnings_is_list(self):
        report = validate_trip(self._good_trip())
        assert isinstance(report.warnings, list)

    def test_errors_is_list(self):
        report = validate_trip(self._good_trip())
        assert isinstance(report.errors, list)

    def test_check_names_are_unique(self):
        report = validate_trip(self._good_trip())
        names  = [c.name for c in report.checks]
        assert len(names) == len(set(names))

    def test_all_check_statuses_are_valid(self):
        valid  = {CheckStatus.PASS, CheckStatus.FAIL,
                  CheckStatus.WARNING, CheckStatus.SKIP}
        report = validate_trip(self._good_trip())
        for check in report.checks:
            assert check.status in valid

    def test_warning_count_property(self):
        report = validate_trip(self._good_trip())
        assert isinstance(report.warning_count, int)
        assert report.warning_count >= 0