---
sidebar_position: 5
---

# Credit & Investment Workflows

Credit card debt and investment tracking need a bit more structure than regular cash wallets. The bot has dedicated flows for both.

## Credit wallets

Credit wallets track purchases, installment schedules, statements, and repayments.

### 1. Record a purchase

```
/wallet credit purchase Visa 1500000 installments=3 beneficiary=Tokped desc=Headset
```

- Amount is split evenly across the requested number of installments.
- Each installment gets its own due date based on the wallet’s settlement day.
- A linked debt record is created so repayments know what to close out.

### 2. View the statement

```
/wallet credit statement Visa
/wallet credit statement Visa reference=2024-12-01
```

- Shows total due, broken down by installment and beneficiary if provided.
- Helpful before you trigger an automatic transfer from a cash wallet.

### 3. Repay

```
/wallet credit repay Visa 500000 from=@Main\ Wallet beneficiary=Tokped desc=June bill
```

- If you omit `from=@wallet`, the bot pulls from your default wallet.
- Partial repayments are supported; remaining installments stay open.
- The bot logs both sides: a withdrawal from the source wallet and an income transaction on the credit wallet.

## Investment wallets

Use investment wallets to keep long-term funds separate from daily spending.

### Top up via transfers

```
/wallet transfer 1000000 Main Wallet Brokerage note=Monthly DCA
```

This keeps your cash ledger accurate, and the investment wallet balance reflects capital invested.

### Track performance with ROE

```
/wallet investment roe Brokerage start=2024-01-01 end=2024-12-31
```

- Calculates simple return on equity over the period.
- Combines contributions, withdrawals, and adjustments to show net gains.

### Adjust to market value

If your brokerage changed value without cash movement, use the API or admin tools to run a manual adjustment transaction so the wallet reflects reality. (A `/wallet adjust` shortcut is planned; for now admins can use the API endpoint.)

## Best practices

- Keep credit purchases detailed with `beneficiary` so repayments know which installments to target.
- Run `credit statement` before repayments to avoid under/over-paying.
- Treat investment wallets as read-only except for transfers and periodic adjustments; use `/recent @Brokerage` to audit contributions.
