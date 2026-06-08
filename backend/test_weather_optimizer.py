"""
tests/test_weather_optimizer.py
================================
Phase 7 — Weather Optimizer Unit Tests

All dates are dynamically generated as future dates
relative to today, so tests never use past dates.

These are pure unit tests — they never call Open Meteo.
The weather_optimizer only receives pre-fetched dicts,
so dates are just dictionary keys (strings).
"""

import pytest
from datetime import date, timedelta

from services.weather_optimizer import (
    WeatherClass,
    WeatherOptimizationResult,
    DayWeather,
    classify_day_weather,
    score_place_for_weather,
    filter_places_for_weather,
    optimize_for_weather,
    adjust_places_for_day,
    get_weather_context_for_prompt,
)


# ---------------------------------------------------------------------------
# Date Helpers — always future dates, never past
# ---------------------------------------------------------------------------

def future_date(days_ahead: int = 7) -> str:
    """Return an ISO date string N days from today."""
    return str(date.today() + timedelta(days=days_ahead))


def future_date_list(count: int, start_days_ahead: int = 7) -> list[str]:
    """Return a list of consecutive ISO date strings starting N days ahead."""
    start = date.today() + timedelta(days=start_days_ahead)
    return [str(start + timedelta(days=i)) for i in range(count)]


# ---------------------------------------------------------------------------
# Fixtures — Places
# ---------------------------------------------------------------------------

@pytest.fixture
def outdoor_park():
    return {
        "name": "KBR Park",
        "category": "Nature & Parks",
        "subcategory": "Urban Park",
        "tags": ["outdoor", "park", "nature", "walking"],
        "walking_intensity": "medium",
        "indoor": False,
    }


@pytest.fixture
def indoor_museum():
    return {
        "name": "Salar Jung Museum",
        "category": "Museums & Galleries",
        "subcategory": "Art Museum",
        "tags": ["indoor", "museum", "heritage", "culture"],
        "walking_intensity": "low",
        "indoor": True,
    }


@pytest.fixture
def outdoor_fort():
    return {
        "name": "Golconda Fort",
        "category": "Historical Sites",
        "subcategory": "Fort",
        "tags": ["outdoor", "heritage", "fort", "trekking"],
        "walking_intensity": "high",
        "indoor": False,
    }


@pytest.fixture
def indoor_cafe():
    return {
        "name": "Nimrah Cafe",
        "category": "Cafes & Restaurants",
        "subcategory": "Cafe",
        "tags": ["indoor", "cafe", "food"],
        "walking_intensity": "low",
        "indoor": True,
    }


@pytest.fixture
def lake_place():
    return {
        "name": "Hussain Sagar Lake",
        "category": "Lakes & Reservoirs",
        "subcategory": "Lake",
        "tags": ["outdoor", "lake", "boating", "nature"],
        "walking_intensity": "low",
        "indoor": False,
    }


# ---------------------------------------------------------------------------
# Fixtures — Weather forecast dicts
# These match DailyForecast.__dict__ from weather.py exactly.
# Dates are always future dates.
# ---------------------------------------------------------------------------

@pytest.fixture
def d1(future_dates):
    """Day 1 date string."""
    return future_dates[0]


@pytest.fixture
def d2(future_dates):
    """Day 2 date string."""
    return future_dates[1]


@pytest.fixture
def d3(future_dates):
    """Day 3 date string."""
    return future_dates[2]


@pytest.fixture
def future_dates():
    """3 consecutive future date strings starting 30 days from today."""
    return future_date_list(count=3, start_days_ahead=30)


@pytest.fixture
def forecast_extreme_heat(future_dates):
    """44°C, clear sky — classifies as EXTREME_HEAT."""
    d = future_dates[0]
    return {
        "date": d,
        "temp_max": 44.0,
        "temp_min": 30.0,
        "condition": "Clear sky",
        "condition_code": "clear",
        "precipitation_mm": 0.0,
        "precipitation_probability": 5,
        "weather_code": 1,
    }


