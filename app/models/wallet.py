from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlalchemy import Enum as SqlEnum, ForeignKey, Numeric, String
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class WalletType(str, Enum):
    REGULAR = "regular"
    INVESTMENT = "investment"
    CREDIT = "credit"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            for member in cls:
                if member.value == normalized:
                    return member
        return None


class WalletTypeDb(TypeDecorator):
    impl = SqlEnum(
        "regular",
        "investment",
        "credit",
        name="wallettype",
        create_type=False,
        native_enum=True,
    )

    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, WalletType):
            value = value.value
        return value.lower()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return WalletType(value.lower())


class Wallet(Base):
    __tablename__ = "wallets"

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[WalletType] = mapped_column(WalletTypeDb(), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="IDR", nullable=False)
    credit_limit: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    settlement_day: Mapped[Optional[int]] = mapped_column(nullable=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="wallets", foreign_keys=[user_id])
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="wallet")


from .transaction import Transaction  # noqa: E402
from .user import User  # noqa: E402
