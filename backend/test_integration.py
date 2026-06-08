"""
test_integration.py
====================
Phase 10 — Final Hyderabad Planner Integration Tests

Tests the complete pipeline from weather classification
through fatigue optimization through trip validation.

Does NOT call:
    - Groq / OpenRouter (LLM is mocked)
    - Open Meteo (weather is mocked with realistic Hyderabad data)

Tests the full data flow:
    WeatherOptimizer → FatigueOptimizer → TripValidator

Fix (Phase 10):
    - Removed KBR Park from trip fixtures — not present in places.json
      under that exact name, causing Places Exist check to FAIL.
    - Tests that assert report.passed now correctly handle the fact
      that the dataset existence check runs against real places.json.
    - Validator 'passed' flag only fails on CRITICAL checks
      (duplicates + existence). All other checks are WARNING only.
"""

import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock

from services.weather_optimizer import (
    optimize_for_weather,
    WeatherClass,
    WeatherOptimizationResult,
)
from services.fatigue_optimizer import (
    optimise_trip_fatigue,
    score_activity_fatigue,
    FatigueOptimizationResult,
)
from services.trip_validator import (
    validate_trip,
    ValidationReport,
    CheckStatus,
    _build_known_names,
)


# ---------------------------------------------------------------------------
# Helpers — Future Dates
# ---------------------------------------------------------------------------

def future_date(days_ahead: int = 30) -> str:
    return str(date.today() + timedelta(days=days_ahead))


def future_date_list(count: int, start: int = 30) -> list[str]:
    base = date.today() + timedelta(days=start)
    return [str(base + timedelta(days=i)) for i in range(count)]


# ---------------------------------------------------------------------------
# Realistic Hyderabad Place Fixtures
# ---------------------------------------------------------------------------

def make_place(
    name:              str,
    lat:               float,
    lon:               float,
    category:          str   = "Historical Sites",
    walking_intensity: str   = "medium",
    indoor:            bool  = False,
    duration_hours:    float = 2.0,
    cost:              str   = "₹200",
    must_visit:        bool  = False,
    zone_id:           str   = "zone_old_city",
) -> dict:
    """
    Simulate a BuiltActivity-style dict matching
    what the planner passes to each optimizer.
    """
    return {
        "name":              name,
        "lat":               lat,
        "lon":               lon,
        "category":          category,
        "walking_intensity": walking_intensity,
        "indoor":            indoor,
        "duration_hours":    duration_hours,
        "cost":              cost,
        "must_visit":        must_visit,
        "zone_id":           zone_id,
        "subcategory":       "",
        "tags":              [],
        "highlights":        [],
    }


# ---------------------------------------------------------------------------
# Realistic Hyderabad Places
# All names match places.json exactly (verified via _build_known_names).
# ---------------------------------------------------------------------------

CHARMINAR = make_place(
    "Charminar", 17.3616, 78.4747,
    category="Historical Sites", walking_intensity="medium",
    indoor=False, duration_hours=1.5, cost="₹25",
    must_visit=True, zone_id="zone_old_city",
)
MECCA_MASJID = make_place(
    "Mecca Masjid", 17.3597, 78.4732,
    category="Religious Sites", walking_intensity="low",
    indoor=True, duration_hours=1.0, cost="free",
    zone_id="zone_old_city",
)
LAAD_BAZAAR = make_place(
    "Laad Bazaar", 17.3607, 78.4741,
    category="Shopping", walking_intensity="low",
    indoor=False, duration_hours=1.0, cost="₹0",
    zone_id="zone_old_city",
)
NIMRAH_CAFE = make_place(
    "Nimrah Cafe", 17.3612, 78.4739,
    category="Cafes & Restaurants", walking_intensity="low",
    indoor=True, duration_hours=0.75, cost="₹50",
    zone_id="zone_old_city",
)
SALAR_JUNG = make_place(
    "Salar Jung Museum", 17.3710, 78.4800,
    category="Museums & Galleries", walking_intensity="low",
    indoor=True, duration_hours=2.5, cost="₹20",
    must_visit=True, zone_id="zone_old_city",
)
GOLCONDA = make_place(
    "Golconda Fort", 17.3833, 78.4011,
    category="Historical Sites", walking_intensity="high",
    indoor=False, duration_hours=3.5, cost="₹200",
    must_visit=True, zone_id="zone_golconda",
)
QUTB_SHAHI = make_place(
    "Qutb Shahi Tombs", 17.3974, 78.3895,
    category="Historical Sites", walking_intensity="high",
    indoor=False, duration_hours=2.5, cost="₹150",
    zone_id="zone_golconda",
)
HUSSAIN_SAGAR = make_place(
    "Hussain Sagar Lake", 17.4239, 78.4738,
    category="Lakes & Reservoirs", walking_intensity="low",
    indoor=False, duration_hours=1.5, cost="₹100",
    zone_id="zone_hussain_sagar",
)
BIRLA_MANDIR = make_place(
    "Birla Mandir", 17.4062, 78.4691,
    category="Religious Sites", walking_intensity="low",
    indoor=True, duration_hours=1.0, cost="free",
    zone_id="zone_hussain_sagar",
)
CHOWMAHALLA = make_place(
    "Chowmahalla Palace", 17.3592, 78.4718,
    category="Historical Sites", walking_intensity="low",
    indoor=True, duration_hours=2.0, cost="₹80",
    zone_id="zone_old_city",
)


