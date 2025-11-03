from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models.wallet import WalletType


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
