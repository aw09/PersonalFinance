# Copilot Instructions for PersonalFinance Codebase

## Architecture Overview
- **Frontend**: Next.js 14 (App Router, TypeScript, Tailwind CSS) in `src/app` and `src/components`.
- **Backend**: Next.js API Routes in `src/app/api/*`.
- **Database**: Supabase Postgres, managed via SQL migrations in `supabase/migrations/`.
- **Auth**: Supabase JWT, enforced via Row Level Security (RLS) on all tables.

## Key Patterns & Conventions
- **Authenticated API Access**: All API routes requiring user context use the helper `getSupabaseUser(request)` from `src/lib/authSupabase.ts` to extract the JWT and validate the user. Example:
  ```typescript
  const user = await getSupabaseUser(request);
  if (!user) return NextResponse.json({ error: 'Invalid or missing token' }, { status: 401 });
  ```
- **Supabase Client Creation**: Use `createAuthSupabase(token)` for requests needing DB access with user context. Never manually parse the Authorization header in API routes—use the helper.
- **RLS Enforcement**: All data access is protected by Supabase RLS. Do not manually check user IDs in queries unless debugging RLS issues.
- **Type Safety**: Use the generated `Database` type from `src/types/database.ts` for all Supabase client instantiations.
- **Component Structure**: UI components are organized by domain (e.g., `budgets`, `wallets`, `transactions`) in `src/components/`.
- **API Route Structure**: Each resource (budgets, wallets, transactions, categories, investments) has its own API route file in `src/app/api/{resource}/route.ts`.

## Developer Workflows
- **Local Development**:
  - Install dependencies: `npm install`
  - Copy env: `cp .env.example .env.local`
  - Start dev server: `npm run dev`
- **Database Setup**:
  - Run migrations: Use Supabase CLI commands for migrations
  - Local: `npx supabase migration up` or `npx supabase db reset`
  - Production: Apply migrations through Supabase dashboard or CI/CD pipeline
- **Environment Variables**:
  - All secrets and keys are managed via `.env.local` (local) and Railway/production env config.
- **Debugging Auth/RLS**:
  - Use debug output in API routes to trace wallet/user issues.
  - If RLS blocks access, check Supabase policies and ensure the JWT is passed via the helper.

## Integration Points
- **Supabase**: All DB and auth operations use Supabase JS client. See `src/lib/authSupabase.ts` for patterns.
- **Telegram Bot**: Webhook handler in `src/app/api/telegram/webhook/route.ts`.
- **Docker/Railway**: Deployment config in `Dockerfile` and `railway.toml`.

## Examples
- **Authenticated API Route**:
  See `src/app/api/budgets/route.ts` for the canonical pattern.
- **Migration Scripts**:
  See `supabase/migrations/` directory for all database schema changes.
- **RLS Policy Reference**:
  See migration SQL and README for RLS details.

## Project-Specific Advice
- Always use the provided helpers for authentication and Supabase client creation.
- Do not bypass RLS or hardcode user IDs—rely on Supabase policies.
- Keep UI and API logic separated by domain for maintainability.
- Reference the README for setup, migration, and environment details.

---

If any conventions or workflows are unclear, please ask for clarification or provide feedback to improve these instructions.
