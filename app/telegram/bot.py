from __future__ import annotations

import asyncio
import calendar
import contextlib
import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
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

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..config import get_settings
from ..models.transaction import TransactionType

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "What I can do:\n"
    "- /add <type> <amount> <description>: log expense, income, debt, or receivable transactions.\n"
    '- Send plain text such as "expense 12000 lunch" or shorthand "e lunch 12000" for quick capture.\n'
    "- Send a receipt photo to extract items and create a transaction automatically.\n"
    "- /lend <name> <amount> [note]: record money you lent to someone.\n"
    "- /repay <name> <amount> [note|all]: track repayments (partial or full) against outstanding debts.\n"
    "- /owed [name]: list who still owes you, including installment and repayment history.\n"
    "- /report [range]: get a summary for today, mtd, ytd, 1 week, 1 month, and other natural ranges.\n"
    "- /help: show this menu again.\n"
    "\nTransactions are stored against your default wallet automatically. Update wallets via the API when you need separated balances "
    "(regular, investment, or credit)."
)

try:
    USER_TIMEZONE = ZoneInfo("Asia/Jakarta")
except ZoneInfoNotFoundError:
    USER_TIMEZONE = timezone(timedelta(hours=7))


def _local_today() -> date:
    return datetime.now(USER_TIMEZONE).date()

TYPE_ALIASES: dict[str, str] = {
    "e": TransactionType.EXPENSE.value,
    "exp": TransactionType.EXPENSE.value,
    "expense": TransactionType.EXPENSE.value,
    "i": TransactionType.INCOME.value,
    "inc": TransactionType.INCOME.value,
    "income": TransactionType.INCOME.value,
    "d": TransactionType.DEBT.value,
    "debt": TransactionType.DEBT.value,
    "r": TransactionType.RECEIVABLE.value,
    "rec": TransactionType.RECEIVABLE.value,
    "receivable": TransactionType.RECEIVABLE.value,
}

ALLOWED_UPDATES = ["message", "callback_query"]


