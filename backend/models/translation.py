"""
Translation Pydantic models.
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, field_validator


# Supported language codes (must match frontend travelPhrases.json)
SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "te": "Telugu",
    "ta": "Tamil",
    "kn": "Kannada",
    "mr": "Marathi",
    "bn": "Bengali",
    "pa": "Punjabi",
    "ja": "Japanese",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
}

# Languages that use the Latin alphabet (no romanization needed)
LATIN_SCRIPT_LANGUAGES = {"en", "fr", "es", "de"}


class TranslateRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Text to translate. Max 1000 characters.",
    )
    from_lang: str = Field(
        default="en",
        description="Source language code (ISO 639-1). Use 'auto' to detect.",
    )
    to_lang: str = Field(
        ...,
        description="Target language code (ISO 639-1).",
    )

    @field_validator("from_lang")
    @classmethod
    def validate_from_lang(cls, v: str) -> str:
        v_lower = v.lower().strip()
        if v_lower == "auto":
            return "auto"
        if v_lower not in SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported source language '{v}'. "
                f"Supported: {list(SUPPORTED_LANGUAGES.keys())} or 'auto'."
            )
        return v_lower

    @field_validator("to_lang")
    @classmethod
    def validate_to_lang(cls, v: str) -> str:
        v_lower = v.lower().strip()
        if v_lower not in SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported target language '{v}'. "
                f"Supported: {list(SUPPORTED_LANGUAGES.keys())}."
            )
        return v_lower


class TranslateResponse(BaseModel):
    translation: str = Field(..., description="Translated text.")
    romanization: str = Field(
        default="",
        description="Romanized version for non-Latin scripts. Empty if not applicable.",
    )
    from_lang: str = Field(..., description="Detected/used source language code.")
    to_lang: str = Field(..., description="Target language code.")
    confidence: Literal["high", "medium", "low"] = Field(
        default="medium",
        description="Translation confidence estimate.",
    )
    cached: bool = Field(
        default=False,
        description="True if served from cache.",
    )
    provider: str = Field(
        default="groq",
        description="Which provider produced this translation.",
    )


class LanguagesResponse(BaseModel):
    languages: dict[str, str] = Field(
        ...,
        description="Map of language_code → language_name",
    )
    count: int