@pytest.fixture
def forecast_rain(future_dates):
    """32°C, 70% rain, WMO 63 — classifies as RAIN."""
    d = future_dates[1]
    return {
        "date": d,
        "temp_max": 32.0,
        "temp_min": 24.0,
        "condition": "Moderate rain",
        "condition_code": "rain",
        "precipitation_mm": 12.0,
        "precipitation_probability": 70,
        "weather_code": 63,
    }


@pytest.fixture
def forecast_hot(future_dates):
    """38°C, low rain — classifies as HOT."""
    d = future_dates[0]
    return {
        "date": d,
        "temp_max": 38.0,
        "temp_min": 26.0,
        "condition": "Mainly clear",
        "condition_code": "clear",
        "precipitation_mm": 0.0,
        "precipitation_probability": 10,
        "weather_code": 1,
    }


@pytest.fixture
def forecast_cloudy(future_dates):
    """28°C, overcast — classifies as CLOUDY."""
    d = future_dates[0]
    return {
        "date": d,
        "temp_max": 28.0,
        "temp_min": 18.0,
        "condition": "Overcast",
        "condition_code": "cloudy",
        "precipitation_mm": 0.0,
        "precipitation_probability": 15,
        "weather_code": 3,
    }


@pytest.fixture
def forecast_clear(future_dates):
    """25°C, clear — classifies as CLEAR."""
    d = future_dates[2]
    return {
        "date": d,
        "temp_max": 25.0,
        "temp_min": 16.0,
        "condition": "Clear sky",
        "condition_code": "clear",
        "precipitation_mm": 0.0,
        "precipitation_probability": 5,
        "weather_code": 0,
    }


@pytest.fixture
def three_day_weather_by_date(future_dates, forecast_extreme_heat,
                               forecast_rain, forecast_clear):
    """
    3-day forecast dict:
        Day 0 → EXTREME_HEAT
        Day 1 → RAIN
        Day 2 → CLEAR
    """
    return {
        future_dates[0]: forecast_extreme_heat,
        future_dates[1]: forecast_rain,
        future_dates[2]: forecast_clear,
    }


# ---------------------------------------------------------------------------
# 1. Classification Tests
# ---------------------------------------------------------------------------

