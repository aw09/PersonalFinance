# PersonalFinance

Dead simple personal finance backend built with FastAPI and PostgreSQL. Features:
- Record transactions for expense, income, debts, and receivables
- Manage wallets (regular, investment, and credit) with automatic “Main Wallet” creation, balance updates, and per-user default wallets
- Track debt agreements, including installment schedules, partial repayments, and summaries
- Accept receipt images and use Google's Gemini LLM to extract structured transactions (no manual OCR needed)
- Telegram bot for quick entry (slash commands, text shorthand, and receipt uploads) plus automatic user provisioning
- Multi-user aware: all entities are scoped to the Telegram user that created them

## Project layout

```
app/
  api/              # FastAPI routers
  config.py         # Settings via environment variables
  db.py             # Database engine and session handling
  main.py           # FastAPI application entrypoint
  models/           # SQLAlchemy ORM models
  schemas/          # Pydantic request/response models
  services/         # Domain services (transactions, debts, LLM, Telegram helpers)
  telegram/         # Telegram bot setup and handlers
```

## Getting started

1. Create and activate a virtual environment
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

2. Install dependencies
   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and update the values for your environment.

4. Apply the database migrations
   ```bash
   alembic upgrade head
   ```

5. Start the API
   ```bash
   uvicorn app.main:app --reload
   ```

   When `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `BACKEND_BASE_URL` are set, the bot registers a webhook automatically and begins processing updates through the FastAPI endpoint.

## Wallets

Every user starts with a “Main Wallet” (type `regular`) that acts as their default balance bucket. Additional wallets can be created to separate investment funds or credit accounts:

- `POST /api/wallets` with `{"user_id": "...", "name": "...", "type": "regular|investment|credit", "make_default": false}`
- `GET /api/wallets?user_id=...` to see balances and which wallet is currently marked as default
- `POST /api/wallets/{wallet_id}/deposit|withdraw|adjust` to move money in or out (each call creates a linked transaction)
- `POST /api/wallets/transfer` to move money between two wallets (uses separate transactions for each side).
- `POST /api/wallets/{wallet_id}/set-default` to change the default wallet for future transactions
- `POST /api/wallets/{wallet_id}/credit/purchase` to capture a card spend and automatically create an installment schedule linked to that wallet
- `POST /api/wallets/{wallet_id}/credit/repay` to apply repayments (optionally specifying the cash wallet that funded the payment and a beneficiary tag)
- `GET /api/wallets/{wallet_id}/credit/statement` to preview the current billing cycle, settlement date, and amounts due (including installment-level detail)
- `GET /api/wallets/{wallet_id}/investment/roe` to calculate a simple return on equity for an investment wallet over a configurable period
- Visit `/docs/rapidoc` for the interactive RapiDoc UI (powered by the same OpenAPI schema).

Credit wallets accept optional `credit_limit` and `settlement_day` fields; investment wallets can be adjusted to reflect market value using the `adjust` endpoint.

Transactions created through the API or the Telegram bot automatically attach to the user's default wallet. Prefix Telegram commands with `@wallet` (for example, `/add @travel expense 150000 flight`) to post directly into a specific wallet without changing the default.

### Telegram commands

- `/add [type] <amount> <description>` - record an expense, income, debt, or receivable. Supports shorthand such as `e cafe 50000 lunch`.
- `/receipt` - send a photo to extract a transaction from a receipt using Gemini (add `@wallet` in the caption to save into a specific wallet).
- `/owed [name]` - list outstanding receivables (with optional name filter).
- `/report [range]` - show summaries for today, mtd, ytd, 1 week, 1 month, etc.
- `/recent [@wallet] [limit|since|per]` - list the latest transactions with flexible pagination. Use `limit=n` to cap the total rows, `per=n` to change the page size (default 10), and `since=YYYY-MM-DD` to filter by date. Pagination buttons appear automatically when more data is available.
- `/wallet <action>` - list wallets, add/edit them, transfer funds between wallets, or change the default wallet (e.g. `/wallet transfer 50000 Main Investment`). Try `/wallet credit statement <wallet>`, `/wallet credit purchase <wallet> <amount> [installments=3]`, `/wallet credit repay <wallet> <amount> [from=@wallet]`, or `/wallet investment roe <wallet> [start=...] [end=...]` for the new credit and investment helpers.
- `/help` - show the command reference inside Telegram.

### Docker

You can run the API inside a container:

```bash
docker build -t personal-finance .
docker run --rm -p 8000:8000 \
  -e DATABASE_URL=postgresql+asyncpg://username:password@host:5432/personal_finance \
  -e GEMINI_API_KEY=your-google-generative-ai-key \
  -e TELEGRAM_BOT_TOKEN=bot-token-from-botfather \
  -e TELEGRAM_WEBHOOK_SECRET=choose-a-random-secret \
  -e BACKEND_BASE_URL=https://your-public-domain.example \
  personal-finance
