from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from app.telegram import bot


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
