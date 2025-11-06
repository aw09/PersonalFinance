from __future__ import annotations

import asyncio
import logging

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
DEFAULT_REPAY_AMOUNT = "10000"


class RepayFlowTester:
    def __init__(self, interactor: TelegramBotInteractor, wallet_manager: WalletManager) -> None:
        self.interactor = interactor
        self.wallet_manager = wallet_manager

    async def run(self) -> None:
        credit_wallet = await self.wallet_manager.ensure_wallet("credit")
        regular_wallet = await self.wallet_manager.ensure_wallet("regular")

        logger.info(
            "Running repayment flow using credit wallet '%s' and source wallet '%s'",
            credit_wallet,
            regular_wallet,
        )

        menu_message = await self.interactor.send_and_expect(
            "/wallet",
            "wallets",
            include_edits=True,
        )
        await self.interactor.click_button(menu_message, "Repay credit")
        await self.interactor.wait_for(
            lambda m: m.text and "Which credit wallet" in m.text,
            timeout=60,
            include_edits=True,
        )
        await self.interactor.send_and_expect(credit_wallet, "how much are you repaying")
        await self.interactor.send_and_expect(DEFAULT_REPAY_AMOUNT, "which wallet paid the bill")
        await self.interactor.send_and_expect(regular_wallet, "Add a note")
        await self.interactor.send_and_expect("skip", "beneficiary")
        confirm_message = await self.interactor.send_and_expect("skip", "confirm repayment")
        await self.interactor.click_button(confirm_message, "confirm")
        await self.interactor.wait_for(
            lambda m: m.text and "Applied repayment" in m.text,
            timeout=90,
            include_edits=True,
        )
        logger.info("Repayment flow completed successfully")


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

        await wallet_manager.ensure_wallet("regular")
        await wallet_manager.ensure_wallet("investment")
        await wallet_manager.ensure_wallet("credit")

        await RepayFlowTester(interactor, wallet_manager).run()
    finally:
        await client.disconnect()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
