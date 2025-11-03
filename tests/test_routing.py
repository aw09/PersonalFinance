from __future__ import annotations

import io
import os
import unittest
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4
from unittest.mock import ANY, AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/testdb")
os.environ.setdefault("AUTO_RUN_MIGRATIONS", "false")

from fastapi.testclient import TestClient  # noqa: E402

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.transaction import TransactionType  # noqa: E402


def build_transaction_payload(
    *,
    user_id: UUID,
    transaction_id: UUID | None = None,
    source: str = "manual",
) -> dict:
    """Create a dictionary shaped like a Transaction ORM instance."""
    now = datetime.utcnow()
    return {
        "id": transaction_id or uuid4(),
        "type": TransactionType.EXPENSE,
        "amount": Decimal("12.34"),
        "currency": "IDR",
        "description": "Groceries",
        "category": "Food",
        "occurred_at": date(2024, 1, 1),
        "items": None,
        "metadata_json": {"note": "test"},
        "source": source,
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }


def build_installment_payload(debt_id: UUID, *, paid: bool = False) -> dict:
    """Create a dictionary shaped like a DebtInstallment ORM instance."""
    now = datetime.utcnow()
    return {
        "id": uuid4(),
        "debt_id": debt_id,
        "installment_number": 1,
        "due_date": date(2024, 2, 1),
        "amount": Decimal("100.00"),
        "paid_amount": Decimal("100.00") if paid else Decimal("0"),
        "paid": paid,
        "paid_at": date.today() if paid else None,
        "transaction_id": None,
        "created_at": now,
        "updated_at": now,
        "payments": [
            {
                "id": uuid4(),
                "installment_id": debt_id,
                "amount": Decimal("100.00"),
                "paid_at": date.today() if paid else date(1970, 1, 1),
                "transaction_id": None,
                "created_at": now,
                "updated_at": now,
            }
        ] if paid else [],
    }


def build_debt_payload(*, user_id: UUID, debt_id: UUID | None = None) -> dict:
    """Create a dictionary shaped like a Debt ORM instance."""
    now = datetime.utcnow()
    debt_uuid = debt_id or uuid4()
    installment = build_installment_payload(debt_uuid, paid=False)
    return {
        "id": debt_uuid,
        "name": "Car Loan",
        "description": "Monthly car loan",
        "principal_amount": Decimal("1000.00"),
        "total_installments": 10,
        "start_date": date(2024, 1, 1),
        "interest_rate": Decimal("2.5"),
        "status": "active",
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
        "installments": [installment],
    }


def build_user_payload(*, user_id: UUID | None = None, default_wallet_id: UUID | None = None) -> dict:
    """Create a dictionary shaped like a User ORM instance."""
    now = datetime.utcnow()
    return {
        "id": user_id or uuid4(),
        "telegram_id": 123456,
        "full_name": "Test User",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "default_wallet_id": default_wallet_id,
    }


class FakeReceiptService:
    """Simple async-friendly fake for the LLM receipt extraction service."""

    def __init__(self, payload: dict):
        self.payload = payload
        self.called = False

    async def parse_receipt(self, image_bytes: bytes) -> dict:
        self.called = True
        return self.payload


