from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from telegram.ext import ContextTypes


def ensure_user_state(context: ContextTypes.DEFAULT_TYPE) -> dict[str, Any]:
    user_data = getattr(context, "user_data", None)
    if user_data is None:
        user_data = {}
        setattr(context, "user_data", user_data)
    return user_data


def normalise_wallet_key(name: str) -> str:
    return " ".join(name.replace("_", " ").split()).casefold()


def parse_bool_flag(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def parse_amount_token(raw: str) -> Decimal:
    try:
        return Decimal(raw.replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid amount '{raw}'.") from exc


def parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Dates must be in YYYY-MM-DD format.") from exc


def format_amount_for_display(amount: str | Decimal, currency: str) -> str:
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return f"{amount} {currency}"

    currency_upper = currency.upper()

    def trimmed(val: Decimal, places: int = 2) -> str:
        quantized = val.quantize(Decimal(1).scaleb(-places))
        s = f"{quantized:,}"
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s

    if currency_upper == "IDR" and value >= Decimal("1000"):
        thousands = (value / Decimal("1000")).quantize(Decimal("1"))
        return f"{thousands:,} K {currency_upper}"
    return f"{trimmed(value)} {currency_upper}"
