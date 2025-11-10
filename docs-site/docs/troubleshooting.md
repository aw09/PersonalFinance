---
sidebar_position: 8
---

# Troubleshooting

Something feels off? Work through these checks before escalating to support.

## Wallet deletion failed

**Message:** `Cannot delete the default wallet.`  
**Fix:** Run `/wallet default ANOTHER_WALLET` first, then retry `/wallet delete OLD_WALLET confirm=yes`.

**Message:** `Something went wrong while deleting the wallet.`  
**Fix:** Make sure you’re running the latest bot build. Older builds were missing the API call; restart the bot if needed. Data safety: even when deletion fails, no transactions are removed.

## Timeout waiting for a reply

- Telegram occasionally rate-limits bots; wait a few seconds and retry.
- If you’re running scripted tests (`integration_tests/scripts.py`), failures are now captured per script, and the summary at the end tells you which flow to inspect.
- For manual use, resend the last command. The bot is idempotent for `/wallet list`, `/report`, `/recent`.

## Receipt parsing inaccurate

- Retake the photo with better lighting and ensure prices are legible.
- Include context in the caption (`expense 120000 dinner`) so the parser has defaults.
- If Gemini is unavailable, the bot prints an explanatory message and falls back to manual entry.

## Credit statement looks wrong

- Run `/wallet list` to confirm the correct settlement day.
- Use `/wallet credit purchase …` with accurate `installments` so repayments can match installments.
- If you deleted a wallet that previously owned those transactions, they now appear as “Unassigned” when exporting data—this is expected because the history is preserved but no longer tied to a wallet.

## Bot feels unresponsive

- Check Telegram’s service status and your network.
- If you’re self-hosting, make sure the bot webhook is registered (FastAPI logs `Registered Telegram webhook` on startup).
- Restart the bot process; it’s stateless and safe to bounce.

Still stuck? Share the exact command, timestamp, and screenshot with the maintainer so they can inspect server logs.