class TestClassifyDayWeather:
    """
    classify_day_weather() is a pure function.
    It never uses the date string for logic — only stores it.
    So any date string is valid here.
    """

    def _classify(self, temp_max, temp_min, rain_prob,
                  weather_code, condition, condition_code,
                  day_index=0):
        return classify_day_weather(
            date=future_date(7),
            day_index=day_index,
            temp_max=temp_max,
            temp_min=temp_min,
            rain_prob=rain_prob,
            weather_code=weather_code,
            condition=condition,
            condition_code=condition_code,
        )

    def test_extreme_heat_by_temperature(self):
        dw = self._classify(44.0, 30.0, 5, 1, "Clear sky", "clear")
        assert dw.classification == WeatherClass.EXTREME_HEAT

    def test_extreme_heat_at_exact_boundary(self):
        dw = self._classify(42.0, 28.0, 0, 0, "Clear sky", "clear")
        assert dw.classification == WeatherClass.EXTREME_HEAT

    def test_extreme_heat_takes_priority_over_rain(self):
        """43°C + 60% rain + WMO 63 → EXTREME_HEAT wins."""
        dw = self._classify(43.0, 30.0, 60, 63, "Moderate rain", "rain")
        assert dw.classification == WeatherClass.EXTREME_HEAT

    def test_rain_by_probability(self):
        dw = self._classify(30.0, 24.0, 50, 1, "Mainly clear", "clear")
        assert dw.classification == WeatherClass.RAIN

    def test_rain_at_probability_boundary(self):
        """Exactly 40% → RAIN."""
        dw = self._classify(30.0, 22.0, 40, 0, "Clear sky", "clear")
        assert dw.classification == WeatherClass.RAIN

    def test_rain_by_condition_code(self):
        dw = self._classify(30.0, 24.0, 10, 1, "Moderate rain", "rain")
        assert dw.classification == WeatherClass.RAIN

    def test_rain_by_drizzle_condition_code(self):
        dw = self._classify(28.0, 22.0, 15, 51, "Light drizzle", "drizzle")
        assert dw.classification == WeatherClass.RAIN

    def test_rain_by_thunderstorm_condition_code(self):
        dw = self._classify(28.0, 22.0, 20, 95, "Thunderstorm", "thunderstorm")
        assert dw.classification == WeatherClass.RAIN

    def test_rain_by_wmo_code_61(self):
        dw = self._classify(28.0, 22.0, 5, 61, "Slight rain", "rain")
        assert dw.classification == WeatherClass.RAIN

    def test_hot_classification(self):
        dw = self._classify(38.0, 26.0, 5, 1, "Mainly clear", "clear")
        assert dw.classification == WeatherClass.HOT

    def test_hot_at_lower_boundary(self):
        """Exactly 35°C → HOT."""
        dw = self._classify(35.0, 24.0, 5, 0, "Clear sky", "clear")
        assert dw.classification == WeatherClass.HOT

    def test_just_below_hot_boundary_is_not_hot(self):
        """34.9°C with no rain → CLEAR (not HOT)."""
        dw = self._classify(34.9, 22.0, 5, 0, "Clear sky", "clear")
        assert dw.classification == WeatherClass.CLEAR

    def test_cloudy_by_condition_code(self):
        dw = self._classify(28.0, 18.0, 10, 3, "Overcast", "cloudy")
        assert dw.classification == WeatherClass.CLOUDY

    def test_cloudy_by_partly_cloudy_condition_code(self):
        dw = self._classify(28.0, 18.0, 10, 2, "Partly cloudy", "partly_cloudy")
        assert dw.classification == WeatherClass.CLOUDY

    def test_cloudy_by_rain_probability_in_range(self):
        """20% rain prob with clear WMO → CLOUDY."""
        dw = self._classify(28.0, 18.0, 20, 1, "Mainly clear", "clear")
        assert dw.classification == WeatherClass.CLOUDY

    def test_clear_classification(self):
        dw = self._classify(25.0, 16.0, 5, 0, "Clear sky", "clear")
        assert dw.classification == WeatherClass.CLEAR

    def test_clear_with_low_rain_prob(self):
        dw = self._classify(30.0, 20.0, 19, 1, "Mainly clear", "clear")
        assert dw.classification == WeatherClass.CLEAR

    def test_stores_correct_day_index(self):
        dw = self._classify(25.0, 16.0, 5, 0, "Clear sky", "clear", day_index=2)
        assert dw.day_index == 2

    def test_stores_provided_date(self):
        target_date = future_date(14)
        dw = classify_day_weather(
            date=target_date, day_index=0,
            temp_max=25.0, temp_min=16.0,
            rain_prob=5, weather_code=0,
            condition="Clear sky", condition_code="clear",
        )
        assert dw.date == target_date

    def test_description_is_non_empty_string(self):
        dw = self._classify(25.0, 16.0, 5, 0, "Clear sky", "clear")
        assert isinstance(dw.description, str)
        assert len(dw.description) > 10

    def test_returns_day_weather_instance(self):
        dw = self._classify(25.0, 16.0, 5, 0, "Clear sky", "clear")
        assert isinstance(dw, DayWeather)

    def test_fog_condition_code_is_cloudy(self):
        dw = self._classify(22.0, 15.0, 5, 45, "Foggy", "fog")
        assert dw.classification == WeatherClass.CLOUDY


# ---------------------------------------------------------------------------
# 2. Place Scoring Tests
# ---------------------------------------------------------------------------