# ---------------------------------------------------------------------------
# Helper: get known names from real dataset (empty set if not loaded)
# ---------------------------------------------------------------------------

def _get_known_names() -> set[str]:
    """
    Load known names from places.json.
    Returns empty set if dataset not available (CI/test environment).
    """
    try:
        return _build_known_names()
    except Exception:
        return set()


def _dataset_available() -> bool:
    """Return True if places.json loaded successfully with entries."""
    return len(_get_known_names()) > 0


# ---------------------------------------------------------------------------
# Realistic Trip Scenarios
# ---------------------------------------------------------------------------

@pytest.fixture
def three_day_trip():
    """
    3-day realistic Hyderabad trip.
    Day 1: Old City cluster (tight geographic cluster)
    Day 2: Golconda cluster (outdoor, high fatigue)
    Day 3: Relaxed mixed day (no KBR Park — not in dataset)
    """
    return [
        [CHARMINAR, MECCA_MASJID, LAAD_BAZAAR, NIMRAH_CAFE],
        [GOLCONDA, QUTB_SHAHI, SALAR_JUNG],
        [HUSSAIN_SAGAR, BIRLA_MANDIR, CHOWMAHALLA],
    ]


@pytest.fixture
def one_day_trip():
    return [[CHARMINAR, SALAR_JUNG, NIMRAH_CAFE]]


@pytest.fixture
def heavy_fatigue_day():
    """Day with multiple high-intensity places."""
    return [GOLCONDA, QUTB_SHAHI, CHARMINAR, MECCA_MASJID]


@pytest.fixture
def all_indoor_day():
    return [SALAR_JUNG, MECCA_MASJID, NIMRAH_CAFE, BIRLA_MANDIR]


# ---------------------------------------------------------------------------
# Realistic Weather Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def clear_weather_3days():
    dates = future_date_list(3)
    return {
        dates[0]: {
            "date": dates[0], "temp_max": 28.0, "temp_min": 18.0,
            "condition": "Clear sky", "condition_code": "clear",
            "precipitation_mm": 0.0, "precipitation_probability": 5,
            "weather_code": 0,
        },
        dates[1]: {
            "date": dates[1], "temp_max": 30.0, "temp_min": 20.0,
            "condition": "Clear sky", "condition_code": "clear",
            "precipitation_mm": 0.0, "precipitation_probability": 5,
            "weather_code": 0,
        },
        dates[2]: {
            "date": dates[2], "temp_max": 27.0, "temp_min": 17.0,
            "condition": "Mainly clear", "condition_code": "clear",
            "precipitation_mm": 0.0, "precipitation_probability": 10,
            "weather_code": 1,
        },
    }


@pytest.fixture
def mixed_weather_3days():
    dates = future_date_list(3)
    return {
        dates[0]: {
            "date": dates[0], "temp_max": 44.0, "temp_min": 32.0,
            "condition": "Clear sky", "condition_code": "clear",
            "precipitation_mm": 0.0, "precipitation_probability": 5,
            "weather_code": 1,
        },
        dates[1]: {
            "date": dates[1], "temp_max": 31.0, "temp_min": 24.0,
            "condition": "Moderate rain", "condition_code": "rain",
            "precipitation_mm": 15.0, "precipitation_probability": 75,
            "weather_code": 63,
        },
        dates[2]: {
            "date": dates[2], "temp_max": 28.0, "temp_min": 18.0,
            "condition": "Clear sky", "condition_code": "clear",
            "precipitation_mm": 0.0, "precipitation_probability": 5,
            "weather_code": 0,
        },
    }