```

## Environment

```env
DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/personal_finance
DIRECT_DATABASE_URL=postgresql://username:password@localhost:5432/personal_finance
GEMINI_API_KEY=your-google-generative-ai-key
TELEGRAM_BOT_TOKEN=bot-token-from-botfather
TELEGRAM_WEBHOOK_SECRET=choose-a-random-secret
TELEGRAM_REGISTER_WEBHOOK_ON_START=false
BACKEND_BASE_URL=https://your-public-domain.example
INTERNAL_BACKEND_BASE_URL=http://service.internal:8000
AUTO_RUN_MIGRATIONS=false
LLM_RECEIPT_PROMPT_PATH=prompts/receipt_prompt.txt
```

## Unittest

```bash
python -m unittest discover -s tests -p "test_*.py"
```

## Telegram integration test

For end-to-end verification against the **production** Telegram bot (real backend + real Telegram traffic), use the Telethon script in `integration_tests/telegram_bot/repay_flow.py`. It signs in as a normal Telegram user, ensures wallets exist, and walks through the credit repayment flow via the live bot—ideal for manual smoke tests without touching the webhook code.

1. Export the required Telegram credentials (no wallet-specific variables are needed—the script creates test wallets as required):
   ```bash
   export TELEGRAM_TEST_API_ID=123456
   export TELEGRAM_TEST_API_HASH=abc123yourhash
   export TELEGRAM_TEST_PHONE=+621234567890
   export TELEGRAM_MAIN_BOT_USERNAME=@PersonalFinanceBot
   # optional: TELEGRAM_TEST_PASSWORD=your-telegram-2fa-password (if 2-step verification enabled)
   # optional: TELEGRAM_TEST_SESSION=/path/to/session.file to override the saved session location
   ```
2. Install dependencies (`telethon` is already listed in `requirements.txt`).
3. Run whichever integration script you need:
   ```bash
   # Full repayment flow (wallet button navigation + confirm inline button)
   python integration_tests/telegram_bot/repay_flow.py

   # General smoke covering /start, /help, /add, /recent, /report, /owed, wallet statements, etc.
   python integration_tests/telegram_bot/basic_flows.py

   # Advanced scenarios: credit purchase/installments, credit repay with @wallet source, lend/repay sequences
   python integration_tests/telegram_bot/advanced_flows.py
   ```
   On first run you will be prompted for the Telegram login code sent to the test phone number (and, if 2-step verification is enabled, the password—either via `TELEGRAM_TEST_PASSWORD` or an interactive prompt). Subsequent runs reuse the saved session.

The script will:
- Send `/wallet list`, auto-create missing regular/investment/credit wallets via `/wallet add`.
- Execute `/wallet credit repay` and answer every prompt (wallet selection, amount, source wallet, notes, beneficiary) before tapping the inline **Confirm** button.
- Wait for the “Applied repayment…” confirmation from the real bot.

Extend `integration_tests/telegram_bot/` with additional flows as required (e.g., `/add`, `/recent`) to keep your manual smoke tests close to the codebase.

## Development notes

- Database migrations are handled with Alembic. Use `alembic revision --autogenerate -m "message"` to create new migrations when models change.
- Supply `DIRECT_DATABASE_URL` when your primary `DATABASE_URL` points to a connection pooler that restricts migrations (e.g., Supabase session pooler). The app will use the main URL for runtime and the direct URL for Alembic.
- The Gemini integration expects receipt images as bytes (e.g. via multipart upload). It sends the raw image to the API and prompts Gemini for structured JSON. Inspect `app/services/llm.py` for details and safeguards.
- The Telegram bot runs in webhook mode via `POST /api/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}`. Ensure `BACKEND_BASE_URL` points to a publicly reachable HTTPS endpoint before enabling it.
- `AUTO_RUN_MIGRATIONS=false` skips the Alembic upgrade on startup; helpful if you prefer manual migrations.
- Users created from Telegram chats (via their `from.id`) are auto-provisioned; you can also manage them explicitly through `/api/users`.

## Next steps

- Wire up authentication if you need multi-user support.
- Expand Telegram flows (e.g., inline keyboards for marking installments as paid).
- Add reporting endpoints (monthly summaries, category breakdowns, etc.).
