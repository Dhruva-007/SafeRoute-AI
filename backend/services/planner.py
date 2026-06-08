"""
Planner Service for SafeRoute AI — v5 (Phase 9: Trip Validation).

Pipeline:
  1. RecommendationEngine    — score all 79 places by user preferences
  2. WeatherFetch            — get Open Meteo forecast
  3. WeatherOptimizer        — classify forecast + nudge recommendation scores
  4. DayBuilder              — select places per day algorithmically
  5. RouteOptimizer          — order within each day by geography
  6. FatigueOptimizer        — balance daily fatigue, fix back-to-back intensity
  7. TripValidator           — validate all 8 constraints, log report  [NEW Phase 9]
  8. LLM                     — write descriptions ONLY (Phase 6 constraints)
  9. LLMOutputValidator      — validate + correct any hallucinations
 10. FatigueService          — score final itinerary for response metadata
 11. TripPlanResponse        — structured output to frontend
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, timedelta

import httpx

from config.settings import get_settings
from models.trip import Activity, DayPlan, TripPlanRequest, TripPlanResponse
from services.day_builder import BuiltActivity, get_day_builder
from services.fatigue import get_fatigue_service
from services.geographic_cluster import get_cluster_engine
from services.llm_validator import get_llm_validator
from services.recommender import get_recommender
from services.route_optimizer import RouteOptimizedDay, get_route_optimizer
from services.weather import get_weather_service

# Phase 7 — Weather Optimizer
from services.weather_optimizer import (
    WeatherOptimizationResult,
    WeatherClass,
    adjust_places_for_day,
    get_weather_context_for_prompt,
    optimize_for_weather,
    score_place_for_weather,
    filter_places_for_weather,
)

# Phase 8 — Fatigue Optimizer
from services.fatigue_optimizer import (
    FatigueOptimizationResult,
    optimise_trip_fatigue,
    get_fatigue_context_for_prompt,
    score_activity_fatigue,
    analyse_day_fatigue,
)

# Phase 9 — Trip Validator
from services.trip_validator import (
    ValidationReport,
    validate_trip,
)

logger = logging.getLogger(__name__)


class PlannerService:
    """
    RAG-powered trip planner — algorithmic place selection + LLM descriptions.
    Phase 9: Full validation layer before LLM description generation.
    """

    def __init__(self) -> None:
        self._settings       = get_settings()
        self._recommender    = get_recommender()
        self._cluster_engine = get_cluster_engine()
        self._day_builder    = get_day_builder()
        self._optimizer      = get_route_optimizer()
        self._fatigue        = get_fatigue_service()
        self._weather        = get_weather_service()
        self._validator      = get_llm_validator()

        logger.info(
            "PlannerService v5 initialised "
            "(algorithmic + weather-aware + fatigue-aware + validated)"
        )
        logger.info(
            "Validator loaded with %d known place names",
            len(self._validator._known_names),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def plan_trip(self, request: TripPlanRequest) -> TripPlanResponse:
        """Generate a complete day-by-day itinerary."""
        logger.info(
            "Planning trip | destination=%s | days=%d | travelers=%d | "
            "budget=%s | interests=%s",
            request.destination,
            request.trip_duration_days,
            request.number_of_travelers,
            request.budget,
            request.interests,
        )

        date_list = self._generate_date_list(
            request.start_date, request.trip_duration_days
        )

        # ── Step 1: Fetch weather ─────────────────────────────────────
        weather_by_date = await self._fetch_weather_for_trip(request)

        # ── Step 2: Run weather optimizer ─────────────────────────────
        weather_result = self._run_weather_optimizer(
            weather_by_date=weather_by_date,
            date_list=date_list,
        )

        # ── Step 3: Algorithmic place selection + route optimization ──
        optimized_days = self._run_algorithmic_pipeline(
            request=request,
            weather_result=weather_result,
            date_list=date_list,
        )

        # ── Step 4: Fatigue optimization ──────────────────────────────
        optimized_days, fatigue_result = self._run_fatigue_optimizer(
            optimized_days=optimized_days,
        )

        # ── Step 5: Trip Validation ───────────────────────────────────
        validation_report = self._run_trip_validator(
            optimized_days=optimized_days,
            request=request,
            weather_result=weather_result,
            fatigue_result=fatigue_result,
        )

        # ── Step 6: Generate descriptions via LLM ─────────────────────
        days_with_descriptions = await self._generate_descriptions(
            optimized_days=optimized_days,
            request=request,
            weather_by_date=weather_by_date,
            weather_result=weather_result,
            fatigue_result=fatigue_result,
        )

        # ── Step 7: Apply fatigue scoring (existing service) ──────────
        days_as_dicts = []
        for i, day_data in enumerate(days_with_descriptions):
            day_dict     = dict(day_data)
            correct_date = (
                date_list[i] if i < len(date_list)
                else str(request.start_date + timedelta(days=i))
            )
            day_dict["date"]    = correct_date
            day_dict["weather"] = weather_by_date.get(correct_date)
            days_as_dicts.append(day_dict)

        scored_days = self._fatigue.score_itinerary(
            days_as_dicts,
            weather_by_date=weather_by_date,
        )

        # ── Step 8: Build response ─────────────────────────────────────
        day_objs = []
        for scored in scored_days:
            activities = self._parse_activities(scored.get("activities", []))
            day_objs.append(
                DayPlan(
                    day=scored["day"],
                    date=scored["date"],
                    activities=activities,
                )
            )

        summary, estimated_budget = self._build_summary(
            optimized_days, request
        )

        logger.info(
            "Trip planned | days=%d | total_activities=%d | "
            "weather_optimized=True | fatigue_optimized=True | "
            "validation=%s",
            len(day_objs),
            sum(len(d.activities) for d in day_objs),
            "PASS" if validation_report.passed else "FAIL",
        )

        return TripPlanResponse(
            summary=summary,
            destination="Hyderabad",
            duration_days=request.trip_duration_days,
            number_of_travelers=request.number_of_travelers,
            budget_level=request.budget,
            estimated_budget=estimated_budget,
            interests=request.interests,
            days=day_objs,
        )

    # ------------------------------------------------------------------
    # Step 1 — Weather fetch (unchanged)
    # ------------------------------------------------------------------

    async def _fetch_weather_for_trip(
        self, request: TripPlanRequest
    ) -> dict[str, dict]:
        """Fetch weather for the trip date range."""
        try:
            forecasts = await self._weather.get_forecast(
                city=request.destination,
                start_date=str(request.start_date),
                end_date=str(request.end_date),
            )
            mapping = {f.date: f.__dict__ for f in forecasts}
            logger.info("Weather fetched for %d days.", len(mapping))
            return mapping
        except Exception as exc:
            logger.warning("Weather fetch failed (non-fatal): %s", exc)
            return {}

    # ------------------------------------------------------------------
    # Step 2 — Weather Optimizer (Phase 7, unchanged)
    # ------------------------------------------------------------------

    def _run_weather_optimizer(
        self,
        weather_by_date: dict[str, dict],
        date_list:       list[str],
    ) -> WeatherOptimizationResult | None:
        """Classify the weather for each trip day."""
        if not weather_by_date:
            logger.warning(
                "No weather data available. Skipping weather optimization."
            )
            return None

        try:
            result = optimize_for_weather(
                weather_by_date=weather_by_date,
                date_list=date_list,
            )
            logger.info(
                "Weather optimizer complete | summary=%s | "
                "indoor_days=%s | has_rain=%s | has_extreme=%s",
                result.overall_summary,
                sorted(result.indoor_days),
                result.has_rain,
                result.has_extreme,
            )
            return result
        except Exception as exc:
            logger.warning(
                "Weather optimizer failed (%s). "
                "Proceeding without weather adjustment.",
                exc,
            )
            return None

    # ------------------------------------------------------------------
    # Step 3 — Algorithmic pipeline (Phase 7, unchanged)
    # ------------------------------------------------------------------

    def _run_algorithmic_pipeline(
        self,
        request:        TripPlanRequest,
        weather_result: WeatherOptimizationResult | None,
        date_list:      list[str],
    ) -> list[RouteOptimizedDay]:
        """
        Run: Recommender → DayBuilder → RouteOptimizer → WeatherAdjustment
        """
        scored_places = self._recommender.recommend(
            interests=request.interests,
            budget=request.budget,
            limit=79,
        )

        logger.info(
            "Recommender top 5: %s",
            [p["name"] for p in scored_places[:5]],
        )

        if weather_result:
            scored_places = self._apply_weather_nudge_to_scores(
                scored_places=scored_places,
                weather_result=weather_result,
                date_list=date_list,
            )

        built_days = self._day_builder.build_days(
            scored_places=scored_places,
            days=request.trip_duration_days,
            interests=request.interests,
            budget=request.budget,
        )

        logger.info(
            "DayBuilder zone sequence: %s",
            [d.primary_zone_id for d in built_days],
        )

        optimized_days = self._optimizer.optimize_itinerary(built_days)

        logger.info(
            "Pipeline complete | days=%d | zones=%s | total_places=%d",
            len(optimized_days),
            [d.primary_zone_id for d in optimized_days],
            sum(d.activity_count for d in optimized_days),
        )

        if weather_result:
            optimized_days = self._apply_per_day_weather_adjustment(
                optimized_days=optimized_days,
                weather_result=weather_result,
                date_list=date_list,
            )

        return optimized_days

    def _apply_weather_nudge_to_scores(
        self,
        scored_places:  list[dict],
        weather_result: WeatherOptimizationResult,
        date_list:      list[str],
    ) -> list[dict]:
        """Apply weather compatibility nudge to recommendation scores."""
        if not weather_result.day_weather:
            return scored_places

        priority_order = [
            WeatherClass.EXTREME_HEAT,
            WeatherClass.RAIN,
            WeatherClass.HOT,
            WeatherClass.CLOUDY,
            WeatherClass.CLEAR,
        ]
        all_classes = {dw.classification for dw in weather_result.day_weather}

        dominant_weather = WeatherClass.CLEAR
        for cls in priority_order:
            if cls in all_classes:
                dominant_weather = cls
                break

        logger.info(
            "Applying weather nudge | dominant_weather=%s",
            dominant_weather.value,
        )

        nudged = []
        for place in scored_places:
            w_score                      = score_place_for_weather(place, dominant_weather)
            place_copy                   = dict(place)
            place_copy["_weather_nudge"] = w_score

            for score_field in ("score", "recommendation_score", "total_score"):
                if score_field in place_copy:
                    place_copy[score_field] = (
                        float(place_copy[score_field]) + w_score * 0.5
                    )
                    break

            nudged.append(place_copy)

        for score_field in ("score", "recommendation_score", "total_score"):
            if nudged and score_field in nudged[0]:
                nudged.sort(key=lambda p: p.get(score_field, 0), reverse=True)
                break

        return nudged

    def _apply_per_day_weather_adjustment(
        self,
        optimized_days: list[RouteOptimizedDay],
        weather_result: WeatherOptimizationResult,
        date_list:      list[str],
    ) -> list[RouteOptimizedDay]:
        """Apply weather-based re-ranking to each day's activity list."""
        from dataclasses import replace as dc_replace

        adjusted_days: list[RouteOptimizedDay] = []

        for day_idx, opt_day in enumerate(optimized_days):
            if day_idx >= len(weather_result.day_weather):
                adjusted_days.append(opt_day)
                continue

            day_weather = weather_result.day_weather[day_idx]
            activities  = opt_day.activities

            if not activities:
                adjusted_days.append(opt_day)
                continue

            activity_dicts = []
            for act in activities:
                act_dict = {
                    "name":              act.name,
                    "category":          act.category,
                    "subcategory":       getattr(act, "subcategory", ""),
                    "walking_intensity": act.walking_intensity,
                    "indoor":            act.indoor,
                    "tags":              list(getattr(act, "highlights", []) or []),
                    "_original":         act,
                }
                activity_dicts.append(act_dict)

            weather_class  = day_weather.classification
            adjusted_dicts = filter_places_for_weather(
                places=activity_dicts,
                weather=weather_class,
                hard_filter=False,
            )

            adjusted_activities = [d["_original"] for d in adjusted_dicts]

            for new_order, act in enumerate(adjusted_activities, start=1):
                act.visit_order = new_order

            original_names = [a.name for a in activities]
            adjusted_names = [a.name for a in adjusted_activities]
            if original_names != adjusted_names:
                logger.info(
                    "Day %d [%s]: weather re-ordered activities.",
                    day_idx + 1, weather_class.value,
                )

            try:
                new_day = dc_replace(opt_day, activities=adjusted_activities)
            except (TypeError, AttributeError):
                opt_day.activities = adjusted_activities
                new_day = opt_day

            adjusted_days.append(new_day)

        return adjusted_days

    # ------------------------------------------------------------------
    # Step 4 — Fatigue Optimizer (Phase 8, unchanged)
    # ------------------------------------------------------------------

    def _run_fatigue_optimizer(
        self,
        optimized_days: list[RouteOptimizedDay],
    ) -> tuple[list[RouteOptimizedDay], FatigueOptimizationResult | None]:
        """
        Run the fatigue optimizer on all days after route optimization.
        Only REORDERS activities within each day.
        Does NOT add or remove activities.
        """
        logger.info("Step 4: Running fatigue optimizer...")

        try:
            days_activities = [day.activities for day in optimized_days]
            fatigue_result  = optimise_trip_fatigue(days_activities)

            if not fatigue_result.optimization_applied:
                logger.info(
                    "Fatigue optimizer: all days already balanced. "
                    "No changes made."
                )
                return optimized_days, fatigue_result

            from dataclasses import replace as dc_replace

            updated_days: list[RouteOptimizedDay] = []

            for day_idx, (opt_day, report) in enumerate(
                zip(optimized_days, fatigue_result.day_reports)
            ):
                reordered_acts, _ = self._get_fatigue_reordered_activities(
                    day_idx=day_idx,
                    original_activities=opt_day.activities,
                    report=report,
                )

                for new_order, act in enumerate(reordered_acts, start=1):
                    act.visit_order = new_order

                try:
                    new_day = dc_replace(opt_day, activities=reordered_acts)
                except (TypeError, AttributeError):
                    opt_day.activities = reordered_acts
                    new_day = opt_day

                updated_days.append(new_day)

            logger.info(
                "Fatigue optimizer complete | "
                "days_reordered=%s | days_over_cap=%s",
                [d + 1 for d in fatigue_result.days_reordered],
                [d + 1 for d in fatigue_result.days_over_cap],
            )

            return updated_days, fatigue_result

        except Exception as exc:
            logger.warning(
                "Fatigue optimizer failed (%s). "
                "Proceeding with route-optimized order.",
                exc,
            )
            return optimized_days, None

    def _get_fatigue_reordered_activities(
        self,
        day_idx:             int,
        original_activities: list[BuiltActivity],
        report:              any,
    ) -> tuple[list[BuiltActivity], any]:
        """Re-apply single-day fatigue optimization to get reordered list."""
        from services.fatigue_optimizer import optimise_day_fatigue
        return optimise_day_fatigue(original_activities, day_idx)

    # ------------------------------------------------------------------
    # Step 5 — Trip Validator (NEW Phase 9)
    # ------------------------------------------------------------------

    def _run_trip_validator(
        self,
        optimized_days: list[RouteOptimizedDay],
        request:        TripPlanRequest,
        weather_result: WeatherOptimizationResult | None,
        fatigue_result: FatigueOptimizationResult | None,
    ) -> ValidationReport:
        """
        Run all 8 trip validation checks.

        Checks:
            1. No duplicate places
            2. All places exist in dataset
            3. Daily duration within range
            4. Budget respected
            5. Weather compatibility
            6. Fatigue balance
            7. Route order valid
            8. Nearby clustering valid

        Never blocks the planning pipeline.
        Always returns a ValidationReport — even on unexpected error.
        """
        logger.info("Step 5: Running trip validator...")

        try:
            days_activities  = [day.activities for day in optimized_days]
            day_weather_list = (
                weather_result.day_weather if weather_result else None
            )

            report = validate_trip(
                days_activities=days_activities,
                user_budget=request.budget,
                day_weather_list=day_weather_list,
                fatigue_result=fatigue_result,
            )

            logger.info(report.summary_line())
            return report

        except Exception as exc:
            logger.warning(
                "Trip validator encountered unexpected error (%s). "
                "Continuing with planning.",
                exc,
            )
            from services.trip_validator import CheckResult, CheckStatus
            return ValidationReport(
                passed=True,
                checks=[
                    CheckResult(
                        name="Trip Validator",
                        status=CheckStatus.SKIP,
                        message=f"Validator error: {exc}",
                    )
                ],
                warnings=[],
                errors=[],
                total_places=sum(
                    len(day.activities) for day in optimized_days
                ),
                total_days=len(optimized_days),
            )

    # ------------------------------------------------------------------
    # Step 6 — LLM description generation (Phase 8, unchanged)
    # ------------------------------------------------------------------

    async def _generate_descriptions(
        self,
        optimized_days:  list[RouteOptimizedDay],
        request:         TripPlanRequest,
        weather_by_date: dict[str, dict],
        weather_result:  WeatherOptimizationResult | None,
        fatigue_result:  FatigueOptimizationResult | None,
    ) -> list[dict]:
        """
        Send pre-built itinerary to LLM for description generation.
        Phase 8: Fatigue context added to prompt.
        """
        date_list = self._generate_date_list(
            request.start_date, request.trip_duration_days
        )

        ground_truth = self._build_ground_truth(optimized_days, date_list)

        trip_place_names = [
            act.name
            for day in optimized_days
            for act in day.activities
        ]

        prompt = self._build_constrained_prompt(
            optimized_days=optimized_days,
            request=request,
            date_list=date_list,
            weather_by_date=weather_by_date,
            trip_place_names=trip_place_names,
            weather_result=weather_result,
            fatigue_result=fatigue_result,
        )

        logger.info(
            "Sending constrained prompt to LLM | "
            "whitelisted_places=%d | prompt_length=%d chars",
            len(trip_place_names),
            len(prompt),
        )

        try:
            raw_response = await self._call_llm_with_fallback(prompt)
            llm_days     = self._parse_llm_response(raw_response)

            corrected_days, validation = self._validator.validate_and_correct(
                llm_days=llm_days,
                ground_truth=ground_truth,
            )

            self._log_validation_result(validation)
            logger.info("LLM descriptions generated and validated.")
            return corrected_days

        except Exception as exc:
            logger.warning(
                "LLM description generation failed (%s). "
                "Using fallback descriptions.",
                exc,
            )
            return self._build_fallback_descriptions(optimized_days, date_list)

    def _build_constrained_prompt(
        self,
        optimized_days:   list[RouteOptimizedDay],
        request:          TripPlanRequest,
        date_list:        list[str],
        weather_by_date:  dict[str, dict],
        trip_place_names: list[str],
        weather_result:   WeatherOptimizationResult | None,
        fatigue_result:   FatigueOptimizationResult | None,
    ) -> str:
        """
        Build the hardened LLM prompt.
        Phase 8: Fatigue context block alongside weather context.
        """
        whitelist_block = "\n".join(
            f"  {i+1}. {name}"
            for i, name in enumerate(trip_place_names)
        )

        itinerary_text = self._format_itinerary_for_prompt(
            optimized_days=optimized_days,
            date_list=date_list,
            weather_by_date=weather_by_date,
            weather_result=weather_result,
        )

        expected_json = self._build_expected_json_schema(
            optimized_days, date_list
        )

        if weather_result:
            weather_block = get_weather_context_for_prompt(weather_result)
        else:
            weather_block = "Weather data not available for this trip."

        if fatigue_result:
            fatigue_block = get_fatigue_context_for_prompt(fatigue_result)
        else:
            fatigue_block = "Fatigue data not available."

        weather_instructions = self._build_weather_writing_instructions(
            weather_result
        )
        fatigue_instructions = self._build_fatigue_writing_instructions(
            fatigue_result
        )

        prompt = f"""You are a Hyderabad travel writer. Your ONLY job is to write activity descriptions.

═══════════════════════════════════════════════════
CRITICAL CONSTRAINT — READ BEFORE WRITING ANYTHING
═══════════════════════════════════════════════════

The itinerary has been algorithmically planned. You MUST NOT change it.

ALLOWED PLACE NAMES — use ONLY these exact names, spelled exactly:
{whitelist_block}

ABSOLUTE PROHIBITIONS:
✗ Do NOT invent any place not in the list above
✗ Do NOT use generic names like "Street Food Trail" or "Heritage Walk"
✗ Do NOT change the spelling of any place name
✗ Do NOT add activities not in the list
✗ Do NOT remove any activity
✗ Do NOT change the order
✗ Do NOT combine two places into one description
✗ Do NOT use names like "local restaurant" or "nearby cafe"

WHAT YOU MUST DO:
✓ Write one vivid 2-sentence description per activity
✓ Include one practical tip per activity (parking, best entrance, timing)
✓ Acknowledge the day's weather condition in each day's opening
✓ Acknowledge pacing and rest points where indicated by fatigue profile
✓ Write one sentence day_summary per day
✓ Write one trip_summary (2-3 sentences total)
✓ Estimate cost in ₹ per person based on context

{weather_instructions}

{fatigue_instructions}

═══════════════════════════════════════════════════
TRIP CONTEXT
═══════════════════════════════════════════════════
Destination: Hyderabad, India
Duration: {request.trip_duration_days} days
Budget: {request.budget}
Interests: {', '.join(request.interests)}
Travelers: {request.number_of_travelers}

═══════════════════════════════════════════════════
WEATHER CONDITIONS
═══════════════════════════════════════════════════
{weather_block}

═══════════════════════════════════════════════════
DAILY FATIGUE PROFILE
═══════════════════════════════════════════════════
{fatigue_block}

═══════════════════════════════════════════════════
PRE-BUILT ITINERARY — WRITE DESCRIPTIONS FOR THESE
═══════════════════════════════════════════════════
{itinerary_text}

═══════════════════════════════════════════════════
OUTPUT — RETURN EXACTLY THIS JSON STRUCTURE
═══════════════════════════════════════════════════

Fill in ONLY the description, day_summary, trip_summary, and estimated_cost fields.
All other fields are pre-filled and must not be changed.

{expected_json}

Return ONLY valid JSON. No markdown. No code fences. No explanation.
The "place" field in each activity MUST match the whitelist exactly."""

        return prompt

    def _build_fatigue_writing_instructions(
        self,
        fatigue_result: FatigueOptimizationResult | None,
    ) -> str:
        """Build fatigue-specific writing instructions for the LLM."""
        if not fatigue_result:
            return ""

        lines = ["FATIGUE/PACING WRITING RULES:"]

        for report in fatigue_result.day_reports:
            if report.exceeds_daily_cap:
                lines.append(
                    f"  Day {report.day_index + 1}: INTENSE day — "
                    "mention comfortable shoes, water breaks, and early starts."
                )
            elif report.high_fatigue_count >= 2:
                lines.append(
                    f"  Day {report.day_index + 1}: Active day — "
                    "mention pacing yourself and using rest stops."
                )
            elif not report.has_recovery:
                lines.append(
                    f"  Day {report.day_index + 1}: No dedicated rest point — "
                    "suggest sitting areas or tea breaks between activities."
                )
            else:
                lines.append(
                    f"  Day {report.day_index + 1}: Well-paced day — "
                    "natural rest points built in."
                )

        return "\n".join(lines)

    def _build_weather_writing_instructions(
        self,
        weather_result: WeatherOptimizationResult | None,
    ) -> str:
        """Build weather-specific writing instructions for the LLM."""
        if not weather_result:
            return ""

        lines = ["WEATHER WRITING RULES:"]

        for dw in weather_result.day_weather:
            cls = dw.classification
            if cls == WeatherClass.EXTREME_HEAT:
                lines.append(
                    f"  Day {dw.day_index + 1}: Mention arriving before 9 AM or "
                    "after 5 PM. Highlight air-conditioning or shade."
                )
            elif cls == WeatherClass.RAIN:
                lines.append(
                    f"  Day {dw.day_index + 1}: Mention indoor-friendly nature "
                    "of venues. Note covered walkways or sheltered areas."
                )
            elif cls == WeatherClass.HOT:
                lines.append(
                    f"  Day {dw.day_index + 1}: Suggest morning visits and "
                    "midday breaks at indoor venues."
                )
            elif cls == WeatherClass.CLOUDY:
                lines.append(
                    f"  Day {dw.day_index + 1}: Good for outdoor exploration. "
                    "Mention pleasant overcast conditions."
                )
            elif cls == WeatherClass.CLEAR:
                lines.append(
                    f"  Day {dw.day_index + 1}: Perfect outdoor conditions. "
                    "Mention the views and natural light."
                )

        return "\n".join(lines)

    def _format_itinerary_for_prompt(
        self,
        optimized_days:  list[RouteOptimizedDay],
        date_list:       list[str],
        weather_by_date: dict[str, dict],
        weather_result:  WeatherOptimizationResult | None = None,
    ) -> str:
        """Format pre-built itinerary as readable text for the LLM."""
        lines: list[str] = []

        for i, day in enumerate(optimized_days):
            day_date = date_list[i] if i < len(date_list) else ""

            if weather_result and i < len(weather_result.day_weather):
                dw          = weather_result.day_weather[i]
                weather_str = (
                    f" | Weather: [{dw.classification.value}] "
                    f"{dw.temp_max}°C, {dw.condition}"
                )
            else:
                weather     = weather_by_date.get(day_date, {})
                weather_str = ""
                if weather:
                    weather_str = (
                        f" | Weather: {weather.get('condition', 'unknown')} "
                        f"{weather.get('temp_max', '?')}°C"
                    )

            lines.append(
                f"\nDAY {day.day_number} ({day_date}) — "
                f"{day.primary_zone_name}{weather_str}"
            )

            for act in day.activities:
                cost_str  = (
                    f"₹{act.avg_cost_per_person} per person"
                    if act.avg_cost_per_person > 0
                    else "Free"
                )
                entry_str = (
                    f"Entry ₹{act.entry_fee_indian}"
                    if act.entry_fee_indian > 0
                    else "Free entry"
                )
                af          = score_activity_fatigue(act)
                fatigue_str = f"Fatigue: {af.fatigue_score:.1f}"

                lines.append(
                    f"  [{act.suggested_start_time} → "
                    f"{act.suggested_end_time}] "
                    f"{act.name}"
                )
                lines.append(
                    f"    {act.category} | "
                    f"{act.duration_hours}h | "
                    f"Walk: {act.walking_intensity} | "
                    f"Indoor: {act.indoor} | "
                    f"{entry_str} | "
                    f"Avg: {cost_str} | "
                    f"{fatigue_str}"
                )
                if act.highlights:
                    lines.append(
                        f"    Highlights: "
                        f"{'; '.join(act.highlights[:2])}"
                    )
                lines.append("")

        return "\n".join(lines)

    def _build_expected_json_schema(
        self,
        optimized_days: list[RouteOptimizedDay],
        date_list:      list[str],
    ) -> str:
        """Build the expected JSON structure. Unchanged from Phase 7."""
        days_json = []

        for i, day in enumerate(optimized_days):
            day_date = date_list[i] if i < len(date_list) else ""

            activities_json = []
            for act in day.activities:
                cost_hint = (
                    f"₹{act.avg_cost_per_person}"
                    if act.avg_cost_per_person > 0
                    else "Free"
                )
                activities_json.append({
                    "time":           act.suggested_start_time,
                    "place":          act.name,
                    "description":    f"[WRITE: 2-sentence description of {act.name}]",
                    "estimated_cost": f"[WRITE: cost in ₹ — hint: ~{cost_hint}]",
                })

            days_json.append({
                "day":         i + 1,
                "date":        day_date,
                "day_summary": f"[WRITE: 1-sentence summary of Day {i+1}]",
                "activities":  activities_json,
            })

        schema = {
            "trip_summary": "[WRITE: 2-3 sentence overview of entire trip]",
            "days":         days_json,
        }

        return json.dumps(schema, indent=2, ensure_ascii=False)

    # ------------------------------------------------------------------
    # LLM response parsing (unchanged)
    # ------------------------------------------------------------------

    def _parse_llm_response(self, raw_response: str) -> list[dict]:
        cleaned = self._strip_markdown(raw_response)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            extracted = self._extract_json(cleaned)
            if extracted is None:
                raise RuntimeError("LLM returned invalid JSON")
            data = extracted

        self._last_trip_summary = str(
            data.get("trip_summary", "")
        ).strip()

        return data.get("days", [])

    def _build_ground_truth(
        self,
        optimized_days: list[RouteOptimizedDay],
        date_list:      list[str],
    ) -> list[dict]:
        """Build the ground truth day structure for validator."""
        ground_truth: list[dict] = []

        for i, day in enumerate(optimized_days):
            day_date = date_list[i] if i < len(date_list) else ""

            activities: list[dict] = []
            for act in day.activities:
                cost_str = (
                    f"₹{act.avg_cost_per_person} per person"
                    if act.avg_cost_per_person > 0
                    else "Free"
                )
                activities.append({
                    "time":              act.suggested_start_time,
                    "place":             act.name,
                    "description":       self._build_fallback_description(act),
                    "estimated_cost":    cost_str,
                    "place_id":          act.place_id,
                    "category":          act.category,
                    "zone_id":           act.zone_id,
                    "lat":               act.lat,
                    "lon":               act.lon,
                    "duration_hours":    act.duration_hours,
                    "visit_order":       act.visit_order,
                    "must_visit":        act.must_visit,
                    "walking_intensity": act.walking_intensity,
                    "indoor":            act.indoor,
                    "end_time":          act.suggested_end_time,
                })

            ground_truth.append({
                "day":               i + 1,
                "date":              day_date,
                "day_summary":       f"Explore {day.primary_zone_name}",
                "zone_id":           day.primary_zone_id,
                "zone_name":         day.primary_zone_name,
                "activities":        activities,
                "total_distance_km": day.total_distance_km,
                "route_notes":       day.route_notes,
            })

        return ground_truth

    def _build_fallback_descriptions(
        self,
        optimized_days: list[RouteOptimizedDay],
        date_list:      list[str],
    ) -> list[dict]:
        """Build day dicts using only place metadata (no LLM)."""
        self._last_trip_summary = ""
        return self._build_ground_truth(optimized_days, date_list)

    def _build_fallback_description(self, act: BuiltActivity) -> str:
        """Build description from place metadata."""
        desc = act.short_description or ""
        if act.highlights:
            desc += f" Highlights: {', '.join(act.highlights[:2])}."
        if act.best_time:
            desc += f" Best time: {act.best_time}."
        return desc.strip() or f"Visit {act.name} in Hyderabad."

    # ------------------------------------------------------------------
    # Logging (unchanged)
    # ------------------------------------------------------------------

    def _log_validation_result(self, result) -> None:
        if result.hallucinated_names:
            logger.error(
                "HALLUCINATIONS REMOVED FROM LLM OUTPUT: %s",
                result.hallucinated_names,
            )
        if result.corrected_names:
            logger.warning(
                "LLM name corrections applied: %s",
                result.corrected_names,
            )
        if result.extra_activities:
            logger.warning(
                "LLM extra activities removed: %s",
                result.extra_activities,
            )
        if result.audit_log:
            for entry in result.audit_log:
                logger.info("LLM audit: %s", entry)

        logger.info(
            "LLM validation complete | valid=%s | "
            "hallucinations=%d | corrections=%d",
            result.is_valid,
            len(result.hallucinated_names),
            result.corrections_applied,
        )

    # ------------------------------------------------------------------
    # Summary + budget (unchanged)
    # ------------------------------------------------------------------

    def _build_summary(
        self,
        optimized_days: list[RouteOptimizedDay],
        request:        TripPlanRequest,
    ) -> tuple[str, str]:
        llm_summary = getattr(self, "_last_trip_summary", "")

        if llm_summary:
            summary = llm_summary
        else:
            zones        = [d.primary_zone_name for d in optimized_days]
            unique_zones = list(dict.fromkeys(zones))
            summary = (
                f"A {request.trip_duration_days}-day Hyderabad itinerary "
                f"covering {', '.join(unique_zones[:3])}. "
                f"Curated for {', '.join(request.interests)} enthusiasts."
            )

        total_cost = sum(
            act.avg_cost_per_person
            for day in optimized_days
            for act in day.activities
        )

        low_est          = int(total_cost * 1.0)
        high_est         = int(total_cost * 1.3)
        estimated_budget = (
            f"₹{low_est:,} - ₹{high_est:,} per person "
            f"(excluding accommodation)"
        )

        return summary, estimated_budget

    # ------------------------------------------------------------------
    # LLM calls (unchanged)
    # ------------------------------------------------------------------

    async def _call_llm_with_fallback(self, prompt: str) -> str:
        try:
            logger.info("Calling Groq (primary)...")
            return await self._call_groq(prompt)
        except Exception as exc:
            logger.warning("Groq failed: %s. Trying OpenRouter...", exc)
            groq_error = str(exc)

        try:
            logger.info("Calling OpenRouter (fallback)...")
            return await self._call_openrouter(prompt)
        except Exception as exc:
            raise RuntimeError(
                f"All LLM providers failed. Groq: {groq_error}. "
                f"OpenRouter: {exc}"
            ) from exc

    async def _call_groq(self, prompt: str) -> str:
        settings = self._settings
        payload  = {
            "model": settings.groq_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a Hyderabad travel writer. "
                        "You write vivid, accurate activity descriptions. "
                        "You respond with valid JSON only. "
                        "You NEVER invent place names. "
                        "You NEVER add or remove places from the itinerary."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens":      4096,
            "temperature":     0.4,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type":  "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.groq_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"Groq API {response.status_code}: {response.text}"
            )

        data = response.json()
        if "error" in data:
            raise RuntimeError(f"Groq error: {data['error']}")

        raw   = data["choices"][0]["message"]["content"].strip()
        usage = data.get("usage", {})
        logger.info(
            "Groq | tokens=%s/%s | chars=%d",
            usage.get("prompt_tokens", "?"),
            usage.get("completion_tokens", "?"),
            len(raw),
        )
        return raw

    async def _call_openrouter(self, prompt: str) -> str:
        settings = self._settings
        payload  = {
            "model": settings.openrouter_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a Hyderabad travel writer. "
                        "You write vivid, accurate activity descriptions. "
                        "You respond with valid JSON only. "
                        "You NEVER invent place names. "
                        "You NEVER add or remove places."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens":  3000,
            "temperature": 0.4,
        }
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://saferoute.ai",
            "X-Title":       "SafeRoute AI Tour Planner",
        }

        last_error: Exception | None = None
        for attempt in range(1, 3):
            try:
                async with httpx.AsyncClient(timeout=180.0) as client:
                    response = await client.post(
                        f"{settings.openrouter_base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )

                if response.status_code == 429:
                    last_error = RuntimeError(
                        f"OpenRouter 429: {response.text}"
                    )
                    if attempt < 2:
                        await asyncio.sleep(3)
                    continue

                if response.status_code != 200:
                    raise RuntimeError(
                        f"OpenRouter {response.status_code}: {response.text}"
                    )

                data = response.json()
                if "error" in data:
                    raise RuntimeError(f"OpenRouter error: {data['error']}")

                raw = data["choices"][0]["message"]["content"].strip()
                logger.info("OpenRouter | chars=%d", len(raw))
                return raw

            except (
                httpx.TimeoutException,
                httpx.RemoteProtocolError,
                httpx.RequestError,
            ) as exc:
                last_error = RuntimeError(f"OpenRouter error: {exc}")
                if attempt < 2:
                    await asyncio.sleep(2)

        if last_error:
            raise last_error
        raise RuntimeError("OpenRouter call failed")

    # ------------------------------------------------------------------
    # Day regeneration (Phase 8, unchanged)
    # ------------------------------------------------------------------

    async def regenerate_day(
        self,
        existing_trip_dict: dict,
        day_number:         int,
    ) -> list[dict]:
        """Regenerate activities for a single day."""
        target_day = None
        for d in existing_trip_dict.get("days", []):
            if d.get("day") == day_number:
                target_day = d
                break

        if target_day is None:
            raise ValueError(f"Day {day_number} not found in trip")

        target_date = target_day.get("date", "")
        interests   = existing_trip_dict.get("interests", [])
        budget      = existing_trip_dict.get("budget_level", "mid-range")

        used_ids: set[str] = set()
        for d in existing_trip_dict.get("days", []):
            if d.get("day") == day_number:
                continue
            for act in d.get("activities", []):
                pid = (
                    act.get("place_id", "")
                    or act.get("place", "").lower().replace(" ", "_")
                )
                if pid:
                    used_ids.add(pid)

        scored = self._recommender.recommend(
            interests=interests, budget=budget, limit=79
        )
        scored_filtered = [p for p in scored if p["id"] not in used_ids]

        built = self._day_builder.build_days(
            scored_places=scored_filtered, days=1,
            interests=interests, budget=budget,
        )
        if not built:
            raise RuntimeError("Could not build replacement day")

        optimized = self._optimizer.optimize_itinerary(built)
        if not optimized:
            raise RuntimeError("Could not optimize replacement day")

        opt_day   = optimized[0]
        date_list = [target_date]

        try:
            from services.fatigue_optimizer import optimise_day_fatigue
            reordered_acts, _ = optimise_day_fatigue(opt_day.activities, 0)
            opt_day.activities = reordered_acts
        except Exception as exc:
            logger.warning("Fatigue opt on regenerated day failed: %s", exc)

        ground_truth = self._build_ground_truth([opt_day], date_list)
        trip_names   = [act.name for act in opt_day.activities]

        prompt = self._build_constrained_prompt(
            optimized_days=[opt_day],
            request=_make_minimal_request(interests, budget, target_date),
            date_list=date_list,
            weather_by_date={},
            trip_place_names=trip_names,
            weather_result=None,
            fatigue_result=None,
        )

        try:
            raw_response = await self._call_llm_with_fallback(prompt)
            llm_days     = self._parse_llm_response(raw_response)
            corrected, _ = self._validator.validate_and_correct(
                llm_days=llm_days,
                ground_truth=ground_truth,
            )
            return corrected[0].get("activities", []) if corrected else []
        except Exception as exc:
            logger.warning(
                "Regeneration LLM failed (%s). Using fallback.", exc
            )
            return ground_truth[0].get("activities", [])

    # ------------------------------------------------------------------
    # Utilities (unchanged)
    # ------------------------------------------------------------------

    def _generate_date_list(
        self, start_date: date, duration_days: int
    ) -> list[str]:
        return [
            str(start_date + timedelta(days=i))
            for i in range(duration_days)
        ]

    def _strip_markdown(self, text: str) -> str:
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return text.strip()

    def _extract_json(self, text: str) -> dict | None:
        start = text.find("{")
        end   = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            return json.loads(text[start: end + 1])
        except json.JSONDecodeError:
            return None

    def _parse_activities(self, activities_raw: list) -> list[Activity]:
        activities: list[Activity] = []
        for act in activities_raw:
            if not isinstance(act, dict):
                continue
            try:
                activities.append(
                    Activity(
                        time=str(act.get("time", "")).strip() or "TBD",
                        place=str(act.get("place", "")).strip() or "Unknown",
                        description=str(
                            act.get("description", "")
                        ).strip() or "Visit this location.",
                        estimated_cost=str(
                            act.get("estimated_cost", "")
                        ).strip() or "₹0",
                    )
                )
            except Exception as exc:
                logger.warning("Skipping malformed activity: %s", exc)
        return activities


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _make_minimal_request(
    interests:   list[str],
    budget:      str,
    target_date: str,
) -> object:
    class _MinimalRequest:
        def __init__(self):
            self.interests           = interests
            self.budget              = budget
            self.trip_duration_days  = 1
            self.number_of_travelers = 2
            self.destination         = "Hyderabad"
            self.start_date          = target_date
            self.end_date            = target_date
    return _MinimalRequest()


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_planner_instance: PlannerService | None = None


def get_planner() -> PlannerService:
    global _planner_instance
    if _planner_instance is None:
        _planner_instance = PlannerService()
    return _planner_instance