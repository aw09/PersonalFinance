from __future__ import annotations

from uuid import UUID

from sqlalchemy import BigInteger, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    """Application user identified by their Telegram account."""

    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False, index=True
    )
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    debts: Mapped[list["Debt"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    default_wallet_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("wallets.id", ondelete="SET NULL"), nullable=True
    )
    wallets: Mapped[list["Wallet"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="Wallet.user_id",
    )
    default_wallet: Mapped["Wallet | None"] = relationship(
        "Wallet",
        foreign_keys=[default_wallet_id],
        post_update=True,
        uselist=False,
    )


from .debt import Debt  # noqa: E402
from .transaction import Transaction  # noqa: E402
from .wallet import Wallet  # noqa: E402
