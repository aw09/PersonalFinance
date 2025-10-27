from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.transaction import Transaction, TransactionType
from ..schemas.transaction import TransactionCreate


def _decimal_to_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


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
    transaction = Transaction(
        type=payload.type,
        amount=payload.amount,
        currency=payload.currency,
        description=payload.description,
        category=payload.category,
        occurred_at=payload.occurred_at,
        source=payload.source,
        items=_normalise_items(
            [item.model_dump(exclude_none=True) for item in payload.items] if payload.items else None
        ),
        metadata=payload.metadata,
    )
    session.add(transaction)
    await session.commit()
    await session.refresh(transaction)
    return transaction


async def list_transactions(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    transaction_type: Optional[TransactionType] = None,
) -> Sequence[Transaction]:
    """Retrieve transactions with optional type filter."""
    stmt: Select[tuple[Transaction]] = select(Transaction).order_by(
        Transaction.occurred_at.desc(), Transaction.created_at.desc()
    )
    if transaction_type:
        stmt = stmt.where(Transaction.type == transaction_type)
    result = await session.execute(stmt.limit(limit).offset(offset))
    return result.scalars().all()


async def get_transaction(session: AsyncSession, transaction_id: Any) -> Optional[Transaction]:
    return await session.get(Transaction, transaction_id)
