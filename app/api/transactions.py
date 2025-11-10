from datetime import date
from collections.abc import Mapping
from datetime import date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models.transaction import TransactionType
from ..schemas.transaction import TransactionCreate, TransactionCreateRequest, TransactionRead
from ..services import create_transaction, get_transaction, get_wallet, list_transactions
from .dependencies import CurrentUser

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction_endpoint(
    payload: TransactionCreateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> TransactionRead:
    if payload.wallet_id:
        wallet = await get_wallet(session, payload.wallet_id)
        if isinstance(wallet, Mapping):
            wallet_owner = wallet.get("user_id")
        else:
            wallet_owner = getattr(wallet, "user_id", None)
        if not wallet or wallet_owner != current_user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    transaction_payload = TransactionCreate(
        **payload.model_dump(),
        user_id=current_user.id,
    )
    transaction = await create_transaction(session, transaction_payload)
    return TransactionRead.model_validate(transaction)


@router.get("", response_model=list[TransactionRead])
async def list_transactions_endpoint(
    session: SessionDep,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    transaction_type: Optional[TransactionType] = Query(default=None),
    wallet_id: Optional[UUID] = Query(default=None),
    occurred_after: Optional[date] = Query(default=None),
    occurred_before: Optional[date] = Query(default=None),
) -> list[TransactionRead]:
    if wallet_id:
        wallet = await get_wallet(session, wallet_id)
        if isinstance(wallet, Mapping):
            wallet_owner = wallet.get("user_id")
        else:
            wallet_owner = getattr(wallet, "user_id", None)
        if not wallet or wallet_owner != current_user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    transactions = await list_transactions(
        session,
        limit=limit,
        offset=offset,
        transaction_type=transaction_type,
        user_id=current_user.id,
        wallet_id=wallet_id,
        occurred_after=occurred_after,
        occurred_before=occurred_before,
    )
    return [TransactionRead.model_validate(tx) for tx in transactions]


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction_endpoint(
    transaction_id: UUID, session: SessionDep, current_user: CurrentUser
) -> TransactionRead:
    transaction = await get_transaction(session, transaction_id)
    transaction_owner = None
    if isinstance(transaction, Mapping):
        transaction_owner = transaction.get("user_id") if transaction else None
    else:
        transaction_owner = getattr(transaction, "user_id", None)
    if not transaction or transaction_owner != current_user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return TransactionRead.model_validate(transaction)
