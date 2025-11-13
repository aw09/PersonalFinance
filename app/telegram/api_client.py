from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import httpx


class FinanceApiClient:
    """HTTP client that forwards Telegram entries to the FastAPI backend."""

    def __init__(self, api_base_url: str) -> None:
        self.client = httpx.AsyncClient(
            base_url=api_base_url,
            timeout=httpx.Timeout(timeout=60.0, connect=10.0),
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    async def create_transaction(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/transactions", json=payload)
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
            "user_id": user_id,
            "commit_transaction": "true" if commit_transaction else "false",
        }
        if wallet_id:
            data["wallet_id"] = wallet_id
        response = await self.client.post("/api/llm/receipt", data=data, files=files)
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
            "user_id": user_id,
            "limit": min(limit, 200),
            "offset": max(offset, 0),
        }
        if wallet_id:
            params["wallet_id"] = wallet_id
        if occurred_after:
            params["occurred_after"] = occurred_after
        if occurred_before:
            params["occurred_before"] = occurred_before
        response = await self.client.get("/api/transactions", params=params)
        response.raise_for_status()
        return response.json()

    async def list_wallets(self, *, user_id: str) -> list[dict[str, Any]]:
        response = await self.client.get("/api/wallets", params={"user_id": user_id})
        response.raise_for_status()
        return response.json()

    async def create_wallet(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/wallets", json=payload)
        response.raise_for_status()
        return response.json()

    async def update_wallet(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.patch(f"/api/wallets/{wallet_id}", json=payload)
        response.raise_for_status()
        return response.json()

    async def delete_wallet(self, wallet_id: str) -> None:
        response = await self.client.delete(f"/api/wallets/{wallet_id}")
        response.raise_for_status()

    async def set_default_wallet(self, wallet_id: str) -> dict[str, Any]:
        response = await self.client.post(f"/api/wallets/{wallet_id}/set-default")
        response.raise_for_status()
        return response.json()

    async def transfer_wallets(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/wallets/transfer", json=payload)
        response.raise_for_status()
        return response.json()

    async def credit_purchase(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post(f"/api/wallets/{wallet_id}/credit/purchase", json=payload)
        response.raise_for_status()
        return response.json()

    async def credit_repayment(self, wallet_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post(f"/api/wallets/{wallet_id}/credit/repay", json=payload)
        response.raise_for_status()
        return response.json()

    async def credit_statement(
        self,
        wallet_id: str,
        *,
        reference_date: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if reference_date:
            params["reference_date"] = reference_date
        response = await self.client.get(
            f"/api/wallets/{wallet_id}/credit/statement",
            params=params or None,
        )
        response.raise_for_status()
        return response.json()

    async def investment_roe(
        self,
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
        response = await self.client.get(
            f"/api/wallets/{wallet_id}/investment/roe",
            params=params or None,
        )
        response.raise_for_status()
        return response.json()

    async def create_debt(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/api/debts", json=payload)
        response.raise_for_status()
        return response.json()

    async def list_debts(self, *, user_id: str) -> list[dict[str, Any]]:
        response = await self.client.get("/api/debts", params={"user_id": user_id})
        response.raise_for_status()
        return response.json()

    async def apply_installment_payment(
        self,
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
        response = await self.client.post(
            f"/api/debts/installments/{installment_id}/pay",
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def update_debt_status(self, debt_id: str, *, status: str) -> dict[str, Any]:
        response = await self.client.patch(f"/api/debts/{debt_id}", json={"status": status})
        response.raise_for_status()
        return response.json()
