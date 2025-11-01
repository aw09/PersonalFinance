from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from app.telegram import bot


def _make_payment(amount: str, paid_at: str, *, transaction_id: str | None = None) -> dict:
    return {
        "id": UUID(int=0),
        "amount": amount,
        "paid_at": paid_at,
        "created_at": f"{paid_at}T00:00:00Z",
        "updated_at": f"{paid_at}T00:00:00Z",
        "transaction_id": transaction_id,
    }


def _make_installment(
    *,
    installment_id: str,
    amount: str,
    paid_amount: str,
    paid: bool,
    number: int = 1,
    due_date: str = "2024-02-01",
    payments: list[dict] | None = None,
) -> dict:
    return {
        "id": installment_id,
        "amount": amount,
        "paid_amount": paid_amount,
        "paid": paid,
        "paid_at": None,
        "installment_number": number,
        "due_date": due_date,
        "payments": payments or [],
    }


class DummyMessage:
    """Minimal stand-in for a Telegram message used in handlers."""

    def __init__(self, text: str | None = None, photo: list | None = None) -> None:
        self.text = text
        self.photo = photo or []
        self.reply_text = AsyncMock()


class DummyFile:
    def __init__(self, data: bytes) -> None:
        self._data = data

    async def download_to_memory(self, *, out: BytesIO):
        out.write(self._data)


class DummyPhoto:
    def __init__(self, data: bytes) -> None:
        self._file = DummyFile(data)

    async def get_file(self) -> DummyFile:
        return self._file


