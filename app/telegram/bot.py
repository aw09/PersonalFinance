from __future__ import annotations

import asyncio
import calendar
import contextlib
import logging
import re
import textwrap
import textwrap
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any

import httpx
from telegram import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    AIORateLimiter,
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover - fallback for Python < 3.9 in tests
    from backports.zoneinfo import ZoneInfo, ZoneInfoNotFoundError  # type: ignore

from ..config import get_settings
from ..models.transaction import TransactionType

logger = logging.getLogger(__name__)

HELP_OVERVIEW = textwrap.dedent(
    """
    How I can help:

    - Quick capture: /add <type> <amount> <description>, free text like "e lunch 12000", or send a receipt photo (caption with @wallet to choose the wallet).
    - Wallets: /wallet list, add, edit, transfer, default - manage cash, investment ROE, and credit card statements or instalments.
    - Debts & repayments: /lend, /repay, /owed keep track of who owes you and installment schedules.
    - Reports: /report [range] for summaries, /recent [options] to browse transactions with pagination.

    Need details? Try /help wallet, /help add, /help recent, /help report, or /help debts.
    """
)

HELP_TOPICS: dict[str, str] = {
    "wallet": textwrap.dedent(
        """
        Wallet commands:
        - /wallet list - refresh and show all wallets with balances (credit wallets highlight upcoming settlements).
        - /wallet add <name> <regular|investment|credit> [currency=IDR] [limit=...] [settlement=day] [default=yes|no].
        - /wallet edit <name> [name=...] [currency=...] [limit=...] [settlement=day] [default=yes|no].
        - /wallet transfer <amount> <from> <to> [note] - move money between wallets (top up investments or pay down credit).
        - /wallet default <name> - set the default wallet used by /add and quick entries.
        - /wallet credit purchase <wallet> <amount> [installments=3] [beneficiary=Name] [desc=...] - record a card purchase and split it into installments.
        - /wallet credit repay <wallet> <amount> [from=@wallet] [beneficiary=Name] [desc=...] - repay a card from another wallet and allocate to installments.
        - /wallet credit statement <wallet> [reference=YYYY-MM-DD] - show the upcoming settlement amount and due installments.
        - /wallet investment roe <wallet> [start=YYYY-MM-DD] [end=YYYY-MM-DD] - calculate simple return on equity for an investment wallet.
        Tips:
        - Prefix transactions with @wallet (e.g. `/add @travel expense 150000 flight`).
        - Investment wallets: transfer contributions from cash wallets and review ROE each month.
        - Credit wallets: keep settlement day updated, use statements to see what is due, and repay from your main wallet.
        """
    ),
    "add": textwrap.dedent(
        """
        Adding transactions:
        - /add [@wallet] <expense|income|debt|receivable> <amount> <description>.
        - Quick shorthand works: `e lunch 12000` or `@cash income 50000 bonus`.
        - Amounts can contain commas or decimals (e.g. 1,250 or 45.67).
        - When omitted, transactions land in your default wallet.
        """
    ),
    "recent": textwrap.dedent(
        """
        Recent activity:
        - /recent [@wallet] [limit=total] [per=page] [since=YYYY-MM-DD].
        - `per` changes the page size (default 10). `limit` caps total rows fetched.
        - Inline Next/Prev buttons let you page through older results.
        - Combine with @wallet to focus on a specific wallet.
        """
    ),
    "report": textwrap.dedent(
        """
        Reports:
        - /report [range] summarises expenses, income, debts, and receivables.
        - Supported ranges: today, daily, mtd, ytd, last week/month/year, and phrases like `last 3 months` or `last 14 days`.
        - Output groups totals per currency and includes a net figure.
        """
    ),
    "debts": textwrap.dedent(
        """
        Debts & repayments:
        - /lend <name> <amount> [note] - records a receivable and creates a debt schedule.
        - /repay <name> <amount> [note|all] - applies repayments to outstanding installments.
        - /owed [name] - shows who still owes you, including installment breakdowns.
        - Repayments track partial payments and mark debts settled automatically.
        """
    ),
}

HELP_TOPICS["overview"] = HELP_OVERVIEW

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
WALLET_TYPES = {"regular", "investment", "credit"}
RECENT_DEFAULT_LIMIT = 10
RECENT_CALLBACK_PREFIX = "recent:"
RECENT_CALLBACK_NEXT = "recent:next"
RECENT_CALLBACK_PREV = "recent:prev"
HELP_CALLBACK_PREFIX = "help:"
WALLET_CALLBACK_PREFIX = "wallet:"

MAIN_MENU_KEYBOARD = ReplyKeyboardMarkup(
    [
        ["/add", "/wallet"],
        ["/recent", "/report"],
        ["/owed", "/help"],
    ],
    resize_keyboard=True
)

HELP_INLINE_KEYBOARD = InlineKeyboardMarkup(
    [
        [
            InlineKeyboardButton("Wallets", callback_data=f"{HELP_CALLBACK_PREFIX}wallet"),
            InlineKeyboardButton("Add", callback_data=f"{HELP_CALLBACK_PREFIX}add"),
        ],
        [
            InlineKeyboardButton("Recent", callback_data=f"{HELP_CALLBACK_PREFIX}recent"),
            InlineKeyboardButton("Report", callback_data=f"{HELP_CALLBACK_PREFIX}report"),
        ],
        [
            InlineKeyboardButton("Debts", callback_data=f"{HELP_CALLBACK_PREFIX}debts"),
            InlineKeyboardButton("Overview", callback_data=f"{HELP_CALLBACK_PREFIX}overview"),
        ],
    ]
)

WALLET_INLINE_KEYBOARD = InlineKeyboardMarkup(
    [
        [InlineKeyboardButton("List wallets", callback_data=f"{WALLET_CALLBACK_PREFIX}list")],
        [
            InlineKeyboardButton("Add", callback_data=f"{WALLET_CALLBACK_PREFIX}add"),
            InlineKeyboardButton("Transfer", callback_data=f"{WALLET_CALLBACK_PREFIX}transfer"),
        ],
        [
            InlineKeyboardButton("Statement", callback_data=f"{WALLET_CALLBACK_PREFIX}statement"),
            InlineKeyboardButton("ROE", callback_data=f"{WALLET_CALLBACK_PREFIX}roe"),
        ],
        [
            InlineKeyboardButton("Set default", callback_data=f"{WALLET_CALLBACK_PREFIX}default"),
            InlineKeyboardButton("Help", callback_data=f"{HELP_CALLBACK_PREFIX}wallet"),
        ],
    ]
)


def _ensure_user_state(context: ContextTypes.DEFAULT_TYPE) -> dict[str, Any]:
    user_data = getattr(context, "user_data", None)
    if user_data is None:
        user_data = {}
        setattr(context, "user_data", user_data)
    return user_data


def _normalise_wallet_key(name: str) -> str:
    cleaned = name.replace("_", " ")
    return re.sub(r"\s+", " ", cleaned).strip().casefold()


def _escape_markdown(text: str) -> str:
    return text.replace("_", "\\_").replace("*", "\\*")


