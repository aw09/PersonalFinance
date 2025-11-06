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

from integration_tests.telegram_bot.common import (
    TestConfig,
    TelegramBotInteractor,
    WalletManager,
    ensure_authorized,
)

logger = logging.getLogger(__name__)


class BasicFlowsTester:
    def __init__(self, interactor: TelegramBotInteractor, wallet_manager: WalletManager) -> None:
        self.interactor = interactor
        self.wallet_manager = wallet_manager

    async def run(self) -> None:
        regular_wallet = await self.wallet_manager.ensure_wallet("regular")
        investment_wallet = await self.wallet_manager.ensure_wallet("investment")
        credit_wallet = await self.wallet_manager.ensure_wallet("credit")
        timestamp = datetime.utcnow().strftime("%H%M%S")

        await self.interactor.send_and_expect(
            "/start",
            "send `/add",
        )

        await self.interactor.send_and_expect(
            "/help wallet",
            "wallet commands",
        )

        help_overview = await self.interactor.send_and_expect(
            "/help",
            "how i can help",
        )
        await self.interactor.click_button(help_overview, "Wallets")
        await self.interactor.wait_for(
            lambda m: m.text and "wallet commands" in m.text.lower(),
            include_edits=True,
        )

        txn_desc = f"integration test {datetime.utcnow().isoformat()}"
        await self.interactor.send_and_expect(
            f"/add @{regular_wallet} expense 12345 {txn_desc}",
            "saved expense",
        )

        await self.interactor.send_and_expect(
            "/recent limit=1",
            "recent transactions",
            include_edits=True,
        )

        await self.interactor.send_and_expect(
            "/report today",
            "report for",
        )

        await self.interactor.send_text("@Main Wallet expense 54321 quick-entry")
        await self.interactor.wait_for(
            lambda m: m.text and "saved expense" in m.text.lower(),
            include_edits=True,
        )

        await self.interactor.send_and_expect(
            "/owed",
            ["outstanding receivables", "no outstanding receivables"],
        )

        await self.interactor.send_and_expect(
            f"/wallet credit statement {credit_wallet}",
            "credit statement",
        )

        await self.interactor.send_and_expect(
            f"/wallet investment roe {investment_wallet} start=2024-01-01 end=2024-12-31",
            "roe",
        )

        temp_wallet = f"IntegrationTemp{timestamp}"
        renamed_wallet = f"{temp_wallet}X"
        await self.interactor.send_and_expect(
            f"/wallet add {temp_wallet} regular currency=IDR",
            f"wallet '{temp_wallet}'",
        )
        await self.interactor.send_and_expect(
            f"/wallet edit {temp_wallet} name={renamed_wallet}",
            f"wallet '{renamed_wallet}' updated",
        )
        await self.interactor.send_and_expect(
            f"/wallet default {renamed_wallet}",
            "default wallet set",
        )
        await self.interactor.send_and_expect(
            f"/wallet default {regular_wallet}",
            "default wallet set",
        )
        await self.interactor.send_and_expect(
            f"/wallet transfer 2000 {regular_wallet} {renamed_wallet} note=test-transfer",
            "transferred",
            include_edits=True,
        )

        recent_message = await self.interactor.send_and_expect(
            "/recent limit=2 per=1",
            "recent transactions",
            include_edits=True,
        )
        await self.interactor.click_button(recent_message, "Next")
        await self.interactor.wait_for(
            lambda m: m.text and "recent transactions" in m.text.lower(),
            include_edits=True,
        )

        logger.info("Basic bot flow test completed successfully")


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
        await BasicFlowsTester(interactor, wallet_manager).run()
    finally:
        await client.disconnect()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
