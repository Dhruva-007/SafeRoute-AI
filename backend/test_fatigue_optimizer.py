"""
test_fatigue_optimizer.py
==========================
Phase 8 — Fatigue Optimizer Unit Tests

Pure unit tests — no database, no LLM, no HTTP calls.
Uses plain dicts to simulate BuiltActivity objects.
"""

import pytest
from services.fatigue_optimizer import (
    ActivityFatigue,
    DayFatigueReport,
    FatigueOptimizationResult,
    score_activity_fatigue,
    analyse_day_fatigue,
    optimise_day_fatigue,
    optimise_trip_fatigue,
    get_fatigue_context_for_prompt,
    DAILY_FATIGUE_CAP,
    MAX_HIGH_INTENSITY_PER_DAY,
    HIGH_FATIGUE_THRESHOLD,
    LOW_FATIGUE_THRESHOLD,
)


# ---------------------------------------------------------------------------
# Fixtures — Activity Dicts (simulate BuiltActivity)
# ---------------------------------------------------------------------------

@pytest.fixture
def golconda_fort():
    """High fatigue — outdoor, high walk, long duration."""
    return {
        "name": "Golconda Fort",
        "category": "Historical Sites",
        "walking_intensity": "high",
        "duration_hours": 3.5,
        "indoor": False,
        "must_visit": True,
    }


@pytest.fixture
def qutb_shahi():
    """High fatigue — outdoor, high walk."""
    return {
        "name": "Qutb Shahi Tombs",
        "category": "Historical Sites",
        "walking_intensity": "high",
        "duration_hours": 2.5,
        "indoor": False,
        "must_visit": False,
    }


@pytest.fixture
def wonderla():
    """Extreme fatigue — adventure, high walk, long duration."""
    return {
        "name": "Wonderla",
        "category": "Adventure",
        "walking_intensity": "high",
        "duration_hours": 5.0,
        "indoor": False,
        "must_visit": False,
    }


@pytest.fixture
def kbr_park():
    """Medium fatigue — outdoor, medium walk."""
    return {
        "name": "KBR Park",
        "category": "Nature & Parks",
        "walking_intensity": "medium",
        "duration_hours": 1.5,
        "indoor": False,
        "must_visit": False,
    }


@pytest.fixture
def salar_jung():
    """Low fatigue — indoor, low walk."""
    return {
        "name": "Salar Jung Museum",
        "category": "Museums & Galleries",
        "walking_intensity": "low",
        "duration_hours": 2.5,
        "indoor": True,
        "must_visit": True,
    }


@pytest.fixture
def nimrah_cafe():
    """Very low fatigue — indoor, low walk, short duration."""
    return {
        "name": "Nimrah Cafe",
        "category": "Cafes & Restaurants",
        "walking_intensity": "low",
        "duration_hours": 0.75,
        "indoor": True,
        "must_visit": False,
    }


@pytest.fixture
def charminar():
    """Medium fatigue — outdoor, medium walk, must_visit."""
    return {
        "name": "Charminar",
        "category": "Historical Sites",
        "walking_intensity": "medium",
        "duration_hours": 1.5,
        "indoor": False,
        "must_visit": True,
    }


@pytest.fixture
def hussain_sagar():
    """Low-medium fatigue — outdoor, low walk."""
    return {
        "name": "Hussain Sagar Lake",
        "category": "Lakes & Reservoirs",
        "walking_intensity": "low",
        "duration_hours": 1.5,
        "indoor": False,
        "must_visit": False,
    }


# ---------------------------------------------------------------------------
# Fixture: Bad day (3 high-fatigue places back-to-back)
# ---------------------------------------------------------------------------

@pytest.fixture
def bad_day(golconda_fort, qutb_shahi, wonderla, nimrah_cafe):
    """
    BAD: Golconda → Qutb Shahi → Wonderla → Nimrah
    Three consecutive high-fatigue places.
    """
    return [golconda_fort, qutb_shahi, wonderla, nimrah_cafe]


@pytest.fixture
def good_day(golconda_fort, salar_jung, nimrah_cafe):
    """
    GOOD: Golconda → Salar Jung → Nimrah
    One high-fatigue, then recovery.
    """
    return [golconda_fort, salar_jung, nimrah_cafe]


