import os
import subprocess
import sys

from dotenv import load_dotenv

REQUIRED_ENV_VARS = [
    "TELEGRAM_TEST_API_ID",
    "TELEGRAM_TEST_API_HASH",
    "TELEGRAM_TEST_PHONE",
    "TELEGRAM_MAIN_BOT_USERNAME",
]


def _ensure_env() -> None:
    load_dotenv()
    missing = [var for var in REQUIRED_ENV_VARS if not os.environ.get(var)]
    if missing:
        missing_vars = ", ".join(sorted(missing))
        raise SystemExit(
            "Cannot run Telegram integration tests. "
            f"Set the following env vars: {missing_vars}"
        )


_ensure_env()

cmds = [
    [sys.executable, "integration_tests/telegram_bot/basic_flows.py"],
    [sys.executable, "integration_tests/telegram_bot/advanced_flows.py"],
    [sys.executable, "integration_tests/telegram_bot/repay_flow.py"],
]

for cmd in cmds:
    print(f"Running {' '.join(cmd)}")
    subprocess.check_call(cmd)
