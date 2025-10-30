from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised application settings, sourced from environment variables or .env."""

    app_name: str = Field(default="PersonalFinance")
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
    telegram_register_webhook_on_start: bool = Field(
        default=False, alias="TELEGRAM_REGISTER_WEBHOOK_ON_START"
    )
    auto_run_migrations: bool = Field(default=False, alias="AUTO_RUN_MIGRATIONS")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor so imports share a single settings instance."""
    return Settings()  # type: ignore[call-arg]
