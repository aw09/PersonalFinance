from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path
import sys

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


class AdvancedFlowsTester:
    def __init__(self, interactor: TelegramBotInteractor, wallet_manager: WalletManager) -> None:
        self.interactor = interactor
        self.wallet_manager = wallet_manager

    async def run(self) -> None:
        regular_wallet = await self.wallet_manager.ensure_wallet("regular")
        credit_wallet = await self.wallet_manager.ensure_wallet("credit")

        timestamp = datetime.utcnow().strftime("%H%M%S")

        purchase_desc = f"integration-credit-{timestamp}"
        logger.info("Recording credit purchase on %s", credit_wallet)
        await self.interactor.send_and_expect(
            f"/wallet credit purchase {credit_wallet} 180000 installments=2 desc={purchase_desc}",
            ["recorded credit purchase"],
            include_edits=True,
        )

        repay_desc = f"integration-repay-{timestamp}"
        await self.interactor.send_and_expect(
            f"/wallet credit repay {credit_wallet} 90000 from=@{regular_wallet} desc={repay_desc}",
            ["applied repayment"],
            include_edits=True,
        )

        debtor = f"IntegrationFriend{timestamp}"
        logger.info("Running lend/repay flow for %s", debtor)
        await self.interactor.send_and_expect(
            f"/lend {debtor} 60000 integration-loan",
            ["recorded receivable"],
        )

        await self.interactor.send_and_expect(
            f"/repay {debtor} 30000 partial",
            ["recorded repayment", "remaining balance"],
        )

        await self.interactor.send_and_expect(
            f"/repay {debtor} all",
            ["recorded repayment", "fully settled"],
        )

        logger.info("Advanced flow completed successfully")


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
        await AdvancedFlowsTester(interactor, wallet_manager).run()
    finally:
        await client.disconnect()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
