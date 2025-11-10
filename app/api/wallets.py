from collections.abc import Mapping
from datetime import date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas import (
    CreditPurchaseRequest,
    CreditRepaymentRequest,
    CreditRepaymentResponse,
    CreditStatementResponse,
    DebtRead,
    InvestmentRoeResponse,
    WalletCreate,
    WalletCreateRequest,
    WalletRead,
    WalletTransactionRequest,
    WalletTransferRequest,
    WalletTransferResponse,
    WalletUpdate,
)
from ..services import (
    calculate_investment_roe,
    credit_purchase,
    credit_repayment,
    create_wallet,
    delete_wallet,
    generate_credit_statement,
    get_wallet,
    list_wallets,
    set_default_wallet,
    update_wallet,
    wallet_adjust,
    wallet_deposit,
    wallet_transfer,
    wallet_withdraw,
)
from .dependencies import CurrentUser

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _wallet_response(wallet, current_user) -> WalletRead:
    if isinstance(wallet, Mapping):
        wallet_id = wallet.get("id")
        wallet_user_id = wallet.get("user_id")
    else:
        wallet_id = getattr(wallet, "id", None)
        wallet_user_id = getattr(wallet, "user_id", None)

    if wallet_user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    is_default = wallet_id == current_user.default_wallet_id

    if isinstance(wallet, Mapping):
        response_payload = {**wallet, "is_default": is_default}
        return WalletRead.model_validate(response_payload)

    setattr(wallet, "is_default", is_default)
    return WalletRead.model_validate(wallet)


@router.post("", response_model=WalletRead, status_code=status.HTTP_201_CREATED)
async def create_wallet_endpoint(
    payload: WalletCreateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WalletRead:
    create_payload = WalletCreate(user_id=current_user.id, **payload.model_dump())
    wallet = await create_wallet(session, create_payload)
    await session.refresh(current_user)
    return _wallet_response(wallet, current_user)


@router.get("", response_model=list[WalletRead])
async def list_wallets_endpoint(
    session: SessionDep, current_user: CurrentUser
) -> list[WalletRead]:
    wallets = await list_wallets(session, current_user.id)
    await session.refresh(current_user)
    return [_wallet_response(wallet, current_user) for wallet in wallets]


def _ensure_wallet(wallet, current_user):
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    owner_id = wallet.get("user_id") if isinstance(wallet, Mapping) else getattr(wallet, "user_id", None)
    if owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@router.patch("/{wallet_id}", response_model=WalletRead)
async def update_wallet_endpoint(
    wallet_id: UUID,
    payload: WalletUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    wallet = await update_wallet(session, wallet, payload)
    await session.refresh(wallet)
    await session.refresh(current_user)
    return _wallet_response(wallet, current_user)


@router.delete("/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wallet_endpoint(
    wallet_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Response:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        await delete_wallet(session, wallet)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{wallet_id}/deposit", response_model=WalletRead)
async def wallet_deposit_endpoint(
    wallet_id: UUID,
    payload: WalletTransactionRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        await wallet_deposit(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return _wallet_response(wallet, current_user)


@router.post("/{wallet_id}/withdraw", response_model=WalletRead)
async def wallet_withdraw_endpoint(
    wallet_id: UUID,
    payload: WalletTransactionRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        await wallet_withdraw(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return _wallet_response(wallet, current_user)


@router.post("/{wallet_id}/adjust", response_model=WalletRead)
async def wallet_adjust_endpoint(
    wallet_id: UUID,
    payload: WalletTransactionRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        await wallet_adjust(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return _wallet_response(wallet, current_user)


@router.post("/transfer", response_model=WalletTransferResponse)
async def wallet_transfer_endpoint(
    payload: WalletTransferRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> WalletTransferResponse:
    source_wallet = _ensure_wallet(
        await get_wallet(session, payload.source_wallet_id), current_user
    )
    target_wallet = _ensure_wallet(
        await get_wallet(session, payload.target_wallet_id), current_user
    )
    try:
        updated_source, updated_target = await wallet_transfer(session, source_wallet, target_wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    source_read = _wallet_response(updated_source, current_user)
    target_read = _wallet_response(updated_target, current_user)
    return WalletTransferResponse(source_wallet=source_read, target_wallet=target_read)


@router.post("/{wallet_id}/set-default", response_model=WalletRead)
async def wallet_set_default_endpoint(
    wallet_id: UUID, session: SessionDep, current_user: CurrentUser
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        await set_default_wallet(session, wallet)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    await session.refresh(current_user)
    return _wallet_response(wallet, current_user)


@router.post(
    "/{wallet_id}/credit/purchase",
    response_model=DebtRead,
    status_code=status.HTTP_201_CREATED,
)
async def credit_purchase_endpoint(
    wallet_id: UUID,
    payload: CreditPurchaseRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> DebtRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        _, debt = await credit_purchase(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DebtRead.model_validate(debt)


@router.post("/{wallet_id}/credit/repay", response_model=CreditRepaymentResponse)
async def credit_repayment_endpoint(
    wallet_id: UUID,
    payload: CreditRepaymentRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> CreditRepaymentResponse:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        result = await credit_repayment(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    wallet_read = _wallet_response(result["wallet"], current_user)
    source_read = None
    if result.get("source_wallet"):
        source_read = _wallet_response(result["source_wallet"], current_user)
    return CreditRepaymentResponse(
        wallet=wallet_read,
        source_wallet=source_read,
        unapplied_amount=result["unapplied_amount"],
    )


@router.get("/{wallet_id}/credit/statement", response_model=CreditStatementResponse)
async def credit_statement_endpoint(
    wallet_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    reference_date: Optional[date] = Query(default=None),
) -> CreditStatementResponse:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        statement = await generate_credit_statement(
            session,
            wallet,
            reference_date=reference_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return statement


@router.get("/{wallet_id}/investment/roe", response_model=InvestmentRoeResponse)
async def investment_roe_endpoint(
    wallet_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
) -> InvestmentRoeResponse:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id), current_user)
    try:
        roe = await calculate_investment_roe(
            session,
            wallet,
            period_start=start_date,
            period_end=end_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return roe


