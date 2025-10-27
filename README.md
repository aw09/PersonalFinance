# PersonalFinance

Dead simple personal finance backend built with FastAPI and PostgreSQL. Features:
- Record transactions for expenditure, income, debts, and receivables
- Track debt agreements, including their installment schedules
- Accept receipt images and use Google's Gemini LLM to extract structured transactions (no manual OCR needed)
- Optional Telegram bot interface for logging transactions on the go

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

3. Provide configuration (see `.env.example`) then start the API
   ```bash
   uvicorn app.main:app --reload
   ```

4. (Optional) start the Telegram bot poller once the API is running
   ```bash
   python -m app.telegram.bot
   ```

## Environment

```env
DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/personal_finance
GEMINI_API_KEY=your-google-generative-ai-key
TELEGRAM_BOT_TOKEN=bot-token-from-botfather
TELEGRAM_DEFAULT_CHAT_ID=optional-default-chat-id
```

## Development notes

- The first API start-up will auto-create tables (handy for local development). Switch to Alembic migrations before production use.
- The Gemini integration expects receipt images as bytes (e.g. via multipart upload). It sends the raw image to the API and prompts Gemini for structured JSON. Inspect `app/services/llm.py` for details and safeguards.
- The Telegram bot uses long polling and talks to the API endpoints. Adjust handlers or move to webhooks if you host it elsewhere.

## Next steps

- Wire up authentication if you need multi-user support.
- Replace auto-migrations with Alembic migrations.
- Expand Telegram flows (e.g., inline keyboards for marking installments as paid).
- Add reporting endpoints (monthly summaries, category breakdowns, etc.).
