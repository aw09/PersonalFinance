from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.debt import Debt, DebtInstallment
from ..schemas.debt import DebtCreate, DebtUpdate, InstallmentPaymentRequest


def _add_months(source: date, months: int) -> date:
    """Return a new date shifted by a number of months."""
    month = source.month - 1 + months
    year = source.year + month // 12
    month = month % 12 + 1
    day = min(
        source.day,
        [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
            month - 1
        ],
    )
    return date(year, month, day)


async def create_debt(session: AsyncSession, payload: DebtCreate) -> Debt:
    """Create a debt and auto-generate its installment schedule."""
    debt = Debt(
        name=payload.name,
        description=payload.description,
        principal_amount=payload.principal_amount,
        total_installments=payload.total_installments,
        start_date=payload.start_date,
        interest_rate=payload.interest_rate,
    )
    session.add(debt)
    await session.flush()

    base_amount = Decimal(payload.principal_amount) / Decimal(payload.total_installments)
    base_amount = base_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    installments: list[DebtInstallment] = []
    for n in range(payload.total_installments):
        due_date = _add_months(payload.start_date, n * payload.frequency_months)
        installments.append(
            DebtInstallment(
                debt_id=debt.id,
                installment_number=n + 1,
                due_date=due_date,
                amount=base_amount,
            )
        )
    session.add_all(installments)
    await session.commit()
    await session.refresh(debt)
    return debt


async def list_debts(session: AsyncSession) -> list[Debt]:
    stmt = select(Debt).order_by(Debt.created_at.desc())
    result = await session.execute(stmt)
    return result.scalars().unique().all()


async def get_debt(session: AsyncSession, debt_id: UUID) -> Optional[Debt]:
    return await session.get(Debt, debt_id)


async def update_debt(session: AsyncSession, debt: Debt, payload: DebtUpdate) -> Debt:
    if payload.description is not None:
        debt.description = payload.description
    if payload.status is not None:
        debt.status = payload.status
    await session.commit()
    await session.refresh(debt)
    return debt


async def mark_installment_paid(
    session: AsyncSession,
    installment: DebtInstallment,
    payload: InstallmentPaymentRequest,
) -> DebtInstallment:
    installment.paid = True
    installment.paid_at = payload.paid_at
    installment.transaction_id = payload.transaction_id
    await session.commit()
    await session.refresh(installment)
    return installment


async def get_installment(session: AsyncSession, installment_id: UUID) -> Optional[DebtInstallment]:
    return await session.get(DebtInstallment, installment_id)
