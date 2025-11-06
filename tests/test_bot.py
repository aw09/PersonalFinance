from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from telegram import InlineKeyboardMarkup

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

    def __init__(
        self,
        text: str | None = None,
        *,
        photo: list | None = None,
        caption: str | None = None,
    ) -> None:
        self.text = text
        self.photo = photo or []
        self.caption = caption
        self.reply_text = AsyncMock()



class DummyCallbackQuery:
    def __init__(self, data: str, *, from_user=None, message=None) -> None:
        self.data = data
        self.from_user = from_user
        self.message = message
        self.answer = AsyncMock()
        self.edit_message_text = AsyncMock()



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
        api_client.list_wallets.return_value = []

        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["expense", "136000", "Sekala"],
            user_data={},
        )

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
        api_client.list_wallets.return_value = []
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            user_data={},
        )

        await bot.free_text_transaction(update, context)

        api_client.ensure_user.assert_awaited_once()
        api_client.create_transaction.assert_awaited_once()
        payload = api_client.create_transaction.await_args.args[0]
        self.assertEqual(payload["type"], "expense")
        self.assertEqual(payload["description"], "indomaret")

    async def test_free_text_multi_word_wallet_hint(self) -> None:
        message = DummyMessage("@Main Wallet expense 75000 dinner")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": str(UUID("11111111-2222-3333-4444-555555555555"))}
        api_client.create_transaction.return_value = {
            "type": "expense",
            "amount": "75000.00",
            "currency": "IDR",
            "description": "dinner",
            "wallet_id": "w-main",
        }
        api_client.list_wallets.return_value = [
            {
                "id": "w-main",
                "name": "Main Wallet",
                "type": "regular",
                "currency": "IDR",
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            user_data={},
        )

        await bot.free_text_transaction(update, context)

        api_client.create_transaction.assert_awaited_once()
        payload = api_client.create_transaction.await_args.args[0]
        self.assertEqual(payload.get("wallet_id"), "w-main")

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

        api_client.list_wallets.return_value = []

        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            user_data={},
        )

        await bot.receipt_photo(update, context)

        api_client.ensure_user.assert_awaited_once_with(528101001, "Faris Tester")
        api_client.parse_receipt.assert_awaited_once()
        args, kwargs = api_client.parse_receipt.await_args
        self.assertEqual(args[0], photo_data)
        self.assertEqual(kwargs["user_id"], str(UUID("11111111-2222-3333-4444-555555555555")))
        self.assertNotIn("wallet_id", kwargs)
        message.reply_text.assert_awaited_once_with("Processing receipt...")
        status_message.edit_text.assert_awaited_once()
        final_text = (
            status_message.edit_text.await_args.kwargs.get("text")
            or status_message.edit_text.await_args.args[0]
        )
        self.assertIn("Receipt saved as expense of 45.67 IDR", final_text)

    async def test_receipt_photo_with_wallet_caption(self) -> None:
        photo_data = b"fake-image"
        message = DummyMessage(
            photo=[DummyPhoto(photo_data)],
            caption="@travel dinner with team",
        )
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
            "amount": "75000",
            "currency": "IDR",
            "description": "Receipt import",
            "wallet_id": "w-travel",
        }
        api_client.list_wallets.return_value = [
            {"id": "w-main", "name": "Main Wallet", "is_default": True},
            {"id": "w-travel", "name": "Travel Fund"},
        ]

        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            user_data={},
        )

        await bot.receipt_photo(update, context)

        api_client.parse_receipt.assert_awaited_once()
        _, kwargs = api_client.parse_receipt.await_args
        self.assertEqual(kwargs["wallet_id"], "w-travel")
        status_message.edit_text.assert_awaited_once()
        final_text = (
            status_message.edit_text.await_args.kwargs.get("text")
            or status_message.edit_text.await_args.args[0]
        )
        self.assertIn("wallet: Travel Fund", final_text)


    async def test_wallet_transfer_command(self) -> None:
        message = DummyMessage('/wallet transfer 50000 Main Investment')
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )

        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-main',
                'name': 'Main Wallet',
                'type': 'regular',
                'balance': '150000.00',
                'currency': 'IDR',
                'is_default': True,
            },
            {
                'id': 'w-invest',
                'name': 'Investment Fund',
                'type': 'investment',
                'balance': '200000.00',
                'currency': 'IDR',
                'is_default': False,
            },
        ]
        api_client.transfer_wallets.return_value = {
            'source_wallet': {
                'id': 'w-main',
                'name': 'Main Wallet',
                'type': 'regular',
                'balance': '100000.00',
                'currency': 'IDR',
                'is_default': True,
            },
            'target_wallet': {
                'id': 'w-invest',
                'name': 'Investment Fund',
                'type': 'investment',
                'balance': '250000.00',
                'currency': 'IDR',
                'is_default': False,
            },
        }

        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            args=['transfer', '50000', 'Main', 'Investment'],
            user_data={},
        )

        await bot.wallet_command(update, context)

        payload = api_client.transfer_wallets.await_args.args[0]
        self.assertEqual(payload['amount'], '50000.00')
        self.assertEqual(payload['source_wallet_id'], 'w-main')
        self.assertEqual(payload['target_wallet_id'], 'w-invest')
        message.reply_text.assert_awaited_once()
        transfer_text = message.reply_text.await_args.args[0]

        self.assertIn('Transferred 50 K IDR', transfer_text)
        self.assertIn('Investment Fund', transfer_text)
    async def test_wallet_command_menu_shows_keyboard(self) -> None:
        message = DummyMessage('/wallet')
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-main',
                'name': 'Main Wallet',
                'type': 'regular',
                'balance': '0',
                'currency': 'IDR',
                'is_default': True,
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            args=[],
            user_data={},
        )

        await bot.wallet_command(update, context)

        message.reply_text.assert_awaited_once()
        reply_kwargs = message.reply_text.await_args.kwargs
        self.assertIsInstance(reply_kwargs.get('reply_markup'), InlineKeyboardMarkup)
        self.assertIn('Wallets:', message.reply_text.await_args.args[0])

    async def test_wallet_callback_list_shows_overview(self) -> None:
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-main',
                'name': 'Main Wallet',
                'type': 'regular',
                'balance': '0',
                'currency': 'IDR',
                'is_default': True,
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            user_data={},
        )
        query = DummyCallbackQuery(
            f"{bot.WALLET_CALLBACK_PREFIX}list",
            from_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )
        update = SimpleNamespace(callback_query=query)

        await bot.wallet_callback(update, context)

        query.edit_message_text.assert_awaited_once()
        args = query.edit_message_text.await_args.args
        self.assertIn('Wallets:', args[0])
        kwargs = query.edit_message_text.await_args.kwargs
        self.assertIsInstance(kwargs.get('reply_markup'), InlineKeyboardMarkup)

    async def test_wallet_credit_statement(self) -> None:
        message = DummyMessage('/wallet credit statement CC_BRI')
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-cc',
                'name': 'CC BRI',
                'type': 'credit',
                'balance': '-500000',
                'currency': 'IDR',
                'settlement_day': 25,
            }
        ]
        api_client.credit_statement.return_value = {
            'wallet_id': 'w-cc',
            'period_start': '2025-05-26',
            'period_end': '2025-06-25',
            'settlement_date': '2025-06-25',
            'amount_due': '1500000',
            'minimum_due': '500000',
            'installments': [
                {
                    'installment_id': 'i1',
                    'installment_number': 1,
                    'due_date': '2025-06-20',
                    'amount_due': '500000',
                    'paid_amount': '0',
                    'wallet_transaction_id': None,
                }
            ],
        }
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            args=['credit', 'statement', 'CC_BRI'],
            user_data={},
        )

        await bot.wallet_command(update, context)

        api_client.credit_statement.assert_awaited_once()
        message.reply_text.assert_awaited_once()
        reply_text = '\n'.join(message.reply_text.await_args.args)
        self.assertIn('credit statement', reply_text.lower())
        self.assertIn('amount due', reply_text.lower())

    async def test_wallet_credit_purchase(self) -> None:
        message = DummyMessage('/wallet credit purchase CC_BRI 150000 installments=3 desc=Gadget')
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-cc',
                'name': 'CC BRI',
                'type': 'credit',
                'balance': '-500000',
                'currency': 'IDR',
            }
        ]
        api_client.credit_purchase.return_value = {
            'id': 'debt-1',
            'installments': [
                {
                    'installment_id': 'i1',
                    'installment_number': 1,
                    'due_date': '2025-07-10',
                    'amount': '50000',
                }
            ],
        }
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            args=['credit', 'purchase', 'CC_BRI', '150000', 'installments=3', 'desc=Gadget'],
            user_data={},
        )

        await bot.wallet_command(update, context)

        api_client.credit_purchase.assert_awaited_once()
        payload = api_client.credit_purchase.await_args.args[1]
        self.assertEqual(payload['amount'], '150000.00')
        self.assertEqual(payload['installments'], 3)
        message.reply_text.assert_awaited_once()
        reply_text = '\n'.join(message.reply_text.await_args.args)
        self.assertIn('credit purchase', reply_text.lower())
        self.assertIn('installments created: 3', reply_text.lower())

    async def test_wallet_credit_repay(self) -> None:
        message = DummyMessage('/wallet credit repay CC_BRI 200000 from=Main desc=Bill')
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-cc',
                'name': 'CC BRI',
                'type': 'credit',
                'balance': '-500000',
                'currency': 'IDR',
            },
            {
                'id': 'w-main',
                'name': 'Main Wallet',
                'type': 'regular',
                'balance': '1000000',
                'currency': 'IDR',
            },
        ]
        api_client.credit_repayment.return_value = {
            'wallet': {'id': 'w-cc'},
            'source_wallet': {'id': 'w-main', 'name': 'Main Wallet'},
            'unapplied_amount': '0',
        }
        api_client.credit_statement.return_value = {
            'wallet_id': 'w-cc',
            'period_start': '2025-05-26',
            'period_end': '2025-06-25',
            'settlement_date': '2025-06-25',
            'amount_due': '1000000',
            'minimum_due': '300000',
            'installments': [],
        }
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            args=['credit', 'repay', 'CC_BRI', '200000', 'from=Main', 'desc=Bill'],
            user_data={},
        )

        await bot.wallet_command(update, context)

        api_client.credit_repayment.assert_awaited_once()
        repay_payload = api_client.credit_repayment.await_args.args[1]
        self.assertEqual(repay_payload['amount'], '200000.00')
        self.assertEqual(repay_payload['source_wallet_id'], 'w-main')
        message.reply_text.assert_awaited_once()
        reply_text = '\n'.join(message.reply_text.await_args.args)
        self.assertIn('applied repayment', reply_text.lower())
        self.assertIn('current bill', reply_text.lower())

    async def test_wallet_investment_roe(self) -> None:
        message = DummyMessage('/wallet investment roe Mutual start=2025-01-01 end=2025-01-31')
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=528101001, full_name='Faris Tester'),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {'id': 'user-1'}
        api_client.list_wallets.return_value = [
            {
                'id': 'w-invest',
                'name': 'Mutual',
                'type': 'investment',
                'balance': '1000000',
                'currency': 'IDR',
            }
        ]
        api_client.investment_roe.return_value = {
            'wallet_id': 'w-invest',
            'period_start': '2025-01-01',
            'period_end': '2025-01-31',
            'contributions': '500000',
            'withdrawals': '100000',
            'net_gain': '400000',
            'roe_percentage': '80.0',
        }
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={'api_client': api_client}),
            args=['investment', 'roe', 'Mutual', 'start=2025-01-01', 'end=2025-01-31'],
            user_data={},
        )

        await bot.wallet_command(update, context)

        api_client.investment_roe.assert_awaited_once()
        message.reply_text.assert_awaited_once()
        reply_text = '\n'.join(message.reply_text.await_args.args)
        self.assertIn('investment roe', reply_text.lower())
        self.assertIn('roe:', reply_text.lower())

    async def test_help_command_lists_features(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(message=message)
        await bot.help_command(update, SimpleNamespace(args=[]))
        message.reply_text.assert_awaited_once()
        help_text = message.reply_text.await_args.args[0]
        reply_markup = message.reply_text.await_args.kwargs.get("reply_markup")
        self.assertIn("Quick capture", help_text)
        self.assertIn("/help wallet", help_text)
        self.assertIsInstance(reply_markup, InlineKeyboardMarkup)

    async def test_help_command_wallet_topic(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(message=message)
        await bot.help_command(update, SimpleNamespace(args=["wallet"]))
        message.reply_text.assert_awaited_once()
        help_text = message.reply_text.await_args.args[0]
        self.assertIn("/wallet add", help_text)
        self.assertIn("Prefix transactions with @wallet", help_text)


    async def test_help_callback_wallet_topic(self) -> None:
        message = DummyMessage()
        query = DummyCallbackQuery(f"{bot.HELP_CALLBACK_PREFIX}wallet", from_user=SimpleNamespace(id=528101001, full_name="Faris Tester"), message=message)
        context = SimpleNamespace(application=SimpleNamespace(bot_data={}), user_data={})
        update = SimpleNamespace(callback_query=query)

        await bot.help_callback(update, context)

        query.edit_message_text.assert_awaited_once()
        args = query.edit_message_text.await_args.args
        self.assertIn("/wallet add", args[0])
        kwargs = query.edit_message_text.await_args.kwargs
        self.assertIsInstance(kwargs.get("reply_markup"), InlineKeyboardMarkup)

    async def test_help_command_unknown_topic(self) -> None:
        message = DummyMessage()
        update = SimpleNamespace(message=message)
        await bot.help_command(update, SimpleNamespace(args=["unknown"]))
        message.reply_text.assert_awaited_once()
        unknown_text = message.reply_text.await_args.args[0]
        self.assertIn("No detailed help", unknown_text)
        self.assertIn("/help wallet", unknown_text)

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
                user_data={},
            )

            await bot.report(update, context)

        kwargs = api_client.list_transactions.await_args.kwargs
        self.assertEqual(kwargs["user_id"], str(UUID("11111111-2222-3333-4444-555555555555")))
        self.assertEqual(kwargs["limit"], 200)
        self.assertEqual(kwargs["offset"], 0)
        message.reply_text.assert_awaited_once()
        report_text = message.reply_text.await_args.args[0]
        self.assertIn("Report for today", report_text)
        self.assertIn("- Expense: 10 K IDR", report_text)
        self.assertIn("- Income: 50 K IDR", report_text)
        self.assertIn("- Net: 40 K IDR", report_text)

    async def test_recent_command_default(self) -> None:
        message = DummyMessage("/recent")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.list_transactions.return_value = [
            {
                "id": "tx-1",
                "occurred_at": "2025-11-01",
                "type": "expense",
                "amount": "10000",
                "currency": "IDR",
                "description": "Lunch",
                "wallet_id": None,
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=[],
            user_data={},
        )

        await bot.recent(update, context)

        kwargs = api_client.list_transactions.await_args.kwargs
        self.assertEqual(kwargs["user_id"], "user-1")
        self.assertEqual(kwargs["limit"], bot.RECENT_DEFAULT_LIMIT + 1)
        self.assertEqual(kwargs["offset"], 0)
        message.reply_text.assert_awaited_once()
        recent_text = message.reply_text.await_args.args[0]
        self.assertIn("Recent transactions", recent_text)
        self.assertIn("Lunch", recent_text)
        self.assertIsNone(message.reply_text.await_args.kwargs.get("reply_markup"))

    async def test_recent_command_with_wallet_and_limit(self) -> None:
        message = DummyMessage("/recent @travel limit=5")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.list_wallets.return_value = [
            {"id": "w-main", "name": "Main Wallet"},
            {"id": "w-travel", "name": "Travel"},
        ]
        api_client.list_transactions.return_value = [
            {
                "id": "tx-1",
                "occurred_at": "2025-11-02",
                "type": "expense",
                "amount": "20000",
                "currency": "IDR",
                "description": "Taxi",
                "wallet_id": "w-travel",
            }
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["@travel", "limit=5"],
            user_data={},
        )

        await bot.recent(update, context)

        kwargs = api_client.list_transactions.await_args.kwargs
        self.assertEqual(kwargs["wallet_id"], "w-travel")
        self.assertEqual(kwargs["limit"], 6)
        self.assertEqual(kwargs["offset"], 0)
        text = message.reply_text.await_args.args[0]
        self.assertIn("Travel", text)
        self.assertIsNone(context.user_data.get("recent_filters"))

    async def test_recent_command_since_enables_pagination(self) -> None:
        message = DummyMessage("/recent since=2025-01-01")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.list_transactions.return_value = [
            {
                "id": f"tx-{i}",
                "occurred_at": "2025-01-0{i+1}",
                "type": "expense",
                "amount": "1000",
                "currency": "IDR",
                "description": f"Item {i}",
                "wallet_id": None,
            }
            for i in range(11)
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["since=2025-01-01"],
            user_data={},
        )

        await bot.recent(update, context)

        kwargs = api_client.list_transactions.await_args.kwargs
        self.assertEqual(kwargs["occurred_after"], "2025-01-01")
        self.assertEqual(kwargs["limit"], bot.RECENT_DEFAULT_LIMIT + 1)
        reply_kwargs = message.reply_text.await_args.kwargs
        self.assertIsInstance(reply_kwargs.get("reply_markup"), InlineKeyboardMarkup)
        state = context.user_data.get("recent_filters")
        self.assertIsNotNone(state)
        self.assertTrue(state.get("has_next"))
        self.assertIsNone(state.get("max_results"))

    async def test_recent_command_with_limit_and_per(self) -> None:
        message = DummyMessage("/recent limit=30 per=20")
        update = SimpleNamespace(
            message=message,
            effective_user=SimpleNamespace(id=123, full_name="Faris Tester"),
        )
        api_client = AsyncMock()
        api_client.ensure_user.return_value = {"id": "user-1"}
        api_client.list_transactions.return_value = [
            {
                "id": f"tx-{i}",
                "occurred_at": f"2025-01-{(i % 28) + 1:02d}",
                "type": "expense",
                "amount": "1000",
                "currency": "IDR",
                "description": f"Item {i}",
                "wallet_id": None,
            }
            for i in range(21)
        ]
        context = SimpleNamespace(
            application=SimpleNamespace(bot_data={"api_client": api_client}),
            args=["limit=30", "per=20"],
            user_data={},
        )

        await bot.recent(update, context)

        kwargs = api_client.list_transactions.await_args.kwargs
        self.assertEqual(kwargs["limit"], 21)
        self.assertEqual(kwargs["offset"], 0)
        reply_kwargs = message.reply_text.await_args.kwargs
        self.assertIsInstance(reply_kwargs.get("reply_markup"), InlineKeyboardMarkup)
        state = context.user_data.get("recent_filters")
        self.assertIsNotNone(state)
        self.assertEqual(state["page_size"], 20)
        self.assertEqual(state["max_results"], 30)
        self.assertTrue(state.get("has_next"))
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
            user_data={},
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
        context = SimpleNamespace(application=SimpleNamespace(bot_data={"api_client": api_client}), args=["Adi", "30000"], user_data={})

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
            user_data={},
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
            user_data={},
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
            args=["Adi"], user_data={})

        await bot.owed(update, context)

        message.reply_text.assert_awaited()
        text = "\n"
        text = "\n".join(arg for arg in message.reply_text.await_args.args)
        self.assertIn("Paid 40 K IDR on 2025-11-04", text)



