---
sidebar_position: 9
---

# FAQ

## Can multiple people share the same bot?

Yes. Every Telegram user ID gets its own PersonalFinance account. Wallets, transactions, and reports are scoped per user automatically.

## Do transactions sync across devices?

Absolutely. The data lives in the backend; the bot is just your chat interface. Open Telegram on desktop or mobile—everything stays in sync.

## What happens to transactions when a wallet is deleted?

They stay in the database. The wallet link (`wallet_id`) becomes `null`, so reports still include the amounts but the wallet name is blank. This prevents accidental data loss.

## Can I change currencies?

Each wallet has its own currency. Switch it via `/wallet edit NAME currency=USD`. Reports group totals by currency, so mixed setups are fine.

## How do I capture shared expenses?

Use regular wallets for personal contributions and create a dedicated wallet (e.g., `Household`). Transfer funds into it and run `/report @Household` when reconciling with roommates. For lending/borrowing, record entries as `receivable`/`debt` and track via `/owed`.

## Do I need to remember every command syntax?

No. `/help` plus the inline buttons cover the most common flows. This documentation adds examples, but the bot always replies with usage hints if it doesn’t understand a command.

## Is there a web dashboard?

Not yet. The RapiDoc UI (`https://your-backend-host/docs/rapidoc`) is aimed at developers. For now, Telegram is the primary interface for end users.

## How often should I run reports?

Daily `/report today` keeps spending in check, while `mtd`/`ytd` help with monthly budgeting. The bot responds instantly, so feel free to run them whenever curiosity strikes.