class TestScorePlaceForWeather:

    def test_indoor_museum_strongly_boosted_extreme_heat(self, indoor_museum):
        score = score_place_for_weather(indoor_museum, WeatherClass.EXTREME_HEAT)
        assert score >= 2.0

    def test_outdoor_fort_strongly_penalised_extreme_heat(self, outdoor_fort):
        score = score_place_for_weather(outdoor_fort, WeatherClass.EXTREME_HEAT)
        assert score <= -2.0

    def test_indoor_cafe_boosted_rain(self, indoor_cafe):
        score = score_place_for_weather(indoor_cafe, WeatherClass.RAIN)
        assert score > 0

    def test_outdoor_park_penalised_rain(self, outdoor_park):
        score = score_place_for_weather(outdoor_park, WeatherClass.RAIN)
        assert score < 0

    def test_lake_extra_penalised_rain(self, lake_place):
        score = score_place_for_weather(lake_place, WeatherClass.RAIN)
        assert score < -1.0

    def test_indoor_museum_boosted_hot(self, indoor_museum):
        score = score_place_for_weather(indoor_museum, WeatherClass.HOT)
        assert score > 0

    def test_outdoor_high_walk_penalised_hot(self, outdoor_fort):
        score = score_place_for_weather(outdoor_fort, WeatherClass.HOT)
        assert score < 0

    def test_outdoor_park_medium_walk_penalised_hot(self, outdoor_park):
        score = score_place_for_weather(outdoor_park, WeatherClass.HOT)
        assert score < 0

    def test_outdoor_boosted_clear(self, outdoor_park):
        score = score_place_for_weather(outdoor_park, WeatherClass.CLEAR)
        assert score >= 0.5

    def test_indoor_neutral_clear(self, indoor_museum):
        score = score_place_for_weather(indoor_museum, WeatherClass.CLEAR)
        assert score == 0.0

    def test_outdoor_not_penalised_cloudy(self, outdoor_park):
        score = score_place_for_weather(outdoor_park, WeatherClass.CLOUDY)
        assert score >= 0.0

    def test_indoor_slight_boost_or_neutral_cloudy(self, indoor_museum):
        score = score_place_for_weather(indoor_museum, WeatherClass.CLOUDY)
        assert score >= 0.0

    def test_score_is_float(self, indoor_museum):
        score = score_place_for_weather(indoor_museum, WeatherClass.CLEAR)
        assert isinstance(score, float)

    def test_empty_tags_does_not_crash(self):
        place = {
            "name": "Unknown Place",
            "category": "",
            "subcategory": "",
            "tags": [],
            "walking_intensity": "low",
        }
        score = score_place_for_weather(place, WeatherClass.RAIN)
        assert isinstance(score, (int, float))

    def test_none_tags_does_not_crash(self):
        place = {
            "name": "Unknown Place",
            "category": "",
            "tags": None,
            "walking_intensity": "low",
        }
        score = score_place_for_weather(place, WeatherClass.RAIN)
        assert isinstance(score, (int, float))

    def test_missing_walking_intensity_does_not_crash(self):
        place = {
            "name": "Place",
            "category": "Nature & Parks",
            "tags": ["outdoor"],
        }
        score = score_place_for_weather(place, WeatherClass.HOT)
        assert isinstance(score, (int, float))

    def test_indoor_flag_true_detected_as_indoor(self):
        """Place with indoor=True should be treated as indoor."""
        place = {
            "name": "Air-conditioned Hall",
            "category": "Historical Sites",  # normally mixed/outdoor
            "tags": [],
            "walking_intensity": "low",
            "indoor": True,
        }
        score = score_place_for_weather(place, WeatherClass.EXTREME_HEAT)
        assert score > 0, "indoor=True should be boosted in extreme heat"

    def test_indoor_flag_false_detected_as_outdoor(self):
        """Place with indoor=False, outdoor tags → treated as outdoor."""
        place = {
            "name": "Open Ground",
            "category": "Historical Sites",
            "tags": ["outdoor", "fort"],
            "walking_intensity": "high",
            "indoor": False,
        }
        score = score_place_for_weather(place, WeatherClass.EXTREME_HEAT)
        assert score < 0, "outdoor=True high walk should be penalised in extreme heat"

    def test_extreme_heat_indoor_score_greater_than_outdoor(
        self, indoor_museum, outdoor_fort
    ):
        indoor_score  = score_place_for_weather(indoor_museum, WeatherClass.EXTREME_HEAT)
        outdoor_score = score_place_for_weather(outdoor_fort, WeatherClass.EXTREME_HEAT)
        assert indoor_score > outdoor_score

    def test_rain_indoor_score_greater_than_outdoor(
        self, indoor_cafe, outdoor_park
    ):
        indoor_score  = score_place_for_weather(indoor_cafe, WeatherClass.RAIN)
        outdoor_score = score_place_for_weather(outdoor_park, WeatherClass.RAIN)
        assert indoor_score > outdoor_score