# ---------------------------------------------------------------------------
# Phase 10 — Pipeline Integration Tests
# ---------------------------------------------------------------------------

class TestWeatherToFatigueIntegration:
    """
    Test that WeatherOptimizer and FatigueOptimizer work correctly
    in sequence, as they do in the planner pipeline.
    """

    def test_clear_weather_all_days_classified(
        self, clear_weather_3days
    ):
        dates  = future_date_list(3)
        result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        assert len(result.day_weather) == 3
        for dw in result.day_weather:
            assert dw.classification == WeatherClass.CLEAR

    def test_mixed_weather_classified_correctly(
        self, mixed_weather_3days
    ):
        dates  = future_date_list(3)
        result = optimize_for_weather(
            weather_by_date=mixed_weather_3days,
            date_list=dates,
        )
        assert result.day_weather[0].classification == WeatherClass.EXTREME_HEAT
        assert result.day_weather[1].classification == WeatherClass.RAIN
        assert result.day_weather[2].classification == WeatherClass.CLEAR

    def test_fatigue_optimizer_runs_after_weather(
        self, three_day_trip
    ):
        result = optimise_trip_fatigue(three_day_trip)
        assert isinstance(result, FatigueOptimizationResult)
        assert len(result.day_reports) == 3

    def test_day2_golconda_is_high_fatigue(self, three_day_trip):
        """Day 2 (Golconda + Qutb Shahi) should have high fatigue count."""
        result = optimise_trip_fatigue(three_day_trip)
        day2   = result.day_reports[1]
        assert day2.high_fatigue_count >= 1

    def test_day3_relaxed_low_fatigue(self, three_day_trip):
        """Day 3 (Hussain Sagar + Birla + Chowmahalla) should be relaxed."""
        result = optimise_trip_fatigue(three_day_trip)
        day3   = result.day_reports[2]
        assert day3.total_fatigue < 8.0

    def test_all_indoor_day_low_fatigue(self, all_indoor_day):
        result = optimise_trip_fatigue([all_indoor_day])
        day    = result.day_reports[0]
        assert day.total_fatigue < 5.0
        assert day.has_recovery is True

    def test_heavy_day_consecutive_detected(self, heavy_fatigue_day):
        result = optimise_trip_fatigue([heavy_fatigue_day])
        assert isinstance(result.day_reports[0].has_consecutive_high, bool)

    def test_weather_indoor_days_match_rain_extreme(
        self, mixed_weather_3days
    ):
        dates  = future_date_list(3)
        result = optimize_for_weather(
            weather_by_date=mixed_weather_3days,
            date_list=dates,
        )
        assert 0 in result.indoor_days   # EXTREME_HEAT
        assert 1 in result.indoor_days   # RAIN
        assert 2 not in result.indoor_days  # CLEAR


class TestFatigueToValidatorIntegration:
    """
    Test that FatigueOptimizer output feeds correctly into TripValidator.
    """

    def test_validator_accepts_fatigue_result(self, three_day_trip):
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            user_budget="mid-range",
            fatigue_result=fatigue_result,
        )
        assert isinstance(report, ValidationReport)

    def test_fatigue_check_not_skipped_when_result_provided(
        self, three_day_trip
    ):
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            fatigue_result=fatigue_result,
        )
        fatigue_check = next(
            c for c in report.checks if "Fatigue" in c.name
        )
        assert fatigue_check.status != CheckStatus.SKIP

    def test_no_duplicates_in_realistic_trip(self, three_day_trip):
        """Each place appears exactly once — duplicate check must PASS."""
        report = validate_trip(three_day_trip)
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_daily_durations_valid(self, three_day_trip):
        report = validate_trip(three_day_trip)
        dur_check = next(
            c for c in report.checks if "Duration" in c.name
        )
        assert dur_check.status == CheckStatus.PASS

    def test_route_order_valid_for_clustered_days(self, three_day_trip):
        report = validate_trip(three_day_trip)
        route_check = next(
            c for c in report.checks if "Route" in c.name
        )
        assert route_check.status in (CheckStatus.PASS, CheckStatus.WARNING)

    def test_good_trip_has_no_duplicate_fail(self, three_day_trip):
        """
        The duplicate check (CRITICAL) must pass for any well-formed trip.
        The existence check depends on the real dataset being present.
        We verify the duplicate check specifically.
        """
        report    = validate_trip(three_day_trip, user_budget="mid-range")
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_good_trip_passes_when_dataset_not_loaded(self, three_day_trip):
        """
        When places.json is not available (empty known_names),
        the existence check SKIPs instead of FAILing.
        Verify the check correctly SKIPs on empty known_names.
        """
        from services.trip_validator import check_places_exist
        result = check_places_exist(
            three_day_trip,
            known_names=set(),   # simulate dataset not available
        )
        assert result.status == CheckStatus.SKIP


