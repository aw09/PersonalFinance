from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

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
_docs_enabled = settings.environment.lower() != "production"
app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
)
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


if _docs_enabled:
    @app.get("/docs/rapidoc", include_in_schema=False)
    async def rapidoc() -> HTMLResponse:
        html = """<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"/><title>{title} API Docs</title><link rel=\"icon\" href=\"data:;base64,iVBORw0KGgo=\"/><script type=\"module\" src=\"https://unpkg.com/rapidoc/dist/rapidoc-min.js\"></script></head><body><rapi-doc spec-url=\"/openapi.json\" theme=\"light\" render-style=\"read\" show-header=\"false\" primary-color=\"#2563eb\" regular-font=\"Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif\" layout=\"row\" show-method-in-nav-bar=\"true\"></rapi-doc></body></html>""".format(title=settings.app_name)
        return HTMLResponse(content=html)
