from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..models.wallet import Wallet, WalletType
from ..models.transaction import Transaction, TransactionType
from ..schemas.transaction import TransactionCreate
from ..schemas.wallet import (
    CreditPurchaseRequest,
    CreditRepaymentRequest,
    CreditStatementResponse,
    InvestmentRoeResponse,
    StatementInstallment,
    WalletCreate,
    WalletUpdate,
    WalletTransactionRequest,
    WalletTransferRequest,
)


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


async def wallet_transfer(
    session: AsyncSession,
    source_wallet: Wallet,
    target_wallet: Wallet,
    request: WalletTransferRequest,
) -> tuple[Wallet, Wallet]:
    if source_wallet.id == target_wallet.id:
        raise ValueError("Source and target wallets must be different")
    if source_wallet.user_id != target_wallet.user_id:
        raise ValueError("Cannot transfer between wallets from different users")
    if request.amount <= 0:
        raise ValueError("Transfer amount must be positive")
    if source_wallet.currency != target_wallet.currency:
        raise ValueError("Wallet currencies must match before transferring")

    description = request.description
    occurred_at = request.occurred_at

    withdraw_desc = description or f"Transfer to {target_wallet.name}"
    deposit_desc = description or f"Transfer from {source_wallet.name}"

    withdraw_payload = WalletTransactionRequest(
        amount=request.amount,
        description=withdraw_desc,
        occurred_at=occurred_at,
    )
    deposit_payload = WalletTransactionRequest(
        amount=request.amount,
        description=deposit_desc,
        occurred_at=occurred_at,
    )

    await wallet_withdraw(session, source_wallet, withdraw_payload)
    await wallet_deposit(session, target_wallet, deposit_payload)

    await session.refresh(source_wallet)
    await session.refresh(target_wallet)
    return source_wallet, target_wallet


def _ensure_wallet_kind(wallet: Wallet, expected: WalletType) -> None:
    if wallet.type != expected:
        raise ValueError(f"Wallet '{wallet.name}' must be of type '{expected.value}' for this operation.")


def _normalise_occurrence(requested: Optional[date]) -> date:
    return requested or date.today()


def _sum_transactions(
    session: AsyncSession,
    wallet_id: UUID,
    tx_type: TransactionType,
    start: Optional[date],
    end: Optional[date],
):
    stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.wallet_id == wallet_id,
        Transaction.type == tx_type,
    )
    if start:
        stmt = stmt.where(Transaction.occurred_at >= start)
    if end:
        stmt = stmt.where(Transaction.occurred_at <= end)
    return stmt


async def calculate_investment_roe(
    session: AsyncSession,
    wallet: Wallet,
    *,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
) -> InvestmentRoeResponse:
    _ensure_wallet_kind(wallet, WalletType.INVESTMENT)

    end_date = period_end or date.today()
    if period_start:
        start_date = period_start
    else:
        # Default to one calendar month back
        month = end_date.month - 1 or 12
        year = end_date.year if end_date.month != 1 else end_date.year - 1
        max_day = monthrange(year, month)[1]
        day = min(end_date.day, max_day)
        start_date = date(year, month, day)

    if start_date > end_date:
        raise ValueError("Start date must be before end date.")

    income_stmt = _sum_transactions(session, wallet.id, TransactionType.INCOME, start_date, end_date)
    expense_stmt = _sum_transactions(session, wallet.id, TransactionType.EXPENSE, start_date, end_date)

    income_result = await session.execute(income_stmt)
    expense_result = await session.execute(expense_stmt)
    contributions = Decimal(income_result.scalar_one() or 0)
    withdrawals = Decimal(expense_result.scalar_one() or 0)

    net_gain = contributions - withdrawals
    if contributions <= Decimal("0"):
        roe = Decimal("0")
    else:
        roe = (net_gain / contributions * Decimal("100")).quantize(Decimal("0.01"))

    return InvestmentRoeResponse(
        wallet_id=wallet.id,
        period_start=start_date,
        period_end=end_date,
        contributions=contributions.quantize(Decimal("0.01")),
        withdrawals=withdrawals.quantize(Decimal("0.01")),
        net_gain=net_gain.quantize(Decimal("0.01")),
        roe_percentage=roe,
    )


def _settlement_date_for_month(year: int, month: int, settlement_day: int) -> date:
    day = min(settlement_day, monthrange(year, month)[1])
    return date(year, month, day)


def _calculate_statement_window(reference: date, settlement_day: int) -> tuple[date, date, date]:
    """Return period_start, period_end, settlement_date (period_end == settlement_date)."""
    current_settlement = _settlement_date_for_month(reference.year, reference.month, settlement_day)
    if reference <= current_settlement:
        settlement_date = current_settlement
    else:
        next_month = reference.month + 1
        next_year = reference.year
        if next_month > 12:
            next_month = 1
            next_year += 1
        settlement_date = _settlement_date_for_month(next_year, next_month, settlement_day)

    prev_month = settlement_date.month - 1
    prev_year = settlement_date.year
    if prev_month == 0:
        prev_month = 12
        prev_year -= 1
    previous_settlement = _settlement_date_for_month(prev_year, prev_month, settlement_day)
    period_start = previous_settlement + timedelta(days=1)
    period_end = settlement_date
    return period_start, period_end, settlement_date


