from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..schemas.user import UserCreate
from .wallets import ensure_default_wallet


async def create_user(session: AsyncSession, payload: UserCreate) -> User:
    existing = await get_user_by_telegram_id(session, payload.telegram_id)
    if existing:
        if payload.full_name and existing.full_name != payload.full_name:
            existing.full_name = payload.full_name
            await session.commit()
            await session.refresh(existing)
        await ensure_default_wallet(session, existing.id)
        return existing

    user = User(telegram_id=payload.telegram_id, full_name=payload.full_name)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await ensure_default_wallet(session, user.id)
    return user


async def list_users(session: AsyncSession) -> list[User]:
    result = await session.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


async def get_user(session: AsyncSession, user_id: UUID) -> Optional[User]:
    return await session.get(User, user_id)


async def get_user_by_telegram_id(session: AsyncSession, telegram_id: int) -> Optional[User]:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalars().first()
