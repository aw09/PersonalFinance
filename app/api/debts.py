from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas.debt import (
    DebtCreate,
    DebtRead,
    DebtUpdate,
    DebtInstallmentRead,
    InstallmentPaymentRequest,
)
from ..services import (
    create_debt,
    get_debt,
    get_installment,
    list_debts,
    mark_installment_paid,
    update_debt,
)

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=DebtRead, status_code=status.HTTP_201_CREATED)
async def create_debt_endpoint(payload: DebtCreate, session: SessionDep) -> DebtRead:
    debt = await create_debt(session, payload)
    return DebtRead.model_validate(debt)


@router.get("", response_model=list[DebtRead])
async def list_debts_endpoint(
    session: SessionDep, user_id: Optional[UUID] = Query(default=None)
) -> list[DebtRead]:
    debts = await list_debts(session, user_id=user_id)
    return [DebtRead.model_validate(d) for d in debts]


@router.get("/{debt_id}", response_model=DebtRead)
async def get_debt_endpoint(debt_id: UUID, session: SessionDep) -> DebtRead:
    debt = await get_debt(session, debt_id)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    return DebtRead.model_validate(debt)


@router.patch("/{debt_id}", response_model=DebtRead)
async def update_debt_endpoint(debt_id: UUID, payload: DebtUpdate, session: SessionDep) -> DebtRead:
    debt = await get_debt(session, debt_id)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    debt = await update_debt(session, debt, payload)
    return DebtRead.model_validate(debt)


@router.post("/installments/{installment_id}/pay", response_model=DebtInstallmentRead)
async def mark_installment_paid_endpoint(
    installment_id: UUID,
    payload: InstallmentPaymentRequest,
    session: SessionDep,
) -> DebtInstallmentRead:
    installment = await get_installment(session, installment_id)
    if not installment:
        raise HTTPException(status_code=404, detail="Installment not found")
    installment = await mark_installment_paid(session, installment, payload)
    return DebtInstallmentRead.model_validate(installment)
