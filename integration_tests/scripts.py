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
    [sys.executable, "integration_tests/telegram_bot/edit_transaction_flow.py"]
]

results = []

for cmd in cmds:
    display = " ".join(cmd)
    print(f"Running {display}")
    try:
        subprocess.check_call(cmd)
        results.append((display, 0, None))
    except subprocess.CalledProcessError as exc:
        # Record the failure but keep the remaining tests running.
        print(f"[ERROR] {display} exited with code {exc.returncode}")
        results.append((display, exc.returncode, exc))

failed = [result for result in results if result[1] != 0]

if failed:
    print("\nIntegration test summary:")
    for display, returncode, _exc in results:
        status = "OK" if returncode == 0 else f"FAIL ({returncode})"
        print(f" - {display}: {status}")
    raise SystemExit(1)
