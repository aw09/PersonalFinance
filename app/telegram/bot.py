from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

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
    """Simple HTTP client that forwards Telegram entries to the FastAPI backend."""

    def __init__(self, base_url: str) -> None:
        self.client = httpx.AsyncClient(base_url=base_url, timeout=10)

    async def create_transaction(self, payload: dict) -> dict:
        response = await self.client.post("/api/transactions", json=payload)
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        await self.client.aclose()


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "👋 Hi! Send `/add <type> <amount> <description>` to store a transaction.\n"
        "Types: expenditure, income, debt, receivable.",
        parse_mode=ParseMode.MARKDOWN,
    )


async def add(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    args = update.message.text.split(maxsplit=3)
    if len(args) < 4:
        await update.message.reply_text(
            "Usage: `/add expenditure 12.34 Grocery shopping`", parse_mode=ParseMode.MARKDOWN
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
            "Try `income 100 Salary` or `/add expenditure 12 lunch`."
        )
        return
    if len(parts) == 2:
        tx_type, amount_raw = parts
        description = "Quick entry"
    else:
        tx_type, amount_raw, description = parts
    await _create_transaction(update, context, tx_type, amount_raw, description)


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

    payload = {
        "type": tx_type.lower(),
        "amount": str(amount.quantize(Decimal("0.01"))),
        "description": description,
        "occurred_at": date.today().isoformat(),
        "currency": "USD",
        "source": "telegram",
    }

    api_client: FinanceApiClient = context.application.bot_data["api_client"]
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


def build_application() -> Application:
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
    base_url = settings.backend_base_url or "http://localhost:8000"
    api_client = FinanceApiClient(base_url)

    application = (
        Application.builder()
        .token(settings.telegram_bot_token)
        .rate_limiter(AIORateLimiter())
        .build()
    )
    application.bot_data["api_client"] = api_client

    async def on_shutdown(_: Application) -> None:
        await api_client.aclose()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("add", add))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, free_text_transaction))
    application.post_shutdown.register(on_shutdown)
    return application


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    application = build_application()
    application.run_polling(close_loop=False)


if __name__ == "__main__":
    main()
