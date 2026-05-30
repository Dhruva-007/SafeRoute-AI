from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, timedelta

import httpx

from config.settings import get_settings
from models.trip import (
    Activity,
    DayPlan,
    TripPlanRequest,
    TripPlanResponse,
)
from services.fatigue import get_fatigue_service
from services.retriever import RetrievedDocument, get_retriever

logger = logging.getLogger(__name__)


class PlannerService:
    """
    RAG-powered trip planner.

    Provider strategy:
      1. Try Groq (primary)   — fast, free, reliable
      2. Try OpenRouter        — fallback if Groq fails
      3. Raise RuntimeError    — if both fail
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._retriever = get_retriever()
        self._fatigue = get_fatigue_service()
        logger.info("PlannerService initialised")
        logger.info("Primary provider : Groq (%s)", self._settings.groq_model)
        logger.info(
            "Fallback provider: OpenRouter (%s)",
            self._settings.openrouter_model,
        )

    async def plan_trip(self, request: TripPlanRequest) -> TripPlanResponse:
        """
        Generate a complete day-by-day itinerary for the given trip request.
        """
        logger.info(
            "Planning trip | destination=%s | days=%d | travelers=%d | "
            "budget=%s | interests=%s",
            request.destination,
            request.trip_duration_days,
            request.number_of_travelers,
            request.budget,
            request.interests,
        )

        # Step 1: Retrieve relevant documents
        documents = self._retrieve_context(request)

        # Step 2: Build the prompt
        prompt = self._build_prompt(request, documents)
        logger.debug("Prompt length: %d characters", len(prompt))

        # Step 3: Call LLM with provider fallback
        raw_response = await self._call_llm_with_fallback(prompt)

        # Step 4: Parse response into structured output
        itinerary = self._parse_response(raw_response, request)

        logger.info(
            "Trip planned successfully | days=%d | activities_total=%d",
            len(itinerary.days),
            sum(len(d.activities) for d in itinerary.days),
        )

        return itinerary

    # ------------------------------------------------------------------
    # Step 1 — Retrieval
    # ------------------------------------------------------------------

    def _retrieve_context(
        self, request: TripPlanRequest
    ) -> list[RetrievedDocument]:
        try:
            documents = self._retriever.retrieve_multi_query(
                interests=request.interests,
                budget=request.budget,
                n_per_query=3,
            )
        except Exception as exc:
            logger.exception("Retrieval failed: %s", exc)
            raise RuntimeError(
                f"Failed to retrieve tourism context: {str(exc)}"
            ) from exc

        logger.info(
            "Retrieved %d unique documents for context", len(documents)
        )
        return documents

    # ------------------------------------------------------------------
    # Step 2 — Prompt Construction
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        request: TripPlanRequest,
        documents: list[RetrievedDocument],
    ) -> str:
        context_block = self._format_context_block(documents)
        date_list = self._generate_date_list(
            request.start_date, request.trip_duration_days
        )

        prompt = f"""You are an expert Hyderabad travel planner.
Create a detailed day-by-day itinerary using ONLY the places listed in the CONTEXT section below.
Do NOT invent places not in the context. Do NOT include places outside Hyderabad.

=== HYDERABAD TOURISM CONTEXT ===
{context_block}

=== TRIP PARAMETERS ===
Destination: Hyderabad, India
Start Date: {request.start_date}
End Date: {request.end_date}
Duration: {request.trip_duration_days} day(s)
Travelers: {request.number_of_travelers}
Budget: {request.budget}
Interests: {', '.join(request.interests)}
Dates: {', '.join(date_list)}

=== RULES ===
1. Plan exactly {request.trip_duration_days} day(s) with the dates listed above.
2. Each day must have 3-5 activities maximum.
3. Group nearby attractions on the same day to minimise travel.
4. Old City group (do together): Charminar, Mecca Masjid, Laad Bazaar, Chowmahalla Palace, Nimrah Cafe.
5. Hitech City group (do together): Shilparamam, Durgam Cheruvu, IKEA, Inorbit Mall.
6. Schedule meals at proper times (breakfast 8am, lunch 1pm, dinner 7pm).
7. Respect the budget level. For 'budget' avoid premium venues.
8. Activities start no earlier than 8 AM, end no later than 10 PM.
9. Do not repeat any place across days.
10. Use Indian Rupees (₹) for all costs.

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No markdown. No code fences. No explanation.

