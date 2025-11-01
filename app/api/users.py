from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas import UserCreate, UserRead
from ..services import (
    create_user,
    get_user,
    get_user_by_telegram_id,
    list_users,
)

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(payload: UserCreate, session: SessionDep) -> UserRead:
    user = await create_user(session, payload)
    return UserRead.model_validate(user)


@router.get("", response_model=list[UserRead])
async def list_users_endpoint(session: SessionDep) -> list[UserRead]:
    users = await list_users(session)
    return [UserRead.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserRead)
async def get_user_endpoint(user_id: UUID, session: SessionDep) -> UserRead:
    user = await get_user(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserRead.model_validate(user)


@router.get("/by-telegram/{telegram_id}", response_model=UserRead)
async def get_user_by_telegram_endpoint(telegram_id: int, session: SessionDep) -> UserRead:
    user = await get_user_by_telegram_id(session, telegram_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserRead.model_validate(user)
