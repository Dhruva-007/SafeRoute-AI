import logging
import secrets
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from typing import Literal


logger = logging.getLogger(__name__)


class Settings(BaseSettings):
        # ─── Knowledge Base Version ───
    knowledge_base_version: Literal["v1", "v2"] = Field(
        default="v1",
        description=(
            "Which knowledge base version to use for RAG. "
            "v1 = legacy hyderabad/ directory. "
            "v2 = enriched hyderabad_v2/places.json. "
            "Allows A/B testing and instant rollback."
        ),
    )
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Groq — primary LLM
    groq_api_key: str = Field(..., description="Groq API key")
    groq_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        description="Groq base URL",
    )
    groq_model: str = Field(
        default="llama-3.3-70b-versatile",
        description="Groq model identifier",
    )

    # OpenRouter — fallback LLM
    openrouter_api_key: str = Field(..., description="OpenRouter API key")
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        description="OpenRouter base URL",
    )
    openrouter_model: str = Field(
        default="google/gemma-4-26b-a4b-it:free",
        description="OpenRouter fallback model",
    )

    # ── NEW ──────────────────────────────────────────────────────────────
    # JWT — used to sign and verify access tokens
    jwt_secret: str = Field(
        default="",
        description=(
            "Secret key for JWT signing. "
            "Set JWT_SECRET in backend/.env — must be a long random string."
        ),
    )
    # ─────────────────────────────────────────────────────────────────────

    # App
    app_name: str = Field(default="SafeRoute AI Tour Planner")
    app_version: str = Field(default="1.0.0")
    debug: bool = Field(default=False)

    # CORS
    allowed_origins: str = Field(
        default="http://localhost:5173",
        description="Comma-separated list of allowed origins",
    )

    # ── NEW ──────────────────────────────────────────────────────────────
    @field_validator("jwt_secret", mode="after")
    @classmethod
    def ensure_jwt_secret(cls, v: str) -> str:
        """
        If JWT_SECRET is not set in .env, generate a random one.
        This keeps the app running in development but prints a clear warning.
        In production, always set JWT_SECRET explicitly.
        """
        if not v or not v.strip():
            generated = secrets.token_hex(32)
            logger.warning(
                "JWT_SECRET is not set in .env. "
                "A random secret has been generated for this session. "
                "ALL existing tokens will be invalidated on restart. "
                "Set JWT_SECRET in backend/.env for persistent sessions."
            )
            return generated
        return v.strip()
    # ─────────────────────────────────────────────────────────────────────

    @field_validator("groq_api_key")
    @classmethod
    def groq_key_must_not_be_placeholder(cls, v: str) -> str:
        if (
            "your_actual_groq_key" in v.lower()
            or "your_groq" in v.lower()
            or not v.strip()
        ):
            raise ValueError(
                "GROQ_API_KEY is not set. "
                "Get a free key at https://console.groq.com and add it to backend/.env"
            )
        return v.strip()

    @field_validator("openrouter_api_key")
    @classmethod
    def openrouter_key_must_not_be_placeholder(cls, v: str) -> str:
        if (
            "your_actual_openrouter" in v.lower()
            or "your_openrouter" in v.lower()
            or not v.strip()
        ):
            raise ValueError(
                "OPENROUTER_API_KEY is not set. "
                "Please add your real key to backend/.env"
            )
        return v.strip()

    def get_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    logger.info(
        "Settings loaded | groq_model=%s | openrouter_model=%s | debug=%s",
        settings.groq_model,
        settings.openrouter_model,
        settings.debug,
    )
    return settings