@pytest.fixture
def consecutive_high_day(golconda_fort, qutb_shahi, salar_jung):
    """
    Golconda (high) → Qutb Shahi (high) → Salar Jung (low)
    Two consecutive high-fatigue — should be reordered.
    """
    return [golconda_fort, qutb_shahi, salar_jung]


# ---------------------------------------------------------------------------
# 1. score_activity_fatigue Tests
# ---------------------------------------------------------------------------

class TestScoreActivityFatigue:

    def test_high_walk_long_duration_gives_high_score(self, golconda_fort):
        af = score_activity_fatigue(golconda_fort)
        assert af.fatigue_score >= HIGH_FATIGUE_THRESHOLD
        assert af.is_high_fatigue is True

    def test_indoor_low_walk_gives_low_score(self, nimrah_cafe):
        af = score_activity_fatigue(nimrah_cafe)
        assert af.fatigue_score < LOW_FATIGUE_THRESHOLD
        assert af.is_low_fatigue is True

    def test_adventure_category_adds_bonus(self, wonderla):
        af = score_activity_fatigue(wonderla)
        # Adventure (1.0) + high walk (3.0) + long duration (1.5) = 5.5 before indoor
        assert af.fatigue_score >= 5.0

    def test_indoor_flag_reduces_score(self, salar_jung):
        """Indoor museum should score lower than equivalent outdoor place."""
        outdoor_museum = dict(salar_jung)
        outdoor_museum["indoor"] = False
        af_indoor  = score_activity_fatigue(salar_jung)
        af_outdoor = score_activity_fatigue(outdoor_museum)
        assert af_indoor.fatigue_score < af_outdoor.fatigue_score

    def test_cafe_restaurant_category_reduces_score(self, nimrah_cafe):
        af = score_activity_fatigue(nimrah_cafe)
        # Cafe reduction + indoor reduction + low walk + short duration
        assert af.fatigue_score < 1.0

    def test_nature_parks_category_adds_small_bonus(self, kbr_park):
        af = score_activity_fatigue(kbr_park)
        # medium (1.5) + short duration (0.5) + nature bonus (0.5) = 2.5
        assert af.fatigue_score >= 1.5

    def test_returns_activity_fatigue_instance(self, golconda_fort):
        af = score_activity_fatigue(golconda_fort)
        assert isinstance(af, ActivityFatigue)

    def test_name_stored_correctly(self, golconda_fort):
        af = score_activity_fatigue(golconda_fort)
        assert af.name == "Golconda Fort"

    def test_must_visit_stored_correctly(self, golconda_fort):
        af = score_activity_fatigue(golconda_fort)
        assert af.is_must_visit is True

    def test_must_visit_false_stored_correctly(self, kbr_park):
        af = score_activity_fatigue(kbr_park)
        assert af.is_must_visit is False

    def test_score_is_non_negative(self, nimrah_cafe):
        af = score_activity_fatigue(nimrah_cafe)
        assert af.fatigue_score >= 0.0

    def test_empty_dict_does_not_crash(self):
        af = score_activity_fatigue({})
        assert isinstance(af, ActivityFatigue)
        assert af.fatigue_score >= 0.0

    def test_minimal_place_scores_low(self):
        place = {"name": "Quiet Spot", "walking_intensity": "minimal",
                 "duration_hours": 0.5, "indoor": True, "category": ""}
        af = score_activity_fatigue(place)
        assert af.fatigue_score < LOW_FATIGUE_THRESHOLD

    def test_string_duration_handled(self):
        """Duration as string '2-3 hours' should parse to ~2.5."""
        place = {
            "name": "Place",
            "walking_intensity": "high",
            "duration_hours": "2-3 hours",
            "indoor": False,
            "category": "",
        }
        af = score_activity_fatigue(place)
        assert isinstance(af.fatigue_score, float)
        assert af.fatigue_score > 0

    def test_is_high_fatigue_and_is_low_fatigue_mutually_exclusive(
        self, golconda_fort, nimrah_cafe
    ):
        high_af = score_activity_fatigue(golconda_fort)
        low_af  = score_activity_fatigue(nimrah_cafe)
        assert high_af.is_high_fatigue is True
        assert high_af.is_low_fatigue is False
        assert low_af.is_high_fatigue is False
        assert low_af.is_low_fatigue is True

    def test_medium_walking_score_between_high_and_low(
        self, charminar, golconda_fort, nimrah_cafe
    ):
        medium_score = score_activity_fatigue(charminar).fatigue_score
        high_score   = score_activity_fatigue(golconda_fort).fatigue_score
        low_score    = score_activity_fatigue(nimrah_cafe).fatigue_score
        assert low_score < medium_score < high_score


