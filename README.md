# Syllabi

A mobile-first homework calendar that turns quick captures into realistic study
blocks. The initialized prototype includes:

- a one-line homework capture flow;
- AI planning through Vercel AI Gateway and the AI SDK with typed,
  validated output;
- a responsive week and task view;
- a local fallback planner when no AI key is available;
- an IndexedDB outbox and service worker for offline capture;
- Supabase browser/server clients;
- a Supabase migration with JWT-backed RLS and a pg_cron reminder queue.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open `http://localhost:3000`.

Add the values from the Supabase project’s **Connect** dialog to `.env.local`.
The public browser key should be a publishable key, never a secret or
`service_role` key.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=openai/gpt-5-mini
```

The model uses AI Gateway’s `creator/model-name` format, so it can be changed
without installing another provider package—for example,
`anthropic/claude-sonnet-4.5` or `google/gemini-2.5-flash`.

## Database

The first migration is in `supabase/migrations`. It creates user-owned subjects,
assignments, study blocks, reminders, push subscriptions, RLS policies, and a
private notification outbox. A pg_cron job moves due reminders to the outbox
every minute.

The next backend step is a small Supabase Edge Function that reads the outbox
with a server-only secret and sends Web Push or email. User-facing API calls
should continue to use the signed-in user’s Supabase JWT; the cron worker should
use a separate server credential stored in Supabase Vault.

## Product plan

See [docs/PRODUCT.md](docs/PRODUCT.md) for the prioritized feature brainstorm,
MVP boundary, AI scheduling rules, and suggested roadmap.
