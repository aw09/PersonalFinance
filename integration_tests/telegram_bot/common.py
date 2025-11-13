from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError
from telethon.tl.custom.message import Message

logger = logging.getLogger(__name__)

WALLET_LINE_RE = re.compile(r"^- (?P<name>.+?):")
DEFAULT_TEST_WALLETS = {
    "regular": "TestRegularWallet",
    "investment": "TestInvestmentWallet",
    "credit": "TestCreditWallet",
}

load_dotenv()


@dataclass
class TestConfig:
    api_id: int
    api_hash: str
    phone_number: str
    bot_username: str
    session_path: Path

    @classmethod
    def from_env(cls) -> "TestConfig":
        try:
            api_id = int(os.environ["TELEGRAM_TEST_API_ID"])
            api_hash = os.environ["TELEGRAM_TEST_API_HASH"]
            phone = os.environ["TELEGRAM_TEST_PHONE"]
        except KeyError as exc:
            raise SystemExit(f"Missing required env var: {exc.args[0]}") from exc

        bot_username = os.environ.get("TELEGRAM_MAIN_BOT_USERNAME")
        if not bot_username:
            raise SystemExit(
                "Set TELEGRAM_MAIN_BOT_USERNAME to the primary bot username (e.g. @PersonalFinanceBot)."
            )

        session_file = Path(
            os.environ.get(
                "TELEGRAM_TEST_SESSION",
                "integration_tests/telegram_bot/test_user.session",
            )
        )
        session_file.parent.mkdir(parents=True, exist_ok=True)
        return cls(
            api_id=api_id,
            api_hash=api_hash,
            phone_number=phone,
            bot_username=bot_username,
            session_path=session_file,
        )


class TelegramBotInteractor:
    def __init__(self, client: TelegramClient, bot_username: str) -> None:
        self.client = client
        self.bot_username = bot_username
        self._bot_entity = None

    async def initialise(self) -> None:
        self._bot_entity = await self.client.get_entity(self.bot_username)

    async def send_and_expect(
        self,
        text: str,
        expectations: list[str] | str,
        *,
        timeout: float = 60.0,
        include_edits: bool = False,
    ) -> Message:
        expectations_list = [expectations] if isinstance(expectations, str) else expectations
        expectations_lower = [exp.lower() for exp in expectations_list]

        def predicate(msg: Message) -> bool:
            text_lower = (msg.text or "").lower()
            if not text_lower:
                return False
            return any(exp in text_lower for exp in expectations_lower)

        return await self._send_and_wait(text, predicate, timeout, include_edits=include_edits)

    async def wait_for(
        self,
        predicate: Callable[[Message], bool],
        *,
        timeout: float = 60.0,
        include_edits: bool = False,
    ) -> Message:
        return await self._wait_for_message(predicate, timeout, include_edits=include_edits)

    async def send_text(self, text: str) -> None:
        await self.client.send_message(self._bot_entity, text)

    async def _send_and_wait(
        self,
        text: str,
        predicate: Callable[[Message], bool],
        timeout: float,
        *,
        include_edits: bool = False,
    ) -> Message:
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Message] = loop.create_future()

        async def handler(event: events.NewMessage.Event) -> None:
            if predicate(event.message) and not future.done():
                future.set_result(event.message)

        self.client.add_event_handler(handler, events.NewMessage(from_users=self._bot_entity))
        edit_handler = None
        if include_edits:
            async def on_edit(event: events.MessageEdited.Event) -> None:
                if predicate(event.message) and not future.done():
                    future.set_result(event.message)

            edit_handler = on_edit
            self.client.add_event_handler(on_edit, events.MessageEdited(from_users=self._bot_entity))
        try:
            await self.client.send_message(self._bot_entity, text)
            return await asyncio.wait_for(future, timeout)
        finally:
            self.client.remove_event_handler(handler)
            if edit_handler:
                self.client.remove_event_handler(edit_handler)

    async def _wait_for_message(
        self,
        predicate: Callable[[Message], bool],
        timeout: float,
        include_edits: bool = False,
    ) -> Message:
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Message] = loop.create_future()

        async def handler(event: events.NewMessage.Event) -> None:
            if predicate(event.message) and not future.done():
                future.set_result(event.message)

        self.client.add_event_handler(handler, events.NewMessage(from_users=self._bot_entity))
        edit_handler = None
        if include_edits:
            async def on_edit(event: events.MessageEdited.Event) -> None:
                if predicate(event.message) and not future.done():
                    future.set_result(event.message)

            edit_handler = on_edit
            self.client.add_event_handler(on_edit, events.MessageEdited(from_users=self._bot_entity))
        try:
            return await asyncio.wait_for(future, timeout)
        finally:
            self.client.remove_event_handler(handler)
            if edit_handler:
                self.client.remove_event_handler(edit_handler)

    async def click_button(self, message: Message, label: str) -> None:
        if not message.buttons:
            raise RuntimeError("Message does not contain inline buttons.")
        for row in message.buttons:
            for button in row:
                if button.text and label.lower() in button.text.lower():
                    await button.click()
                    logger.info("Clicked button: %s", button.text)
                    return
        raise RuntimeError(f"Could not find button containing '{label}'.")


