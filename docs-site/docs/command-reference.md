---
sidebar_position: 3
---

# Command Reference

Here are the messages you’ll use most often. All commands work in private 1:1 chats with the bot.

## Quick capture

| Command / Shortcut | Purpose | Example |
| ------------------ | ------- | ------- |
| `/add [@wallet] TYPE AMOUNT DESCRIPTION` | Structured record for expense, income, debt, or receivable. | `/add @cash expense 125000 groceries` |
| `e …`, `i …`, `d …`, `r …` | Shorthand for `/add expense`, `/add income`, etc. Useful on mobile. | `e lunch 48000 team meal` |
| `@wallet …` prefix | Target a wallet without changing the default. Works with `/add`, shorthand text, and `/report`. | `@travel e taxi 75000 airport` |
| `/receipt` + photo | Upload a receipt and let Gemini parse it. Optional caption `@wallet` to select the destination. | Send photo with caption `@cash` |

## Reports and history

| Command | Description |
| ------- | ----------- |
| `/recent [@wallet] [limit=10] [per=5] [since=YYYY-MM-DD]` | Paginated list of transactions. Use the inline **Prev/Next** buttons to page through results. |
| `/report RANGE` | Summary by type for `today`, `yesterday`, `mtd`, `ytd`, `last 7 days`, `last 3 months`, etc. |
| `/owed [name]` | Shows outstanding receivables, optionally filtered by beneficiary. |

## Wallets

| Command | Description |
| ------- | ----------- |
| `/wallet list` | Refresh balances and show all wallets. Default wallet is tagged with ⭐. |
| `/wallet add NAME regular/investment/credit [currency=IDR] [limit=...] [settlement=day] [default=yes|no]` | Create wallets on the fly. |
| `/wallet edit NAME …` | Rename wallets, change currency, credit limit, or settlement day. |
| `/wallet default NAME` | Switch which wallet receives transactions by default. |
| `/wallet transfer AMOUNT FROM TO [note=…]` | Moves funds between two wallets (creates matching withdraw/deposit transactions). |
| `/wallet delete NAME confirm=yes` | Deletes a non-default wallet. Transactions stay in history but lose their wallet link. |

## Credit features

| Command | Description |
| ------- | ----------- |
| `/wallet credit purchase WALLET AMOUNT [installments=3] [beneficiary=Name] [desc=...]` | Record a card swipe and automatically create installment schedules. |
| `/wallet credit repay WALLET AMOUNT [from=@wallet] [beneficiary=Name] [desc=...]` | Apply repayments and optionally pull cash from another wallet. |
| `/wallet credit statement WALLET [reference=YYYY-MM-DD]` | Preview what’s due in the upcoming cycle, per installment. |

## Investment helpers

| Command | Description |
| ------- | ----------- |
| `/wallet investment roe WALLET [start=YYYY-MM-DD] [end=YYYY-MM-DD]` | Calculate simple return on equity for investment wallets. |
| `/wallet transfer AMOUNT CASH_WALLET INVESTMENT_WALLET` | Earmark contributions; pair with ROE reports for performance tracking. |

## Help & navigation

- `/help` – overview of categories plus inline buttons.
- `/help wallet`, `/help add`, `/help recent`, `/help report`, `/help debts` – topic deep dives.
- `/start` – re-send onboarding message and re-check permissions.

> Tip: Commands accept commas and decimals in amounts (e.g. `1,250` or `45.67`). The bot normalises currency formatting automatically.
