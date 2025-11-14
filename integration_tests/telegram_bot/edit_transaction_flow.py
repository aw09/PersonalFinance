from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parents[2]
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from telethon import TelegramClient
from telethon.tl.custom.message import Message

from integration_tests.telegram_bot.common import (
    TestConfig,
    TelegramBotInteractor,
    WalletManager,
    ensure_authorized,
)

logger = logging.getLogger(__name__)


class EditTransactionTester:
    def __init__(self, interactor: TelegramBotInteractor, wallet_manager: WalletManager) -> None:
        self.interactor = interactor
        self.wallet_manager = wallet_manager

    async def run(self) -> None:
        regular_wallet = await self.wallet_manager.ensure_wallet("regular")
        timestamp = datetime.utcnow().strftime("%H%M%S")
        txn_desc = f"Integration edit txn {timestamp}"

        await self.interactor.send_and_expect(
            f"/add @{regular_wallet} expense 45123 {txn_desc}",
            "saved expense",
        )

        recent_message = await self.interactor.send_and_expect(
            "/recent limit=1",
            "recent transactions",
            include_edits=True,
        )
        detail_button_label = self._find_recent_detail_button_label(recent_message)
        await self.interactor.click_button(recent_message, detail_button_label)
        await self._run_transitionals([
            ("Amount", "99999"),
            ("Description", "Integration edit txn updated"),
            ("Category", "Updated category"),
            ("Wallet", f"@{regular_wallet}"),
            ("Type", "income"),
            ("Currency", "USD"),
            ("Date", datetime.utcnow().strftime("%Y-%m-%d")),
        ])

    def _find_recent_detail_button_label(self, message: Message) -> str:
        for row in message.buttons or []:
            for button in row:
                text = button.text or ""
                if "·" in text or "id" in text.lower():
                    return text
        if message.buttons:
            return message.buttons[0][0].text
        raise RuntimeError("Could not find transaction detail button")

    async def _run_transitionals(self, edits: list[tuple[str, str]]) -> None:
        for field_label, value in edits:
            detail_message = await self.interactor.wait_for(
                lambda m: m.text and "wallet" in m.text.lower(),
                include_edits=True,
            )
            await self.interactor.click_button(detail_message, "Edit transaction")
            edit_menu = await self._wait_for_edit_menu()
            try:
                await self._select_field_with_navigation(edit_menu, field_label)
            except RuntimeError:
                logger.warning("Field %s not available on any page, skipping", field_label)
                continue
            prompt = await self.interactor.wait_for(
                lambda m: m.text and f"send the new {field_label.lower()}" in m.text.lower(),
                include_edits=True,
            )
            await self.interactor.send_text(value)
            await self.interactor.wait_for(
                lambda m: m.text and "updated" in m.text.lower(),
                include_edits=True,
            )

    async def _wait_for_edit_menu(self) -> Message:
        return await self.interactor.wait_for(
            lambda m: m.text and "select a field to update" in m.text.lower(),
            include_edits=True,
        )

    async def _select_field_with_navigation(self, message: Message, field_label: str) -> None:
        current = message
        while True:
            try:
                await self.interactor.click_button(current, field_label)
                return
            except RuntimeError:
                nav_label = self._find_nav_button(current)
                if not nav_label:
                    raise
                await self.interactor.click_button(current, nav_label)
                current = await self._wait_for_edit_menu()

    def _find_nav_button(self, message: Message) -> str | None:
        for row in message.buttons or []:
            for button in row:
                text = (button.text or "").lower()
                if "next" in text:
                    return button.text
        return None


def load_client(config: TestConfig) -> TelegramClient:
    return TelegramClient(str(config.session_path), config.api_id, config.api_hash)


async def main_async() -> None:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    config = TestConfig.from_env()
    client = load_client(config)
    await client.connect()
    try:
        await ensure_authorized(client, config)
        interactor = TelegramBotInteractor(client, config.bot_username)
        await interactor.initialise()
        wallet_manager = WalletManager(interactor)
        await EditTransactionTester(interactor, wallet_manager).run()
    finally:
        await client.disconnect()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
