from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, MagicMock, patch

from app.schemas.transaction import TransactionCreate, TransactionType
from app.services import transactions


class DummySession:
    def __init__(self) -> None:
        self.add = MagicMock()
        self.get: AsyncMock = AsyncMock()
        self.commit: AsyncMock = AsyncMock()
        self.refresh: AsyncMock = AsyncMock()


class TransactionWalletIntegrationTests(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.session = DummySession()
        self.user_id = uuid4()

    async def test_create_transaction_with_explicit_wallet_updates_balance(self) -> None:
        wallet_id = uuid4()
        wallet = SimpleNamespace(id=wallet_id, user_id=self.user_id, balance=Decimal("100.00"))
        self.session.get.return_value = wallet

        payload = TransactionCreate(
            type=TransactionType.EXPENSE,
            amount=Decimal("20.00"),
            currency="IDR",
            description="Dinner",
            occurred_at=date.today(),
            user_id=self.user_id,
            source="test",
            wallet_id=wallet_id,
        )

        transaction = await transactions.create_transaction(self.session, payload)

        self.session.get.assert_awaited_once_with(transactions.Wallet, wallet_id)
        self.session.add.assert_called_once_with(transaction)
        self.session.commit.assert_awaited_once()
        self.session.refresh.assert_awaited_once_with(transaction)
        self.assertEqual(transaction.wallet_id, wallet_id)
        self.assertEqual(wallet.balance, Decimal("80.00"))

    async def test_create_transaction_with_income_increases_balance(self) -> None:
        wallet_id = uuid4()
        wallet = SimpleNamespace(id=wallet_id, user_id=self.user_id, balance=Decimal("50.00"))
        self.session.get.return_value = wallet

        payload = TransactionCreate(
            type=TransactionType.INCOME,
            amount=Decimal("25.50"),
            currency="IDR",
            description="Freelance",
            occurred_at=date.today(),
            user_id=self.user_id,
            source="test",
            wallet_id=wallet_id,
        )

        await transactions.create_transaction(self.session, payload)

        self.assertEqual(wallet.balance, Decimal("75.50"))

    async def test_create_transaction_without_wallet_uses_default_wallet(self) -> None:
        wallet = SimpleNamespace(id=uuid4(), user_id=self.user_id, balance=Decimal("0.00"))
        with patch("app.services.transactions.ensure_default_wallet", new_callable=AsyncMock) as ensure_mock:
            ensure_mock.return_value = wallet

            payload = TransactionCreate(
                type=TransactionType.EXPENSE,
                amount=Decimal("10"),
                currency="IDR",
                description="Snacks",
                occurred_at=date.today(),
                user_id=self.user_id,
                source="test",
            )

            transaction = await transactions.create_transaction(self.session, payload)

        ensure_mock.assert_awaited_once_with(self.session, self.user_id)
        self.session.get.assert_not_called()
        self.assertEqual(transaction.wallet_id, wallet.id)

    async def test_create_transaction_rejects_wallet_from_other_user(self) -> None:
        wallet_id = uuid4()
        wallet = SimpleNamespace(id=wallet_id, user_id=uuid4(), balance=Decimal("0"))
        self.session.get.return_value = wallet

        payload = TransactionCreate(
            type=TransactionType.EXPENSE,
            amount=Decimal("5"),
            currency="IDR",
            description="Mismatch",
            occurred_at=date.today(),
            user_id=self.user_id,
            source="test",
            wallet_id=wallet_id,
        )

        with self.assertRaisesRegex(ValueError, "Wallet does not belong to user"):
            await transactions.create_transaction(self.session, payload)

        self.session.commit.assert_not_called()

    async def test_create_transaction_raises_when_wallet_missing(self) -> None:
        self.session.get.return_value = None
        wallet_id = uuid4()
        payload = TransactionCreate(
            type=TransactionType.EXPENSE,
            amount=Decimal("5"),
            currency="IDR",
            description="Missing wallet",
            occurred_at=date.today(),
            user_id=self.user_id,
            source="test",
            wallet_id=wallet_id,
        )

        with self.assertRaisesRegex(ValueError, "Wallet not found"):
            await transactions.create_transaction(self.session, payload)

        self.session.commit.assert_not_called()