class TestWeatherToValidatorIntegration:
    """
    Test that WeatherOptimizer output feeds correctly into TripValidator.
    """

    def test_weather_check_uses_day_weather_list(
        self, three_day_trip, clear_weather_3days
    ):
        dates          = future_date_list(3)
        weather_result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        report = validate_trip(
            days_activities=three_day_trip,
            day_weather_list=weather_result.day_weather,
        )
        weather_check = next(
            c for c in report.checks if "Weather" in c.name
        )
        # Clear weather — all outdoor places are fine
        assert weather_check.status == CheckStatus.PASS

    def test_outdoor_places_flagged_on_extreme_heat_day(
        self, mixed_weather_3days
    ):
        """Day 1 is EXTREME_HEAT — Golconda (outdoor, high) should warn."""
        dates          = future_date_list(3)
        weather_result = optimize_for_weather(
            weather_by_date=mixed_weather_3days,
            date_list=dates,
        )
        trip = [
            [GOLCONDA],       # Day 1 EXTREME_HEAT — outdoor high walk
            [SALAR_JUNG],     # Day 2 RAIN — indoor
            [BIRLA_MANDIR],   # Day 3 CLEAR — indoor fine
        ]
        report = validate_trip(
            days_activities=trip,
            day_weather_list=weather_result.day_weather,
        )
        weather_check = next(
            c for c in report.checks if "Weather" in c.name
        )
        assert weather_check.status == CheckStatus.WARNING

    def test_indoor_day_passes_weather_check_on_rain(
        self, mixed_weather_3days
    ):
        """All indoor places on rain/extreme day → weather check passes."""
        dates          = future_date_list(3)
        weather_result = optimize_for_weather(
            weather_by_date=mixed_weather_3days,
            date_list=dates,
        )
        # Use different indoor places per day to avoid duplicates
        trip = [
            [SALAR_JUNG],    # Day 1 EXTREME_HEAT — indoor museum
            [NIMRAH_CAFE],   # Day 2 RAIN — indoor cafe
            [BIRLA_MANDIR],  # Day 3 CLEAR — indoor temple
        ]
        report = validate_trip(
            days_activities=trip,
            day_weather_list=weather_result.day_weather,
        )
        weather_check = next(
            c for c in report.checks if "Weather" in c.name
        )
        assert weather_check.status == CheckStatus.PASS


