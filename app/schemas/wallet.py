from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models.wallet import WalletType


class WalletCreateRequest(BaseModel):
    name: str = Field(max_length=64)
    type: WalletType = Field(default=WalletType.REGULAR)
    currency: str = Field(default="IDR", max_length=3, min_length=3)
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    settlement_day: Optional[int] = Field(default=None, ge=1, le=31)
    make_default: bool = Field(default=False)


class WalletCreate(BaseModel):
    name: str = Field(max_length=64)
    type: WalletType = Field(default=WalletType.REGULAR)
    user_id: UUID
    currency: str = Field(default="IDR", max_length=3, min_length=3)
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    settlement_day: Optional[int] = Field(default=None, ge=1, le=31)
    make_default: bool = Field(default=False)


class WalletUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=64)
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    settlement_day: Optional[int] = Field(default=None, ge=1, le=31)
    currency: Optional[str] = Field(default=None, max_length=3, min_length=3)


class WalletRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    type: WalletType
    balance: Decimal
    currency: str
    credit_limit: Optional[Decimal]
    settlement_day: Optional[int]
    created_at: datetime
    updated_at: datetime
    is_default: bool = False


class WalletTransactionRequest(BaseModel):
    amount: Decimal
    description: Optional[str] = Field(default=None, max_length=256)
    occurred_at: Optional[date] = None


class WalletTransferRequest(BaseModel):
    source_wallet_id: UUID
    target_wallet_id: UUID
    amount: Decimal
    description: Optional[str] = Field(default=None, max_length=256)
    occurred_at: Optional[date] = None


class CreditPurchaseRequest(BaseModel):
    amount: Decimal
    description: Optional[str] = Field(default=None, max_length=512)
    occurred_at: Optional[date] = None
    installments: int = Field(description="Number of installments (e.g. 3, 6, 12)", ge=1)
    beneficiary_name: Optional[str] = Field(default=None, max_length=128)


class CreditRepaymentRequest(BaseModel):
    amount: Decimal
    description: Optional[str] = Field(default=None, max_length=512)
    occurred_at: Optional[date] = None
    source_wallet_id: Optional[UUID] = Field(
        default=None, description="Wallet supplying the cash repayment (defaults to user's main wallet)."
    )
    beneficiary_name: Optional[str] = Field(
        default=None, max_length=128, description="Mark repayment as being for this beneficiary's receivable."
    )


class StatementInstallment(BaseModel):
    installment_id: UUID
    installment_number: int
    due_date: date
    amount_due: Decimal
    paid_amount: Decimal
    wallet_transaction_id: Optional[UUID] = None


class CreditStatementResponse(BaseModel):
    wallet_id: UUID
    period_start: date
    period_end: date
    settlement_date: date
    amount_due: Decimal
    minimum_due: Decimal
    installments: list[StatementInstallment]


class CreditRepaymentResponse(BaseModel):
    wallet: WalletRead
    source_wallet: Optional[WalletRead] = None
    unapplied_amount: Decimal


class InvestmentRoeResponse(BaseModel):
    wallet_id: UUID
    period_start: date
    period_end: date
    contributions: Decimal
    withdrawals: Decimal
    net_gain: Decimal
    roe_percentage: Decimal


class WalletTransferResponse(BaseModel):
    source_wallet: WalletRead
    target_wallet: WalletRead
