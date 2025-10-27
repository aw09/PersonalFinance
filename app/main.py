from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import api_router
from .config import get_settings
from .db import init_db
from .telegram.bot import init_bot, shutdown_bot


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_bot()
    try:
        yield
    finally:
        await shutdown_bot()


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
