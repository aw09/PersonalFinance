---
sidebar_position: 7
---

# Reports & History

Keeping tabs on your spending is effortless once you master `/recent` and `/report`.

## `/recent`

```
/recent
/recent @Travel limit=20 per=5
/recent since=2024-10-01
```

- `limit` caps the total number of rows fetched (max 500).
- `per` controls how many transactions appear per page (default 10).
- `since` filters by ISO date. Combine with `@wallet` for focused audits.
- Inline **Prev/Next** buttons appear automatically when there are more results. They remember your original filters.

Use `/recent limit=2 per=1` during testing to ensure pagination works end-to-end (the integration tests already do this).

## `/report`

```
/report today
/report last 30 days
/report mtd
/report @Investment ytd
```

- Supported ranges include: `today`, `yesterday`, `week`, `month`, `quarter`, `year`, `mtd`, `ytd`, `last n days/months`, etc.
- Combine with `@wallet` to scope to a specific wallet.
- The bot groups totals by currency and type (expense, income, debt, receivable) and shows a net figure at the end.

## `/owed`

- `/owed` – see everyone who owes you money.
- `/owed Alex` – narrow down to a specific beneficiary.
- Results show total outstanding plus the latest installment/due date.

## Using data outside Telegram

- Every command you trigger is backed by the same FastAPI endpoints exposed via the RapiDoc UI (`https://your-backend-host/docs/rapidoc`).
- Admins can export raw transactions from the database or via `/api/transactions` for spreadsheets and BI tools.
- Because wallet links are preserved on delete (they just become `null`), you never lose historical context.
