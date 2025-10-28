# PersonalFinance

Dead simple personal finance backend built with FastAPI and PostgreSQL. Features:
- Record transactions for expense, income, debts, and receivables
- Track debt agreements, including their installment schedules
- Accept receipt images and use Google's Gemini LLM to extract structured transactions (no manual OCR needed)
- Optional Telegram bot interface for logging transactions on the go
- Multi-user aware: transactions and debts belong to users identified by their Telegram account (the bot auto-creates them on first message)

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
BACKEND_BASE_URL=https://your-public-domain.example
AUTO_RUN_MIGRATIONS=true
LLM_RECEIPT_PROMPT_PATH=prompts/receipt_prompt.txt
```

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
