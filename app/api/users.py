from typing import Annotated
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas import UserCreate, UserRead
from ..services import create_user
from .dependencies import CurrentUser

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    payload: UserCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> UserRead:
    if payload.telegram_id != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Cannot create another user")
    user = await create_user(session, payload)
    await session.refresh(current_user)
    return UserRead.model_validate(user)


@router.get("", response_model=list[UserRead])
async def list_users_endpoint(
    session: SessionDep, current_user: CurrentUser
) -> list[UserRead]:
    await session.refresh(current_user)
    return [UserRead.model_validate(current_user)]


@router.get("/me", response_model=UserRead)
async def get_current_user_endpoint(
    session: SessionDep, current_user: CurrentUser
) -> UserRead:
    await session.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.get("/{user_id}", response_model=UserRead)
async def get_user_endpoint(
    user_id: UUID, session: SessionDep, current_user: CurrentUser
) -> UserRead:
    if user_id != current_user.id:
        raise HTTPException(status_code=404, detail="User not found")
    await session.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.get("/by-telegram/{telegram_id}", response_model=UserRead)
async def get_user_by_telegram_endpoint(
    telegram_id: int, session: SessionDep, current_user: CurrentUser
) -> UserRead:
    if telegram_id != current_user.telegram_id:
        raise HTTPException(status_code=404, detail="User not found")
    await session.refresh(current_user)
    return UserRead.model_validate(current_user)