class FinanceApiClient:
    """HTTP client that forwards Telegram entries to the FastAPI backend."""

    def __init__(self, api_base_url: str) -> None:
        self.client = httpx.AsyncClient(
            base_url=api_base_url,
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

    async def create_debt(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/debts", json=payload)
        response.raise_for_status()
        return response.json()

    async def list_debts(self, *, user_id: str) -> list[dict[str, Any]]:
        response = await self.client.get("/api/debts", params={"user_id": user_id})
        response.raise_for_status()
        return response.json()

    async def apply_installment_payment(
        self,
        installment_id: str,
        *,
        amount: Decimal,
        paid_at: date,
        transaction_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "paid_at": paid_at.isoformat(),
            "amount": str(amount),
        }
        if transaction_id:
            payload["transaction_id"] = transaction_id
        response = await self.client.post(
            f"/api/debts/installments/{installment_id}/pay",
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def update_debt_status(self, debt_id: str, *, status: str) -> dict[str, Any]:
        response = await self.client.patch(f"/api/debts/{debt_id}", json={"status": status})
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
    text = update.message.text or ""
    try:
        tx_type, amount, description = _parse_quick_entry(text)
    except ValueError as exc:
        await update.message.reply_text(
            f"{exc}\nTry `expense lunch 12000` or shorthand `e lunch 12000`."
        )
        return
    await _create_transaction(update, context, tx_type, amount, description)


async def lend(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    args = getattr(context, "args", [])
    if not args or len(args) < 2:
        await update.message.reply_text(
            "Usage: `/lend <name> <amount> [note]`", parse_mode=ParseMode.MARKDOWN
        )
        return
    try:
        amount_idx, amount = _extract_amount_from_tokens(args)
    except ValueError as exc:
        await update.message.reply_text(str(exc))
        return
    name = " ".join(args[:amount_idx]).strip()
    if not name:
        await update.message.reply_text("Please provide who you lent money to.")
        return
    note = " ".join(args[amount_idx + 1 :]).strip()

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

    try:
        await api_client.create_debt(
            {
                "name": name,
                "description": note or None,
                "principal_amount": str(amount.quantize(Decimal("0.01"))),
                "total_installments": 1,
                "start_date": _local_today().isoformat(),
                "interest_rate": None,
                "frequency_months": 1,
                "user_id": user["id"],
            }
        )
    except httpx.HTTPStatusError as exc:
        await update.message.reply_text(f"Could not record debt: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to create debt via API")
        await update.message.reply_text("Something went wrong while recording the debt.")
        return

    description = note or f"Loan to {name}"
    try:
        amount_text = str(amount.quantize(Decimal("0.01")))
        await api_client.create_transaction(
            {
                "type": TransactionType.RECEIVABLE.value,
                "amount": amount_text,
                "currency": "IDR",
                "description": description,
                "category": None,
                "occurred_at": _local_today().isoformat(),
                "source": "telegram",
                "user_id": user["id"],
            }
        )
    except Exception:
        logger.exception("Failed to create receivable transaction for debt.")

    try:
        debts = await api_client.list_debts(user_id=user["id"])
    except Exception:
        debts = []

    summary = _aggregate_debts_by_name(debts)
    outstanding = summary.get(_normalise_name(name), {}).get("amount", Decimal("0"))
    reply_lines = [
        f"Recorded receivable of {_format_amount_for_display(amount, 'IDR')} from {name}."
    ]
    if note:
        reply_lines.append(f"Note: {note}")
    if outstanding > 0:
        reply_lines.append(
            f"Outstanding balance: {_format_amount_for_display(outstanding, 'IDR')}"
        )
    await update.message.reply_text("\n".join(reply_lines))


async def repay(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    args = getattr(context, "args", [])
    if not args:
        await update.message.reply_text(
            "Usage: `/repay <name> <amount> [note]`", parse_mode=ParseMode.MARKDOWN
        )
        return

    is_full_repayment = args[-1].lower() == "all"
    if is_full_repayment:
        name_tokens = args[:-1]
        amount = None
        note_tokens: list[str] = []
    else:
        try:
            amount_idx, amount = _extract_amount_from_tokens(args)
        except ValueError as exc:
            await update.message.reply_text(str(exc))
            return
        name_tokens = args[:amount_idx]
        note_tokens = args[amount_idx + 1 :]

    name = " ".join(name_tokens).strip()
    if not name:
        await update.message.reply_text("Please provide who repaid you.")
        return
    note = " ".join(note_tokens).strip()

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

    try:
        debts = await api_client.list_debts(user_id=user["id"])
    except Exception:
        logger.exception("Failed to fetch debts for repayment.")
        await update.message.reply_text("Could not fetch existing debts to apply the repayment.")
        return

    key = _normalise_name(name)
    matching_debts = [debt for debt in debts if _normalise_name(debt.get("name", "")) == key]
    if not matching_debts:
        await update.message.reply_text(f"No outstanding balance found for {name}.")
        return

    debt_summary = _aggregate_debts_by_name(matching_debts)
    outstanding = debt_summary.get(key, {}).get("amount", Decimal("0"))
    if outstanding <= 0:
        await update.message.reply_text(f"No outstanding balance found for {name}.")
        return

    if amount is None:
        amount = outstanding
        note = note or "Full repayment"

    payment_target = min(amount, outstanding)
    overpay = amount - payment_target

    description = note or f"Repayment from {name}"
    try:
        transaction = await api_client.create_transaction(
            {
                "type": TransactionType.INCOME.value,
                "amount": str(amount.quantize(Decimal("0.01"))),
                "currency": "IDR",
                "description": description,
                "category": None,
                "occurred_at": _local_today().isoformat(),
                "source": "telegram",
                "user_id": user["id"],
            }
        )
    except httpx.HTTPStatusError as exc:
        await update.message.reply_text(f"Could not record repayment: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to create repayment transaction.")
        await update.message.reply_text("Something went wrong while recording the repayment.")
        return

    remaining = payment_target
    for debt in sorted(matching_debts, key=lambda d: d.get("created_at", "")):
        installments = sorted(
            debt.get("installments", []),
            key=lambda inst: inst.get("installment_number", 0),
        )
        for inst in installments:
            if inst.get("paid"):
                continue
            inst_amount = Decimal(str(inst.get("amount", "0")))
            if inst_amount <= 0:
                continue
            chunk = min(remaining, inst_amount)
            if chunk <= 0:
                break
            try:
                updated = await api_client.apply_installment_payment(
                    inst["id"],
                    amount=chunk,
                    paid_at=_local_today(),
                    transaction_id=transaction["id"],
                )
            except httpx.HTTPStatusError as exc:
                await update.message.reply_text(
                    f"Failed to apply repayment to debt: {exc.response.text}"
                )
                return
            except Exception:
                logger.exception("Failed to apply repayment to debt.")
                await update.message.reply_text(
                    "Something went wrong while applying the repayment to the debt."
                )
                return

            inst["paid"] = updated.get("paid", inst.get("paid"))
            inst["amount"] = updated.get("amount", inst["amount"])
            remaining -= chunk
            if remaining <= Decimal("0"):
                break

        debt_outstanding = _debt_outstanding_amount(debt)
        if debt_outstanding <= Decimal("0"):
            try:
                await api_client.update_debt_status(debt["id"], status="settled")
            except Exception:
                logger.exception("Failed to update debt status to settled.")
        if remaining <= Decimal("0"):
            break

    try:
        debts_after = await api_client.list_debts(user_id=user["id"])
    except Exception:
        debts_after = matching_debts

    summary_after = _aggregate_debts_by_name(debts_after)
    outstanding_after = summary_after.get(key, {}).get("amount", Decimal("0"))

    reply_lines = [
        f"Recorded repayment of {_format_amount_for_display(payment_target, 'IDR')} from {name}."
    ]
    if note:
        reply_lines.append(f"Note: {note}")
    if overpay > 0:
        reply_lines.append(
            f"Overpayment of {_format_amount_for_display(overpay, 'IDR')} was not applied."
        )
    if outstanding_after > 0:
        reply_lines.append(
            f"Remaining balance: {_format_amount_for_display(outstanding_after, 'IDR')}"
        )
    else:
        reply_lines.append(f"{name} is fully settled.")
    await update.message.reply_text("\n".join(reply_lines))


async def owed(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    filter_name = " ".join(getattr(context, "args", [])).strip()
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

    try:
        debts = await api_client.list_debts(user_id=user["id"])
    except Exception:
        logger.exception("Failed to fetch debts for summary.")
        await update.message.reply_text("Could not fetch outstanding balances right now.")
        return

    summary = _aggregate_debts_by_name(debts)
    if not summary:
        await update.message.reply_text("No outstanding receivables 🎉")
        return

    if filter_name:
        key = _normalise_name(filter_name)
        entry = summary.get(key)
        if not entry:
            await update.message.reply_text(f"No outstanding balance found for {filter_name}.")
            return
        total = entry["amount"]
        lines = [
            f"{entry['display_name']} owes {_format_amount_for_display(total, 'IDR')}.",
        ]
        details: list[str] = []
        for debt in entry["debts"]:
            details.extend(_format_debt_breakdown_lines(debt))
        if details:
            lines.append("Breakdown:")
            lines.extend(details)
        await update.message.reply_text("\n".join(lines))
        return

    lines = ["Outstanding receivables:"]
    for entry in sorted(summary.values(), key=lambda item: item["display_name"].lower()):
        lines.append(
            f"- {entry['display_name']}: {_format_amount_for_display(entry['amount'], 'IDR')}"
        )
    await update.message.reply_text("\n".join(lines))

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


def _parse_quick_entry(text: str) -> tuple[TransactionType, Decimal, str]:
    tokens = text.strip().split()
    if len(tokens) < 2:
        raise ValueError("Provide at least a type and amount, e.g. `e lunch 12000`.")
    tx_type = _resolve_transaction_type(tokens[0])
    amount_value: Decimal | None = None
    amount_index: int | None = None
    for idx in range(len(tokens) - 1, 0, -1):
        candidate = tokens[idx].replace(",", "")
        try:
            amount_value = Decimal(candidate)
            amount_index = idx
            break
        except (InvalidOperation, ValueError):
            continue
    if amount_value is None or amount_index is None:
        raise ValueError("Could not find an amount in your message.")
    description_tokens = tokens[1:amount_index] + tokens[amount_index + 1 :]
    description = " ".join(description_tokens).strip() or "Quick entry"
    return tx_type, amount_value, description


async def _create_transaction(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    tx_type: TransactionType | str,
    amount_raw: Decimal | str,
    description: str,
) -> None:
    if isinstance(amount_raw, Decimal):
        amount = amount_raw
    else:
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            await update.message.reply_text(f"Invalid amount `{amount_raw}`.")
            return

    try:
        tx_type_enum = _resolve_transaction_type(tx_type)
    except ValueError as exc:
        await update.message.reply_text(str(exc))
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
        "type": tx_type_enum.value,
        "amount": str(amount.quantize(Decimal("0.01"))),
        "description": description,
        "occurred_at": _local_today().isoformat(),
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
    application.add_handler(CommandHandler("lend", lend))
    application.add_handler(CommandHandler("repay", repay))
    application.add_handler(CommandHandler("owed", owed))
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

    api_base_url = str(settings.internal_backend_base_url or settings.backend_base_url)

    async with _lock:
        global _application, _api_client
        if _application is not None:
            return

        api_client = FinanceApiClient(api_base_url)
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
                        BotCommand("lend", "Record money you lent"),
                        BotCommand("repay", "Record repayment received"),
                        BotCommand("owed", "Show outstanding balances"),
                        BotCommand("report", "Show a spending summary"),
                    ]
                )
            except Exception:
                logger.exception("Failed to set Telegram command list.")
            if settings.telegram_register_webhook_on_start:
                await application.bot.set_webhook(url=webhook_url, drop_pending_updates=False, allowed_updates=ALLOWED_UPDATES)
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




def _resolve_transaction_type(raw: str | TransactionType) -> TransactionType:
    if isinstance(raw, TransactionType):
        return raw
    try:
        normalised = TYPE_ALIASES.get(raw.lower(), raw.lower())
        return TransactionType(normalised)
    except Exception as exc:
        raise ValueError(f"Unsupported transaction type '{raw}'.") from exc


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


def _extract_amount_from_tokens(tokens: list[str]) -> tuple[int, Decimal]:
    for idx in range(len(tokens) - 1, -1, -1):
        candidate = tokens[idx].replace(",", "")
        try:
            return idx, Decimal(candidate)
        except (InvalidOperation, ValueError):
            continue
    raise ValueError("Could not find an amount in your command. Place it at the end.")


def _normalise_name(name: str) -> str:
    return name.strip().lower()


def _debt_outstanding_amount(debt: dict[str, Any]) -> Decimal:
    outstanding = Decimal("0")
    for inst in debt.get("installments", []):
        try:
            amount = Decimal(str(inst.get("amount", "0")))
            paid_amount = Decimal(str(inst.get("paid_amount", "0")))
        except (InvalidOperation, ValueError):
            continue
        remaining = amount - paid_amount
        if remaining > 0:
            outstanding += remaining
    return outstanding


def _aggregate_debts_by_name(
    debts: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for debt in debts:
        name = debt.get("name") or "Unknown"
        key = _normalise_name(name)
        outstanding = _debt_outstanding_amount(debt)
        if outstanding <= Decimal("0"):
            continue
        entry = summary.setdefault(
            key,
            {"display_name": name, "amount": Decimal("0"), "debts": []},
        )
        entry["amount"] += outstanding
        entry["debts"].append(debt)
    return summary


def _format_installment_detail(installment: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    try:
        original_amount = Decimal(str(installment.get("amount", "0")))
        paid_amount = Decimal(str(installment.get("paid_amount", "0")))
    except (InvalidOperation, ValueError):
        return lines

    if original_amount <= 0:
        return lines

    remaining = original_amount - paid_amount
    if remaining <= Decimal("0.00"):
        return lines

    due_date = installment.get("due_date") or "n/a"
    lines.append(
        f"  • Installment #{installment.get('installment_number', '?')} due {due_date}: "
        f"{_format_amount_for_display(remaining, 'IDR')} remaining"
    )

    payments = sorted(
        installment.get("payments") or [],
        key=lambda p: (p.get("paid_at") or "", p.get("created_at") or ""),
    )
    for payment in payments:
        try:
            pay_amount = Decimal(str(payment.get("amount", "0")))
        except (InvalidOperation, ValueError):
            continue
        if pay_amount <= 0:
            continue
        paid_text = _format_amount_for_display(pay_amount, "IDR")
        paid_at = payment.get("paid_at") or "n/a"
        lines.append(f"    ◦ Paid {paid_text} on {paid_at}")
    return lines

def _format_debt_breakdown_lines(debt: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    remaining = _debt_outstanding_amount(debt)
    if remaining <= Decimal("0"):
        return lines
    start_date = debt.get("start_date") or debt.get("created_at", "")
    header = (
        f"- Loan opened {start_date}: {_format_amount_for_display(remaining, 'IDR')} remaining"
    )
    lines.append(header)
    for installment in sorted(
        debt.get("installments", []),
        key=lambda inst: inst.get("installment_number", 0),
    ):
        details = _format_installment_detail(installment)
        if details:
            lines.extend(details)
    return lines


def _subtract_months(base: date, months: int) -> date:
    year = base.year
    month = base.month - months
    while month <= 0:
        month += 12
        year -= 1
    day = min(base.day, calendar.monthrange(year, month)[1])
    return base.replace(year=year, month=month, day=day)


def _parse_report_range(arg: str | None) -> tuple[date, date, str]:
    today = _local_today()
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

