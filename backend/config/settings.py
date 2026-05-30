import logging
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator


logger = logging.getLogger(__name__)


class Settings(BaseSettings):
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

    # App
    app_name: str = Field(default="SafeRoute AI Tour Planner")
    app_version: str = Field(default="1.0.0")
    debug: bool = Field(default=False)

    # CORS
    allowed_origins: str = Field(
        default="http://localhost:5173",
        description="Comma-separated list of allowed origins",
    )

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