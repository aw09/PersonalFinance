from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlalchemy import Enum as SqlEnum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class WalletType(str, Enum):
    REGULAR = "regular"
    INVESTMENT = "investment"
    CREDIT = "credit"


class Wallet(Base):
    __tablename__ = "wallets"

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[WalletType] = mapped_column(SqlEnum(WalletType), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="IDR", nullable=False)
    credit_limit: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    settlement_day: Mapped[Optional[int]] = mapped_column(nullable=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="wallets", foreign_keys=[user_id])
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="wallet")


from .transaction import Transaction  # noqa: E402
from .user import User  # noqa: E402