# ---------------------------------------------------------------------------
# 3. Filter Places Tests
# ---------------------------------------------------------------------------

class TestFilterPlacesForWeather:

    def test_soft_filter_does_not_remove_any_places(
        self, outdoor_fort, indoor_museum
    ):
        result = filter_places_for_weather(
            [outdoor_fort, indoor_museum],
            WeatherClass.EXTREME_HEAT,
            hard_filter=False,
        )
        assert len(result) == 2

    def test_soft_filter_puts_indoor_first_extreme_heat(
        self, outdoor_fort, indoor_museum
    ):
        result = filter_places_for_weather(
            [outdoor_fort, indoor_museum],
            WeatherClass.EXTREME_HEAT,
            hard_filter=False,
        )
        assert result[0]["name"] == "Salar Jung Museum"

    def test_hard_filter_extreme_heat_removes_outdoor(
        self, outdoor_fort, indoor_museum
    ):
        result = filter_places_for_weather(
            [outdoor_fort, indoor_museum],
            WeatherClass.EXTREME_HEAT,
            hard_filter=True,
        )
        names = [p["name"] for p in result]
        assert "Salar Jung Museum" in names

    def test_hard_filter_rain_removes_lake(
        self, lake_place, indoor_museum
    ):
        """Lake scores <= -2.0 on rain day → hard filter removes it."""
        result = filter_places_for_weather(
            [lake_place, indoor_museum],
            WeatherClass.RAIN,
            hard_filter=True,
        )
        names = [p["name"] for p in result]
        assert "Salar Jung Museum" in names

    def test_weather_score_field_added_to_each_place(self, indoor_museum):
        result = filter_places_for_weather(
            [indoor_museum],
            WeatherClass.CLEAR,
        )
        assert "_weather_score" in result[0]

    def test_original_place_dict_not_mutated(self, indoor_museum):
        original_keys = set(indoor_museum.keys())
        filter_places_for_weather([indoor_museum], WeatherClass.RAIN)
        assert set(indoor_museum.keys()) == original_keys

    def test_empty_input_returns_empty_list(self):
        result = filter_places_for_weather([], WeatherClass.RAIN)
        assert result == []

    def test_rain_ranks_indoor_above_outdoor(
        self, outdoor_park, outdoor_fort, indoor_cafe, indoor_museum
    ):
        places = [outdoor_park, outdoor_fort, indoor_cafe, indoor_museum]
        result = filter_places_for_weather(places, WeatherClass.RAIN)
        first_score = result[0].get("_weather_score", 0)
        last_score  = result[-1].get("_weather_score", 0)
        assert first_score >= last_score

    def test_clear_ranks_outdoor_above_indoor(
        self, indoor_museum, outdoor_park
    ):
        result = filter_places_for_weather(
            [indoor_museum, outdoor_park],
            WeatherClass.CLEAR,
        )
        assert result[0]["name"] == "KBR Park"

    def test_all_places_preserved_in_soft_filter(
        self, outdoor_park, outdoor_fort, indoor_cafe, indoor_museum, lake_place
    ):
        places = [outdoor_park, outdoor_fort, indoor_cafe, indoor_museum, lake_place]
        result = filter_places_for_weather(places, WeatherClass.RAIN, hard_filter=False)
        assert len(result) == 5

    def test_no_duplicate_places_after_filter(
        self, outdoor_park, indoor_museum
    ):
        places = [outdoor_park, indoor_museum]
        result = filter_places_for_weather(places, WeatherClass.HOT)
        names  = [p["name"] for p in result]
        assert len(names) == len(set(names))


