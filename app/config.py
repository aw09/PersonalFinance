from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised application settings, sourced from environment variables or .env."""

    app_name: str = Field(default="PersonalFinance")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    database_url: str = Field(alias="DATABASE_URL")
    gemini_api_key: Optional[str] = Field(
        default=None, alias="GEMINI_API_KEY", description="Google Generative AI key"
    )
    telegram_bot_token: Optional[str] = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_webhook_secret: Optional[str] = Field(
        default=None, alias="TELEGRAM_WEBHOOK_SECRET"
    )
    direct_database_url: Optional[str] = Field(
        default=None,
        alias="DIRECT_DATABASE_URL",
        description="Optional direct Postgres connection string used for running migrations.",
    )
    llm_receipt_prompt_path: Path = Field(
        default=Path("prompts/receipt_prompt.txt"),
        alias="LLM_RECEIPT_PROMPT_PATH",
    )
    backend_base_url: Optional[AnyHttpUrl] = Field(
        default=None,
        alias="BACKEND_BASE_URL",
        description="The public URL where FastAPI is reachable (used by Telegram webhooks).",
    )
    internal_backend_base_url: Optional[AnyHttpUrl] = Field(
        default=None,
        alias="INTERNAL_BACKEND_BASE_URL",
        description="Internal URL used by services to avoid egress charges; falls back to BACKEND_BASE_URL.",
    )
    telegram_register_webhook_on_start: bool = Field(
        default=False, alias="TELEGRAM_REGISTER_WEBHOOK_ON_START"
    )
    auto_run_migrations: bool = Field(default=False, alias="AUTO_RUN_MIGRATIONS")
    auth_secret_key: str = Field(
        default="change-me-to-a-safe-key",
        alias="AUTH_SECRET_KEY",
        description="Secret key used to sign API access tokens.",
        min_length=16,
    )
    auth_token_algorithm: str = Field(
        default="HS256",
        alias="AUTH_TOKEN_ALGORITHM",
        description="JWT signing algorithm used for access tokens.",
    )
    auth_access_token_ttl_seconds: int = Field(
        default=60 * 60 * 12,
        alias="AUTH_ACCESS_TOKEN_TTL_SECONDS",
        description="Lifetime of access tokens issued after Telegram login (in seconds).",
        ge=300,
    )
    telegram_login_max_age_seconds: int = Field(
        default=60 * 60 * 24,
        alias="TELEGRAM_LOGIN_MAX_AGE_SECONDS",
        description="Maximum age of the Telegram login payload (in seconds).",
        ge=60,
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor so imports share a single settings instance."""
    return Settings()  # type: ignore[call-arg]