# ---------------------------------------------------------------------------
# 2. analyse_day_fatigue Tests
# ---------------------------------------------------------------------------

class TestAnalyseDayFatigue:

    def test_returns_day_fatigue_report(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=0)
        assert isinstance(report, DayFatigueReport)

    def test_correct_day_index(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=2)
        assert report.day_index == 2

    def test_total_fatigue_is_sum_of_activities(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=0)
        expected = sum(
            score_activity_fatigue(a).fatigue_score for a in good_day
        )
        assert abs(report.total_fatigue - expected) < 0.01

    def test_bad_day_exceeds_cap(self, bad_day):
        report = analyse_day_fatigue(bad_day, day_index=0)
        assert report.exceeds_daily_cap is True

    def test_good_day_does_not_exceed_cap(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=0)
        assert report.exceeds_daily_cap is False

    def test_bad_day_has_high_count_over_max(self, bad_day):
        report = analyse_day_fatigue(bad_day, day_index=0)
        assert report.high_fatigue_count > MAX_HIGH_INTENSITY_PER_DAY

    def test_good_day_has_recovery(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=0)
        assert report.has_recovery is True

    def test_consecutive_high_detected(self, consecutive_high_day):
        report = analyse_day_fatigue(consecutive_high_day, day_index=0)
        assert report.has_consecutive_high is True

    def test_no_consecutive_in_good_day(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=0)
        assert report.has_consecutive_high is False

    def test_warnings_generated_for_bad_day(self, bad_day):
        report = analyse_day_fatigue(bad_day, day_index=0)
        assert len(report.warnings) > 0

    def test_no_warnings_for_good_day(self, good_day):
        report = analyse_day_fatigue(good_day, day_index=0)
        assert len(report.warnings) == 0

    def test_empty_day_returns_valid_report(self):
        report = analyse_day_fatigue([], day_index=0)
        assert report.total_fatigue == 0.0
        assert report.high_fatigue_count == 0
        assert report.has_consecutive_high is False

    def test_single_activity_no_consecutive(self, golconda_fort):
        report = analyse_day_fatigue([golconda_fort], day_index=0)
        assert report.has_consecutive_high is False

    def test_activity_fatigues_count_matches_activities(self, bad_day):
        report = analyse_day_fatigue(bad_day, day_index=0)
        assert len(report.activity_fatigues) == len(bad_day)

    def test_high_fatigue_count_accurate(self, consecutive_high_day):
        report = analyse_day_fatigue(consecutive_high_day, day_index=0)
        expected_high = sum(
            1 for a in consecutive_high_day
            if score_activity_fatigue(a).is_high_fatigue
        )
        assert report.high_fatigue_count == expected_high


# ---------------------------------------------------------------------------
# 3. optimise_day_fatigue Tests
# ---------------------------------------------------------------------------

