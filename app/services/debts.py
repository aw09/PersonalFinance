from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.debt import Debt, DebtInstallment, DebtInstallmentPayment
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
        user_id=payload.user_id,
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
                paid_amount=Decimal("0"),
            )
        )
    session.add_all(installments)
    await session.commit()

    result = await session.execute(
        select(Debt)
        .options(
            selectinload(Debt.installments).selectinload(DebtInstallment.payments)
        )
        .where(Debt.id == debt.id)
    )
    return result.scalar_one()


async def list_debts(session: AsyncSession, *, user_id: Optional[UUID] = None) -> list[Debt]:
    stmt = (
        select(Debt)
        .options(
            selectinload(Debt.installments).selectinload(DebtInstallment.payments)
        )
        .order_by(Debt.created_at.desc())
    )
    if user_id:
        stmt = stmt.where(Debt.user_id == user_id)
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
    current_amount = Decimal(str(installment.amount))
    paid_amount_so_far = Decimal(str(installment.paid_amount or 0))
    payment_amount = Decimal(str(payload.amount)) if payload.amount is not None else current_amount
    if payment_amount <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    new_paid_total = paid_amount_so_far + payment_amount
    capped_total = min(new_paid_total, current_amount)
    fully_paid = capped_total >= current_amount

    payment = DebtInstallmentPayment(
        installment_id=installment.id,
        amount=payment_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        paid_at=payload.paid_at,
        transaction_id=payload.transaction_id,
    )
    session.add(payment)

    installment.paid_amount = capped_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if fully_paid:
        installment.paid = True
        installment.paid_at = payload.paid_at
        installment.transaction_id = payload.transaction_id
    else:
        installment.paid = False
        installment.paid_at = None
        installment.transaction_id = payload.transaction_id
    await session.commit()
    await session.refresh(installment, attribute_names=["payments"])
    return installment


async def get_installment(session: AsyncSession, installment_id: UUID) -> Optional[DebtInstallment]:
    return await session.get(DebtInstallment, installment_id)
