from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import Any

import httpx
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    AIORateLimiter,
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from ..config import get_settings

logger = logging.getLogger(__name__)


class FinanceApiClient:
    """HTTP client that forwards Telegram entries to the FastAPI backend."""

    def __init__(self, base_url: str) -> None:
        self.client = httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(timeout=60.0, connect=10.0),
        )

    async def ensure_user(self, telegram_id: int, full_name: str | None) -> dict[str, Any]:
        response = await self.client.get(f"/api/users/by-telegram/{telegram_id}")
        if response.status_code == 404:
            response = await self.client.post(
                "/api/users",
                json={"telegram_id": telegram_id, "full_name": full_name},
            )
        response.raise_for_status()
        return response.json()

    async def create_transaction(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/transactions", json=payload)
        response.raise_for_status()
        return response.json()

    async def parse_receipt(
        self,
        image_bytes: bytes,
        *,
        user_id: str,
        commit_transaction: bool = True,
    ) -> dict[str, Any]:
        files = {"file": ("receipt.jpg", image_bytes, "image/jpeg")}
        data = {
            "user_id": user_id,
            "commit_transaction": "true" if commit_transaction else "false",
        }
        response = await self.client.post("/api/llm/receipt", data=data, files=files)
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        await self.client.aclose()


_application: Application | None = None
_api_client: FinanceApiClient | None = None
_lock = asyncio.Lock()


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Hi! Send `/add <type> <amount> <description>` to store a transaction.\n"
        "Types: expense, income, debt, receivable.",
        parse_mode=ParseMode.MARKDOWN,
    )


async def add(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    args = update.message.text.split(maxsplit=3)
    if len(args) < 4:
        await update.message.reply_text(
            "Usage: `/add expense 12.34 Grocery shopping`", parse_mode=ParseMode.MARKDOWN
        )
        return
    _, tx_type, amount_raw, description = args
    await _create_transaction(update, context, tx_type, amount_raw, description)


async def free_text_transaction(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    parts = update.message.text.split(maxsplit=2)
    if len(parts) < 2:
        await update.message.reply_text(
            "Try `income 100 Salary` or `/add expense 12 lunch`."
        )
        return
    if len(parts) == 2:
        tx_type, amount_raw = parts
        description = "Quick entry"
    else:
        tx_type, amount_raw, description = parts
    await _create_transaction(update, context, tx_type, amount_raw, description)


async def receipt_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    if not update.message.photo:
        await update.message.reply_text("Send a photo to extract a receipt.")
        return

    tele_user = update.effective_user
    if tele_user is None:
        await update.message.reply_text("Could not determine your Telegram user.")
        return

    status_message = await update.message.reply_text("Processing receipt…")

    photo = update.message.photo[-1]
    try:
        file = await photo.get_file()
        buffer = BytesIO()
        await file.download_to_memory(out=buffer)
        buffer.seek(0)
        image_bytes = buffer.getvalue()
    except Exception:
        logger.exception("Failed to download photo from Telegram")
        await status_message.edit_text("Could not download your photo. Please try again.")
        return

    api_client: FinanceApiClient = context.application.bot_data["api_client"]
    try:
        user = await api_client.ensure_user(tele_user.id, tele_user.full_name)
    except httpx.HTTPStatusError as exc:
        logger.exception("Failed to ensure Telegram user in backend")
        await status_message.edit_text(f"User sync error: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to ensure Telegram user in backend")
        await status_message.edit_text("Could not sync your Telegram user with the backend.")
        return

    try:
        data = await api_client.parse_receipt(image_bytes, user_id=user["id"])
    except httpx.HTTPStatusError as exc:
        await status_message.edit_text(f"Receipt error: {exc.response.text}")
    except Exception:
        logger.exception("Failed to parse receipt via API")
        await status_message.edit_text("Something went wrong while processing the receipt.")
    else:
        await status_message.edit_text(
            f"Receipt saved as {data['type']} of {data['amount']} {data['currency']} "
            f"for *{data.get('description') or 'no description'}*.",
            parse_mode=ParseMode.MARKDOWN,
        )


async def _create_transaction(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    tx_type: str,
    amount_raw: str,
    description: str,
) -> None:
    try:
        amount = Decimal(amount_raw)
    except Exception:
        await update.message.reply_text(f"Invalid amount `{amount_raw}`.")
        return

    api_client: FinanceApiClient = context.application.bot_data["api_client"]
    tele_user = update.effective_user
    if tele_user is None:
        await update.message.reply_text("Could not determine your Telegram user.")
        return

    try:
        user = await api_client.ensure_user(tele_user.id, tele_user.full_name)
    except httpx.HTTPStatusError as exc:
        logger.exception("Failed to ensure Telegram user in backend")
        await update.message.reply_text(f"User sync error: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to ensure Telegram user in backend")
        await update.message.reply_text("Could not sync your Telegram user with the backend.")
        return

    payload = {
        "type": tx_type.lower(),
        "amount": str(amount.quantize(Decimal("0.01"))),
        "description": description,
        "occurred_at": date.today().isoformat(),
        "currency": "IDR",
        "source": "telegram",
        "user_id": user["id"],
    }
    try:
        data = await api_client.create_transaction(payload)
    except httpx.HTTPStatusError as exc:
        await update.message.reply_text(f"API error: {exc.response.text}")
    except Exception:
        logger.exception("Failed to create transaction via API")
        await update.message.reply_text("Something went wrong while saving the transaction.")
    else:
        await update.message.reply_text(
            f"Saved {data['type']} of {data['amount']} {data['currency']} "
            f"for *{data.get('description') or 'no description'}*.",
            parse_mode=ParseMode.MARKDOWN,
        )


def _create_application(token: str, api_client: FinanceApiClient) -> Application:
    application = (
        Application.builder()
        .token(token)
        .rate_limiter(AIORateLimiter())
        .build()
    )
    application.bot_data["api_client"] = api_client
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("add", add))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, free_text_transaction))
    application.add_handler(MessageHandler(filters.PHOTO, receipt_photo))
    return application


