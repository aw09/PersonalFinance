from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from .user import UserRead


class TelegramLoginRequest(BaseModel):
    """Payload produced by the Telegram Login Widget."""

    model_config = ConfigDict(extra="allow")

    id: int = Field(ge=0, description="Telegram user identifier")
    first_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=255)
    photo_url: str | None = None
    auth_date: int = Field(description="Unix timestamp when the auth data was generated")
    hash: str = Field(description="HMAC-SHA256 signature of the payload")

    def auth_datetime(self) -> datetime:
        """Return the authentication timestamp as an aware datetime."""

        return datetime.fromtimestamp(self.auth_date, tz=timezone.utc)

    def full_name(self) -> str | None:
        """Best-effort derivation of a human readable name."""

        names = [name for name in (self.first_name, self.last_name) if name]
        if names:
            return " ".join(names)
        return self.username


class AccessTokenResponse(BaseModel):
    """Response returned after a successful login."""

    access_token: str = Field(description="JWT access token to use in the Authorization header")
    token_type: str = Field(default="bearer", description="Type of token returned")
    expires_in: int = Field(description="Lifetime of the token in seconds")
    expires_at: datetime = Field(description="UTC timestamp when the token expires")
    user: UserRead

