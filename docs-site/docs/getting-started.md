---
sidebar_position: 2
---

# Getting Started

Follow these steps the first time you talk to the bot.

## 1. Say hi and verify yourself

1. Open the PersonalFinance bot in Telegram (`@pfin_staging_bot` or your production handle).
2. Send `/start`.
3. The bot links your Telegram user ID to a PersonalFinance account.  
   - If you’re new, it creates one automatically and spins up a **Main Wallet** in IDR.
   - Returning users are re-attached to their existing data.

## 2. Grant optional 2FA password (if prompted)

If your Telegram account uses two-factor authentication, integration tests (and some admin flows) rely on a password saved in `TELEGRAM_TEST_PASSWORD`. End users don’t need to configure anything—just enter the code/password when Telegram asks.

## 3. Understand the wallet model

Every transaction belongs to a wallet.

| Wallet type   | Use case                                        | Notes |
| ------------- | ----------------------------------------------- | ----- |
| `regular`     | Cash/bank accounts for daily spending           | One of them is your **default** wallet. |
| `investment`  | Long-term savings, mutual funds, brokerage      | Track contributions via transfers; adjust value manually. |
| `credit`      | Credit cards or BNPL accounts                   | Supports statements, purchases with installments, and repayments. |

When you don’t specify a wallet, the bot uses your default.  
Prefix commands with `@wallet-name` (e.g. `/add @travel expense 150000 flight`) to target another wallet without switching the default.

## 4. Test a basic command

Try these messages right after `/start`:

- `/help wallet` – quick overview of wallet actions.
- `/wallet list` – shows every wallet, balance, and the default marker.
- `e lunch 12000 quick` – shorthand for `/add expense 12000 quick`. The bot will confirm with “Saved expense…”.

If those respond, you’re ready for deeper functionality covered in the next sections.