class WalletManager:
    def __init__(self, interactor: TelegramBotInteractor) -> None:
        self.interactor = interactor
        self.wallets_by_type: dict[str, list[str]] = {}

    async def refresh(self) -> dict[str, list[str]]:
        message = await self.interactor.send_and_expect(
            "/wallet list",
            ["wallets", "do not have any wallets"],
            timeout=90,
            include_edits=True,
        )
        text = message.text or ""
        logger.debug("Wallet overview text:\n%s", text)
        self.wallets_by_type = parse_wallet_overview(text)
        logger.info("Parsed wallets: %s", self.wallets_by_type)
        return self.wallets_by_type

    async def ensure_wallet(self, wallet_type: str) -> str:
        wallets = await self.refresh()
        existing = wallets.get(wallet_type)
        if existing:
            return existing[0]
        name = DEFAULT_TEST_WALLETS.get(wallet_type, f"Test{wallet_type.title()}Wallet")
        unique_name = self._make_unique_name(name, wallets)
        logger.info("Creating %s wallet '%s'", wallet_type, unique_name)
        command = f"/wallet add {unique_name} {wallet_type}"
        if wallet_type == "credit":
            command += " limit=1000000 settlement=20"
        if wallet_type in {"regular", "investment"}:
            command += " currency=IDR"
        await self.interactor.send_and_expect(command, f"wallet '{unique_name}'")
        for attempt in range(3):
            wallets = await self.refresh()
            created = wallets.get(wallet_type)
            if created:
                return created[0]
            logger.info(
                "Wallet type %s not visible yet (attempt %s/3). Retrying...",
                wallet_type,
                attempt + 1,
            )
            await asyncio.sleep(2)
        raise RuntimeError(f"Failed to create wallet of type {wallet_type}.")

    def _make_unique_name(self, base: str, wallets: dict[str, list[str]]) -> str:
        existing_names = {name for names in wallets.values() for name in names}
        candidate = base
        counter = 2
        while candidate in existing_names:
            candidate = f"{base}{counter}"
            counter += 1
        return candidate


def parse_wallet_overview(text: str) -> dict[str, list[str]]:
    wallets: dict[str, list[str]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        match = WALLET_LINE_RE.search(line)
        if not match:
            continue
        raw_name = match.group("name").strip()
        name = raw_name.replace("(default)", "").strip()
        type_fragment = extract_wallet_type_fragment(line)
        if not type_fragment:
            logger.debug("Could not extract wallet type from line: %s", line)
            continue
        wallet_type = type_fragment.strip().lower()
        wallets.setdefault(wallet_type, []).append(name)
    return wallets


def extract_wallet_type_fragment(line: str) -> str | None:
    colon_index = line.find(":")
    if colon_index == -1:
        return None
    first_paren = line.find("(", colon_index)
    if first_paren == -1:
        return None
    first_close = line.find(")", first_paren)
    if first_close == -1:
        return None
    content = line[first_paren + 1 : first_close]
    if "," in content:
        return content.split(",", 1)[0]
    return content


async def ensure_authorized(client: TelegramClient, config: TestConfig) -> None:
    if await client.is_user_authorized():
        return
    logger.info("Authorising Telegram client for %s", config.phone_number)
    await client.send_code_request(config.phone_number)
    code = input("Enter the login code Telegram sent to your user: ")
    try:
        await client.sign_in(config.phone_number, code)
    except SessionPasswordNeededError:
        password = os.environ.get("TELEGRAM_TEST_PASSWORD")
        if not password:
            password = input("Enter your Telegram 2FA password: ")
        await client.sign_in(password=password)