class TelegramBotTests(IsolatedAsyncioTestCase):
    async def test_add_command_creates_transaction(self) -> None:
        message = DummyMessage("/add expense 136000 Sekala")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name="Faris Tester"),
        )

        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": str(UUID("11111111-2222-3333-4444-555555555555"))}
        api_client.create_transaction.return_value = {
            "type": "expense",
            "amount": "136000.00",
            "currency": "IDR",
            "description": "Sekala",
            "source": "telegram",
        }

        context = SimpleNamespace(application=SimpleNamespace(bot_data={"api_client": api_client}))

        await bot.add(update, context)

        api_client.ensure_user.assert_awaited_once_with(528101001, "Faris Tester")
        api_client.create_transaction.assert_awaited_once()

        payload = api_client.create_transaction.await_args.args[0]
        expected_amount = str(Decimal("136000").quantize(Decimal("0.01")))
        self.assertEqual(
            payload,
            {
                "type": "expense",
                "amount": expected_amount,
                "description": "Sekala",
                "occurred_at": bot.date.today().isoformat(),
                "currency": "IDR",
                "source": "telegram",
                "user_id": str(UUID("11111111-2222-3333-4444-555555555555")),
            },
        )
        message.reply_text.assert_awaited_once()
        call_args = message.reply_text.await_args
        self.assertIn("Saved expense of 136 K IDR", call_args.args[0])

    async def test_free_text_quick_entry_shorthand(self) -> None:
        message = DummyMessage("e indomaret 50000")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": str(UUID("11111111-2222-3333-4444-555555555555"))}
        api_client.create_transaction.return_value = {
            "type": "expense",
            "amount": "50000.00",
            "currency": "IDR",
            "description": "indomaret",
            "source": "telegram",
        }
        context = SimpleNamespace(application=SimpleNamespace(bot_data={"api_client": api_client}))

        await bot.free_text_transaction(update, context)

        api_client.ensure_user.assert_awaited_once()
        api_client.create_transaction.assert_awaited_once()
        payload = api_client.create_transaction.await_args.args[0]
        self.assertEqual(payload["type"], "expense")
        self.assertEqual(payload["description"], "indomaret")

    async def test_receipt_photo_parses_image(self) -> None:
        photo_data = b"fake-image"
        message = DummyMessage(photo=[DummyPhoto(photo_data)])
        status_message = AsyncMock()
        status_message.edit_text = AsyncMock()
        message.reply_text.return_value = status_message
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name="Faris Tester"),
        )

        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": str(UUID("11111111-2222-3333-4444-555555555555"))}
        api_client.parse_receipt.return_value = {
            "type": "expense",
            "amount": "45.67",
            "currency": "IDR",
            "description": "Receipt import",
        }

        context = SimpleNamespace(application=SimpleNamespace(bot_data={"api_client": api_client}))

        await bot.receipt_photo(update, context)

        api_client.ensure_user.assert_awaited_once_with(528101001, "Faris Tester")
        api_client.parse_receipt.assert_awaited_once()
        args, kwargs = api_client.parse_receipt.await_args
        self.assertEqual(args[0], photo_data)
        self.assertEqual(kwargs["user_id"], str(UUID("11111111-2222-3333-4444-555555555555")))
        message.reply_text.assert_awaited_once_with("Processing receipt...")
        status_message.edit_text.assert_awaited_once()
        final_text = (
            status_message.edit_text.await_args.kwargs.get("text")
            or status_message.edit_text.await_args.args[0]
        )
        self.assertIn("Receipt saved as expense of 45.67 IDR", final_text)

    async def test_help_command_lists_features(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(message=message)
        await bot.help_command(update, SimpleNamespace())
        message.reply_text.assert_awaited_once()
        help_text = message.reply_text.await_args.args[0]
        self.assertIn("/report", help_text)
        self.assertIn("receipt", help_text.lower())
        self.assertIn("shorthand", help_text.lower())

    async def test_report_command_generates_summary(self) -> None:
        today = bot.date.today()
        with patch("app.telegram.bot._parse_report_range", return_value=(today, today, "today")):
            message = DummyMessage("/report")
            update = SimpleNamespace(
                message=message,
                effective_user=SimpleNamespace(id=528101001, full_name="Faris Tester"),
            )
            api_client = AsyncMock()
            api_client.ensure_user.return_value = {"id": str(UUID("11111111-2222-3333-4444-555555555555"))}
            api_client.list_transactions.return_value = [
                {
                    "type": "expense",
                    "amount": "10000",
                    "currency": "IDR",
                    "occurred_at": today.isoformat(),
                },
                {
                    "type": "income",
                    "amount": "50000",
                    "currency": "IDR",
                    "occurred_at": today.isoformat(),
                },
            ]
            context = SimpleNamespace(
                application=SimpleNamespace(bot_data={"api_client": api_client}),
                args=[],
            )

            await bot.report(update, context)

            api_client.list_transactions.assert_awaited_once_with(
                user_id=str(UUID("11111111-2222-3333-4444-555555555555"))
            )
            message.reply_text.assert_awaited_once()
            report_text = message.reply_text.await_args.args[0]
            self.assertIn("Report for today", report_text)
            self.assertIn("- Expense: 10 K IDR", report_text)
            self.assertIn("- Income: 50 K IDR", report_text)
            self.assertIn("- Net: 40 K IDR", report_text)

    async def test_lend_command_creates_debt_and_transaction(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.create_debt.return_value = {"id": "debt-1"}
        api_client.create_transaction.return_value = {"id": "tx-1"}
        api_client.list_debts.return_value = [
            {
                "id": "debt-1",
                "name": "Adi",
                "installments": [
                    _make_installment(
                        installment_id="inst-1",
                        amount="50000",
                        paid_amount="0",
                        paid=False,
                        payments=[],
                    )
                ],
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["Adi", "50000"],
        )

        await bot.lend(update, context)

        api_client.create_debt.assert_awaited_once()
        api_client.create_transaction.assert_awaited_once()
        message.reply_text.assert_awaited()
        response_text = "\n".join(arg for arg in message.reply_text.await_args.args)
        self.assertIn("Adi", response_text)
        self.assertIn("Outstanding balance", response_text)

    async def test_repay_command_partial_payment(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        initial_installment = _make_installment(
            installment_id="inst-1",
            amount="50000",
            paid_amount="0",
            paid=False,
            payments=[],
        )
        api_client.list_debts.return_value = [
            {
                "id": "debt-1",
                "name": "Adi",
                "created_at": "2024-01-01T00:00:00Z",
                "installments": [initial_installment],
            }
        ]
        api_client.create_transaction.return_value = {"id": "tx-1"}
        updated_installment = _make_installment(
            installment_id="inst-1",
            amount="50000",
            paid_amount="30000",
            paid=False,
            payments=[
                _make_payment("30000", date.today().isoformat(), transaction_id="tx-1"),
            ],
        )
        api_client.apply_installment_payment.return_value = {
            **updated_installment,
            "paid": False,
        }
        api_client.list_debts.side_effect = [
            api_client.list_debts.return_value,
            [
                {
                    "id": "debt-1",
                    "name": "Adi",
                    "created_at": "2024-01-01T00:00:00Z",
                    "installments": [updated_installment],
                }
            ],
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["Adi", "30000"],
        )

        await bot.repay(update, context)

        api_client.apply_installment_payment.assert_awaited_once()
        message.reply_text.assert_awaited()
        reply = "\n"
        reply = "\n".join(arg for arg in message.reply_text.await_args.args)
        self.assertIn("20 K IDR", reply)


    async def test_repay_all_reduces_all_outstanding(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        first_installment = _make_installment(
            installment_id="inst-1",
            amount="60000",
            paid_amount="10000",
            paid=False,
            number=1,
            payments=[
                _make_payment("10000", "2025-11-01", transaction_id="tx-old"),
            ],
        )
        second_installment = _make_installment(
            installment_id="inst-2",
            amount="50000",
            paid_amount="0",
            paid=False,
            number=2,
            payments=[],
        )
        api_client.list_debts.return_value = [
            {
                "id": "debt-1",
                "name": "Adi",
                "created_at": "2025-11-01",
                "installments": [first_installment, second_installment],
            }
        ]
        api_client.create_transaction.return_value = {"id": "tx-all"}

        first_update = _make_installment(
            installment_id="inst-1",
            amount="60000",
            paid_amount="60000",
            paid=True,
            number=1,
            payments=[
                _make_payment("10000", "2025-11-01", transaction_id="tx-old"),
                _make_payment("50000", date.today().isoformat(), transaction_id="tx-all"),
            ],
        )
        second_update = _make_installment(
            installment_id="inst-2",
            amount="50000",
            paid_amount="50000",
            paid=True,
            number=2,
            payments=[
                _make_payment("50000", date.today().isoformat(), transaction_id="tx-all"),
            ],
        )
        api_client.apply_installment_payment.side_effect = [
            {**first_update, "paid": True},
            {**second_update, "paid": True},
        ]
        api_client.list_debts.side_effect = [
            api_client.list_debts.return_value,
            [
                {
                    "id": "debt-1",
                    "name": "Adi",
                    "created_at": "2025-11-01",
                    "installments": [first_update, second_update],
                }
            ],
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["Adi", "all"],
        )

        await bot.repay(update, context)

        api_client.create_transaction.assert_awaited_once()
        tx_payload = api_client.create_transaction.await_args.args[0]
        self.assertEqual(tx_payload["amount"], "100000.00")
        self.assertEqual(tx_payload["description"], "Full repayment")

        self.assertEqual(api_client.apply_installment_payment.await_count, 2)
        first_call_amount = api_client.apply_installment_payment.await_args_list[0].kwargs["amount"]
        second_call_amount = api_client.apply_installment_payment.await_args_list[1].kwargs["amount"]
        first_call_amount = api_client.apply_installment_payment.await_args_list[0].kwargs["amount"]
        second_call_amount = api_client.apply_installment_payment.await_args_list[1].kwargs["amount"]

        message.reply_text.assert_awaited()
        text = "\n".join(arg for arg in message.reply_text.await_args.args)
        self.assertIn("Full repayment", text)
    async def test_owed_summary_lists_people(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.list_debts.return_value = [
            {
                "id": "debt-1",
                "name": "Adi",
                "installments": [
                    _make_installment(
                        installment_id="inst-1",
                        amount="50000",
                        paid_amount="0",
                        paid=False,
                        payments=[],
                    )
                ],
            },
            {
                "id": "debt-2",
                "name": "Budi",
                "installments": [
                    _make_installment(
                        installment_id="inst-2",
                        amount="75000",
                        paid_amount="0",
                        paid=False,
                        payments=[],
                    )
                ],
            },
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=[],
        )

        await bot.owed(update, context)

        message.reply_text.assert_awaited()
        summary = "\n"
        summary = "\n".join(arg for arg in message.reply_text.await_args.args)
        self.assertIn("Budi", summary)

    async def test_owed_detail_shows_partial_payments(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.list_debts.return_value = [
            {
                "id": "debt-1",
                "name": "Adi",
                "created_at": "2025-11-01",
                "installments": [
                    _make_installment(
                        installment_id="inst-1",
                        amount="85000",
                        paid_amount="80000",
                        paid=False,
                        number=1,
                        due_date="2025-11-01",
                        payments=[
                            _make_payment("40000", "2025-11-02", transaction_id="tx-1"),
                            _make_payment("40000", "2025-11-04", transaction_id="tx-2"),
                        ],
                    ),
                    _make_installment(
                        installment_id="inst-2",
                        amount="5000",
                        paid_amount="0",
                        paid=False,
                        number=2,
                        due_date="2025-12-01",
                        payments=[],
                    ),
                ],
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["Adi"],
        )

        await bot.owed(update, context)

        message.reply_text.assert_awaited()
        text = "\n"
        text = "\n".join(arg for arg in message.reply_text.await_args.args)
        self.assertIn("Paid 40 K IDR on 2025-11-04", text)
