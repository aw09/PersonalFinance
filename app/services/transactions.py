from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.transaction import Transaction, TransactionType
from ..models.wallet import Wallet
from ..schemas.transaction import TransactionCreate
from .wallets import ensure_default_wallet


def _decimal_to_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None



def _apply_wallet_balance(wallet: Wallet, tx_type: TransactionType, amount: Decimal) -> None:
    if wallet.balance is None:
        wallet.balance = Decimal("0")

    if tx_type == TransactionType.INCOME:
        wallet.balance = (wallet.balance or Decimal("0")) + amount
    elif tx_type == TransactionType.EXPENSE:
        wallet.balance = (wallet.balance or Decimal("0")) - amount
    wallet.balance = wallet.balance.quantize(Decimal("0.01"))

async def _resolve_wallet(session: AsyncSession, payload: TransactionCreate) -> Wallet | None:
    if payload.wallet_id:
        wallet = await session.get(Wallet, payload.wallet_id)
        if not wallet:
            raise ValueError("Wallet not found")
        if wallet.user_id != payload.user_id:
            raise ValueError("Wallet does not belong to user")
        return wallet
    return await ensure_default_wallet(session, payload.user_id)

def _normalise_items(items: Optional[list[dict[str, Any]]]) -> Optional[list[dict[str, Any]]]:
    if not items:
        return None
    normalised: list[dict[str, Any]] = []
    for item in items:
        clean = {**item}
        for key in ("quantity", "unit_price", "total_price"):
            if key in clean and clean[key] is not None:
                clean[key] = _decimal_to_float(Decimal(str(clean[key])))
        normalised.append(clean)
    return normalised


async def create_transaction(
    session: AsyncSession,
    payload: TransactionCreate,
) -> Transaction:
    """Persist a new transaction."""
    tx_type = (
        payload.type
        if isinstance(payload.type, TransactionType)
        else TransactionType(str(payload.type).lower())
    )
    wallet = await _resolve_wallet(session, payload)

    transaction = Transaction(
        type=tx_type,
        amount=payload.amount,
        currency=payload.currency,
        description=payload.description,
        category=payload.category,
        occurred_at=payload.occurred_at,
        source=payload.source,
        items=_normalise_items(
            [item.model_dump(exclude_none=True) for item in payload.items] if payload.items else None
        ),
        metadata_json=payload.metadata,
        user_id=payload.user_id,
        wallet_id=wallet.id if wallet else None,
    )
    session.add(transaction)
    if wallet:
        _apply_wallet_balance(wallet, tx_type, payload.amount)
    await session.commit()
    await session.refresh(transaction)
    return transaction


async def list_transactions(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    transaction_type: Optional[TransactionType] = None,
    user_id: Optional[UUID] = None,
    wallet_id: Optional[UUID] = None,
    occurred_after: Optional[date] = None,
    occurred_before: Optional[date] = None,
) -> Sequence[Transaction]:
    """Retrieve transactions with optional type filter."""
    stmt: Select[tuple[Transaction]] = select(Transaction).options(selectinload(Transaction.wallet)).order_by(
        Transaction.occurred_at.desc(), Transaction.created_at.desc()
    )
    if transaction_type:
        stmt = stmt.where(Transaction.type == transaction_type)
    if user_id:
        stmt = stmt.where(Transaction.user_id == user_id)
    if wallet_id:
        stmt = stmt.where(Transaction.wallet_id == wallet_id)
    if occurred_after:
        stmt = stmt.where(Transaction.occurred_at >= occurred_after)
    if occurred_before:
        stmt = stmt.where(Transaction.occurred_at <= occurred_before)
    result = await session.execute(stmt.limit(limit).offset(offset))
    return result.scalars().all()


async def get_transaction(session: AsyncSession, transaction_id: Any) -> Optional[Transaction]:
    return await session.get(Transaction, transaction_id)
