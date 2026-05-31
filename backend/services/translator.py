"""
Translator Service

Uses Groq (primary) and OpenRouter (fallback) to perform real-time
text translation with structured JSON output. Includes an in-memory
cache to avoid duplicate API calls for identical requests.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass

import httpx

from config.settings import get_settings
from models.translation import (
    LATIN_SCRIPT_LANGUAGES,
    SUPPORTED_LANGUAGES,
    TranslateResponse,
)

logger = logging.getLogger(__name__)


# In-memory cache: { cache_key: (timestamp, payload) }
_CACHE: dict[str, tuple[float, TranslateResponse]] = {}
CACHE_TTL_SECONDS = 60 * 60 * 24  # 24h — translations rarely change
CACHE_MAX_ENTRIES = 1000


@dataclass
class TranslationResult:
    translation: str
    romanization: str
    confidence: str
    provider: str


class TranslatorService:
    """
    LLM-powered translation with Groq primary + OpenRouter fallback.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        logger.info("TranslatorService initialised")
        logger.info("  Primary  : Groq (%s)", self._settings.groq_model)
        logger.info("  Fallback : OpenRouter (%s)", self._settings.openrouter_model)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def translate(
        self,
        text: str,
        from_lang: str,
        to_lang: str,
    ) -> TranslateResponse:
        """
        Translate text from one language to another.

        Args:
            text:      The text to translate (1-1000 chars).
            from_lang: ISO 639-1 source code or 'auto'.
            to_lang:   ISO 639-1 target code.

        Returns:
            TranslateResponse with translation, romanization, confidence.
        """
        text_clean = text.strip()

        # Same-language no-op
        if from_lang != "auto" and from_lang == to_lang:
            return TranslateResponse(
                translation=text_clean,
                romanization="",
                from_lang=from_lang,
                to_lang=to_lang,
                confidence="high",
                cached=False,
                provider="noop",
            )

        # Check cache
        cache_key = self._cache_key(text_clean, from_lang, to_lang)
        cached = self._get_from_cache(cache_key)
        if cached is not None:
            logger.info(
                "Translation cache hit | %s→%s | text=%r",
                from_lang, to_lang, text_clean[:30],
            )
            cached.cached = True
            return cached

        # Build prompt
        prompt = self._build_prompt(text_clean, from_lang, to_lang)
        logger.info(
            "Translating | %s→%s | %d chars",
            from_lang, to_lang, len(text_clean),
        )

        # Call LLM with provider fallback
        try:
            result = await self._call_groq(prompt)
        except Exception as exc:
            logger.warning("Groq translation failed: %s. Falling back to OpenRouter.", exc)
            try:
                result = await self._call_openrouter(prompt)
            except Exception as exc2:
                logger.error("Both providers failed | groq=%s | openrouter=%s", exc, exc2)
                raise RuntimeError(
                    f"Translation failed on both providers. "
                    f"Groq: {exc}. OpenRouter: {exc2}"
                ) from exc2

        # Strip romanization for Latin-script targets (not useful)
        romanization = result.romanization if to_lang not in LATIN_SCRIPT_LANGUAGES else ""

        response = TranslateResponse(
            translation=result.translation,
            romanization=romanization,
            from_lang=from_lang,
            to_lang=to_lang,
            confidence=result.confidence,
            cached=False,
            provider=result.provider,
        )

        # Cache result
        self._save_to_cache(cache_key, response)
        return response

    def get_supported_languages(self) -> dict[str, str]:
        return dict(SUPPORTED_LANGUAGES)

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_prompt(self, text: str, from_lang: str, to_lang: str) -> str:
        src_name = SUPPORTED_LANGUAGES.get(from_lang, from_lang)
        tgt_name = SUPPORTED_LANGUAGES.get(to_lang, to_lang)

        if from_lang == "auto":
            src_directive = (
                "Detect the source language automatically."
            )
        else:
            src_directive = f"The source language is {src_name}."

        needs_romanization = to_lang not in LATIN_SCRIPT_LANGUAGES

        roman_instruction = (
            f'Provide an English-letter (romanized) version under "romanization". '
            f"For {tgt_name}, use a clear phonetic romanization."
            if needs_romanization
            else 'Set "romanization" to an empty string since the target uses Latin script.'
        )

        return f"""You are a professional translator specialising in travel and emergency phrases.

{src_directive}
Translate the following text into {tgt_name}.

{roman_instruction}

Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation.
Use this exact schema:

{{
  "translation": "the translated text in {tgt_name}",
  "romanization": "{'phonetic romanization' if needs_romanization else ''}",
  "confidence": "high"
}}

Rules:
- Translation must be natural and contextually appropriate.
- Preserve the tone (polite/urgent/casual).
- Confidence must be "high", "medium", or "low".
- Output ONLY the JSON object.

Text to translate:
\"\"\"
{text}
\"\"\""""

    # ------------------------------------------------------------------
    # LLM provider calls
    # ------------------------------------------------------------------

    async def _call_groq(self, prompt: str) -> TranslationResult:
        s = self._settings
        payload = {
            "model": s.groq_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a precise translator. "
                        "Always respond with valid JSON only. "
                        "Never include markdown or explanations."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1200,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {s.groq_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{s.groq_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"Groq returned {response.status_code}: {response.text[:200]}"
            )

        data = response.json()
        raw = data["choices"][0]["message"]["content"].strip()
        parsed = self._parse_llm_response(raw)
        parsed.provider = "groq"
        return parsed

    async def _call_openrouter(self, prompt: str) -> TranslationResult:
        s = self._settings
        payload = {
            "model": s.openrouter_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a precise translator. "
                        "Always respond with valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1200,
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {s.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://saferoute.ai",
            "X-Title": "SafeRoute AI Translator",
        }

        last_error = None
        for attempt in range(1, 3):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{s.openrouter_base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )

                if response.status_code == 429:
                    last_error = RuntimeError(f"OpenRouter 429: {response.text[:200]}")
                    if attempt < 2:
                        await asyncio.sleep(2)
                        continue
                    raise last_error

                if response.status_code != 200:
                    raise RuntimeError(
                        f"OpenRouter returned {response.status_code}: {response.text[:200]}"
                    )

                data = response.json()
                raw = data["choices"][0]["message"]["content"].strip()
                parsed = self._parse_llm_response(raw)
                parsed.provider = "openrouter"
                return parsed

            except (httpx.TimeoutException, httpx.RequestError) as exc:
                last_error = RuntimeError(f"OpenRouter network error: {exc}")
                if attempt < 2:
                    await asyncio.sleep(2)
                    continue

        if last_error:
            raise last_error
        raise RuntimeError("OpenRouter call failed after retries")

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _parse_llm_response(self, raw: str) -> TranslationResult:
        cleaned = self._strip_markdown(raw)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            data = self._extract_json(cleaned)
            if data is None:
                raise RuntimeError(
                    f"LLM returned invalid JSON. Raw: {raw[:300]}"
                )

        translation = str(data.get("translation", "")).strip()
        if not translation:
            raise RuntimeError(
                f"LLM response missing 'translation' field. Raw: {raw[:300]}"
            )

        romanization = str(data.get("romanization", "")).strip()
        confidence = str(data.get("confidence", "medium")).strip().lower()
        if confidence not in ("high", "medium", "low"):
            confidence = "medium"

        return TranslationResult(
            translation=translation,
            romanization=romanization,
            confidence=confidence,
            provider="unknown",  # set by caller
        )

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

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _cache_key(self, text: str, from_lang: str, to_lang: str) -> str:
        return f"{from_lang}|{to_lang}|{text}"

    def _get_from_cache(self, key: str) -> TranslateResponse | None:
        entry = _CACHE.get(key)
        if entry is None:
            return None
        ts, payload = entry
        if time.time() - ts > CACHE_TTL_SECONDS:
            _CACHE.pop(key, None)
            return None
        return payload.model_copy()

    def _save_to_cache(self, key: str, payload: TranslateResponse) -> None:
        if len(_CACHE) >= CACHE_MAX_ENTRIES:
            # Evict oldest 20% to make room
            sorted_items = sorted(_CACHE.items(), key=lambda kv: kv[1][0])
            for k, _ in sorted_items[: CACHE_MAX_ENTRIES // 5]:
                _CACHE.pop(k, None)
        _CACHE[key] = (time.time(), payload.model_copy())


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_translator: TranslatorService | None = None


def get_translator() -> TranslatorService:
    global _translator
    if _translator is None:
        _translator = TranslatorService()
    return _translator