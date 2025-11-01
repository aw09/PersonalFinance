from __future__ import annotations
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock

from app.telegram import bot


class DummyMessage:
    """Minimal stand-in for a Telegram message used in handlers."""

    def __init__(self, text: str) -> None:
        self.text = text
        self.reply_text = AsyncMock()


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
        self.assertIn("Saved expense of 136000.00 IDR", call_args.args[0])
