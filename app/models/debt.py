from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Debt(Base):
    """A debt agreement with installment schedule."""

    __tablename__ = "debts"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    principal_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_installments: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    interest_rate: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 3), nullable=True, doc="Optional nominal interest rate (yearly)."
    )
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    installments: Mapped[list["DebtInstallment"]] = relationship(
        back_populates="debt", cascade="all, delete-orphan"
    )
    user: Mapped["User"] = relationship(back_populates="debts")


class DebtInstallment(Base):
    """Individual installment tied to a debt."""

    __tablename__ = "debt_installments"

    debt_id: Mapped[UUID] = mapped_column(ForeignKey("debts.id", ondelete="CASCADE"), nullable=False)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    paid_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    transaction_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    debt: Mapped[Debt] = relationship(back_populates="installments")
    transaction: Mapped[Optional["Transaction"]] = relationship(back_populates="debt_installment")
    payments: Mapped[list["DebtInstallmentPayment"]] = relationship(
        back_populates="installment", cascade="all, delete-orphan"
    )


class DebtInstallmentPayment(Base):
    """Record of a single payment applied to an installment."""

    __tablename__ = "debt_installment_payments"

    installment_id: Mapped[UUID] = mapped_column(
        ForeignKey("debt_installments.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_at: Mapped[date] = mapped_column(Date, nullable=False)
    transaction_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    installment: Mapped["DebtInstallment"] = relationship(back_populates="payments")
    transaction: Mapped[Optional["Transaction"]] = relationship()


from .transaction import Transaction  # noqa: E402  # avoid circular import during definition
from .user import User  # noqa: E402