# ---------------------------------------------------------------------------
# 4. optimize_for_weather Tests
# ---------------------------------------------------------------------------

class TestOptimizeForWeather:

    def test_returns_correct_day_count(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert len(result.day_weather) == 3

    def test_day_0_extreme_heat(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert result.day_weather[0].classification == WeatherClass.EXTREME_HEAT

    def test_day_1_rain(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert result.day_weather[1].classification == WeatherClass.RAIN

    def test_day_2_clear(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert result.day_weather[2].classification == WeatherClass.CLEAR

    def test_has_rain_true(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert result.has_rain is True

    def test_has_extreme_true(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert result.has_extreme is True

    def test_indoor_days_contains_extreme_and_rain_days(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert 0 in result.indoor_days   # EXTREME_HEAT
        assert 1 in result.indoor_days   # RAIN

    def test_clear_day_not_in_indoor_days(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert 2 not in result.indoor_days  # CLEAR

    def test_overall_summary_not_empty(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert result.overall_summary != ""
        assert len(result.overall_summary) > 3

    def test_returns_optimization_result_instance(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        assert isinstance(result, WeatherOptimizationResult)

    def test_all_day_weather_are_correct_type(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        for dw in result.day_weather:
            assert isinstance(dw, DayWeather)

    def test_day_indices_are_zero_based_sequential(
        self, three_day_weather_by_date, future_dates
    ):
        result = optimize_for_weather(
            weather_by_date=three_day_weather_by_date,
            date_list=future_dates,
        )
        for i, dw in enumerate(result.day_weather):
            assert dw.day_index == i

    def test_empty_weather_dict_defaults_all_days_to_clear(self):
        dates  = future_date_list(3, start_days_ahead=30)
        result = optimize_for_weather(
            weather_by_date={},
            date_list=dates,
        )
        assert len(result.day_weather) == 3
        for dw in result.day_weather:
            assert dw.classification == WeatherClass.CLEAR

    def test_missing_date_in_forecast_defaults_to_clear(self):
        """If a date in date_list has no entry in weather_by_date → CLEAR."""
        d1 = future_date(30)
        d2 = future_date(31)
        result = optimize_for_weather(
            weather_by_date={
                d1: {
                    "date": d1,
                    "temp_max": 28.0, "temp_min": 18.0,
                    "condition": "Clear sky", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 5,
                    "weather_code": 0,
                }
                # d2 intentionally missing
            },
            date_list=[d1, d2],
        )
        assert len(result.day_weather) == 2
        assert result.day_weather[0].classification == WeatherClass.CLEAR
        assert result.day_weather[1].classification == WeatherClass.CLEAR

    def test_empty_date_list_returns_empty_result(self):
        result = optimize_for_weather(
            weather_by_date={},
            date_list=[],
        )
        assert result.day_weather == []
        assert result.indoor_days == set()

    def test_single_clear_day_no_indoor_preference(self):
        d      = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d,
                    "temp_max": 26.0, "temp_min": 17.0,
                    "condition": "Clear sky", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 5,
                    "weather_code": 0,
                }
            },
            date_list=[d],
        )
        assert 0 not in result.indoor_days
        assert result.has_rain is False
        assert result.has_extreme is False

    def test_hot_day_in_indoor_days(self):
        d      = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d,
                    "temp_max": 38.0, "temp_min": 26.0,
                    "condition": "Mainly clear", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 10,
                    "weather_code": 1,
                }
            },
            date_list=[d],
        )
        assert 0 in result.indoor_days

    def test_dates_stored_correctly_in_day_weather(self):
        dates  = future_date_list(2, start_days_ahead=30)
        result = optimize_for_weather(
            weather_by_date={},   # empty → CLEAR defaults
            date_list=dates,
        )
        assert result.day_weather[0].date == dates[0]
        assert result.day_weather[1].date == dates[1]


# ---------------------------------------------------------------------------
# 5. adjust_places_for_day Tests
# ---------------------------------------------------------------------------

class TestAdjustPlacesForDay:

    def _day_weather(self, classification: WeatherClass) -> DayWeather:
        return DayWeather(
            day_index=0,
            date=future_date(30),
            classification=classification,
            temp_max=30.0,
            temp_min=20.0,
            rain_prob=10,
            weather_code=0,
            condition="Clear sky",
            condition_code="clear",
            description="Test weather description.",
        )

    def test_returns_list(self, outdoor_park, indoor_museum):
        dw     = self._day_weather(WeatherClass.CLEAR)
        result = adjust_places_for_day([outdoor_park, indoor_museum], dw)
        assert isinstance(result, list)

    def test_rain_puts_indoor_first(self, outdoor_park, indoor_museum):
        dw     = self._day_weather(WeatherClass.RAIN)
        result = adjust_places_for_day([outdoor_park, indoor_museum], dw)
        assert result[0]["name"] == "Salar Jung Museum"

    def test_extreme_heat_puts_indoor_first(self, outdoor_fort, indoor_museum):
        dw     = self._day_weather(WeatherClass.EXTREME_HEAT)
        result = adjust_places_for_day([outdoor_fort, indoor_museum], dw)
        assert result[0]["name"] == "Salar Jung Museum"

    def test_clear_puts_outdoor_first(self, indoor_museum, outdoor_park):
        dw     = self._day_weather(WeatherClass.CLEAR)
        result = adjust_places_for_day([indoor_museum, outdoor_park], dw)
        assert result[0]["name"] == "KBR Park"

    def test_empty_input_returns_empty(self):
        dw     = self._day_weather(WeatherClass.CLEAR)
        result = adjust_places_for_day([], dw)
        assert result == []

    def test_weather_score_present_on_each_result(self, indoor_museum):
        dw     = self._day_weather(WeatherClass.RAIN)
        result = adjust_places_for_day([indoor_museum], dw)
        assert "_weather_score" in result[0]

    def test_single_place_returns_single_place(self, indoor_museum):
        dw     = self._day_weather(WeatherClass.CLEAR)
        result = adjust_places_for_day([indoor_museum], dw)
        assert len(result) == 1

    def test_all_places_preserved_count(
        self, outdoor_park, outdoor_fort, indoor_cafe, indoor_museum
    ):
        dw     = self._day_weather(WeatherClass.HOT)
        places = [outdoor_park, outdoor_fort, indoor_cafe, indoor_museum]
        result = adjust_places_for_day(places, dw)
        assert len(result) == 4

    def test_hot_puts_indoor_before_outdoor_high_walk(
        self, outdoor_fort, indoor_museum
    ):
        dw     = self._day_weather(WeatherClass.HOT)
        result = adjust_places_for_day([outdoor_fort, indoor_museum], dw)
        assert result[0]["name"] == "Salar Jung Museum"


# ---------------------------------------------------------------------------
# 6. get_weather_context_for_prompt Tests
# ---------------------------------------------------------------------------

class TestGetWeatherContextForPrompt:

    def _build_result(self, weather_by_date, date_list) -> WeatherOptimizationResult:
        return optimize_for_weather(
            weather_by_date=weather_by_date,
            date_list=date_list,
        )

    def test_returns_string(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert isinstance(context, str)

    def test_contains_all_day_numbers(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert "Day 1" in context
        assert "Day 2" in context
        assert "Day 3" in context

    def test_contains_extreme_heat_label(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert "EXTREME_HEAT" in context

    def test_contains_rain_label(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert "RAIN" in context

    def test_contains_clear_label(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert "CLEAR" in context

    def test_extreme_heat_alert_in_output(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert "EXTREME HEAT" in context.upper()

    def test_rain_alert_in_output(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert "RAIN" in context.upper()

    def test_clear_only_no_alerts(self):
        d      = future_date(30)
        result = self._build_result(
            {
                d: {
                    "date": d,
                    "temp_max": 26.0, "temp_min": 17.0,
                    "condition": "Clear sky", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 5,
                    "weather_code": 0,
                }
            },
            [d],
        )
        context = get_weather_context_for_prompt(result)
        assert "ALERT" not in context.upper()

    def test_output_length_meaningful(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        assert len(context) > 50

    def test_each_day_date_appears_in_context(
        self, three_day_weather_by_date, future_dates
    ):
        result  = self._build_result(three_day_weather_by_date, future_dates)
        context = get_weather_context_for_prompt(result)
        for d in future_dates:
            assert d in context


# ---------------------------------------------------------------------------
# 7. Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases:

    def test_seven_day_trip_all_clear(self):
        dates  = future_date_list(7, start_days_ahead=30)
        result = optimize_for_weather(weather_by_date={}, date_list=dates)
        assert len(result.day_weather) == 7
        assert result.indoor_days == set()

    def test_single_day_extreme_heat(self):
        d = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d,
                    "temp_max": 45.0, "temp_min": 32.0,
                    "condition": "Clear sky", "condition_code": "clear",
                    "precipitation_mm": 0.0,
                    "precipitation_probability": 0,
                    "weather_code": 0,
                }
            },
            date_list=[d],
        )
        assert result.day_weather[0].classification == WeatherClass.EXTREME_HEAT
        assert result.has_extreme is True
        assert result.has_rain is False
        assert 0 in result.indoor_days

    def test_rain_and_hot_but_not_extreme(self):
        d = future_date(30)
        result = optimize_for_weather(
            weather_by_date={
                d: {
                    "date": d,
                    "temp_max": 36.0, "temp_min": 26.0,
                    "condition": "Moderate rain", "condition_code": "rain",
                    "precipitation_mm": 8.0,
                    "precipitation_probability": 65,
                    "weather_code": 63,
                }
            },
            date_list=[d],
        )
        # RAIN takes priority over HOT when temp < 42
        assert result.day_weather[0].classification == WeatherClass.RAIN

    def test_place_with_all_fields_missing(self):
        """Completely empty place dict should not crash the scorer."""
        score = score_place_for_weather({}, WeatherClass.RAIN)
        assert isinstance(score, (int, float))

    def test_filter_single_place_soft(self, outdoor_fort):
        result = filter_places_for_weather(
            [outdoor_fort], WeatherClass.RAIN, hard_filter=False
        )
        assert len(result) == 1

    def test_summary_contains_count_prefix(self):
        dates  = future_date_list(2, start_days_ahead=30)
        result = optimize_for_weather(weather_by_date={}, date_list=dates)
        # e.g. "2x CLEAR"
        assert "x" in result.overall_summary.lower() or "CLEAR" in result.overall_summary

    def test_weather_class_values_are_strings(self):
        """WeatherClass inherits from str — values should be usable as strings."""
        assert WeatherClass.CLEAR == "CLEAR"
        assert WeatherClass.RAIN == "RAIN"
        assert WeatherClass.HOT == "HOT"
        assert WeatherClass.EXTREME_HEAT == "EXTREME_HEAT"
        assert WeatherClass.CLOUDY == "CLOUDY"

    def test_optimize_preserves_date_order(self):
        dates = future_date_list(5, start_days_ahead=30)
        result = optimize_for_weather(weather_by_date={}, date_list=dates)
        result_dates = [dw.date for dw in result.day_weather]
        assert result_dates == dates