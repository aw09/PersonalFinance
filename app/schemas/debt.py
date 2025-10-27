from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DebtCreate(BaseModel):
    name: str = Field(max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    principal_amount: Decimal
    total_installments: int = Field(gt=0, le=240)
    start_date: date
    interest_rate: Optional[Decimal] = Field(default=None)
    frequency_months: int = Field(default=1, gt=0, le=12)


class DebtUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=512)
    status: Optional[str] = Field(default=None, max_length=32)


class DebtInstallmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    debt_id: UUID
    installment_number: int
    due_date: date
    amount: Decimal
    paid: bool
    paid_at: Optional[date]
    transaction_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime


class DebtRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: Optional[str]
    principal_amount: Decimal
    total_installments: int
    start_date: date
    interest_rate: Optional[Decimal]
    status: str
    created_at: datetime
    updated_at: datetime
    installments: list[DebtInstallmentRead]


class InstallmentPaymentRequest(BaseModel):
    paid_at: date = Field(default_factory=date.today)
    transaction_id: Optional[UUID] = None
