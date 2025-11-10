---
sidebar_position: 6
---

# Receipts & Automation

Snap a receipt, forward it to the bot, and let Gemini extract the details for you. Here’s how to get consistent results.

## Uploading receipts

1. Open the chat with the bot.
2. Tap the paperclip and choose **Photo or Video**.
3. Add an optional caption:
   - `@wallet` to force a destination wallet.
   - `expense coffee` if you want to suggest the description.
4. Send the photo. The bot replies with a parsing status and, once complete, a “Saved expense …” message.

Tips:

- Use well-lit photos with cropped receipts; avoid low contrast or folded paper.
- If the receipt shows totals in thousands (e.g., “123,5”), the bot normalises decimals automatically.
- The parser keeps you in control: it returns the structured transaction before committing if the bot is configured that way. In this deployment it saves immediately but you can delete/adjust afterwards.

## Auto-classifying wallets

- The caption `@wallet-name` is the safest option.
- If omitted, the bot uses your default wallet.
- Receipts sent as replies to a previous bot message inherit the same wallet, which is useful when batching.

## Handling errors

If parsing fails you’ll see “Could not parse that receipt.” Common causes:

- Blurry or partial photo → retake.
- Currency symbols/format not recognised → include `expense AMOUNT` in the caption to override.
- Gemini quota exceeded → retry later; admins receive alerts.

## Other automation hooks

- **Inline buttons** in `/recent` keep history browsing tidy.
- **Wallet transfer confirmations** edit the original message once both sides succeed, so you can trust that a failure would have been called out.
- **Integration tests** in `integration_tests/telegram_bot/` mimic user actions to ensure regressions (like failed deletions) are caught before release.
