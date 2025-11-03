from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..models.wallet import Wallet, WalletType
from ..schemas.transaction import TransactionCreate
from ..schemas.wallet import WalletCreate, WalletUpdate, WalletTransactionRequest


async def ensure_default_wallet(session: AsyncSession, user_id: UUID) -> Wallet:
    user_obj = await session.get(User, user_id)
    if not user_obj:
        raise ValueError("User not found")

    if user_obj.default_wallet_id:
        wallet = await session.get(Wallet, user_obj.default_wallet_id)
        if wallet:
            return wallet

    wallet: Wallet | None = None
    result = await session.execute(
        select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.created_at.asc())
    )
    existing_wallets = result.scalars().all()
    if existing_wallets:
        wallet = next((w for w in existing_wallets if w.type == WalletType.REGULAR), existing_wallets[0])

    created_new = False
    if not wallet:
        wallet = Wallet(
            name="Main Wallet",
            type=WalletType.REGULAR,
            user_id=user_id,
            currency="IDR",
        )
        session.add(wallet)
        await session.flush()
        created_new = True

    user_obj.default_wallet_id = wallet.id
    await session.commit()
    if created_new:
        await session.refresh(wallet)
    return wallet


async def list_wallets(session: AsyncSession, user_id: UUID) -> list[Wallet]:
    result = await session.execute(
        select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.created_at.asc())
    )
    return result.scalars().all()


async def get_wallet(session: AsyncSession, wallet_id: UUID) -> Optional[Wallet]:
    return await session.get(Wallet, wallet_id)


async def create_wallet(session: AsyncSession, payload: WalletCreate) -> Wallet:
    wallet = Wallet(
        name=payload.name,
        type=payload.type,
        user_id=payload.user_id,
        currency=payload.currency,
        credit_limit=payload.credit_limit,
        settlement_day=payload.settlement_day,
    )
    session.add(wallet)
    await session.commit()
    await session.refresh(wallet)

    if payload.make_default:
        await set_default_wallet(session, wallet)
    return wallet


async def update_wallet(session: AsyncSession, wallet: Wallet, payload: WalletUpdate) -> Wallet:
    if payload.name is not None:
        wallet.name = payload.name
    if payload.currency is not None:
        wallet.currency = payload.currency
    if payload.credit_limit is not None:
        wallet.credit_limit = payload.credit_limit
    if payload.settlement_day is not None:
        wallet.settlement_day = payload.settlement_day
    await session.commit()
    await session.refresh(wallet)
    return wallet


async def set_default_wallet(session: AsyncSession, wallet: Wallet) -> Wallet:
    user = await session.get(User, wallet.user_id)
    if not user:
        raise ValueError("User not found")
    user.default_wallet_id = wallet.id
    await session.commit()
    await session.refresh(wallet)
    return wallet


async def _create_wallet_transaction(
    session: AsyncSession,
    wallet: Wallet,
    *,
    amount: Decimal,
    tx_type,
    description: Optional[str],
    occurred_at: Optional[date],
    source: str,
):
    from .transactions import create_transaction

    tx_payload = TransactionCreate(
        type=tx_type,
        amount=amount,
        currency=wallet.currency,
        description=description,
        occurred_at=occurred_at or date.today(),
        user_id=wallet.user_id,
        wallet_id=wallet.id,
        source=source,
    )
    return await create_transaction(session, tx_payload)


async def wallet_deposit(
    session: AsyncSession,
    wallet: Wallet,
    request: WalletTransactionRequest,
):
    from ..models.transaction import TransactionType

    if request.amount <= 0:
        raise ValueError("Deposit amount must be positive")

    return await _create_wallet_transaction(
        session,
        wallet,
        amount=request.amount,
        tx_type=TransactionType.INCOME,
        description=request.description or "Wallet deposit",
        occurred_at=request.occurred_at,
        source="wallet_deposit",
    )


async def wallet_withdraw(
    session: AsyncSession,
    wallet: Wallet,
    request: WalletTransactionRequest,
):
    from ..models.transaction import TransactionType

    if request.amount <= 0:
        raise ValueError("Withdraw amount must be positive")

    return await _create_wallet_transaction(
        session,
        wallet,
        amount=request.amount,
        tx_type=TransactionType.EXPENSE,
        description=request.description or "Wallet withdraw",
        occurred_at=request.occurred_at,
        source="wallet_withdraw",
    )


async def wallet_adjust(
    session: AsyncSession,
    wallet: Wallet,
    request: WalletTransactionRequest,
):
    from ..models.transaction import TransactionType

    amount = request.amount
    description = request.description or "Wallet adjustment"
    if amount == 0:
        raise ValueError("Adjustment amount cannot be zero")

    if amount > 0:
        tx_type = TransactionType.INCOME
        source = "wallet_adjust_increase"
    else:
        tx_type = TransactionType.EXPENSE
        source = "wallet_adjust_decrease"
        amount = abs(amount)

    return await _create_wallet_transaction(
        session,
        wallet,
        amount=amount,
        tx_type=tx_type,
        description=description,
        occurred_at=request.occurred_at,
        source=source,
    )