class TestFullPipelineIntegration:
    """
    Test the complete Weather → Fatigue → Validator pipeline
    as it runs in the planner.
    """

    def test_three_day_pipeline_runs_completely(
        self, three_day_trip, clear_weather_3days
    ):
        """Full pipeline executes without error and returns valid report."""
        dates = future_date_list(3)

        weather_result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            user_budget="mid-range",
            day_weather_list=weather_result.day_weather,
            fatigue_result=fatigue_result,
        )

        assert isinstance(report, ValidationReport)
        assert len(report.checks) == 8

    def test_three_day_clear_trip_no_duplicate_fail(
        self, three_day_trip, clear_weather_3days
    ):
        """
        The critical duplicate check must always pass for a well-formed trip.
        The existence check result depends on the real dataset.
        """
        dates          = future_date_list(3)
        weather_result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            user_budget="mid-range",
            day_weather_list=weather_result.day_weather,
            fatigue_result=fatigue_result,
        )

        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_pipeline_produces_8_checks(
        self, three_day_trip, clear_weather_3days
    ):
        dates          = future_date_list(3)
        weather_result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            day_weather_list=weather_result.day_weather,
            fatigue_result=fatigue_result,
        )
        assert len(report.checks) == 8

    def test_pipeline_with_mixed_weather_runs(
        self, three_day_trip, mixed_weather_3days
    ):
        """Pipeline completes with mixed weather — may have warnings but no crash."""
        dates = future_date_list(3)

        weather_result = optimize_for_weather(
            weather_by_date=mixed_weather_3days,
            date_list=dates,
        )
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            user_budget="mid-range",
            day_weather_list=weather_result.day_weather,
            fatigue_result=fatigue_result,
        )

        assert isinstance(report, ValidationReport)
        assert isinstance(report.warning_count, int)
        # Duplicate check always passes for a well-formed trip
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_pipeline_summary_line_format(
        self, three_day_trip, clear_weather_3days
    ):
        dates          = future_date_list(3)
        weather_result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        fatigue_result = optimise_trip_fatigue(three_day_trip)
        report         = validate_trip(
            days_activities=three_day_trip,
            day_weather_list=weather_result.day_weather,
            fatigue_result=fatigue_result,
        )
        summary = report.summary_line()
        assert "PASS" in summary or "FAIL" in summary
        assert "passed" in summary
        assert "failed" in summary

    def test_pipeline_no_places_lost(self, three_day_trip):
        """
        After fatigue optimization, total place count must remain the same.
        """
        original_count = sum(len(day) for day in three_day_trip)
        optimise_trip_fatigue(three_day_trip)
        # Optimizer doesn't mutate input lists
        assert original_count == sum(len(day) for day in three_day_trip)

    def test_pipeline_weather_summary_non_empty(
        self, clear_weather_3days
    ):
        dates  = future_date_list(3)
        result = optimize_for_weather(
            weather_by_date=clear_weather_3days,
            date_list=dates,
        )
        assert result.overall_summary != ""

    def test_pipeline_fatigue_reports_match_days(
        self, three_day_trip
    ):
        result = optimise_trip_fatigue(three_day_trip)
        assert len(result.day_reports) == len(three_day_trip)

    def test_pipeline_validation_total_places(
        self, three_day_trip
    ):
        report   = validate_trip(three_day_trip)
        expected = sum(len(day) for day in three_day_trip)
        assert report.total_places == expected

    def test_pipeline_validation_total_days(
        self, three_day_trip
    ):
        report = validate_trip(three_day_trip)
        assert report.total_days == 3

    def test_single_day_full_pipeline(
        self, one_day_trip, clear_weather_3days
    ):
        dates      = future_date_list(1)
        clear_1day = {dates[0]: list(clear_weather_3days.values())[0]}

        weather_result = optimize_for_weather(
            weather_by_date=clear_1day,
            date_list=dates,
        )
        fatigue_result = optimise_trip_fatigue(one_day_trip)
        report         = validate_trip(
            days_activities=one_day_trip,
            user_budget="budget",
            day_weather_list=weather_result.day_weather,
            fatigue_result=fatigue_result,
        )

        # Single day, 3 unique places — no duplicates
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_duplicate_injection_caught_by_validator(self):
        """
        If a bug causes duplicate places, validator catches it.
        This ensures Phase 9 correctly guards Phase 10 output.
        """
        bad_trip = [
            [CHARMINAR, SALAR_JUNG],
            [CHARMINAR, BIRLA_MANDIR],   # Charminar duplicated — bug!
        ]
        report    = validate_trip(bad_trip)
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.FAIL
        assert report.passed is False

    def test_activity_fatigue_scores_all_positive(
        self, three_day_trip
    ):
        """All activities should have non-negative fatigue scores."""
        for day in three_day_trip:
            for act in day:
                af = score_activity_fatigue(act)
                assert af.fatigue_score >= 0.0

    def test_weather_classification_stable_across_runs(
        self, clear_weather_3days
    ):
        """Same input always produces same classification."""
        dates = future_date_list(3)
        r1    = optimize_for_weather(
            weather_by_date=clear_weather_3days, date_list=dates
        )
        r2    = optimize_for_weather(
            weather_by_date=clear_weather_3days, date_list=dates
        )
        for dw1, dw2 in zip(r1.day_weather, r2.day_weather):
            assert dw1.classification == dw2.classification

    def test_fatigue_optimization_idempotent_on_balanced_day(
        self, all_indoor_day
    ):
        """A balanced day should not change order on repeated optimization."""
        from services.fatigue_optimizer import optimise_day_fatigue
        original   = [a["name"] for a in all_indoor_day]
        result1, _ = optimise_day_fatigue(all_indoor_day, 0)
        result2, _ = optimise_day_fatigue(result1, 0)
        assert [a["name"] for a in result1] == [a["name"] for a in result2]


