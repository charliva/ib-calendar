<img width="1490" height="855" alt="Screenshot 2026-09-19 at 3 31 40 PM" src="https://github.com/user-attachments/assets/7f829efb-5283-46f9-b542-f68d635b5d9a" />

---

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
# Server-only key used by the protected invitation routes.
SUPABASE_SECRET_KEY=sb_secret_...
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=openai/gpt-5-mini
```

The model uses AI Gateway’s `creator/model-name` format, so it can be changed
without installing another provider package—for example,
`anthropic/claude-sonnet-4.5` or `google/gemini-2.5-flash`.

## Invitations and email codes

Signed-in users can copy a single-use, seven-day invitation URL or enter a
friend's address to create a passwordless account and send a verification code.
Normal email sign-in does not create accounts, so new accounts must come through
an invitation. Invitation creation is limited to 10 per user in 24 hours.

In the hosted Supabase dashboard, turn off **Allow new users to sign up** under
Authentication settings after confirming your owner account already exists. The
server-only invitation route creates a confirmed passwordless account before
requesting its OTP, so invited users can still finish signup while public signup
stays off. The recipient still needs the emailed code before Supabase issues a
session.

Apply `supabase/migrations/20260810190834_add_invitations.sql`, add the
server-only `SUPABASE_SECRET_KEY` to the deployment, and configure a production
SMTP provider in Supabase Authentication settings. Set the Magic Link email
template to the contents of `supabase/templates/magic-link.html`; it uses
`{{ .Token }}` rather than `{{ .ConfirmationURL }}`, which makes Supabase send
a typed one-time code instead of an authentication link.

The recommended free provider is Resend. Add `auth.charlieva.dev` as a sending
domain in Resend, then add the exact SPF/MX and DKIM records shown there to
Cloudflare DNS. Using a dedicated auth subdomain isolates its reputation and
avoids the Vercel CNAME already used by `cal.charlieva.dev`.

Configure Supabase Authentication > SMTP with:

- host: `smtp.resend.com`
- port: `465` with implicit TLS, or `587` with STARTTLS
- username: `resend`
- password: the Resend API key
- sender: `Syllabi <login@auth.example.dev>`

Resend's free tier is suitable for a small class/friends rollout. Cloudflare
Email Routing can remain enabled independently for inbound aliases, but it is
not an outbound SMTP server and cannot deliver Supabase authentication codes.

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
