from datetime import date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models.transaction import TransactionType
from ..schemas.transaction import TransactionCreate, TransactionRead, TransactionUpdate
from ..services import create_transaction, get_transaction, list_transactions, update_transaction
from ..services.transactions import TransactionNotFoundError

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction_endpoint(
    payload: TransactionCreate,
    session: SessionDep,
) -> TransactionRead:
    transaction = await create_transaction(session, payload)
    return TransactionRead.model_validate(transaction)


@router.get("", response_model=list[TransactionRead])
async def list_transactions_endpoint(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    transaction_type: Optional[TransactionType] = Query(default=None),
    user_id: Optional[UUID] = Query(default=None),
    wallet_id: Optional[UUID] = Query(default=None),
    occurred_after: Optional[date] = Query(default=None),
    occurred_before: Optional[date] = Query(default=None),
) -> list[TransactionRead]:
    transactions = await list_transactions(
        session,
        limit=limit,
        offset=offset,
        transaction_type=transaction_type,
        user_id=user_id,
        wallet_id=wallet_id,
        occurred_after=occurred_after,
        occurred_before=occurred_before,
    )
    return [TransactionRead.model_validate(tx) for tx in transactions]


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction_endpoint(transaction_id: UUID, session: SessionDep) -> TransactionRead:
    transaction = await get_transaction(session, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return TransactionRead.model_validate(transaction)


@router.patch("/{transaction_id}", response_model=TransactionRead)
async def update_transaction_endpoint(
    transaction_id: UUID,
    payload: TransactionUpdate,
    session: SessionDep,
) -> TransactionRead:
    try:
        transaction = await update_transaction(session, transaction_id, payload)
    except TransactionNotFoundError:
        raise HTTPException(status_code=404, detail="Transaction not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TransactionRead.model_validate(transaction)
