from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas import (
    WalletCreate,
    WalletRead,
    WalletTransactionRequest,
    WalletTransferRequest,
    WalletTransferResponse,
    WalletUpdate,
)
from ..services import (
    create_wallet,
    get_user,
    get_wallet,
    list_wallets,
    set_default_wallet,
    update_wallet,
    wallet_adjust,
    wallet_deposit,
    wallet_transfer,
    wallet_withdraw,
)

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def _wallet_response(
    session: AsyncSession,
    wallet,
    *,
    default_wallet_id: UUID | None = None,
) -> WalletRead:
    if isinstance(wallet, dict):
        wallet_id = wallet.get("id")
        wallet_user_id = wallet.get("user_id")
    else:
        wallet_id = getattr(wallet, "id", None)
        wallet_user_id = getattr(wallet, "user_id", None)

    if wallet_user_id is None:
        raise HTTPException(status_code=500, detail="Wallet missing user reference")

    if default_wallet_id is None:
        user = await get_user(session, wallet_user_id)
        if user is None:
            default_wallet_id = None
        elif isinstance(user, dict):
            default_wallet_id = user.get("default_wallet_id")
        else:
            default_wallet_id = user.default_wallet_id

    is_default = wallet_id == default_wallet_id

    if isinstance(wallet, dict):
        response_payload = {**wallet, "is_default": is_default}
        return WalletRead.model_validate(response_payload)

    setattr(wallet, "is_default", is_default)
    return WalletRead.model_validate(wallet)


@router.post("", response_model=WalletRead, status_code=status.HTTP_201_CREATED)
async def create_wallet_endpoint(payload: WalletCreate, session: SessionDep) -> WalletRead:
    wallet = await create_wallet(session, payload)
    return await _wallet_response(session, wallet)


@router.get("", response_model=list[WalletRead])
async def list_wallets_endpoint(user_id: UUID, session: SessionDep) -> list[WalletRead]:
    wallets = await list_wallets(session, user_id)
    user = await get_user(session, user_id)
    if user is None:
        default_wallet_id = None
    elif isinstance(user, dict):
        default_wallet_id = user.get("default_wallet_id")
    else:
        default_wallet_id = user.default_wallet_id
    response: list[WalletRead] = []
    for wallet in wallets:
        response.append(await _wallet_response(session, wallet, default_wallet_id=default_wallet_id))
    return response


def _ensure_wallet(wallet):
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@router.patch("/{wallet_id}", response_model=WalletRead)
async def update_wallet_endpoint(
    wallet_id: UUID,
    payload: WalletUpdate,
    session: SessionDep,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id))
    wallet = await update_wallet(session, wallet, payload)
    await session.refresh(wallet)
    return await _wallet_response(session, wallet)


@router.post("/{wallet_id}/deposit", response_model=WalletRead)
async def wallet_deposit_endpoint(
    wallet_id: UUID,
    payload: WalletTransactionRequest,
    session: SessionDep,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id))
    try:
        await wallet_deposit(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return await _wallet_response(session, wallet)


@router.post("/{wallet_id}/withdraw", response_model=WalletRead)
async def wallet_withdraw_endpoint(
    wallet_id: UUID,
    payload: WalletTransactionRequest,
    session: SessionDep,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id))
    try:
        await wallet_withdraw(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return await _wallet_response(session, wallet)


@router.post("/{wallet_id}/adjust", response_model=WalletRead)
async def wallet_adjust_endpoint(
    wallet_id: UUID,
    payload: WalletTransactionRequest,
    session: SessionDep,
) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id))
    try:
        await wallet_adjust(session, wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return await _wallet_response(session, wallet)


@router.post("/transfer", response_model=WalletTransferResponse)
async def wallet_transfer_endpoint(
    payload: WalletTransferRequest,
    session: SessionDep,
) -> WalletTransferResponse:
    source_wallet = _ensure_wallet(await get_wallet(session, payload.source_wallet_id))
    target_wallet = _ensure_wallet(await get_wallet(session, payload.target_wallet_id))
    try:
        updated_source, updated_target = await wallet_transfer(session, source_wallet, target_wallet, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    source_read = await _wallet_response(session, updated_source)
    target_read = await _wallet_response(session, updated_target)
    return WalletTransferResponse(source_wallet=source_read, target_wallet=target_read)


@router.post("/{wallet_id}/set-default", response_model=WalletRead)
async def wallet_set_default_endpoint(wallet_id: UUID, session: SessionDep) -> WalletRead:
    wallet = _ensure_wallet(await get_wallet(session, wallet_id))
    try:
        await set_default_wallet(session, wallet)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(wallet)
    return await _wallet_response(session, wallet)


