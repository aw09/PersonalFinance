from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import anyio
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _get_alembic_config() -> Config:
    config_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    config = Config(str(config_path))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency providing an async database session."""
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Apply database migrations on startup."""
    config = _get_alembic_config()
    await anyio.to_thread.run_sync(command.upgrade, config, "head")
