from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import Date, Enum as SqlEnum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class TransactionType(str, Enum):
    EXPENDITURE = "expenditure"
    INCOME = "income"
    DEBT = "debt"
    RECEIVABLE = "receivable"


class Transaction(Base):
    """Core financial transaction."""

    __tablename__ = "transactions"

    occurred_at: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    type: Mapped[TransactionType] = mapped_column(SqlEnum(TransactionType), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    items: Mapped[Optional[list[dict]]] = mapped_column(JSONB, nullable=True)
    _metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)

    debt_installment: Mapped[Optional["DebtInstallment"]] = relationship(
        back_populates="transaction", uselist=False
    )

    @property
    def metadata(self) -> Optional[dict]:
        return self._metadata

    @metadata.setter
    def metadata(self, value: Optional[dict]) -> None:
        self._metadata = value


from .debt import DebtInstallment  # noqa: E402  # avoid circular import at runtime