async def generate_credit_statement(
    session: AsyncSession,
    wallet: Wallet,
    *,
    reference_date: Optional[date] = None,
) -> CreditStatementResponse:
    _ensure_wallet_kind(wallet, WalletType.CREDIT)
    if not wallet.settlement_day:
        raise ValueError("Credit wallet must have a settlement day configured.")

    ref = reference_date or date.today()
    period_start, period_end, settlement = _calculate_statement_window(ref, wallet.settlement_day)

    from .debts import list_debts_for_wallet, installment_remaining

    debts = await list_debts_for_wallet(session, wallet.id)
    installments: list[StatementInstallment] = []
    amount_due = Decimal("0.00")

    for debt in debts:
        for installment in sorted(debt.installments, key=lambda inst: (inst.due_date, inst.installment_number)):
            remaining = installment_remaining(installment)
            if remaining <= 0:
                continue
            if installment.due_date > settlement:
                continue
            amount_due += remaining
            installments.append(
                StatementInstallment(
                    installment_id=installment.id,
                    installment_number=installment.installment_number,
                    due_date=installment.due_date,
                    amount_due=remaining.quantize(Decimal("0.01")),
                    paid_amount=Decimal(str(installment.paid_amount or 0)).quantize(Decimal("0.01")),
                    wallet_transaction_id=installment.transaction_id,
                )
            )

    amount_due = amount_due.quantize(Decimal("0.01"))
    minimum_due = amount_due

    return CreditStatementResponse(
        wallet_id=wallet.id,
        period_start=period_start,
        period_end=period_end,
        settlement_date=settlement,
        amount_due=amount_due,
        minimum_due=minimum_due,
        installments=installments,
    )


async def credit_purchase(
    session: AsyncSession,
    wallet: Wallet,
    request: CreditPurchaseRequest,
):
    _ensure_wallet_kind(wallet, WalletType.CREDIT)
    if request.amount <= 0:
        raise ValueError("Purchase amount must be positive.")
    if request.installments <= 0:
        raise ValueError("Number of installments must be positive.")

    occurred_at = _normalise_occurrence(request.occurred_at)
    description = request.description or "Credit purchase"

    purchase_tx = await _create_wallet_transaction(
        session,
        wallet,
        amount=request.amount,
        tx_type=TransactionType.EXPENSE,
        description=description,
        occurred_at=occurred_at,
        source="credit_purchase",
    )

    from ..schemas.debt import DebtCreate
    from .debts import create_debt

    debt_payload = DebtCreate(
        name=description,
        description=description,
        principal_amount=request.amount,
        total_installments=request.installments,
        start_date=occurred_at,
        interest_rate=None,
        frequency_months=1,
        user_id=wallet.user_id,
        category="credit",
        wallet_id=wallet.id,
        beneficiary_name=request.beneficiary_name,
    )
    debt = await create_debt(session, debt_payload)

    await session.refresh(wallet)
    return purchase_tx, debt


async def credit_repayment(
    session: AsyncSession,
    wallet: Wallet,
    request: CreditRepaymentRequest,
):
    _ensure_wallet_kind(wallet, WalletType.CREDIT)
    if request.amount <= 0:
        raise ValueError("Repayment amount must be positive.")
    occurred_at = _normalise_occurrence(request.occurred_at)
    description = request.description or "Credit repayment"

    if request.source_wallet_id:
        source_wallet = await session.get(Wallet, request.source_wallet_id)
        if not source_wallet:
            raise ValueError("Source wallet not found.")
        if source_wallet.user_id != wallet.user_id:
            raise ValueError("Source wallet must belong to same user.")
        if source_wallet.id == wallet.id:
            source_wallet = None
    else:
        default_wallet = await ensure_default_wallet(session, wallet.user_id)
        source_wallet = default_wallet if default_wallet.id != wallet.id else None

    source_transaction = None
    if source_wallet:
        withdraw_payload = WalletTransactionRequest(
            amount=request.amount,
            description=description,
            occurred_at=occurred_at,
        )
        source_transaction = await wallet_withdraw(session, source_wallet, withdraw_payload)

    credit_transaction = await _create_wallet_transaction(
        session,
        wallet,
        amount=request.amount,
        tx_type=TransactionType.INCOME,
        description=description,
        occurred_at=occurred_at,
        source="credit_repayment",
    )

    from .debts import list_debts_for_wallet, installment_remaining, mark_installment_paid
    from ..schemas.debt import InstallmentPaymentRequest

    debts = await list_debts_for_wallet(session, wallet.id)
    if request.beneficiary_name:
        normalized = request.beneficiary_name.strip().lower()
        filtered = [d for d in debts if (d.beneficiary_name or "").strip().lower() == normalized]
        if not filtered:
            raise ValueError("No credit purchases found for that beneficiary.")
        debts = filtered

    remaining_amount = Decimal(request.amount)
    for debt in debts:
        installments = sorted(
            debt.installments,
            key=lambda inst: (inst.due_date, inst.installment_number),
        )
        for installment in installments:
            remaining = installment_remaining(installment)
            if remaining <= 0:
                continue
            if remaining_amount <= 0:
                break
            payment_amount = min(remaining_amount, remaining)
            payment_request = InstallmentPaymentRequest(
                paid_at=occurred_at,
                transaction_id=credit_transaction.id,
                amount=payment_amount,
            )
            await mark_installment_paid(session, installment, payment_request)
            remaining_amount -= payment_amount
        if remaining_amount <= 0:
            break

    await session.refresh(wallet)
    if source_wallet:
        await session.refresh(source_wallet)

    return {
        "wallet": wallet,
        "source_wallet": source_wallet,
        "source_transaction": source_transaction,
        "credit_transaction": credit_transaction,
        "unapplied_amount": remaining_amount.quantize(Decimal("0.01")),
    }
