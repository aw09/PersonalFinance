from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DebtInstallmentPaymentRead(BaseModel):
    """Read model representing a single installment payment."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    amount: Decimal
    paid_at: date
    transaction_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime


class DebtInstallmentRead(BaseModel):
    """Read model for an individual debt installment."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    debt_id: UUID
    installment_number: int
    due_date: date
    amount: Decimal
    paid_amount: Decimal
    paid: bool
    paid_at: Optional[date]
    transaction_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    payments: list[DebtInstallmentPaymentRead] = Field(default_factory=list)


class DebtRead(BaseModel):
    """Read model for a debt including its installments."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: Optional[str]
    principal_amount: Decimal
    total_installments: int
    start_date: date
    interest_rate: Optional[Decimal]
    status: str
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    installments: list[DebtInstallmentRead]


class DebtCreate(BaseModel):
    """Payload for creating a debt."""

    name: str = Field(max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    principal_amount: Decimal
    total_installments: int = Field(gt=0, le=240)
    start_date: date
    interest_rate: Optional[Decimal] = Field(default=None)
    frequency_months: int = Field(default=1, gt=0, le=12)
    user_id: UUID


class DebtUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=512)
    status: Optional[str] = Field(default=None, max_length=32)


class InstallmentPaymentRequest(BaseModel):
    paid_at: date = Field(default_factory=date.today)
    transaction_id: Optional[UUID] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