async def init_bot() -> None:
    """Initialise the Telegram bot and register the webhook."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_webhook_secret:
        logger.info("Telegram bot or webhook secret not configured; skipping bot initialisation.")
        return
    if not settings.backend_base_url:
        logger.warning("BACKEND_BASE_URL is missing; skipping Telegram webhook setup.")
        return

    base_url = str(settings.backend_base_url)
    webhook_url = base_url.rstrip("/") + f"/api/telegram/webhook/{settings.telegram_webhook_secret}"

    async with _lock:
        global _application, _api_client
        if _application is not None:
            return

        api_client = FinanceApiClient(base_url)
        application = _create_application(settings.telegram_bot_token, api_client)

        try:
            await application.initialize()
            await application.start()
            if settings.telegram_register_webhook_on_start:
                await application.bot.set_webhook(url=webhook_url, drop_pending_updates=False)
                logger
        except Exception:
            logger.exception("Failed to initialise Telegram webhook; bot disabled for this run.")
            with contextlib.suppress(Exception):
                await application.stop()
            with contextlib.suppress(Exception):
                await application.shutdown()
            await api_client.aclose()
            return

        _application = application
        _api_client = api_client
        logger.info("Telegram webhook configured at %s", webhook_url)


async def handle_update(payload: dict[str, Any]) -> None:
    """Process a Telegram update forwarded by FastAPI."""
    async with _lock:
        if _application is None:
            raise RuntimeError("Telegram bot is not initialised.")
        application = _application
    update = Update.de_json(payload, application.bot)
    await application.process_update(update)


async def shutdown_bot() -> None:
    """Tear down the Telegram bot and remove the webhook."""
    async with _lock:
        global _application, _api_client
        if _application is None:
            return
        await _application.stop()
        await _application.shutdown()
        if _api_client:
            await _api_client.aclose()
        _application = None
        _api_client = None


async def main() -> None:  # pragma: no cover - helper for local debugging
    """Manual entry point that keeps backward compatibility for local tests."""
    await init_bot()
    logger.info("Webhook mode active. Provide updates via FastAPI endpoint.")


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())




