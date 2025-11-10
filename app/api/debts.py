from collections.abc import Mapping
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas.debt import (
    DebtCreate,
    DebtCreateRequest,
    DebtInstallmentRead,
    DebtRead,
    DebtUpdate,
    InstallmentPaymentRequest,
)
from ..services import (
    create_debt,
    get_debt,
    get_installment,
    get_wallet,
    list_debts,
    mark_installment_paid,
    update_debt,
)
from .dependencies import CurrentUser

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _debt_to_read(debt: Any) -> DebtRead:
    """Normalise service responses (dicts or ORM objects) into DebtRead."""
    if isinstance(debt, Mapping):
        payload = dict(debt)
        payload.setdefault("category", "manual")
        payload.setdefault("wallet_id", None)
        payload.setdefault("beneficiary_name", None)
        payload.setdefault("installments", payload.get("installments", []))
        return DebtRead.model_validate(payload)
    return DebtRead.model_validate(debt)


def _get_user_id(record: Any) -> Any:
    if record is None:
        return None
    if isinstance(record, Mapping):
        return record.get("user_id")
    return getattr(record, "user_id", None)


@router.post("", response_model=DebtRead, status_code=status.HTTP_201_CREATED)
async def create_debt_endpoint(
    payload: DebtCreateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> DebtRead:
    if payload.wallet_id:
        wallet = await get_wallet(session, payload.wallet_id)
        if not wallet or _get_user_id(wallet) != current_user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    debt_payload = DebtCreate(user_id=current_user.id, **payload.model_dump())
    debt = await create_debt(session, debt_payload)
    return _debt_to_read(debt)


@router.get("", response_model=list[DebtRead])
async def list_debts_endpoint(
    session: SessionDep, current_user: CurrentUser
) -> list[DebtRead]:
    debts = await list_debts(session, user_id=current_user.id)
    return [_debt_to_read(d) for d in debts]


@router.get("/{debt_id}", response_model=DebtRead)
async def get_debt_endpoint(
    debt_id: UUID, session: SessionDep, current_user: CurrentUser
) -> DebtRead:
    debt = await get_debt(session, debt_id)
    if not debt or _get_user_id(debt) != current_user.id:
        raise HTTPException(status_code=404, detail="Debt not found")
    return _debt_to_read(debt)


@router.patch("/{debt_id}", response_model=DebtRead)
async def update_debt_endpoint(
    debt_id: UUID,
    payload: DebtUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> DebtRead:
    debt = await get_debt(session, debt_id)
    if not debt or _get_user_id(debt) != current_user.id:
        raise HTTPException(status_code=404, detail="Debt not found")
    debt = await update_debt(session, debt, payload)
    return _debt_to_read(debt)


@router.post("/installments/{installment_id}/pay", response_model=DebtInstallmentRead)
async def mark_installment_paid_endpoint(
    installment_id: UUID,
    payload: InstallmentPaymentRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> DebtInstallmentRead:
    installment = await get_installment(session, installment_id)
    if not installment:
        raise HTTPException(status_code=404, detail="Installment not found")
    await session.refresh(installment, attribute_names=["debt"])
    debt_ref = None
    if isinstance(installment, Mapping):
        debt_ref = installment.get("debt")
    else:
        debt_ref = getattr(installment, "debt", None)
    debt_user_id = _get_user_id(debt_ref)
    if debt_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Installment not found")
    try:
        installment = await mark_installment_paid(session, installment, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DebtInstallmentRead.model_validate(installment)