{{
  "summary": "2-3 sentence trip overview",
  "estimated_budget": "₹X,XXX - ₹X,XXX per person",
  "days": [
    {{
      "day": 1,
      "date": "{request.start_date}",
      "activities": [
        {{
          "time": "9:00 AM",
          "place": "Place name from context",
          "description": "What to do here",
          "estimated_cost": "₹XXX per person"
        }}
      ]
    }}
  ]
}}

Return ONLY the JSON object."""

        return prompt

    def _format_context_block(
        self, documents: list[RetrievedDocument]
    ) -> str:
        lines: list[str] = []
        for i, doc in enumerate(documents, start=1):
            lines.append(f"[{i}] {doc.name}")
            lines.append(f"    Category: {doc.category} | Budget: {doc.budget_level} | Duration: {doc.recommended_duration_hours}h")
            lines.append(f"    Best time: {doc.best_time}")
            lines.append(f"    Tags: {', '.join(doc.tags)}")
            lines.append(f"    Details: {doc.description[:300]}")
            lines.append("")
        return "\n".join(lines)

    def _generate_date_list(
        self, start_date: date, duration_days: int
    ) -> list[str]:
        return [
            str(start_date + timedelta(days=i))
            for i in range(duration_days)
        ]

    # ------------------------------------------------------------------
    # Step 3 — LLM Call with Provider Fallback
    # ------------------------------------------------------------------

    async def _call_llm_with_fallback(self, prompt: str) -> str:
        """
        Try Groq first. If it fails, try OpenRouter. If both fail, raise.
        """
        # ---- Try Groq (primary) ----
        try:
            logger.info("Attempting LLM call via Groq (primary)...")
            return await self._call_groq(prompt)
        except Exception as exc:
            logger.warning(
                "Groq failed: %s. Falling back to OpenRouter...", exc
            )
            groq_error = str(exc)

        # ---- Try OpenRouter (fallback) ----
        try:
            logger.info("Attempting LLM call via OpenRouter (fallback)...")
            return await self._call_openrouter(prompt)
        except Exception as exc:
            logger.error(
                "Both providers failed | groq=%s | openrouter=%s",
                groq_error,
                exc,
            )
            raise RuntimeError(
                f"All LLM providers failed. "
                f"Groq error: {groq_error}. "
                f"OpenRouter error: {str(exc)}"
            ) from exc

    async def _call_groq(self, prompt: str) -> str:
        """
        Send the prompt to Groq.
        Groq is OpenAI-compatible so the payload shape is the same.
        """
        settings = self._settings

        payload = {
            "model": settings.groq_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a Hyderabad travel planning expert. "
                        "You respond with valid JSON only. "
                        "Never include markdown formatting or explanations."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 4000,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }

        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        logger.info(
            "Calling Groq | model=%s | max_tokens=4000",
            settings.groq_model,
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.groq_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )

        if response.status_code != 200:
            logger.error(
                "Groq error | status=%d | body=%s",
                response.status_code,
                response.text,
            )
            raise RuntimeError(
                f"Groq API returned {response.status_code}: {response.text}"
            )

        data = response.json()

        if "error" in data:
            raise RuntimeError(f"Groq API error: {data['error']}")

        raw_content = data["choices"][0]["message"]["content"].strip()
        usage = data.get("usage", {})
        logger.info(
            "Groq response received | prompt_tokens=%s | completion_tokens=%s "
            "| response_length=%d chars",
            usage.get("prompt_tokens", "?"),
            usage.get("completion_tokens", "?"),
            len(raw_content),
        )

        return raw_content

    async def _call_openrouter(self, prompt: str) -> str:
        """
        Fallback LLM call to OpenRouter.
        Includes retry logic for transient rate limit errors.
        """
        settings = self._settings

        payload = {
            "model": settings.openrouter_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a Hyderabad travel planning expert. "
                        "You respond with valid JSON only. "
                        "Never include markdown formatting or explanations."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 3000,
            "temperature": 0.3,
        }

        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://saferoute.ai",
            "X-Title": "SafeRoute AI Tour Planner",
        }

        last_error: Exception | None = None

        for attempt in range(1, 3):  # 2 attempts on fallback
            try:
                logger.info(
                    "Calling OpenRouter | model=%s | attempt=%d",
                    settings.openrouter_model,
                    attempt,
                )
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
                    raise last_error

                if response.status_code != 200:
                    raise RuntimeError(
                        f"OpenRouter returned {response.status_code}: "
                        f"{response.text}"
                    )

                data = response.json()

                if "error" in data:
                    raise RuntimeError(
                        f"OpenRouter API error: {data['error']}"
                    )

                raw_content = data["choices"][0]["message"]["content"].strip()
                usage = data.get("usage", {})
                logger.info(
                    "OpenRouter response received | prompt_tokens=%s | "
                    "completion_tokens=%s | response_length=%d chars",
                    usage.get("prompt_tokens", "?"),
                    usage.get("completion_tokens", "?"),
                    len(raw_content),
                )

                return raw_content

            except (httpx.TimeoutException, httpx.RemoteProtocolError,
                    httpx.RequestError) as exc:
                last_error = RuntimeError(f"OpenRouter network error: {exc}")
                if attempt < 2:
                    await asyncio.sleep(2)
                    continue

        if last_error:
            raise last_error
        raise RuntimeError("OpenRouter call failed after retries")

    # ------------------------------------------------------------------
    # Step 4 — Response Parsing
    # ------------------------------------------------------------------

    def _parse_response(
        self,
        raw_response: str,
        request: TripPlanRequest,
    ) -> TripPlanResponse:
        cleaned = self._strip_markdown(raw_response)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            extracted = self._extract_json(cleaned)
            if extracted is None:
                logger.error(
                    "Failed to parse LLM response as JSON. Raw response:\n%s",
                    raw_response[:500],
                )
                raise RuntimeError(
                    f"LLM returned invalid JSON: {str(exc)}"
                ) from exc
            data = extracted

        required_keys = {"summary", "estimated_budget", "days"}
        missing = required_keys - set(data.keys())
        if missing:
            raise RuntimeError(
                f"LLM response missing required fields: {missing}"
            )

        if not isinstance(data["days"], list) or len(data["days"]) == 0:
            raise RuntimeError(
                "LLM response 'days' field is empty or not a list"
            )

        date_list = self._generate_date_list(
            request.start_date, request.trip_duration_days
        )

        days: list[DayPlan] = []
        for i, day_data in enumerate(data["days"]):
            if not isinstance(day_data, dict):
                continue

            activities = self._parse_activities(
                day_data.get("activities", [])
            )

            correct_date = date_list[i] if i < len(date_list) else str(
                request.start_date + timedelta(days=i)
            )

            days.append(
                DayPlan(
                    day=i + 1,
                    date=correct_date,
                    activities=activities,
                )
            )

        if not days:
            raise RuntimeError(
                "No valid days could be parsed from LLM response"
            )

        # Apply fatigue scoring to every activity
        days_as_dicts = [d.model_dump() for d in days]
        scored_days = self._fatigue.score_itinerary(days_as_dicts)

        scored_day_objs = [DayPlan(**d) for d in scored_days]

        return TripPlanResponse(
            summary=str(data.get("summary", "")).strip(),
            destination="Hyderabad",
            duration_days=request.trip_duration_days,
            number_of_travelers=request.number_of_travelers,
            budget_level=request.budget,
            estimated_budget=str(data.get("estimated_budget", "")).strip(),
            interests=request.interests,
            days=scored_day_objs,
        )

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
                logger.warning("Skipping malformed activity %s: %s", act, exc)
        return activities

    def _strip_markdown(self, text: str) -> str:
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return text.strip()

    def _extract_json(self, text: str) -> dict | None:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_planner_instance: PlannerService | None = None


def get_planner() -> PlannerService:
    global _planner_instance
    if _planner_instance is None:
        _planner_instance = PlannerService()
    return _planner_instance