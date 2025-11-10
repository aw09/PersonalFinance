from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..schemas import AccessTokenResponse, TelegramLoginRequest, UserCreate, UserRead
from ..utils import jwt
from .users import create_user


class AuthenticationError(Exception):
    """Base exception for authentication failures."""


class TelegramAuthenticationError(AuthenticationError):
    """Raised when Telegram login data cannot be verified."""


def _build_data_check_string(payload: TelegramLoginRequest) -> str:
    """Return the canonical string used for Telegram signature verification."""

    data: dict[str, str] = {}
    base = payload.model_dump(exclude={"hash"}, exclude_none=True)
    for key, value in base.items():
        data[key] = str(value)

    extra = getattr(payload, "model_extra", None) or {}
    for key, value in extra.items():
        if key == "hash" or value is None:
            continue
        data[key] = str(value)

    parts = [f"{key}={value}" for key, value in sorted(data.items())]
    return "\n".join(parts)


def _verify_signature(payload: TelegramLoginRequest, bot_token: str) -> None:
    if not bot_token:
        raise TelegramAuthenticationError("Telegram bot token is not configured on the server.")

    secret_key = sha256(bot_token.encode()).digest()
    check_string = _build_data_check_string(payload)
    expected_hash = hmac.new(secret_key, check_string.encode(), sha256).hexdigest()
    if not hmac.compare_digest(expected_hash, payload.hash):
        raise TelegramAuthenticationError("Telegram login payload failed signature verification.")


def _ensure_fresh(payload: TelegramLoginRequest, *, max_age_seconds: int) -> None:
    issued_at = payload.auth_datetime()
    now = datetime.now(timezone.utc)
    if issued_at > now + timedelta(seconds=30):
        raise TelegramAuthenticationError("Telegram login payload timestamp is in the future.")
    if now - issued_at > timedelta(seconds=max_age_seconds):
        raise TelegramAuthenticationError("Telegram login payload is too old; request a new login.")


def _create_access_token(*, user_id: str, telegram_id: int) -> tuple[str, datetime]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.auth_access_token_ttl_seconds)
    payload = {
        "sub": user_id,
        "tg_id": telegram_id,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.auth_secret_key, settings.auth_token_algorithm)
    return token, expires_at


async def authenticate_telegram_user(
    session: AsyncSession, payload: TelegramLoginRequest
) -> AccessTokenResponse:
    """Validate a Telegram login payload and return an access token."""

    settings = get_settings()
    _verify_signature(payload, settings.telegram_bot_token or "")
    _ensure_fresh(payload, max_age_seconds=settings.telegram_login_max_age_seconds)

    full_name = payload.full_name()
    user = await create_user(
        session,
        UserCreate(telegram_id=payload.id, full_name=full_name),
    )

    if not user.is_active:
        raise AuthenticationError("User account is disabled.")

    token, expires_at = _create_access_token(user_id=str(user.id), telegram_id=user.telegram_id)
    return AccessTokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.auth_access_token_ttl_seconds,
        expires_at=expires_at,
        user=UserRead.model_validate(user),
    )

