from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas import AccessTokenResponse, TelegramLoginRequest
from ..services.auth import (
    AuthenticationError,
    TelegramAuthenticationError,
    authenticate_telegram_user,
)

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.post("/login", response_model=AccessTokenResponse, status_code=status.HTTP_200_OK)
async def telegram_login(payload: TelegramLoginRequest, session: SessionDep) -> AccessTokenResponse:
    """Exchange Telegram login data for an access token."""

    try:
        return await authenticate_telegram_user(session, payload)
    except TelegramAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