class RoutingTests(unittest.TestCase):
    """Ensure FastAPI routers respond and delegate as expected."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._init_db_patch = patch("app.main.init_db", new=AsyncMock())
        cls._init_bot_patch = patch("app.main.init_bot", new=AsyncMock())
        cls._shutdown_bot_patch = patch("app.main.shutdown_bot", new=AsyncMock())

        cls._create_tx_patch = patch("app.api.transactions.create_transaction", new_callable=AsyncMock)
        cls._list_tx_patch = patch("app.api.transactions.list_transactions", new_callable=AsyncMock)
        cls._get_tx_patch = patch("app.api.transactions.get_transaction", new_callable=AsyncMock)

        cls._create_debt_patch = patch("app.api.debts.create_debt", new_callable=AsyncMock)
        cls._list_debt_patch = patch("app.api.debts.list_debts", new_callable=AsyncMock)
        cls._get_debt_patch = patch("app.api.debts.get_debt", new_callable=AsyncMock)
        cls._update_debt_patch = patch("app.api.debts.update_debt", new_callable=AsyncMock)
        cls._get_installment_patch = patch("app.api.debts.get_installment", new_callable=AsyncMock)
        cls._mark_installment_patch = patch("app.api.debts.mark_installment_paid", new_callable=AsyncMock)

        cls._create_user_patch = patch("app.api.users.create_user", new_callable=AsyncMock)
        cls._list_users_patch = patch("app.api.users.list_users", new_callable=AsyncMock)
        cls._get_user_patch = patch("app.api.users.get_user", new_callable=AsyncMock)
        cls._get_user_by_telegram_patch = patch(
            "app.api.users.get_user_by_telegram_id", new_callable=AsyncMock
        )

        cls._create_wallet_patch = patch("app.api.wallets.create_wallet", new_callable=AsyncMock)
        cls._list_wallets_patch = patch("app.api.wallets.list_wallets", new_callable=AsyncMock)
        cls._get_wallet_patch = patch("app.api.wallets.get_wallet", new_callable=AsyncMock)
        cls._update_wallet_patch = patch("app.api.wallets.update_wallet", new_callable=AsyncMock)
        cls._wallet_deposit_patch = patch("app.api.wallets.wallet_deposit", new_callable=AsyncMock)
        cls._wallet_withdraw_patch = patch("app.api.wallets.wallet_withdraw", new_callable=AsyncMock)
        cls._wallet_adjust_patch = patch("app.api.wallets.wallet_adjust", new_callable=AsyncMock)
        cls._wallet_get_user_patch = patch("app.api.wallets.get_user", new_callable=AsyncMock)
        cls._set_default_wallet_patch = patch("app.api.wallets.set_default_wallet", new_callable=AsyncMock)

        cls._receipt_service_patch = patch("app.api.llm.get_receipt_service")
        cls._llm_create_tx_patch = patch("app.api.llm.create_transaction", new_callable=AsyncMock)

        cls._handle_update_patch = patch("app.api.telegram.handle_update", new_callable=AsyncMock)
        cls._telegram_settings_patch = patch(
            "app.api.telegram.get_settings",
            return_value=SimpleNamespace(telegram_webhook_secret="secret123"),
        )

        cls.init_db_mock = cls._init_db_patch.start()
        cls.init_bot_mock = cls._init_bot_patch.start()
        cls.shutdown_bot_mock = cls._shutdown_bot_patch.start()

        cls.create_transaction_mock = cls._create_tx_patch.start()
        cls.list_transactions_mock = cls._list_tx_patch.start()
        cls.get_transaction_mock = cls._get_tx_patch.start()

        cls.create_debt_mock = cls._create_debt_patch.start()
        cls.list_debts_mock = cls._list_debt_patch.start()
        cls.get_debt_mock = cls._get_debt_patch.start()
        cls.update_debt_mock = cls._update_debt_patch.start()
        cls.get_installment_mock = cls._get_installment_patch.start()
        cls.mark_installment_mock = cls._mark_installment_patch.start()

        cls.create_user_mock = cls._create_user_patch.start()
        cls.list_users_mock = cls._list_users_patch.start()
        cls.get_user_mock = cls._get_user_patch.start()
        cls.get_user_by_telegram_mock = cls._get_user_by_telegram_patch.start()

        cls.create_wallet_mock = cls._create_wallet_patch.start()
        cls.list_wallets_mock = cls._list_wallets_patch.start()
        cls.get_wallet_mock = cls._get_wallet_patch.start()
        cls.update_wallet_mock = cls._update_wallet_patch.start()
        cls.wallet_deposit_mock = cls._wallet_deposit_patch.start()
        cls.wallet_withdraw_mock = cls._wallet_withdraw_patch.start()
        cls.wallet_adjust_mock = cls._wallet_adjust_patch.start()
        cls.wallet_get_user_mock = cls._wallet_get_user_patch.start()
        cls.set_default_wallet_mock = cls._set_default_wallet_patch.start()

        cls.get_receipt_service_mock = cls._receipt_service_patch.start()
        cls.llm_create_transaction_mock = cls._llm_create_tx_patch.start()

        cls.handle_update_mock = cls._handle_update_patch.start()
        cls.telegram_settings_mock = cls._telegram_settings_patch.start()

        class _DummySession:
            async def refresh(self, *_args, **_kwargs):
                return None

        cls._dummy_session = _DummySession()

        async def _override_db():
            yield cls._dummy_session

        app.dependency_overrides[get_db] = _override_db

        cls._client_ctx = TestClient(app)
        cls.client = cls._client_ctx.__enter__()

        cls.async_mocks = [
            cls.create_transaction_mock,
            cls.list_transactions_mock,
            cls.get_transaction_mock,
            cls.create_debt_mock,
            cls.list_debts_mock,
            cls.get_debt_mock,
            cls.update_debt_mock,
            cls.get_installment_mock,
            cls.mark_installment_mock,
            cls.create_user_mock,
            cls.list_users_mock,
            cls.get_user_mock,
            cls.get_user_by_telegram_mock,
            cls.create_wallet_mock,
            cls.list_wallets_mock,
            cls.get_wallet_mock,
            cls.update_wallet_mock,
            cls.wallet_deposit_mock,
            cls.wallet_withdraw_mock,
            cls.wallet_adjust_mock,
            cls.wallet_get_user_mock,
            cls.set_default_wallet_mock,
            cls.llm_create_transaction_mock,
            cls.handle_update_mock,
        ]

    @classmethod
    def tearDownClass(cls) -> None:
        cls._client_ctx.__exit__(None, None, None)
        app.dependency_overrides.pop(get_db, None)

        patchers = [
            cls._create_tx_patch,
            cls._list_tx_patch,
            cls._get_tx_patch,
            cls._create_debt_patch,
            cls._list_debt_patch,
            cls._get_debt_patch,
            cls._update_debt_patch,
            cls._get_installment_patch,
            cls._mark_installment_patch,
            cls._create_user_patch,
            cls._list_users_patch,
            cls._get_user_patch,
            cls._get_user_by_telegram_patch,
            cls._create_wallet_patch,
            cls._list_wallets_patch,
            cls._get_wallet_patch,
            cls._update_wallet_patch,
            cls._wallet_deposit_patch,
            cls._wallet_withdraw_patch,
            cls._wallet_adjust_patch,
            cls._wallet_get_user_patch,
            cls._set_default_wallet_patch,
            cls._receipt_service_patch,
            cls._llm_create_tx_patch,
            cls._handle_update_patch,
            cls._telegram_settings_patch,
            cls._init_db_patch,
            cls._init_bot_patch,
            cls._shutdown_bot_patch,
        ]
        for patcher in patchers:
            patcher.stop()

    def setUp(self) -> None:
        for mock in self.async_mocks:
            mock.reset_mock()
        self.get_receipt_service_mock.reset_mock()

        wallet_id = uuid4()
        self.user = build_user_payload(default_wallet_id=wallet_id)
        self.transaction = build_transaction_payload(user_id=self.user["id"], source="manual")
        self.llm_transaction = build_transaction_payload(user_id=self.user["id"], source="llm")
        self.debt = build_debt_payload(user_id=self.user["id"])
        self.installment = self.debt["installments"][0]
        self.paid_installment = {
            **self.installment,
            "paid": True,
            "paid_at": date.today(),
            "paid_amount": Decimal("100.00"),
            "payments": [
                {
                    "id": uuid4(),
                    "installment_id": self.installment["id"],
                    "amount": Decimal("100.00"),
                    "paid_at": date.today(),
                    "transaction_id": None,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            ],
        }

        now = datetime.utcnow()
        self.wallet = {
            "id": wallet_id,
            "user_id": self.user["id"],
            "name": "Main Wallet",
            "type": "regular",
            "balance": Decimal("0.00"),
            "currency": "IDR",
            "credit_limit": None,
            "settlement_day": None,
            "created_at": now,
            "updated_at": now,
            "is_default": True,
        }
        self.wallet_get_user_mock.return_value = self.user

        self.create_transaction_mock.return_value = self.transaction
        self.list_transactions_mock.return_value = [self.transaction]
        self.get_transaction_mock.return_value = self.transaction

        self.create_debt_mock.return_value = self.debt
        self.list_debts_mock.return_value = [self.debt]
        self.get_debt_mock.return_value = self.debt
        self.update_debt_mock.return_value = self.debt
        self.get_installment_mock.return_value = self.installment
        self.mark_installment_mock.return_value = self.paid_installment

        self.create_wallet_mock.return_value = self.wallet
        self.list_wallets_mock.return_value = [self.wallet]
        self.get_wallet_mock.return_value = self.wallet
        self.update_wallet_mock.return_value = self.wallet
        self.wallet_deposit_mock.return_value = None
        self.wallet_withdraw_mock.return_value = None
        self.wallet_adjust_mock.return_value = None
        self.wallet_deposit_mock.side_effect = None
        self.wallet_withdraw_mock.side_effect = None
        self.wallet_adjust_mock.side_effect = None
        self.wallet_get_user_mock.side_effect = None
        self.set_default_wallet_mock.return_value = self.wallet
        self.set_default_wallet_mock.side_effect = None
        self.create_user_mock.return_value = self.user
        self.list_users_mock.return_value = [self.user]
        self.get_user_mock.return_value = self.user
        self.get_user_by_telegram_mock.return_value = self.user

        receipt_payload = {
            "transaction": {
                "type": TransactionType.EXPENSE.value,
                "amount": "45.67",
                "currency": "IDR",
                "description": "Receipt import",
                "category": "Food",
                "occurred_at": date.today().isoformat(),
            },
            "items": [
                {
                    "name": "Item A",
                    "quantity": 1,
                    "unit_price": "45.67",
                    "total_price": "45.67",
                    "category": "Food",
                }
            ],
            "metadata": {"confidence": 0.9},
        }
        self.fake_receipt_service = FakeReceiptService(receipt_payload)
        self.get_receipt_service_mock.return_value = self.fake_receipt_service
        self.llm_create_transaction_mock.return_value = self.llm_transaction

    def test_healthcheck(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_create_transaction_route(self) -> None:
        payload = {
            "type": "expense",
            "amount": "12.34",
            "currency": "IDR",
            "description": "Groceries",
            "category": "Food",
            "occurred_at": "2024-01-01",
            "source": "manual",
            "user_id": str(self.user["id"]),
        }
        response = self.client.post("/api/transactions", json=payload)
        self.assertEqual(response.status_code, 201)
        self.create_transaction_mock.assert_awaited_once()
        body = response.json()
        self.assertEqual(body["type"], "expense")
        self.assertEqual(body["user_id"], str(self.user["id"]))

    def test_list_transactions_route(self) -> None:
        response = self.client.get("/api/transactions")
        self.assertEqual(response.status_code, 200)
        self.list_transactions_mock.assert_awaited_once()
        body = response.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["id"], str(self.transaction["id"]))

    def test_get_transaction_route(self) -> None:
        tx_id = self.transaction["id"]
        response = self.client.get(f"/api/transactions/{tx_id}")
        self.assertEqual(response.status_code, 200)
        self.get_transaction_mock.assert_awaited_once_with(ANY, tx_id)
        self.assertEqual(response.json()["id"], str(tx_id))

    def test_get_transaction_not_found(self) -> None:
        self.get_transaction_mock.return_value = None
        tx_id = uuid4()
        response = self.client.get(f"/api/transactions/{tx_id}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Transaction not found")

    def test_create_debt_route(self) -> None:
        payload = {
            "name": "Car Loan",
            "principal_amount": "1000",
            "total_installments": 10,
            "start_date": "2024-01-01",
            "user_id": str(self.user["id"]),
        }
        response = self.client.post("/api/debts", json=payload)
        self.assertEqual(response.status_code, 201)
        self.create_debt_mock.assert_awaited_once()
        self.assertEqual(response.json()["id"], str(self.debt["id"]))

    def test_list_debts_route(self) -> None:
        response = self.client.get("/api/debts")
        self.assertEqual(response.status_code, 200)
        self.list_debts_mock.assert_awaited_once()
        self.assertEqual(len(response.json()), 1)

    def test_get_debt_route(self) -> None:
        debt_id = self.debt["id"]
        response = self.client.get(f"/api/debts/{debt_id}")
        self.assertEqual(response.status_code, 200)
        self.get_debt_mock.assert_awaited_once_with(ANY, debt_id)
        self.assertEqual(response.json()["id"], str(debt_id))

    def test_get_debt_not_found(self) -> None:
        self.get_debt_mock.return_value = None
        response = self.client.get(f"/api/debts/{uuid4()}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Debt not found")

    def test_update_debt_route(self) -> None:
        debt_id = self.debt["id"]
        updated = {**self.debt, "description": "Updated description"}
        self.update_debt_mock.return_value = updated
        response = self.client.patch(f"/api/debts/{debt_id}", json={"description": "Updated description"})
        self.assertEqual(response.status_code, 200)
        self.update_debt_mock.assert_awaited_once()
        self.assertEqual(response.json()["description"], "Updated description")

    def test_update_debt_not_found(self) -> None:
        self.get_debt_mock.return_value = None
        response = self.client.patch(f"/api/debts/{uuid4()}", json={"description": "Update"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Debt not found")

    def test_mark_installment_paid_route(self) -> None:
        installment_id = self.installment["id"]
        response = self.client.post(
            f"/api/debts/installments/{installment_id}/pay", json={"paid_at": date.today().isoformat()}
        )
        self.assertEqual(response.status_code, 200)
        self.mark_installment_mock.assert_awaited_once()
        self.assertTrue(response.json()["paid"])

    def test_mark_installment_not_found(self) -> None:
        self.get_installment_mock.return_value = None
        response = self.client.post(
            f"/api/debts/installments/{uuid4()}/pay", json={"paid_at": date.today().isoformat()}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Installment not found")

    def test_llm_receipt_preview_route(self) -> None:
        files = {"file": ("receipt.jpg", io.BytesIO(b"fake-bytes"), "image/jpeg")}
        data = {
            "commit_transaction": "false",
            "user_id": str(self.user["id"]),
        }
        response = self.client.post("/api/llm/receipt", data=data, files=files)
        self.assertEqual(response.status_code, 202)
        self.assertTrue(self.fake_receipt_service.called)
        self.llm_create_transaction_mock.assert_not_called()
        body = response.json()
        self.assertEqual(body["message"], "Preview only, not stored.")

    def test_llm_receipt_commit_route(self) -> None:
        files = {"file": ("receipt.jpg", io.BytesIO(b"fake-bytes"), "image/jpeg")}
        data = {
            "commit_transaction": "true",
            "user_id": str(self.user["id"]),
        }
        response = self.client.post("/api/llm/receipt", data=data, files=files)
        self.assertEqual(response.status_code, 201)
        self.llm_create_transaction_mock.assert_awaited_once()
        self.assertEqual(response.json()["source"], "llm")

    def test_telegram_webhook_route(self) -> None:
        payload = {"update_id": 1}
        response = self.client.post("/api/telegram/webhook/secret123", json=payload)
        self.assertEqual(response.status_code, 204)
        self.handle_update_mock.assert_awaited_once_with(payload)

    def test_telegram_webhook_bad_secret(self) -> None:
        response = self.client.post("/api/telegram/webhook/wrong", json={"update_id": 1})
        self.assertEqual(response.status_code, 404)

    def test_create_user_route(self) -> None:
        payload = {
            "telegram_id": 123456,
            "full_name": "Test User",
        }
        response = self.client.post("/api/users", json=payload)
        self.assertEqual(response.status_code, 201)
        self.create_user_mock.assert_awaited_once()
        self.assertEqual(response.json()["id"], str(self.user["id"]))

    def test_list_users_route(self) -> None:
        response = self.client.get("/api/users")
        self.assertEqual(response.status_code, 200)
        self.list_users_mock.assert_awaited_once()
        body = response.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["telegram_id"], self.user["telegram_id"])

    def test_get_user_route(self) -> None:
        user_id = self.user["id"]
        response = self.client.get(f"/api/users/{user_id}")
        self.assertEqual(response.status_code, 200)
        self.get_user_mock.assert_awaited_once_with(ANY, user_id)
        self.assertEqual(response.json()["id"], str(user_id))

    def test_get_user_not_found(self) -> None:
        self.get_user_mock.return_value = None
        response = self.client.get(f"/api/users/{uuid4()}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "User not found")

    def test_get_user_by_telegram_route(self) -> None:
        response = self.client.get("/api/users/by-telegram/123456")
        self.assertEqual(response.status_code, 200)
        self.get_user_by_telegram_mock.assert_awaited_once_with(ANY, 123456)
        self.assertEqual(response.json()["telegram_id"], self.user["telegram_id"])

    def test_get_user_by_telegram_not_found(self) -> None:
        self.get_user_by_telegram_mock.return_value = None
        response = self.client.get("/api/users/by-telegram/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "User not found")

    def test_list_wallets_route(self) -> None:
        response = self.client.get(f"/api/wallets?user_id={self.user['id']}")
        self.assertEqual(response.status_code, 200)
        self.list_wallets_mock.assert_awaited_once()
        body = response.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["id"], str(self.wallet["id"]))
        self.assertTrue(body[0]["is_default"])

    def test_create_wallet_route(self) -> None:
        new_wallet = {
            **self.wallet,
            "id": uuid4(),
            "name": "Savings",
            "type": "regular",
            "is_default": False,
        }
        self.create_wallet_mock.return_value = new_wallet
        payload = {
            "user_id": str(self.user["id"]),
            "name": "Savings",
            "type": "regular",
            "currency": "IDR",
        }
        response = self.client.post("/api/wallets", json=payload)
        self.assertEqual(response.status_code, 201)
        self.create_wallet_mock.assert_awaited_once()
        self.assertEqual(response.json()["name"], "Savings")
        self.assertEqual(response.json()["type"], "regular")
        self.assertFalse(response.json()["is_default"])

    def test_create_wallet_route_make_default(self) -> None:
        new_wallet_id = uuid4()
        new_wallet = {
            **self.wallet,
            "id": new_wallet_id,
            "name": "Savings",
            "type": "regular",
            "is_default": True,
        }
        self.create_wallet_mock.return_value = new_wallet
        self.wallet_get_user_mock.return_value = {
            **self.user,
            "default_wallet_id": new_wallet_id,
        }
        payload = {
            "user_id": str(self.user["id"]),
            "name": "Savings",
            "type": "regular",
            "currency": "IDR",
            "make_default": True,
        }
        response = self.client.post("/api/wallets", json=payload)
        self.assertEqual(response.status_code, 201)
        self.create_wallet_mock.assert_awaited_once()
        body = response.json()
        self.assertTrue(body["is_default"])
        self.assertEqual(body["id"], str(new_wallet_id))

    def test_wallet_update_route(self) -> None:
        wallet_id = self.wallet["id"]
        response = self.client.patch(
            f"/api/wallets/{wallet_id}",
            json={"name": "Travel", "currency": "USD"},
        )
        self.assertEqual(response.status_code, 200)
        self.update_wallet_mock.assert_awaited_once()

    def test_wallet_deposit_route(self) -> None:
        amount = "150000.00"
        payload = {"amount": amount, "description": "Initial top up"}
        response = self.client.post(f"/api/wallets/{self.wallet['id']}/deposit", json=payload)
        self.assertEqual(response.status_code, 200)
        self.get_wallet_mock.assert_awaited_once()
        self.wallet_deposit_mock.assert_awaited_once()
        self.assertEqual(response.json()["id"], str(self.wallet["id"]))
        self.assertTrue(response.json()["is_default"])

    def test_wallet_deposit_not_found(self) -> None:
        self.get_wallet_mock.return_value = None
        response = self.client.post(f"/api/wallets/{uuid4()}/deposit", json={"amount": "10.00"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Wallet not found")

    def test_wallet_deposit_validation_error(self) -> None:
        self.wallet_deposit_mock.side_effect = ValueError("Deposit amount must be positive")
        response = self.client.post(f"/api/wallets/{self.wallet['id']}/deposit", json={"amount": "-5.00"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Deposit amount must be positive")

    def test_wallet_withdraw_route(self) -> None:
        payload = {"amount": "50000.00", "description": "Cash out"}
        response = self.client.post(f"/api/wallets/{self.wallet['id']}/withdraw", json=payload)
        self.assertEqual(response.status_code, 200)
        self.wallet_withdraw_mock.assert_awaited_once()
        self.assertEqual(response.json()["id"], str(self.wallet["id"]))
        self.assertTrue(response.json()["is_default"])

    def test_wallet_adjust_route(self) -> None:
        payload = {"amount": "1000.00", "description": "Balance tweak"}
        response = self.client.post(f"/api/wallets/{self.wallet['id']}/adjust", json=payload)
        self.assertEqual(response.status_code, 200)
        self.wallet_adjust_mock.assert_awaited_once()
        self.assertEqual(response.json()["id"], str(self.wallet["id"]))
        self.assertTrue(response.json()["is_default"])

    def test_wallet_set_default_route(self) -> None:
        new_wallet = {
            **self.wallet,
            "id": uuid4(),
            "is_default": True,
        }
        self.get_wallet_mock.return_value = new_wallet
        self.set_default_wallet_mock.return_value = new_wallet
        self.wallet_get_user_mock.return_value = {
            **self.user,
            "default_wallet_id": new_wallet["id"],
        }
        response = self.client.post(f"/api/wallets/{new_wallet['id']}/set-default")
        self.assertEqual(response.status_code, 200)
        self.set_default_wallet_mock.assert_awaited_once()
        body = response.json()
        self.assertEqual(body["id"], str(new_wallet["id"]))
        self.assertTrue(body["is_default"])

    def test_wallet_set_default_not_found(self) -> None:
        self.get_wallet_mock.return_value = None
        response = self.client.post(f"/api/wallets/{uuid4()}/set-default")
        self.assertEqual(response.status_code, 404)

    def test_wallet_set_default_error(self) -> None:
        self.set_default_wallet_mock.side_effect = ValueError("User not found")
        response = self.client.post(f"/api/wallets/{self.wallet['id']}/set-default")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "User not found")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
