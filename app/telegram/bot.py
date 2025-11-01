from __future__ import annotations

import asyncio
import calendar
import contextlib
import logging
import re
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any

import httpx
from telegram import BotCommand, Update
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
from ..models.transaction import TransactionType

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "Here is what I can do:\n"
    "- /add <type> <amount> <description>: record a transaction (types: expense, income, debt, receivable).\n"
    "- Send plain text like \"expense 12000 lunch\" for quick capture.\n"
    "- Send a receipt photo to extract items automatically.\n"
    "- /report [range]: show totals for a period. Examples: /report, /report 1 week, /report mtd, /report ytd.\n"
    "- /help: show this menu again."
)


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

    async def list_transactions(
        self,
        *,
        user_id: str,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        response = await self.client.get(
            "/api/transactions",
            params={"user_id": user_id, "limit": min(limit, 200)},
        )
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


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(HELP_TEXT)


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


async def report(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    tele_user = update.effective_user
    if tele_user is None:
        await update.message.reply_text("Could not determine your Telegram user.")
        return

    range_arg = " ".join(getattr(context, "args", [])) if getattr(context, "args", None) else ""
    try:
        start_date, end_date, label = _parse_report_range(range_arg)
    except ValueError as exc:
        await update.message.reply_text(str(exc))
        return

    api_client: FinanceApiClient = context.application.bot_data["api_client"]
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

    try:
        transactions = await api_client.list_transactions(user_id=user["id"])
    except httpx.HTTPStatusError as exc:
        await update.message.reply_text(f"Could not fetch transactions: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to fetch transactions from backend")
        await update.message.reply_text("Something went wrong while fetching your transactions.")
        return

    summary = _build_report_summary(transactions, start_date, end_date, label)
    await update.message.reply_text(summary)


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

    status_message = await update.message.reply_text("Processing receipt...")

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
        amount_text = _format_amount_for_display(data["amount"], data["currency"])
        await status_message.edit_text(
            f"Receipt saved as {data['type']} of {amount_text} "
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
        amount_text = _format_amount_for_display(data["amount"], data["currency"])
        await update.message.reply_text(
            f"Saved {data['type']} of {amount_text} "
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
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("add", add))
    application.add_handler(CommandHandler("report", report))
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
            try:
                await application.bot.set_my_commands(
                    [
                        BotCommand("start", "Show welcome message"),
                        BotCommand("help", "List bot features"),
                        BotCommand("add", "Add a transaction"),
                        BotCommand("report", "Show a spending summary"),
                    ]
                )
            except Exception:
                logger.exception("Failed to set Telegram command list.")
            if settings.telegram_register_webhook_on_start:
                await application.bot.set_webhook(url=webhook_url, drop_pending_updates=False)
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




def _format_amount_for_display(amount: str | Decimal, currency: str) -> str:
    """Format amount with thousands separators or local shorthand."""
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return f"{amount} {currency}"

    currency_upper = currency.upper()

    def _trimmed(val: Decimal, places: int = 2) -> str:
        quantize_target = Decimal(1).scaleb(-places)
        quantized = val.quantize(quantize_target)
        text = format(quantized, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return text

    if currency_upper == "IDR":
        if value >= Decimal("1000000"):
            display_value = value / Decimal("1000000")
            return f"{_trimmed(display_value, 2)} JT {currency_upper}"
        if value >= Decimal("1000"):
            display_value = value / Decimal("1000")
            places = 1 if display_value >= Decimal("10") else 2
            return f"{_trimmed(display_value, places)} K {currency_upper}"
        if value == value.to_integral():
            return f"{int(value):,} {currency_upper}"
        return f"{value:,.2f} {currency_upper}"

    return f"{value:,.2f} {currency_upper}"


def _subtract_months(base: date, months: int) -> date:
    year = base.year
    month = base.month - months
    while month <= 0:
        month += 12
        year -= 1
    day = min(base.day, calendar.monthrange(year, month)[1])
    return base.replace(year=year, month=month, day=day)


def _parse_report_range(arg: str | None) -> tuple[date, date, str]:
    today = date.today()
    if not arg:
        return today, today, "today"
    text = arg.strip().lower()
    if not text:
        return today, today, "today"

    if text in {"today", "daily"}:
        return today, today, "today"
    if text in {"ytd", "year to date"}:
        start = today.replace(month=1, day=1)
        return start, today, "year to date"
    if text in {"mtd", "month to date"}:
        start = today.replace(day=1)
        return start, today, "month to date"
    if text in {"last week"}:
        start = today - timedelta(days=6)
        return start, today, "last week"
    if text in {"last month"}:
        start = _subtract_months(today, 1)
        return start, today, "last month"
    if text in {"last year"}:
        start = today.replace(year=today.year - 1)
        return start, today, "last year"

    match = re.match(r"^(?:last\s+)?(\d+)\s*(day|days|week|weeks|month|months|year|years)$", text)
    if match:
        count = int(match.group(1))
        unit = match.group(2)
        if "day" in unit:
            start = today - timedelta(days=count - 1)
            label = f"last {count} day" + ("s" if count > 1 else "")
            return start, today, label
        if "week" in unit:
            start = today - timedelta(days=(count * 7) - 1)
            label = f"last {count} week" + ("s" if count > 1 else "")
            return start, today, label
        if "month" in unit:
            start = _subtract_months(today, count)
            label = f"last {count} month" + ("s" if count > 1 else "")
            return start, today, label
        if "year" in unit:
            # Align day within year, adjusting for leap years
            try:
                start = today.replace(year=today.year - count)
            except ValueError:
                start = today.replace(month=2, day=28, year=today.year - count)
            label = f"last {count} year" + ("s" if count > 1 else "")
            return start, today, label

    raise ValueError(
        "Could not understand that time range. Try one of: today, 1 week, 1 month, 1 year, mtd, ytd."
    )


def _build_report_summary(
    transactions: list[dict[str, Any]],
    start: date,
    end: date,
    label: str,
) -> str:
    filtered: list[dict[str, Any]] = []
    for tx in transactions:
        occurred_raw = tx.get("occurred_at")
        if not occurred_raw:
            continue
        try:
            occurred = date.fromisoformat(occurred_raw)
        except ValueError:
            continue
        if start <= occurred <= end:
            filtered.append(tx)

    if not filtered:
        return f"No transactions found for {label} ({start.isoformat()} - {end.isoformat()})."

    currency_totals: dict[str, defaultdict[str, Decimal]] = {}
    counts: dict[str, int] = defaultdict(int)

    for tx in filtered:
        currency = str(tx.get("currency", "") or "").upper() or "UNKNOWN"
        totals = currency_totals.setdefault(currency, defaultdict(Decimal))
        try:
            amount = Decimal(str(tx.get("amount", "0") or "0"))
        except (InvalidOperation, ValueError):
            continue
        tx_type = str(tx.get("type", "unknown")).lower()
        totals[tx_type] += amount
        counts[currency] += 1

    lines: list[str] = [
        f"Report for {label} ({start.isoformat()} - {end.isoformat()})",
        f"Total transactions: {len(filtered)}",
    ]

    for currency in sorted(currency_totals):
        totals = currency_totals[currency]
        lines.append("")
        lines.append(f"{currency}:")
        for tx_type in TransactionType:
            amount = totals.get(tx_type.value)
            if amount is not None:
                lines.append(
                    f"- {tx_type.value.capitalize()}: {_format_amount_for_display(amount, currency)}"
                )
        net = (
            totals.get(TransactionType.INCOME.value, Decimal("0"))
            + totals.get(TransactionType.RECEIVABLE.value, Decimal("0"))
            - totals.get(TransactionType.EXPENSE.value, Decimal("0"))
            - totals.get(TransactionType.DEBT.value, Decimal("0"))
        )
        lines.append(f"- Net: {_format_amount_for_display(net, currency)}")
        lines.append(f"- Count: {counts[currency]}")

    return "\n".join(lines)