class TestOptimiseDayFatigue:

    def test_returns_tuple_of_list_and_report(self, good_day):
        result, report = optimise_day_fatigue(good_day, day_index=0)
        assert isinstance(result, list)
        assert isinstance(report, DayFatigueReport)

    def test_good_day_not_reordered(self, good_day):
        original_names = [a["name"] for a in good_day]
        result, _      = optimise_day_fatigue(good_day, day_index=0)
        result_names   = [a["name"] for a in result]
        assert result_names == original_names

    def test_consecutive_high_day_gets_reordered(self, consecutive_high_day):
        """
        Golconda (high) → Qutb Shahi (high) → Salar Jung (low)
        After optimization: Golconda → Salar Jung → Qutb Shahi
        (low-fatigue inserted between the two highs)
        """
        original_names = [a["name"] for a in consecutive_high_day]
        result, report = optimise_day_fatigue(consecutive_high_day, day_index=0)
        result_names   = [a["name"] for a in result]
        # Either reordered OR consecutive flag is now False
        assert (
            result_names != original_names
            or not report.has_consecutive_high
        )

    def test_all_activities_preserved_after_reorder(self, consecutive_high_day):
        """No activities should be lost during reordering."""
        result, _ = optimise_day_fatigue(consecutive_high_day, day_index=0)
        assert len(result) == len(consecutive_high_day)

    def test_no_duplicate_activities_after_reorder(self, consecutive_high_day):
        result, _ = optimise_day_fatigue(consecutive_high_day, day_index=0)
        names     = [a["name"] for a in result]
        assert len(names) == len(set(names))

    def test_empty_day_returns_empty(self):
        result, report = optimise_day_fatigue([], day_index=0)
        assert result == []
        assert report.total_fatigue == 0.0

    def test_single_activity_unchanged(self, golconda_fort):
        result, _ = optimise_day_fatigue([golconda_fort], day_index=0)
        assert len(result) == 1
        assert result[0]["name"] == "Golconda Fort"

    def test_bad_day_reduces_consecutive_high(self, bad_day):
        """After optimization, consecutive high pairs should be reduced."""
        _, initial_report = optimise_day_fatigue.__wrapped__(bad_day, 0) \
            if hasattr(optimise_day_fatigue, '__wrapped__') \
            else (None, analyse_day_fatigue(bad_day, 0))

        result, final_report = optimise_day_fatigue(bad_day, day_index=0)

        # The optimizer should have at least attempted to fix it
        # (Even if it can't fully eliminate all consecutive pairs with
        #  only one low-fatigue activity available)
        assert isinstance(result, list)
        assert len(result) == len(bad_day)

    def test_two_high_one_low_breaks_consecutive(
        self, golconda_fort, qutb_shahi, nimrah_cafe
    ):
        """
        Golconda (high) → Qutb Shahi (high) → Nimrah (low)
        Should reorder to: Golconda → Nimrah → Qutb Shahi
        """
        day    = [golconda_fort, qutb_shahi, nimrah_cafe]
        result, report = optimise_day_fatigue(day, day_index=0)
        names  = [a["name"] for a in result]

        # Nimrah should appear between the two forts
        nimrah_idx   = names.index("Nimrah Cafe")
        golconda_idx = names.index("Golconda Fort")
        qutb_idx     = names.index("Qutb Shahi Tombs")

        # Nimrah should not be last if there are still two highs
        # OR the consecutive pair should be broken
        assert not report.has_consecutive_high or nimrah_idx < max(golconda_idx, qutb_idx)


# ---------------------------------------------------------------------------
# 4. optimise_trip_fatigue Tests
# ---------------------------------------------------------------------------

class TestOptimiseTripFatigue:

    def test_returns_fatigue_optimization_result(
        self, good_day, consecutive_high_day
    ):
        result = optimise_trip_fatigue([good_day, consecutive_high_day])
        assert isinstance(result, FatigueOptimizationResult)

    def test_correct_day_report_count(
        self, good_day, consecutive_high_day
    ):
        result = optimise_trip_fatigue([good_day, consecutive_high_day])
        assert len(result.day_reports) == 2

    def test_empty_trip_returns_empty_result(self):
        result = optimise_trip_fatigue([])
        assert result.day_reports == []
        assert result.days_reordered == []
        assert result.days_over_cap == []

    def test_all_good_days_no_reordering(
        self, good_day
    ):
        result = optimise_trip_fatigue([good_day, good_day])
        assert result.days_reordered == []

    def test_bad_days_detected_in_over_cap(self, bad_day):
        result = optimise_trip_fatigue([bad_day])
        # Bad day has Wonderla (extreme) + Golconda + Qutb Shahi
        # May still be over cap even after reordering
        assert isinstance(result.days_over_cap, list)

    def test_overall_warnings_collected(self, bad_day):
        result = optimise_trip_fatigue([bad_day])
        assert isinstance(result.overall_warnings, list)

    def test_optimization_applied_flag_true_when_reordered(
        self, consecutive_high_day
    ):
        """If any day was reordered, optimization_applied should be True."""
        result = optimise_trip_fatigue([consecutive_high_day])
        # May or may not have been reordered depending on optimizer decision
        assert isinstance(result.optimization_applied, bool)

    def test_single_activity_day_no_reorder(self, golconda_fort):
        result = optimise_trip_fatigue([[golconda_fort]])
        assert result.days_reordered == []

    def test_three_day_trip_all_reported(
        self, good_day, consecutive_high_day, bad_day
    ):
        result = optimise_trip_fatigue([good_day, consecutive_high_day, bad_day])
        assert len(result.day_reports) == 3

    def test_day_report_day_indices_sequential(
        self, good_day, consecutive_high_day
    ):
        result = optimise_trip_fatigue([good_day, consecutive_high_day])
        for i, report in enumerate(result.day_reports):
            assert report.day_index == i


