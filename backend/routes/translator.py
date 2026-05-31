"""
Translator API routes.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from models.translation import (
    LanguagesResponse,
    TranslateRequest,
    TranslateResponse,
)
from services.translator import get_translator

logger = logging.getLogger(__name__)

# No prefix here — we set explicit paths on each route below
router = APIRouter(tags=["Translator"])


@router.post(
    "/translate",
    response_model=TranslateResponse,
    summary="Translate text between supported languages",
)
async def translate(payload: TranslateRequest) -> TranslateResponse:
    """
    Translate text from one language to another using Groq (with OpenRouter fallback).

    - **text**: text to translate (1–1000 chars)
    - **from_lang**: ISO 639-1 code or "auto" to detect
    - **to_lang**: ISO 639-1 target code
    """
    service = get_translator()

    try:
        return await service.translate(
            text=payload.text,
            from_lang=payload.from_lang,
            to_lang=payload.to_lang,
        )
    except RuntimeError as exc:
        error_msg = str(exc)
        logger.error("Translation failed: %s", error_msg)

        if "429" in error_msg or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "The translation service is temporarily rate-limited.",
                    "message": "Please wait a moment and try again.",
                },
            )
        if "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=504,
                detail={
                    "error": "Translation request timed out.",
                    "message": error_msg,
                },
            )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Translation service error.",
                "message": error_msg,
            },
        )
    except Exception as exc:
        logger.exception("Unexpected error in /translate: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "An unexpected error occurred.",
                "message": str(exc),
            },
        )


@router.get(
    "/translate/languages",
    response_model=LanguagesResponse,
    summary="List supported languages",
)
async def list_languages() -> LanguagesResponse:
    """
    Returns all supported language codes and their human-readable names.
    """
    service = get_translator()
    langs = service.get_supported_languages()
    return LanguagesResponse(languages=langs, count=len(langs))