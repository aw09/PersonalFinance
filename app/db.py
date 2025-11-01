from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from pathlib import Path

import anyio
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _get_alembic_config() -> Config:
    config_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    config = Config(str(config_path))
    migrations_url = settings.direct_database_url or settings.database_url
    config.set_main_option("sqlalchemy.url", migrations_url)
    return config


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency providing an async database session."""
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Apply database migrations on startup."""
    if not settings.auto_run_migrations:
        logger.info("AUTO_RUN_MIGRATIONS disabled; skipping Alembic upgrade on startup.")
        return
    config = _get_alembic_config()
    await anyio.to_thread.run_sync(command.upgrade, config, "head")
