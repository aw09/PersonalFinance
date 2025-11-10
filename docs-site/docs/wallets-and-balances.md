---
sidebar_position: 4
---

# Wallets & Balances

Wallets are the backbone of the bot. Think of them as labeled balance buckets—cash accounts, cards, investment pots—that keep your transactions organised.

## Listing wallets

- `/wallet list` refreshes balances from the backend and prints a tidy list.
- The star (⭐) icon marks your default wallet (used when no `@wallet` is specified).
- Credit wallets highlight their settlement day so you know when the next bill hits.

## Creating wallets

```
/wallet add Travel regular currency=IDR default=no
/wallet add Brokerage investment currency=IDR
/wallet add Visa credit currency=IDR limit=20000000 settlement=25
```

Rules:

- Name must be unique per user.
- Currency defaults to IDR but can be changed per wallet.
- Credit wallets can optionally track `credit_limit` and `settlement_day` (1–28).
- Setting `default=yes` makes the new wallet the landing spot for future `/add` commands.

## Editing wallets

```
/wallet edit Visa name=Visa Platinum settlement=20 limit=25000000
/wallet edit Travel currency=USD
```

You can update name, currency, limits, and settlement day. The bot responds with “Wallet 'NAME' updated.”

## Switching the default wallet

- `/wallet default Main Wallet` – use this when you temporarily switched to a travel wallet and want to go back.
- You cannot delete the current default wallet; set another wallet as default first.

## Transferring between wallets

```
/wallet transfer 200000 Main Wallet Brokerage note=April top-up
```

The bot executes a withdrawal from the source and a deposit into the destination so your history stays balanced.

## Deleting wallets

```
/wallet delete Travel confirm=yes
```

Safeguards:

- The default wallet cannot be deleted (you’ll get `Cannot delete the default wallet.`).
- Existing transactions and debts remain in the database. Their `wallet_id` is set to `null`, so history is preserved without breaking references.
- If you recreated a wallet with the same name, it’s considered a new wallet with its own ID.
