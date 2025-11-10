from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hmac
from hashlib import sha256
from typing import Any

import httpx

__all__ = ["FinanceApiClient"]


@dataclass
class _AuthState:
    """Cached authentication details for a Telegram user."""

    user_id: str
    telegram_id: int
    profile: dict[str, Any]
    user: dict[str, Any]
    access_token: str
    expires_at: datetime


class FinanceApiClient:
    """HTTP client that forwards Telegram entries to the FastAPI backend."""

    def __init__(self, api_base_url: str, *, bot_token: str | None = None) -> None:
        self.client = httpx.AsyncClient(
            base_url=api_base_url,
            timeout=httpx.Timeout(timeout=60.0, connect=10.0),
        )
        self._bot_token = bot_token or ""
        self._auth_by_user_id: dict[str, _AuthState] = {}
        self._auth_by_telegram_id: dict[int, _AuthState] = {}

    async def ensure_user(self, telegram_user: Any, full_name: str | None = None) -> dict[str, Any]:
        profile = self._build_profile(telegram_user, full_name)
        state = await self._authenticate_and_store(profile)
        return state.user

    def _build_profile(self, telegram_user: Any, full_name: str | None) -> dict[str, Any]:
        if hasattr(telegram_user, "id"):
            telegram_id = int(getattr(telegram_user, "id"))
            profile: dict[str, Any] = {
                "id": telegram_id,
                "first_name": getattr(telegram_user, "first_name", None),
                "last_name": getattr(telegram_user, "last_name", None),
                "username": getattr(telegram_user, "username", None),
            }
            if not profile["first_name"] and hasattr(telegram_user, "full_name"):
                profile["first_name"] = getattr(telegram_user, "full_name") or None
            return profile
        if telegram_user is None:
            raise ValueError("Telegram user information is required to authenticate.")
        telegram_id = int(telegram_user)
        first_name: str | None = None
        last_name: str | None = None
        if full_name:
            parts = full_name.strip().split(" ", 1)
            first_name = parts[0]
            if len(parts) > 1:
                last_name = parts[1]
        return {
            "id": telegram_id,
            "first_name": first_name or full_name,
            "last_name": last_name,
            "username": None,
        }

    async def _authenticate_and_store(self, profile: dict[str, Any]) -> _AuthState:
        auth_data = await self._authenticate(profile)
        user = auth_data.get("user")
        if not isinstance(user, dict):
            raise RuntimeError("Authentication response did not include user details.")
        return self._save_auth_state(profile, user, auth_data)

    async def _authenticate(self, profile: dict[str, Any]) -> dict[str, Any]:
        if not self._bot_token:
            raise RuntimeError("Telegram bot token must be configured for API authentication.")
        payload = self._build_login_payload(profile)
        response = await self.client.post("/api/auth/login", json=payload)
        response.raise_for_status()
        return response.json()

    def _build_login_payload(self, profile: dict[str, Any]) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": profile["id"],
            "auth_date": int(datetime.now(timezone.utc).timestamp()),
        }
        if profile.get("first_name"):
            data["first_name"] = profile["first_name"]
        if profile.get("last_name"):
            data["last_name"] = profile["last_name"]
        if profile.get("username"):
            data["username"] = profile["username"]

        secret_key = sha256(self._bot_token.encode()).digest()
        parts = sorted((key, str(value)) for key, value in data.items())
        check_string = "\n".join(f"{key}={value}" for key, value in parts)
        data["hash"] = hmac.new(secret_key, check_string.encode(), sha256).hexdigest()
        return data

    def _save_auth_state(
        self,
        profile: dict[str, Any],
        user: dict[str, Any],
        auth_data: dict[str, Any],
    ) -> _AuthState:
        expires_at = self._parse_expires_at(auth_data.get("expires_at"))
        state = _AuthState(
            user_id=str(user.get("id")),
            telegram_id=int(profile["id"]),
            profile={**profile},
            user=user,
            access_token=str(auth_data.get("access_token")),
            expires_at=expires_at,
        )
        self._auth_by_user_id[state.user_id] = state
        self._auth_by_telegram_id[state.telegram_id] = state
        return state

    def _parse_expires_at(self, raw: Any) -> datetime:
        if isinstance(raw, datetime):
            expires = raw
        elif isinstance(raw, str):
            try:
                expires = datetime.fromisoformat(raw)
            except ValueError:
                expires = datetime.now(timezone.utc) + timedelta(hours=1)
        else:
            expires = datetime.now(timezone.utc) + timedelta(hours=1)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        else:
            expires = expires.astimezone(timezone.utc)
        return expires

    def _token_valid(self, state: _AuthState) -> bool:
        return state.expires_at - datetime.now(timezone.utc) > timedelta(seconds=30)

    async def _ensure_state(self, state: _AuthState) -> _AuthState:
        if self._token_valid(state):
            return state
        refreshed = await self._authenticate(state.profile)
        user = refreshed.get("user") or state.user
        return self._save_auth_state(state.profile, user, refreshed)

    async def _authorisation_headers(self, *, user_id: str) -> dict[str, str]:
        key = str(user_id)
        state = self._auth_by_user_id.get(key)
        if not state:
            raise RuntimeError("Call ensure_user before making authenticated API requests.")
        state = await self._ensure_state(state)
        return {"Authorization": f"Bearer {state.access_token}"}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        user_id: str,
        headers: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        auth_headers = await self._authorisation_headers(user_id=str(user_id))
        merged_headers = {**(headers or {}), **auth_headers}
        return await self.client.request(method, path, headers=merged_headers, **kwargs)

    async def create_transaction(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Transaction payload must include user_id")
        response = await self._request("POST", "/api/transactions", user_id=user_id, json=data)
        response.raise_for_status()
        return response.json()

    async def parse_receipt(
        self,
        image_bytes: bytes,
        *,
        user_id: str,
        commit_transaction: bool = True,
        wallet_id: str | None = None,
    ) -> dict[str, Any]:
        files = {"file": ("receipt.jpg", image_bytes, "image/jpeg")}
        data = {
            "commit_transaction": "true" if commit_transaction else "false",
        }
        if wallet_id:
            data["wallet_id"] = wallet_id
        response = await self._request(
            "POST",
            "/api/llm/receipt",
            user_id=user_id,
            data=data,
            files=files,
        )
        response.raise_for_status()
        return response.json()

    async def list_transactions(
        self,
        *,
        user_id: str,
        limit: int = 500,
        offset: int = 0,
        wallet_id: str | None = None,
        occurred_after: str | None = None,
        occurred_before: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "limit": min(limit, 200),
            "offset": max(offset, 0),
        }
        if wallet_id:
            params["wallet_id"] = wallet_id
        if occurred_after:
            params["occurred_after"] = occurred_after
        if occurred_before:
            params["occurred_before"] = occurred_before
        response = await self._request(
            "GET",
            "/api/transactions",
            user_id=user_id,
            params=params,
        )
        response.raise_for_status()
        return response.json()

    async def list_wallets(self, *, user_id: str) -> list[dict[str, Any]]:
        response = await self._request("GET", "/api/wallets", user_id=user_id)
        response.raise_for_status()
        return response.json()

    async def create_wallet(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Wallet payload must include user_id")
        response = await self._request("POST", "/api/wallets", user_id=user_id, json=data)
        response.raise_for_status()
        return response.json()

    async def update_wallet(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Wallet update payload must include user_id")
        response = await self._request(
            "PATCH", f"/api/wallets/{wallet_id}", user_id=user_id, json=data
        )
        response.raise_for_status()
        return response.json()

    async def set_default_wallet(self, wallet_id: str, *, user_id: str) -> dict[str, Any]:
        response = await self._request(
            "POST", f"/api/wallets/{wallet_id}/set-default", user_id=user_id
        )
        response.raise_for_status()
        return response.json()

    async def delete_wallet(self, wallet_id: str, *, user_id: str) -> None:
        response = await self._request(
            "DELETE", f"/api/wallets/{wallet_id}", user_id=user_id
        )
        response.raise_for_status()

    async def transfer_wallets(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Wallet transfer payload must include user_id")
        response = await self._request(
            "POST", "/api/wallets/transfer", user_id=user_id, json=data
        )
        response.raise_for_status()
        return response.json()

    async def credit_purchase(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Credit purchase payload must include user_id")
        response = await self._request(
            "POST",
            f"/api/wallets/{wallet_id}/credit/purchase",
            user_id=user_id,
            json=data,
        )
        response.raise_for_status()
        return response.json()

    async def credit_repayment(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Credit repayment payload must include user_id")
        response = await self._request(
            "POST",
            f"/api/wallets/{wallet_id}/credit/repay",
            user_id=user_id,
            json=data,
        )
        response.raise_for_status()
        return response.json()

    async def credit_statement(
        self,
        user_id: str,
        wallet_id: str,
        *,
        reference_date: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if reference_date:
            params["reference_date"] = reference_date
        response = await self._request(
            "GET",
            f"/api/wallets/{wallet_id}/credit/statement",
            user_id=user_id,
            params=params or None,
        )
        response.raise_for_status()
        return response.json()

    async def investment_roe(
        self,
        user_id: str,
        wallet_id: str,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        response = await self._request(
            "GET",
            f"/api/wallets/{wallet_id}/investment/roe",
            user_id=user_id,
            params=params or None,
        )
        response.raise_for_status()
        return response.json()

    async def create_debt(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = dict(payload)
        user_id = data.pop("user_id", None)
        if not user_id:
            raise ValueError("Debt payload must include user_id")
        response = await self._request("POST", "/api/debts", user_id=user_id, json=data)
        response.raise_for_status()
        return response.json()

    async def list_debts(self, *, user_id: str) -> list[dict[str, Any]]:
        response = await self._request("GET", "/api/debts", user_id=user_id)
        response.raise_for_status()
        return response.json()

    async def apply_installment_payment(
        self,
        user_id: str,
        installment_id: str,
        *,
        amount: Decimal,
        paid_at: date,
        transaction_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "paid_at": paid_at.isoformat(),
            "amount": str(amount),
        }
        if transaction_id:
            payload["transaction_id"] = transaction_id
        response = await self._request(
            "POST",
            f"/api/debts/installments/{installment_id}/pay",
            user_id=user_id,
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def update_debt_status(self, user_id: str, debt_id: str, *, status: str) -> dict[str, Any]:
        response = await self._request(
            "PATCH", f"/api/debts/{debt_id}", user_id=user_id, json={"status": status}
        )
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        await self.client.aclose()