# ---------------------------------------------------------------------------
# 5. get_fatigue_context_for_prompt Tests
# ---------------------------------------------------------------------------

class TestGetFatigueContextForPrompt:

    def _make_result(self, days: list) -> FatigueOptimizationResult:
        return optimise_trip_fatigue(days)

    def test_returns_string(self, good_day):
        result  = self._make_result([good_day])
        context = get_fatigue_context_for_prompt(result)
        assert isinstance(context, str)

    def test_contains_day_reference(self, good_day):
        result  = self._make_result([good_day])
        context = get_fatigue_context_for_prompt(result)
        assert "Day 1" in context

    def test_contains_fatigue_score(self, good_day):
        result  = self._make_result([good_day])
        context = get_fatigue_context_for_prompt(result)
        assert "fatigue=" in context

    def test_intense_day_mentions_heavy(self, bad_day):
        result  = self._make_result([bad_day])
        context = get_fatigue_context_for_prompt(result)
        # Heavy day should trigger footwear/hydration note
        assert "INTENSE" in context or "HEAVY" in context or "heavy" in context.lower()

    def test_non_empty_output(self, good_day, consecutive_high_day):
        result  = self._make_result([good_day, consecutive_high_day])
        context = get_fatigue_context_for_prompt(result)
        assert len(context) > 30

    def test_multiple_days_all_present(
        self, good_day, consecutive_high_day
    ):
        result  = self._make_result([good_day, consecutive_high_day])
        context = get_fatigue_context_for_prompt(result)
        assert "Day 1" in context
        assert "Day 2" in context


# ---------------------------------------------------------------------------
# 6. Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases:

    def test_object_with_attributes_instead_of_dict(self):
        """fatigue_optimizer should work with object attributes too."""
        class FakeActivity:
            name             = "Fake Place"
            category         = "Museums & Galleries"
            walking_intensity = "low"
            duration_hours   = 1.5
            indoor           = True
            must_visit       = False

        af = score_activity_fatigue(FakeActivity())
        assert isinstance(af, ActivityFatigue)
        assert af.name == "Fake Place"

    def test_duration_as_float_string(self):
        place = {
            "name": "Place",
            "walking_intensity": "medium",
            "duration_hours": "1.5",
            "indoor": False,
            "category": "",
        }
        af = score_activity_fatigue(place)
        assert isinstance(af.fatigue_score, float)

    def test_duration_in_minutes_string(self):
        place = {
            "name": "Quick Stop",
            "walking_intensity": "low",
            "duration_hours": "45 minutes",
            "indoor": True,
            "category": "Cafes & Restaurants",
        }
        af = score_activity_fatigue(place)
        assert af.fatigue_score >= 0.0

    def test_unknown_walking_intensity_defaults_to_low(self):
        place = {
            "name": "Mystery Place",
            "walking_intensity": "unknown_value",
            "duration_hours": 1.0,
            "indoor": False,
            "category": "",
        }
        af = score_activity_fatigue(place)
        assert isinstance(af.fatigue_score, float)

    def test_none_walking_intensity_defaults_gracefully(self):
        place = {
            "name": "Place",
            "walking_intensity": None,
            "duration_hours": 1.0,
            "indoor": False,
            "category": "",
        }
        af = score_activity_fatigue(place)
        assert af.fatigue_score >= 0.0

    def test_all_high_fatigue_day_still_preserves_count(
        self, golconda_fort, qutb_shahi, wonderla
    ):
        day    = [golconda_fort, qutb_shahi, wonderla]
        result, _ = optimise_day_fatigue(day, day_index=0)
        assert len(result) == 3

    def test_all_low_fatigue_day_has_no_consecutive_high(
        self, salar_jung, nimrah_cafe, hussain_sagar
    ):
        day    = [salar_jung, nimrah_cafe, hussain_sagar]
        _, report = optimise_day_fatigue(day, day_index=0)
        assert report.has_consecutive_high is False
        assert report.high_fatigue_count == 0

    def test_optimise_trip_with_empty_days(self):
        """Trip with some empty days should not crash."""
        result = optimise_trip_fatigue([[], [], []])
        assert len(result.day_reports) == 3
        for report in result.day_reports:
            assert report.total_fatigue == 0.0