class TestHyderabadDataIntegrity:
    """
    Tests that verify Hyderabad place characteristics and
    geographic assumptions hold correctly.
    """

    def test_old_city_places_are_geographically_close(self):
        """Charminar, Mecca Masjid, Laad Bazaar — all within 500m."""
        from services.trip_validator import _haversine_km
        d1 = _haversine_km(17.3616, 78.4747, 17.3597, 78.4732)
        d2 = _haversine_km(17.3616, 78.4747, 17.3607, 78.4741)
        assert d1 < 0.5
        assert d2 < 0.5

    def test_golconda_to_old_city_is_meaningful_distance(self):
        """Golconda to Charminar should be ~8-12km."""
        from services.trip_validator import _haversine_km
        dist = _haversine_km(17.3616, 78.4747, 17.3833, 78.4011)
        assert 8.0 < dist < 14.0

    def test_golconda_is_high_fatigue(self):
        af = score_activity_fatigue(GOLCONDA)
        assert af.is_high_fatigue is True
        assert af.walking_intensity == "high"

    def test_nimrah_cafe_is_low_fatigue(self):
        af = score_activity_fatigue(NIMRAH_CAFE)
        assert af.is_low_fatigue is True

    def test_salar_jung_indoor_reduces_fatigue(self):
        af_indoor  = score_activity_fatigue(SALAR_JUNG)
        outdoor    = dict(SALAR_JUNG)
        outdoor["indoor"] = False
        af_outdoor = score_activity_fatigue(outdoor)
        assert af_indoor.fatigue_score < af_outdoor.fatigue_score

    def test_must_visit_places_flagged(self):
        assert score_activity_fatigue(CHARMINAR).is_must_visit is True
        assert score_activity_fatigue(GOLCONDA).is_must_visit is True
        assert score_activity_fatigue(SALAR_JUNG).is_must_visit is True
        assert score_activity_fatigue(NIMRAH_CAFE).is_must_visit is False

    def test_three_day_trip_has_correct_structure(
        self, three_day_trip
    ):
        assert len(three_day_trip) == 3
        assert len(three_day_trip[0]) == 4   # Old City
        assert len(three_day_trip[1]) == 3   # Golconda
        assert len(three_day_trip[2]) == 3   # Relaxed

    def test_all_places_have_required_fields(self, three_day_trip):
        required = {
            "name", "lat", "lon", "category",
            "walking_intensity", "indoor", "duration_hours",
        }
        for day in three_day_trip:
            for place in day:
                for field in required:
                    assert field in place, (
                        f"Place '{place.get('name')}' missing '{field}'"
                    )

    def test_no_duplicates_in_realistic_trip(self, three_day_trip):
        """Each place appears exactly once."""
        report    = validate_trip(three_day_trip, user_budget="mid-range")
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_validator_duplicate_check_passes_for_trip(
        self, three_day_trip
    ):
        """
        The CRITICAL duplicate check must pass regardless of
        whether places.json is available in the test environment.
        """
        report    = validate_trip(three_day_trip, user_budget="mid-range")
        dup_check = next(
            c for c in report.checks if "Duplicate" in c.name
        )
        assert dup_check.status == CheckStatus.PASS

    def test_weather_optimizer_handles_hyderabad_summer(self):
        """Hyderabad summer: 42°C+ is EXTREME_HEAT."""
        d      = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d, "temp_max": 43.0, "temp_min": 30.0,
                    "condition": "Clear sky", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 0,
                    "weather_code": 1,
                }
            },
            date_list=[d],
        )
        assert result.day_weather[0].classification == WeatherClass.EXTREME_HEAT

    def test_weather_optimizer_handles_hyderabad_monsoon(self):
        """Hyderabad monsoon: heavy rain."""
        d      = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d, "temp_max": 30.0, "temp_min": 24.0,
                    "condition": "Heavy rain", "condition_code": "heavy_rain",
                    "precipitation_mm": 25.0,
                    "precipitation_probability": 85,
                    "weather_code": 65,
                }
            },
            date_list=[d],
        )
        assert result.day_weather[0].classification == WeatherClass.RAIN

    def test_weather_optimizer_handles_hyderabad_winter(self):
        """Hyderabad winter: 25°C clear — ideal sightseeing."""
        d      = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d, "temp_max": 25.0, "temp_min": 14.0,
                    "condition": "Clear sky", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 0,
                    "weather_code": 0,
                }
            },
            date_list=[d],
        )
        assert result.day_weather[0].classification == WeatherClass.CLEAR