from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.transaction import TransactionType


class TransactionItem(BaseModel):
    """Item extracted from a receipt."""

    name: str
    quantity: Decimal = Field(default=1)
    unit_price: Decimal
    total_price: Optional[Decimal] = None
    category: Optional[str] = None


class TransactionCreate(BaseModel):
    """Payload for adding a new transaction."""

    type: TransactionType
    amount: Decimal
    currency: str = Field(default="IDR", min_length=3, max_length=3)
    description: Optional[str] = Field(default=None, max_length=512)
    category: Optional[str] = Field(default=None, max_length=64)
    occurred_at: date
    items: Optional[list[TransactionItem]] = None
    metadata: Optional[dict[str, Any]] = None
    source: str = Field(default="manual", max_length=32)
    user_id: UUID

    @field_validator("type", mode="before")
    @classmethod
    def _normalise_type(cls, value: TransactionType | str) -> TransactionType:
        """Allow case-insensitive transaction types from external clients."""
        if isinstance(value, TransactionType):
            return value
        if isinstance(value, str):
            try:
                return TransactionType(value.lower())
            except ValueError as exc:
                raise ValueError("Unsupported transaction type") from exc
        raise TypeError("Transaction type must be a string or TransactionType instance")


class TransactionRead(BaseModel):
    """API response shape for transactions."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    type: TransactionType
    amount: Decimal
    currency: str
    description: Optional[str]
    category: Optional[str]
    occurred_at: date
    items: Optional[list[TransactionItem]]
    metadata: Optional[dict[str, Any]] = Field(default=None, alias="metadata_json")
    source: str
    user_id: UUID
    created_at: datetime
    updated_at: datetime
