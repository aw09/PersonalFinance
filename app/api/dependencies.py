from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models.user import User
from ..utils import jwt as jwt_utils


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login",
    description="Use the `/api/auth/login` endpoint with Telegram data to obtain an access token.",
)

SessionDep = Annotated[AsyncSession, Depends(get_db)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]


def _unauthorised(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(session: SessionDep, token: TokenDep) -> User:
    settings = get_settings()
    try:
        payload = jwt_utils.decode(
            token,
            settings.auth_secret_key,
            algorithms=[settings.auth_token_algorithm],
        )
    except jwt_utils.ExpiredSignatureError as exc:
        raise _unauthorised("Access token has expired") from exc
    except jwt_utils.InvalidTokenError as exc:
        raise _unauthorised("Invalid authentication credentials") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise _unauthorised("Token payload is missing subject")

    try:
        user_uuid = UUID(str(user_id))
    except (ValueError, TypeError) as exc:
        raise _unauthorised("Malformed user identifier in token") from exc

    user = await session.get(User, user_uuid)
    if not user or not user.is_active:
        raise _unauthorised("User not found or inactive")

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]