async def _load_wallets(
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user_id: str,
    *,
    refresh: bool = False,
) -> list[dict[str, Any]]:
    user_state = _ensure_user_state(context)
    cache: dict[str, Any] = user_state.setdefault("wallet_cache", {})
    if refresh or "list" not in cache:
        wallets = await api_client.list_wallets(user_id=user_id)
        cache["list"] = wallets
        cache["by_id"] = {wallet["id"]: wallet for wallet in wallets if wallet.get("id")}
        cache["by_name"] = {
            _normalise_wallet_key(wallet["name"]): wallet
            for wallet in wallets
            if wallet.get("name")
        }
    return cache.get("list", [])


async def _prefetch_credit_statements(
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user_id: str,
    wallets: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    statements: dict[str, dict[str, Any]] = {}
    for wallet in wallets:
        if wallet.get("type") != "credit":
            continue
        wallet_id = wallet.get("id")
        if not wallet_id:
            continue
        try:
            statement = await api_client.credit_statement(wallet_id)
        except httpx.HTTPStatusError as exc:
            logger.exception(
                "Failed to fetch credit statement (HTTP error) for wallet %s: %s",
                wallet.get("name"),
                exc.response.text if hasattr(exc, "response") else exc,
            )
            continue
        except Exception:
            logger.exception("Failed to fetch credit statement for wallet %s", wallet.get("name"))
            continue
        statements[wallet_id] = statement
    return statements


async def _get_wallet_by_name(
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user_id: str,
    wallet_name: str,
) -> dict[str, Any]:
    wallets = await _load_wallets(context, api_client, user_id)
    cache = _ensure_user_state(context).get("wallet_cache", {})
    by_name = cache.get("by_name", {})
    key = _normalise_wallet_key(wallet_name)
    wallet = by_name.get(key)
    if wallet:
        return wallet
    candidates = [w for w in wallets if key in _normalise_wallet_key(w["name"])]
    if not candidates:
        raise ValueError(f"Wallet '{wallet_name}' not found. Use /wallet to see available wallets.")
    if len(candidates) > 1:
        names = ", ".join(w["name"] for w in candidates)
        raise ValueError(f"Ambiguous wallet '{wallet_name}'. Matches: {names}")
    return candidates[0]


async def _get_wallet_by_id(
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user_id: str,
    wallet_id: str,
) -> dict[str, Any] | None:
    cache = _ensure_user_state(context).get("wallet_cache", {})
    wallet = cache.get("by_id", {}).get(wallet_id) if cache else None
    if wallet:
        return wallet
    wallets = await _load_wallets(context, api_client, user_id, refresh=True)
    for item in wallets:
        if item.get("id") == wallet_id:
            return item
    return None


def _parse_wallet_options(tokens: list[str]) -> dict[str, str]:
    options: dict[str, str] = {}
    for token in tokens:
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        options[key.strip().lower()] = value.strip()
    return options


def _parse_recent_args(
    args: list[str],
) -> tuple[str | None, int | None, date | None, int | None]:
    wallet_hint: str | None = None
    limit: int | None = None
    since: date | None = None
    page_size: int | None = None
    for token in args:
        token = token.strip()
        if not token:
            continue
        if token.startswith("@"):
            wallet_hint = token[1:].strip() or None
            continue
        lower = token.lower()
        if lower.startswith("limit="):
            value = lower.split("=", 1)[1]
            try:
                limit = max(1, int(value))
            except ValueError as exc:
                raise ValueError("Limit must be a positive integer.") from exc
            continue
        if any(lower.startswith(prefix) for prefix in ("per=", "page=", "pagesize=", "per_page=")):
            value = lower.split("=", 1)[1]
            try:
                page_size = max(1, int(value))
            except ValueError as exc:
                raise ValueError("Page size must be a positive integer.") from exc
            continue
        if lower.startswith("since="):
            value = token.split("=", 1)[1].strip()
            try:
                since = date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError("Use YYYY-MM-DD format for dates.") from exc
            continue
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", token):
            try:
                since = date.fromisoformat(token)
            except ValueError as exc:
                raise ValueError("Use YYYY-MM-DD format for dates.") from exc
            continue
        if token.isdigit():
            limit = max(1, int(token))
    return wallet_hint, limit, since, page_size


def _recent_header(wallet_name: str | None, since: date | None) -> str:
    parts = ["Recent transactions"]
    if wallet_name:
        parts.append(f"in {wallet_name}")
    if since:
        parts.append(f"since {since.isoformat()}")
    return " ".join(parts)


async def _format_recent_line(
    context: ContextTypes.DEFAULT_TYPE,
    api_client: "FinanceApiClient",
    user_id: str,
    tx: dict[str, Any],
) -> str:
    occurred = str(tx.get("occurred_at") or "-")
    tx_type = str(tx.get("type", "")).capitalize()
    amount_text = _format_amount_for_display(tx.get("amount", "0"), tx.get("currency", "IDR"))
    description = _escape_markdown(str(tx.get("description") or "No description"))
    wallet_label = None
    wallet_id = tx.get("wallet_id")
    if wallet_id:
        wallet = await _get_wallet_by_id(context, api_client, user_id, wallet_id)
        if wallet:
            wallet_label = wallet.get("name")
    wallet_suffix = f" (wallet: {_escape_markdown(wallet_label)})" if wallet_label else ""
    return f"- {occurred}: {tx_type} {amount_text} - *{description}*{wallet_suffix}"


async def _generate_recent_page(
    context: ContextTypes.DEFAULT_TYPE,
    api_client: "FinanceApiClient",
    user: dict[str, Any],
    filters: dict[str, Any],
    offset: int,
) -> tuple[str, InlineKeyboardMarkup | None, int, bool]:
    page_size: int = filters["page_size"]
    max_results: int | None = filters.get("max_results")
    remaining: int | None = None
    if max_results is not None:
        remaining = max(0, max_results - offset)
    fetch_limit = page_size + 1
    if remaining is not None:
        if remaining == 0:
            transactions: list[dict[str, Any]] = []
        else:
            fetch_limit = min(fetch_limit, remaining + 1)
    if remaining == 0:
        transactions = []
    else:
        params: dict[str, Any] = {
            "user_id": user["id"],
            "limit": max(1, fetch_limit),
            "offset": max(0, offset),
        }
        if filters.get("wallet_id"):
            params["wallet_id"] = filters["wallet_id"]
        if filters.get("since"):
            params["occurred_after"] = filters["since"].isoformat()

        transactions = await api_client.list_transactions(**params)
    has_next = len(transactions) > page_size
    if max_results is not None and (offset + page_size) >= max_results:
        has_next = False
    page_transactions = transactions[:page_size]

    header = _recent_header(filters.get("wallet_name"), filters.get("since"))
    lines: list[str] = [f"*{_escape_markdown(header)}*"]
    for tx in page_transactions:
        lines.append(await _format_recent_line(context, api_client, str(user["id"]), tx))
    if not page_transactions:
        lines.append("No transactions found for the selected criteria.")

    keyboard: InlineKeyboardMarkup | None = None
    if offset > 0 or has_next:
        buttons: list[InlineKeyboardButton] = []
        if offset > 0:
            buttons.append(InlineKeyboardButton("< Prev", callback_data=RECENT_CALLBACK_PREV))
        if has_next:
            buttons.append(InlineKeyboardButton("Next >", callback_data=RECENT_CALLBACK_NEXT))
        if buttons:
            keyboard = InlineKeyboardMarkup([buttons])

    return "\n".join(lines), keyboard, len(page_transactions), has_next


def _parse_bool_flag(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


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
        wallet_id: str | None = None,
    ) -> dict[str, Any]:
        files = {"file": ("receipt.jpg", image_bytes, "image/jpeg")}
        data = {
            "user_id": user_id,
            "commit_transaction": "true" if commit_transaction else "false",
        }
        if wallet_id:
            data["wallet_id"] = wallet_id
        response = await self.client.post("/api/llm/receipt", data=data, files=files)
        response.raise_for_status()
        return response.json()

    async def list_transactions(
        self,
        *,
        user_id: str,
        limit: int = 500,
        offset: int = 0,
        wallet_id: str | None = None,
        occurred_after: str | None = None,
        occurred_before: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "user_id": user_id,
            "limit": min(limit, 200),
            "offset": max(offset, 0),
        }
        if wallet_id:
            params["wallet_id"] = wallet_id
        if occurred_after:
            params["occurred_after"] = occurred_after
        if occurred_before:
            params["occurred_before"] = occurred_before
        response = await self.client.get("/api/transactions", params=params)
        response.raise_for_status()
        return response.json()

    async def list_wallets(self, *, user_id: str) -> list[dict[str, Any]]:
        response = await self.client.get("/api/wallets", params={"user_id": user_id})
        response.raise_for_status()
        return response.json()

    async def create_wallet(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/wallets", json=payload)
        response.raise_for_status()
        return response.json()

    async def update_wallet(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.patch(f"/api/wallets/{wallet_id}", json=payload)
        response.raise_for_status()
        return response.json()

    async def set_default_wallet(self, wallet_id: str) -> dict[str, Any]:
        response = await self.client.post(f"/api/wallets/{wallet_id}/set-default")
        response.raise_for_status()
        return response.json()

    async def transfer_wallets(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/wallets/transfer", json=payload)
        response.raise_for_status()
        return response.json()

    async def credit_purchase(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post(f"/api/wallets/{wallet_id}/credit/purchase", json=payload)
        response.raise_for_status()
        return response.json()

    async def credit_repayment(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post(f"/api/wallets/{wallet_id}/credit/repay", json=payload)
        response.raise_for_status()
        return response.json()

    async def credit_statement(
        self,
        wallet_id: str,
        *,
        reference_date: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if reference_date:
            params["reference_date"] = reference_date
        response = await self.client.get(
            f"/api/wallets/{wallet_id}/credit/statement",
            params=params or None,
        )
        response.raise_for_status()
        return response.json()

    async def investment_roe(
        self,
        wallet_id: str,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        response = await self.client.get(
            f"/api/wallets/{wallet_id}/investment/roe",
            params=params or None,
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
        "Types: expense, income, debt, receivable.\n"
        "Prefix with `@wallet` to target a specific wallet (e.g. `/add @travel expense 200 taxi`).",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=MAIN_MENU_KEYBOARD,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    args = getattr(context, "args", None)
    topic = (args[0] or "").strip().lower() if args else None
    if topic:
        if topic == "overview":
            await update.message.reply_text(HELP_OVERVIEW, reply_markup=HELP_INLINE_KEYBOARD)
            return
        help_text = HELP_TOPICS.get(topic)
        if help_text:
            await update.message.reply_text(help_text)
            return
        await update.message.reply_text(
            f"No detailed help for '{topic}'. Try /help wallet, /help add, /help recent, /help report, or /help debts."
        )
        return
    await update.message.reply_text(HELP_OVERVIEW, reply_markup=HELP_INLINE_KEYBOARD)


async def help_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()
    topic = query.data.split(":", 1)[1] if ":" in query.data else "overview"
    help_text = HELP_TOPICS.get(topic, HELP_OVERVIEW)
    await query.edit_message_text(help_text, reply_markup=HELP_INLINE_KEYBOARD)


async def add(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    args = list(getattr(context, "args", []) or [])
    wallet_hint: str | None = None
    if args and args[0].startswith("@"):
        wallet_hint = args.pop(0)[1:].strip()
        if not wallet_hint:
            await update.message.reply_text(
                "Provide a wallet name after '@', e.g. `/add @travel expense 12.34 Taxi`.",
                parse_mode=ParseMode.MARKDOWN,
            )
            return
    if len(args) < 3:
        await update.message.reply_text(
            "Usage: `/add [@wallet] expense 12.34 Grocery shopping`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return
    tx_type = args[0]
    amount_raw = args[1]
    description = " ".join(args[2:]).strip()
    if not description:
        description = "Telegram add"
    await _create_transaction(
        update,
        context,
        tx_type,
        amount_raw,
        description,
        wallet_hint=wallet_hint,
    )


async def free_text_transaction(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    text = update.message.text or ""
    try:
        wallet_hint, tx_type, amount, description = _parse_quick_entry(text)
    except ValueError as exc:
        await update.message.reply_text(
            f"{exc}\nTry `expense lunch 12000` or shorthand `e lunch 12000`. "
            "Prefix with `@wallet` to pick another wallet."
        )
        return
    await _create_transaction(
        update,
        context,
        tx_type,
        amount,
        description,
        wallet_hint=wallet_hint,
    )


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

    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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

    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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
    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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

    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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
        transactions = await api_client.list_transactions(user_id=user["id"], limit=200, offset=0)
    except httpx.HTTPStatusError as exc:
        await update.message.reply_text(f"Could not fetch transactions: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to fetch transactions from backend")
        await update.message.reply_text("Something went wrong while fetching your transactions.")
        return

    summary = _build_report_summary(transactions, start_date, end_date, label)
    await update.message.reply_text(summary)


def _format_wallet_overview(
    wallets: list[dict[str, Any]],
    *,
    credit_statements: dict[str, dict[str, Any]] | None = None,
) -> str:
    if not wallets:
        return (
            "You do not have any wallets yet. Create one with "
            "`/wallet add <name> <regular|investment|credit>`."
        )
    sorted_wallets = sorted(
        wallets,
        key=lambda w: (not w.get("is_default", False), w.get("name", "").lower()),
    )
    lines = ["Wallets:"]
    today = _local_today()
    for wallet in sorted_wallets:
        raw_name = wallet.get("name", "Unnamed")
        name = _escape_markdown(raw_name)
        currency = wallet.get("currency", "IDR")
        wallet_type = wallet.get("type", "unknown")
        balance_text = _escape_markdown(
            _format_amount_for_display(wallet.get("balance", "0"), currency)
        )
        default_tag = " (default)" if wallet.get("is_default") else ""
        parts = f"{name}{default_tag}: {balance_text} ({wallet_type}, {currency})"
        extras: list[str] = []
        credit_limit = wallet.get("credit_limit")
        if credit_limit not in (None, "", 0, "0"):
            extras.append(
                f"limit {_format_amount_for_display(credit_limit, currency)}"
            )
        settlement_day = wallet.get("settlement_day")
        if settlement_day:
            extras.append(f"settles day {settlement_day}")
        if wallet_type == "credit" and credit_statements:
            statement = credit_statements.get(wallet.get("id"))
            if statement:
                amount_due = statement.get("amount_due", "0")
                minimum_due = statement.get("minimum_due", "0")
                amount_text = _format_amount_for_display(amount_due, currency)
                try:
                    settlement_date = date.fromisoformat(str(statement.get("settlement_date")))
                except Exception:
                    settlement_date = None
                status_text = "no settlement date"
                if settlement_date:
                    delta_days = (settlement_date - today).days
                    if delta_days < 0:
                        status_text = f"overdue by {abs(delta_days)} day(s)"
                    elif delta_days == 0:
                        status_text = "due today"
                    elif delta_days == 1:
                        status_text = "due tomorrow"
                    elif delta_days <= 5:
                        status_text = f"due in {delta_days} days"
                    else:
                        status_text = f"due {settlement_date.isoformat()}"
                extras.append(
                    f"bill {amount_text} ({status_text})"
                )
                try:
                    minimum_decimal = Decimal(str(minimum_due))
                    amount_decimal = Decimal(str(amount_due))
                except (InvalidOperation, ValueError):
                    minimum_decimal = amount_decimal = None
                if minimum_decimal is not None and amount_decimal is not None and minimum_decimal < amount_decimal:
                    extras.append(
                        f"minimum {_format_amount_for_display(minimum_due, currency)}"
                    )
        if extras:
            extras_text = ", ".join(_escape_markdown(item) for item in extras)
            parts += f" ({extras_text})"
        lines.append(f"- {parts}")
    lines.append(
        "\nPrefix transactions with @wallet to target a non-default wallet, e.g. "
        "`/add @travel expense 150000 flight`."
    )
    return "\n".join(lines)


async def wallet_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()
    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
    tele_user = query.from_user
    try:
        user = await api_client.ensure_user(tele_user.id, tele_user.full_name if tele_user else None)
    except httpx.HTTPStatusError as exc:
        logger.exception("Failed to ensure Telegram user in backend during wallet callback")
        await query.edit_message_text(f"User sync error: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to ensure Telegram user in backend during wallet callback")
        await query.edit_message_text("Could not sync your Telegram user with the backend.")
        return

    action = query.data.split(":", 1)[1] if ":" in query.data else "list"

    if action == "list":
        try:
            await _send_wallet_overview(update, context, api_client, user["id"], refresh=True)
        except Exception:
            logger.exception("Failed to load wallets during callback")
            await query.edit_message_text("Could not load wallets right now.")
        return

    if action == "add":
        message = (
            "Use `/wallet add <name> <regular|investment|credit> [currency=IDR] "
            "[limit=...] [settlement=day] [default=yes|no]` to create a wallet."
        )
        await query.edit_message_text(message, parse_mode=ParseMode.MARKDOWN, reply_markup=WALLET_INLINE_KEYBOARD)
        return

    if action == "statement":
        message = (
            "Show card bills with `/wallet credit statement <wallet> [reference=YYYY-MM-DD]`."
        )
        await query.edit_message_text(message, parse_mode=ParseMode.MARKDOWN, reply_markup=WALLET_INLINE_KEYBOARD)
        return

    if action == "roe":
        message = (
            "Check investment performance with `/wallet investment roe <wallet> "
            "[start=YYYY-MM-DD] [end=YYYY-MM-DD]`."
        )
        await query.edit_message_text(message, parse_mode=ParseMode.MARKDOWN, reply_markup=WALLET_INLINE_KEYBOARD)
        return

    if action == "transfer":
        message = (
            "Transfer funds with `/wallet transfer <amount> <from_wallet> <to_wallet> [note]`.\n"
            "Example: `/wallet transfer 50000 Main Investment`."
        )
        await query.edit_message_text(message, parse_mode=ParseMode.MARKDOWN, reply_markup=WALLET_INLINE_KEYBOARD)
        return

    if action == "default":
        message = "Change the default wallet with `/wallet default <name>`."
        await query.edit_message_text(message, parse_mode=ParseMode.MARKDOWN, reply_markup=WALLET_INLINE_KEYBOARD)
        return

    await query.edit_message_text("Wallet command not recognised.", reply_markup=WALLET_INLINE_KEYBOARD)


async def _send_wallet_overview(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user_id: str,
    *,
    refresh: bool = False,
) -> None:
    wallets = await _load_wallets(context, api_client, user_id, refresh=refresh)
    credit_statements: dict[str, dict[str, Any]] = {}
    if wallets:
        credit_statements = await _prefetch_credit_statements(context, api_client, user_id, wallets)
    overview = _format_wallet_overview(wallets, credit_statements=credit_statements)
    user_state = _ensure_user_state(context)
    user_state["wallet_user_id"] = user_id
    message_obj = getattr(update, "message", None)
    callback_obj = getattr(update, "callback_query", None)
    if message_obj is not None:
        await message_obj.reply_text(overview, parse_mode=ParseMode.MARKDOWN, reply_markup=WALLET_INLINE_KEYBOARD)
    elif callback_obj is not None:
        await callback_obj.edit_message_text(
            overview,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=WALLET_INLINE_KEYBOARD,
        )


async def wallet_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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

    args = list(getattr(context, "args", []) or [])
    if not args or args[0].lower() in {"menu", "overview"}:
        await _send_wallet_overview(update, context, api_client, user["id"], refresh=True)
        return

    if args[0].lower() in {"list", "ls"}:
        await _send_wallet_overview(update, context, api_client, user["id"], refresh=True)
        return

    subcommand = args[0].lower()

    if subcommand == "credit":
        await _handle_wallet_credit(update, context, api_client, user, args[1:])
        return

    if subcommand in {"investment", "invest"}:
        await _handle_wallet_investment(update, context, api_client, user, args[1:])
        return

    if subcommand == "add":
        if len(args) < 3:
            await update.message.reply_text(
                "Usage: /wallet add <name> <regular|investment|credit> "
                "[currency=IDR] [limit=100000] [settlement=25] [default=yes|no]"
            )
            return
        name = args[1]
        wallet_type = args[2].lower()
        if wallet_type not in WALLET_TYPES:
            await update.message.reply_text(
                f"Unknown wallet type '{wallet_type}'. Choose from regular, investment, credit."
            )
            return
        options = _parse_wallet_options(args[3:])
        currency = options.get("currency", "IDR").upper()
        if len(currency) != 3:
            await update.message.reply_text("Currency must be a 3-letter ISO code.")
            return
        payload: dict[str, Any] = {
            "user_id": user["id"],
            "name": name,
            "type": wallet_type,
            "currency": currency,
        }
        if "limit" in options:
            try:
                limit_value = Decimal(options["limit"])
                if limit_value < 0:
                    raise ValueError
                payload["credit_limit"] = str(limit_value.quantize(Decimal("0.01")))
            except Exception:
                await update.message.reply_text("Credit limit must be a positive number.")
                return
        if "settlement" in options:
            try:
                settlement_day = int(options["settlement"])
            except ValueError:
                await update.message.reply_text("Settlement day must be a number between 1 and 31.")
                return
            if not 1 <= settlement_day <= 31:
                await update.message.reply_text("Settlement day must be between 1 and 31.")
                return
            payload["settlement_day"] = settlement_day
        if "default" in options:
            payload["make_default"] = _parse_bool_flag(options["default"])

        try:
            wallet = await api_client.create_wallet(payload)
        except httpx.HTTPStatusError as exc:
            await update.message.reply_text(f"Could not create wallet: {exc.response.text}")
            return
        except Exception:
            logger.exception("Failed to create wallet via API")
            await update.message.reply_text("Something went wrong while creating the wallet.")
            return

        await _load_wallets(context, api_client, user["id"], refresh=True)
        message = f"Wallet '{wallet['name']}' ({wallet['type']}) created."
        if wallet.get("is_default"):
            message += " It is now the default wallet."
        await update.message.reply_text(message)
        return

    if subcommand in {"edit", "update"}:
        if len(args) < 2:
            await update.message.reply_text(
                "Usage: /wallet edit <name> [name=new] [currency=...] [limit=...] [settlement=...]"
            )
            return
        target = args[1]
        options = _parse_wallet_options(args[2:])
        if not options:
            await update.message.reply_text(
                "Provide at least one field to update: name=..., currency=..., limit=..., settlement=..."
            )
            return
        try:
            wallet_record = await _get_wallet_by_name(context, api_client, user["id"], target)
        except ValueError as exc:
            await update.message.reply_text(str(exc))
            return

        update_payload: dict[str, Any] = {}
        if "name" in options:
            update_payload["name"] = options["name"]
        if "currency" in options:
            currency = options["currency"].upper()
            if len(currency) != 3:
                await update.message.reply_text("Currency must be a 3-letter ISO code.")
                return
            update_payload["currency"] = currency
        if "limit" in options:
            try:
                limit_value = Decimal(options["limit"])
                if limit_value < 0:
                    raise ValueError
                update_payload["credit_limit"] = str(limit_value.quantize(Decimal("0.01")))
            except Exception:
                await update.message.reply_text("Credit limit must be a positive number.")
                return
        if "settlement" in options:
            try:
                settlement_day = int(options["settlement"])
            except ValueError:
                await update.message.reply_text("Settlement day must be a number between 1 and 31.")
                return
            if not 1 <= settlement_day <= 31:
                await update.message.reply_text("Settlement day must be between 1 and 31.")
                return
            update_payload["settlement_day"] = settlement_day

        if not update_payload:
            await update.message.reply_text("No changes detected.")
            return

        try:
            wallet = await api_client.update_wallet(wallet_record["id"], update_payload)
        except httpx.HTTPStatusError as exc:
            await update.message.reply_text(f"Could not update wallet: {exc.response.text}")
            return
        except Exception:
            logger.exception("Failed to update wallet via API")
            await update.message.reply_text("Something went wrong while updating the wallet.")
            return

        if "default" in options:
            try:
                if _parse_bool_flag(options["default"]):
                    await api_client.set_default_wallet(wallet_record["id"])
            except Exception:
                logger.exception("Failed to update default wallet during edit.")

        await _load_wallets(context, api_client, user["id"], refresh=True)
        await update.message.reply_text(f"Wallet '{wallet.get('name', target)}' updated.")
        return

    if subcommand == "transfer":
        if len(args) < 4:
            await update.message.reply_text(
                "Usage: /wallet transfer <amount> <from_wallet> <to_wallet> [note]"
            )
            return
        amount_token = args[1].replace(",", "")
        try:
            amount = Decimal(amount_token)
        except (InvalidOperation, ValueError):
            await update.message.reply_text("Transfer amount must be a valid number.")
            return
        if amount <= 0:
            await update.message.reply_text("Transfer amount must be positive.")
            return
        source_hint = args[2].lstrip("@")
        target_hint = args[3].lstrip("@")
        if not source_hint or not target_hint:
            await update.message.reply_text(
                "Provide both source and target wallets, e.g. `/wallet transfer 50000 Main Investment`."
            )
            return
        note = " ".join(args[4:]).strip()
        try:
            source_wallet = await _get_wallet_by_name(context, api_client, user["id"], source_hint)
            target_wallet = await _get_wallet_by_name(context, api_client, user["id"], target_hint)
        except ValueError as exc:
            await update.message.reply_text(str(exc))
            return
        if source_wallet.get("id") == target_wallet.get("id"):
            await update.message.reply_text("Choose two different wallets for a transfer.")
            return
        transfer_payload: dict[str, Any] = {
            "source_wallet_id": source_wallet["id"],
            "target_wallet_id": target_wallet["id"],
            "amount": str(amount.quantize(Decimal("0.01"))),
        }
        if note:
            transfer_payload["description"] = note
        try:
            result = await api_client.transfer_wallets(transfer_payload)
        except httpx.HTTPStatusError as exc:
            await update.message.reply_text(f"Could not transfer between wallets: {exc.response.text}")
            return
        except Exception:
            logger.exception("Failed to transfer between wallets via API")
            await update.message.reply_text("Something went wrong while transferring between wallets.")
            return
        await _load_wallets(context, api_client, user["id"], refresh=True)
        source_after = result.get("source_wallet", source_wallet)
        target_after = result.get("target_wallet", target_wallet)
        source_name = source_after.get("name", source_wallet.get("name", "Source wallet"))
        target_name = target_after.get("name", target_wallet.get("name", "Target wallet"))
        currency = source_after.get("currency", source_wallet.get("currency", "IDR"))
        amount_text = _format_amount_for_display(str(amount.quantize(Decimal("0.01"))), currency)
        lines = [
            f"Transferred {amount_text} from {source_name} to {target_name}."
        ]
        source_balance = source_after.get("balance")
        target_balance = target_after.get("balance")
        if source_balance is not None:
            lines.append(
                f"{source_name} balance: {_format_amount_for_display(source_balance, source_after.get('currency', currency))}"
            )
        if target_balance is not None:
            lines.append(
                f"{target_name} balance: {_format_amount_for_display(target_balance, target_after.get('currency', currency))}"
            )
        target_type = (target_after.get("type") or "").lower()
        if target_type == "investment":
            lines.append("Investment wallet topped up. Keep building your savings!")
        elif target_type == "credit":
            lines.append("Credit wallet payment recorded. Remember to monitor the settlement date.")
        await update.message.reply_text("\n".join(lines))
        return

    if subcommand in {"default", "set-default"}:
        if len(args) < 2:
            await update.message.reply_text("Usage: /wallet default <name>")
            return
        target = args[1]
        try:
            wallet_record = await _get_wallet_by_name(context, api_client, user["id"], target)
        except ValueError as exc:
            await update.message.reply_text(str(exc))
            return
        try:
            await api_client.set_default_wallet(wallet_record["id"])
        except httpx.HTTPStatusError as exc:
            await update.message.reply_text(f"Could not set default wallet: {exc.response.text}")
            return
        except Exception:
            logger.exception("Failed to set default wallet")
            await update.message.reply_text("Something went wrong while updating the default wallet.")
            return
        wallets = await _load_wallets(context, api_client, user["id"], refresh=True)
        default_wallet = next((w for w in wallets if w.get("is_default")), wallet_record)
        await update.message.reply_text(f"Default wallet set to '{default_wallet['name']}'.")
        return

    usage = (
        "Wallet usage:\n"
        "/wallet add <name> <regular|investment|credit> [currency=IDR] [limit=...] [settlement=day] [default=yes|no]\n"
        "/wallet edit <name> [name=new] [currency=...] [limit=...] [settlement=day]\n"
        "/wallet transfer <amount> <from_wallet> <to_wallet> [note]\n"
        "/wallet default <name>\n"
        "/wallet list"
    )
    await update.message.reply_text(usage)




async def recent(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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

    args = list(getattr(context, "args", []) or [])
    try:
        wallet_hint, limit_arg, since, page_size_arg = _parse_recent_args(args)
    except ValueError as exc:
        await update.message.reply_text(str(exc))
        return

    page_size_value = page_size_arg or RECENT_DEFAULT_LIMIT
    page_size_value = max(1, min(page_size_value, 50))
    max_results = limit_arg
    if max_results is not None:
        page_size_value = min(page_size_value, max_results)

    wallet_record = None
    if wallet_hint:
        try:
            wallet_record = await _get_wallet_by_name(context, api_client, user["id"], wallet_hint)
        except ValueError as exc:
            await update.message.reply_text(str(exc))
            return

    filters = {
        "wallet_id": wallet_record["id"] if wallet_record else None,
        "wallet_name": wallet_record["name"] if wallet_record else None,
        "since": since,
        "page_size": page_size_value,
        "max_results": max_results,
    }

    page_text, keyboard, count, has_next = await _generate_recent_page(
        context, api_client, user, filters, offset=0
    )

    await update.message.reply_text(
        page_text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard
    )

    user_state = _ensure_user_state(context)
    if keyboard:
        stored_filters = filters.copy()
        stored_filters["user_id"] = user["id"]
        stored_filters["has_next"] = has_next
        user_state["recent_filters"] = stored_filters
        user_state["recent_offset"] = 0
    else:
        user_state.pop("recent_filters", None)
        user_state.pop("recent_offset", None)


async def recent_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()
    user_state = _ensure_user_state(context)
    filters = user_state.get("recent_filters")
    if not filters:
        await query.edit_message_text("Session expired. Run /recent again.")
        return

    direction = query.data.split(":", 1)[1] if ":" in query.data else ""
    offset = user_state.get("recent_offset", 0)
    page_size = filters["page_size"]
    if direction == "next":
        offset += page_size
    elif direction == "prev":
        offset = max(0, offset - page_size)

    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
    user = {"id": filters["user_id"]}

    page_text, keyboard, count, has_next = await _generate_recent_page(
        context, api_client, user, filters, offset
    )
    if count == 0 and direction == "next" and offset > 0:
        offset = max(0, offset - page_size)
        page_text, keyboard, count, has_next = await _generate_recent_page(
            context, api_client, user, filters, offset
        )

    filters["has_next"] = has_next
    user_state["recent_offset"] = offset
    user_state["recent_filters"] = filters
    await query.edit_message_text(
        page_text, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard
    )


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

    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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

    wallet_hint: str | None = None
    caption = (update.message.caption or "").strip()
    if caption:
        for token in caption.split():
            if token.startswith("@") and len(token) > 1:
                wallet_hint = token[1:].strip()
                if wallet_hint:
                    break
    wallet_label: str | None = None
    wallet_id: str | None = None
    if wallet_hint:
        try:
            wallet_record = await _get_wallet_by_name(context, api_client, user["id"], wallet_hint)
        except ValueError as exc:
            await status_message.edit_text(str(exc))
            return
        wallet_id = wallet_record.get("id")
        wallet_label = wallet_record.get("name")

    parse_kwargs: dict[str, Any] = {"user_id": user["id"]}
    if wallet_id:
        parse_kwargs["wallet_id"] = wallet_id

    try:
        data = await api_client.parse_receipt(
            image_bytes,
            **parse_kwargs,
        )
    except httpx.HTTPStatusError as exc:
        await status_message.edit_text(f"Receipt error: {exc.response.text}")
    except Exception:
        logger.exception("Failed to parse receipt via API")
        await status_message.edit_text("Something went wrong while processing the receipt.")
    else:
        amount_text = _format_amount_for_display(data["amount"], data["currency"])
        if not wallet_label and data.get("wallet_id"):
            wallet_lookup = await _get_wallet_by_id(context, api_client, user["id"], data["wallet_id"])
            if wallet_lookup:
                wallet_label = wallet_lookup.get("name")
        wallet_suffix = f" (wallet: {_escape_markdown(wallet_label)})" if wallet_label else ""
        await status_message.edit_text(
            f"Receipt saved as {data['type']} of {amount_text} "
            f"for *{_escape_markdown(data.get('description') or 'no description')}*{wallet_suffix}.",
            parse_mode=ParseMode.MARKDOWN,
        )


def _parse_quick_entry(text: str) -> tuple[str | None, TransactionType, Decimal, str]:
    tokens = text.strip().split()
    wallet_hint: str | None = None
    if tokens and tokens[0].startswith("@"):
        wallet_hint = tokens.pop(0)[1:].strip()
        if not wallet_hint:
            raise ValueError("Provide a wallet name after '@', e.g. `@travel expense 500`.")
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
    return wallet_hint, tx_type, amount_value, description


async def _create_transaction(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    tx_type: TransactionType | str,
    amount_raw: Decimal | str,
    description: str,
    *,
    wallet_hint: str | None = None,
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

    api_client: "FinanceApiClient" = context.application.bot_data["api_client"]
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

    wallet_record: dict[str, Any] | None = None
    if wallet_hint:
        try:
            wallet_record = await _get_wallet_by_name(context, api_client, user["id"], wallet_hint)
        except ValueError as exc:
            await update.message.reply_text(str(exc))
            return
        payload_wallet_id = wallet_record.get("id")
    else:
        payload_wallet_id = None

    payload = {
        "type": tx_type_enum.value,
        "amount": str(amount.quantize(Decimal("0.01"))),
        "description": description,
        "occurred_at": _local_today().isoformat(),
        "currency": "IDR",
        "source": "telegram",
        "user_id": user["id"],
    }
    if payload_wallet_id:
        payload["wallet_id"] = payload_wallet_id
    try:
        data = await api_client.create_transaction(payload)
    except httpx.HTTPStatusError as exc:
        await update.message.reply_text(f"API error: {exc.response.text}")
    except Exception:
        logger.exception("Failed to create transaction via API")
        await update.message.reply_text("Something went wrong while saving the transaction.")
    else:
        amount_text = _format_amount_for_display(data["amount"], data["currency"])
        wallet_label: str | None = wallet_record["name"] if wallet_record else None
        wallet_id = data.get("wallet_id")
        if wallet_id and not wallet_label:
            wallet_lookup = await _get_wallet_by_id(context, api_client, user["id"], wallet_id)
            if wallet_lookup:
                wallet_label = wallet_lookup.get("name")
        description_text = _escape_markdown(str(data.get("description") or "no description"))
        wallet_suffix = f" (wallet: {_escape_markdown(wallet_label)})" if wallet_label else ""
        message_text = (
            f"Saved {data['type']} of {amount_text} "
            f"for *{description_text}*{wallet_suffix}."
        )
        await update.message.reply_text(message_text, parse_mode=ParseMode.MARKDOWN)


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
    application.add_handler(CommandHandler("recent", recent))
    application.add_handler(CommandHandler(["wallet", "wallets"], wallet_command))
    application.add_handler(CallbackQueryHandler(help_callback, pattern=f"^{HELP_CALLBACK_PREFIX}"))
    application.add_handler(CallbackQueryHandler(wallet_callback, pattern=f"^{WALLET_CALLBACK_PREFIX}"))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, free_text_transaction))
    application.add_handler(MessageHandler(filters.PHOTO, receipt_photo))
    application.add_handler(CallbackQueryHandler(recent_callback, pattern=f"^{RECENT_CALLBACK_PREFIX}"))
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
                        BotCommand("wallet", "Manage wallets"),
                        BotCommand("recent", "Show recent transactions"),
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


def _partition_option_tokens(tokens: list[str]) -> tuple[dict[str, str], list[str]]:
    """Split tokens into key=value options and free-text tokens."""
    options: dict[str, str] = {}
    free_tokens: list[str] = []
    for token in tokens:
        if "=" in token:
            key, value = token.split("=", 1)
            options[key.strip().lower()] = value.strip()
        else:
            free_tokens.append(token)
    return options, free_tokens


def _parse_amount_token(raw: str) -> Decimal:
    try:
        return Decimal(raw.replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid amount '{raw}'.") from exc


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Dates must be in YYYY-MM-DD format.") from exc


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
        f"  - Installment #{installment.get('installment_number', '?')} due {due_date}: "
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

def _format_credit_statement_message(wallet: dict[str, Any], statement: dict[str, Any]) -> str:
    currency = wallet.get("currency", "IDR")
    wallet_name = _escape_markdown(wallet.get("name", "Unnamed"))
    period_start = _escape_markdown(str(statement.get("period_start")))
    period_end = _escape_markdown(str(statement.get("period_end")))
    settlement = _escape_markdown(str(statement.get("settlement_date")))
    amount_due_text = _escape_markdown(
        _format_amount_for_display(statement.get("amount_due", "0"), currency)
    )
    minimum_due_value = statement.get("minimum_due", "0")
    minimum_due_text = _escape_markdown(
        _format_amount_for_display(minimum_due_value, currency)
    )
    amount_due_value = statement.get("amount_due", "0")

    lines = [
        f"*{wallet_name} credit statement*",
        f"Period: {period_start} - {period_end}",
        f"Settlement: {settlement}",
        f"Amount due: {amount_due_text}",
    ]
    try:
        minimum_decimal = Decimal(str(minimum_due_value))
        amount_decimal = Decimal(str(amount_due_value))
    except (InvalidOperation, ValueError):
        minimum_decimal = amount_decimal = None
    if minimum_decimal is not None and amount_decimal is not None and minimum_decimal < amount_decimal:
        lines.append(f"Minimum due: {minimum_due_text}")

    installments = statement.get("installments") or []
    if installments:
        lines.append("")
        lines.append("Due installments:")
        for installment in installments:
            number = installment.get("installment_number", "?")
            due_date = installment.get("due_date", "n/a")
            inst_amount = _escape_markdown(
                _format_amount_for_display(installment.get("amount_due", "0"), currency)
            )
            lines.append(f"- #{number} due {due_date}: {inst_amount}")
    else:
        lines.append("")
        lines.append("No installments due for this cycle.")

    return "\n".join(lines)


async def _handle_wallet_credit(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user: dict[str, Any],
    args: list[str],
) -> None:
    message = update.message
    if not message:
        return
    if not args:
        await message.reply_text(
            "Usage: /wallet credit <purchase|repay|statement> <wallet> ..."
        )
        return

    action = args[0].lower()
    if action not in {"purchase", "repay", "statement"}:
        await message.reply_text(
            "Unknown credit command. Use purchase, repay, or statement."
        )
        return

    if len(args) < 2:
        await message.reply_text("Please specify which credit wallet to use.")
        return

    wallet_hint = args[1].lstrip("@")
    try:
        wallet_record = await _get_wallet_by_name(context, api_client, user["id"], wallet_hint)
    except ValueError as exc:
        await message.reply_text(str(exc))
        return

    if wallet_record.get("type") != "credit":
        await message.reply_text(
            f"Wallet '{wallet_record.get('name')}' is not a credit wallet."
        )
        return

    if action == "statement":
        option_tokens, _ = _partition_option_tokens(args[2:])
        reference_token = option_tokens.get("reference") or option_tokens.get("date")
        reference_value: str | None = None
        if reference_token:
            try:
                reference_value = _parse_iso_date(reference_token).isoformat()
            except ValueError as exc:
                await message.reply_text(str(exc))
                return
        try:
            statement = await api_client.credit_statement(
                wallet_record["id"],
                reference_date=reference_value,
            )
        except httpx.HTTPStatusError as exc:
            await message.reply_text(f"Could not fetch statement: {exc.response.text}")
            return
        except Exception:
            logger.exception("Failed to fetch credit statement via bot")
            await message.reply_text("Something went wrong while fetching the statement.")
            return

        text = _format_credit_statement_message(wallet_record, statement)
        await message.reply_text(text, parse_mode=ParseMode.MARKDOWN)
        return

    if action == "purchase":
        if len(args) < 3:
            await message.reply_text(
                "Usage: /wallet credit purchase <wallet> <amount> [installments=3] [beneficiary=Name] [desc=...]"
            )
            return
        try:
            amount = _parse_amount_token(args[2])
        except ValueError as exc:
            await message.reply_text(str(exc))
            return
        options, free_tokens = _partition_option_tokens(args[3:])
        description = " ".join(free_tokens).strip()
        if options.get("desc"):
            description = options["desc"]
        installment_token = (
            options.get("installments")
            or options.get("installment")
            or options.get("inst")
        )
        installments = 1
        if installment_token:
            try:
                installments = int(installment_token)
            except ValueError:
                await message.reply_text("Installments must be a number, e.g. installments=3.")
                return
            if installments <= 0:
                await message.reply_text("Installments must be at least 1.")
                return
        occurred_token = options.get("date") or options.get("occurred") or options.get("occurred_at")
        if occurred_token:
            try:
                occurred_at = _parse_iso_date(occurred_token)
            except ValueError as exc:
                await message.reply_text(str(exc))
                return
        else:
            occurred_at = _local_today()
        beneficiary = options.get("beneficiary")

        payload: dict[str, Any] = {
            "amount": str(amount.quantize(Decimal("0.01"))),
            "installments": installments,
            "occurred_at": occurred_at.isoformat(),
        }
        if description:
            payload["description"] = description
        if beneficiary:
            payload["beneficiary_name"] = beneficiary

        try:
            debt = await api_client.credit_purchase(wallet_record["id"], payload)
        except httpx.HTTPStatusError as exc:
            await message.reply_text(f"Could not record credit purchase: {exc.response.text}")
            return
        except Exception:
            logger.exception("Failed to record credit purchase via bot")
            await message.reply_text("Something went wrong while saving the credit purchase.")
            return

        installments_data = debt.get("installments") or []
        next_installment_text = None
        if installments_data:
            try:
                first_due = min(
                    installments_data,
                    key=lambda inst: inst.get("due_date") or "9999-12-31",
                )
                due_date = first_due.get("due_date", "n/a")
                amount_due = _format_amount_for_display(first_due.get("amount", "0"), wallet_record.get("currency", "IDR"))
                next_installment_text = f"First installment #{first_due.get('installment_number', '?')} due {due_date} ({amount_due})."
            except Exception:
                next_installment_text = None

        amount_text = _escape_markdown(
            _format_amount_for_display(amount, wallet_record.get("currency", "IDR"))
        )
        lines = [
            f"Recorded credit purchase of {amount_text} on {occurred_at.isoformat()} for {_escape_markdown(wallet_record.get('name', 'wallet'))}."
        ]
        if description:
            lines.append(f"Note: {_escape_markdown(description)}")
        if beneficiary:
            lines.append(f"Beneficiary: {_escape_markdown(beneficiary)}")
        lines.append(f"Installments created: {installments}.")
        if next_installment_text:
            lines.append(_escape_markdown(next_installment_text))

        await message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)
        await _load_wallets(context, api_client, user["id"], refresh=True)
        return

    # action == "repay"
    if len(args) < 3:
        await message.reply_text(
            "Usage: /wallet credit repay <wallet> <amount> [from=@wallet] [beneficiary=Name] [desc=...]"
        )
        return
    try:
        amount = _parse_amount_token(args[2])
    except ValueError as exc:
        await message.reply_text(str(exc))
        return
    options, free_tokens = _partition_option_tokens(args[3:])
    description = " ".join(free_tokens).strip()
    if options.get("desc"):
        description = options["desc"]
    occurred_token = options.get("date") or options.get("occurred") or options.get("occurred_at")
    if occurred_token:
        try:
            occurred_at = _parse_iso_date(occurred_token)
        except ValueError as exc:
            await message.reply_text(str(exc))
            return
    else:
        occurred_at = _local_today()
    beneficiary = options.get("beneficiary")

    source_hint = options.get("from") or options.get("source")
    source_wallet_record: dict[str, Any] | None = None
    if source_hint:
        normalised = source_hint.lstrip("@")
        try:
            source_wallet_record = await _get_wallet_by_name(context, api_client, user["id"], normalised)
        except ValueError as exc:
            await message.reply_text(str(exc))
            return

    payload: dict[str, Any] = {
        "amount": str(amount.quantize(Decimal("0.01"))),
        "occurred_at": occurred_at.isoformat(),
    }
    if description:
        payload["description"] = description
    if beneficiary:
        payload["beneficiary_name"] = beneficiary
    if source_wallet_record:
        payload["source_wallet_id"] = source_wallet_record.get("id")

    try:
        repayment = await api_client.credit_repayment(wallet_record["id"], payload)
    except httpx.HTTPStatusError as exc:
        await message.reply_text(f"Could not record repayment: {exc.response.text}")
        return
    except Exception:
        logger.exception("Failed to record credit repayment via bot")
        await message.reply_text("Something went wrong while saving the repayment.")
        return

    currency = wallet_record.get("currency", "IDR")
    amount_text = _escape_markdown(_format_amount_for_display(amount, currency))
    wallet_label = _escape_markdown(wallet_record.get("name", "wallet"))
    source_label = None
    if repayment.get("source_wallet"):
        source_label = _escape_markdown(repayment["source_wallet"].get("name", ""))
    elif source_wallet_record:
        source_label = _escape_markdown(source_wallet_record.get("name", ""))

    lines = [f"Applied repayment of {amount_text} to {wallet_label}."]
    if source_label:
        lines.append(f"Source wallet: {source_label}.")
    if description:
        lines.append(f"Note: {_escape_markdown(description)}")
    if beneficiary:
        lines.append(f"Beneficiary tag: {_escape_markdown(beneficiary)}")

    try:
        unapplied = Decimal(str(repayment.get("unapplied_amount", "0")))
    except (InvalidOperation, ValueError):
        unapplied = Decimal("0")
    if unapplied > Decimal("0"):
        unapplied_text = _escape_markdown(_format_amount_for_display(unapplied, currency))
        lines.append(f"Unapplied balance: {unapplied_text} (will remain on the card).")

    statement_summary = None
    try:
        statement = await api_client.credit_statement(wallet_record["id"])
        amount_due = _escape_markdown(
            _format_amount_for_display(statement.get("amount_due", "0"), currency)
        )
        settlement = statement.get("settlement_date", "n/a")
        statement_summary = f"Current bill: {amount_due} due {settlement}."
    except Exception:
        logger.exception("Failed to refresh credit statement after repayment")

    if statement_summary:
        lines.append(_escape_markdown(statement_summary))

    await message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)
    await _load_wallets(context, api_client, user["id"], refresh=True)


async def _handle_wallet_investment(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    api_client: FinanceApiClient,
    user: dict[str, Any],
    args: list[str],
) -> None:
    message = update.message
    if not message:
        return
    if not args:
        await message.reply_text("Usage: /wallet investment roe <wallet> [start=YYYY-MM-DD] [end=YYYY-MM-DD]")
        return

    action = args[0].lower()
    if action != "roe":
        await message.reply_text("Only the 'roe' action is supported for investment wallets.")
        return

    if len(args) < 2:
        await message.reply_text("Please specify which investment wallet to analyse.")
        return

    wallet_hint = args[1].lstrip("@")
    try:
        wallet_record = await _get_wallet_by_name(context, api_client, user["id"], wallet_hint)
    except ValueError as exc:
        await message.reply_text(str(exc))
        return

    if wallet_record.get("type") != "investment":
        await message.reply_text(
            f"Wallet '{wallet_record.get('name')}' is not an investment wallet."
        )
        return

    options, _ = _partition_option_tokens(args[2:])
    start_token = options.get("start") or options.get("from")
    end_token = options.get("end") or options.get("to")
    start_iso: str | None = None
    end_iso: str | None = None
    if start_token:
        try:
            start_iso = _parse_iso_date(start_token).isoformat()
        except ValueError as exc:
            await message.reply_text(str(exc))
            return
    if end_token:
        try:
            end_iso = _parse_iso_date(end_token).isoformat()
        except ValueError as exc:
            await message.reply_text(str(exc))
            return

    try:
        roe = await api_client.investment_roe(
            wallet_record["id"],
            start_date=start_iso,
            end_date=end_iso,
        )
    except httpx.HTTPStatusError as exc:
        await message.reply_text(f"Could not calculate ROE: {exc.response.text}")
        return
    except ValueError as exc:
        await message.reply_text(str(exc))
        return
    except Exception:
        logger.exception("Failed to calculate investment ROE via bot")
        await message.reply_text("Something went wrong while calculating ROE.")
        return

    currency = wallet_record.get("currency", "IDR")
    wallet_name = _escape_markdown(wallet_record.get("name", "wallet"))
    contributions = _escape_markdown(
        _format_amount_for_display(roe.get("contributions", "0"), currency)
    )
    withdrawals = _escape_markdown(
        _format_amount_for_display(roe.get("withdrawals", "0"), currency)
    )
    net_gain = _escape_markdown(
        _format_amount_for_display(roe.get("net_gain", "0"), currency)
    )
    try:
        roe_percentage = Decimal(str(roe.get("roe_percentage", "0")))
    except (InvalidOperation, ValueError):
        roe_percentage = Decimal("0")
    roe_text = f"{roe_percentage.quantize(Decimal('0.01'))}%"

    lines = [
        f"*{wallet_name} investment ROE*",
        f"Period: {_escape_markdown(str(roe.get('period_start')))} - {_escape_markdown(str(roe.get('period_end')))}",
        f"Contributions: {contributions}",
        f"Withdrawals: {withdrawals}",
        f"Net gain: {net_gain}",
        f"ROE: {_escape_markdown(roe_text)}",
    ]
    try:
        contrib_value = Decimal(str(roe.get("contributions", "0")))
    except (InvalidOperation, ValueError):
        contrib_value = Decimal("0")
    if contrib_value == 0:
        lines.append("Note: Contributions are zero for this period, so ROE is shown as 0%.")

    await message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)
