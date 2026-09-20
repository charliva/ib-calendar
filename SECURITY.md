# Security policy

Syllabi runs as a live app at **cal.charlieva.dev** holding real students'
schedules and schoolwork. Reports about that instance are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for anything that could expose another
person's data.

Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/charliva/ib-calendar/security/advisories/new).
That channel is private until a fix ships.

Include what you did, what you expected, and what actually happened. A short
reproduction beats a scanner report. Expect an acknowledgement within a few
days; this is a personal project, not a company with an on-call rota.

## In scope

- Reading, writing or deleting another account's calendar, subjects,
  assignments, assessments or learning signals.
- Bypassing invite-only signup, or minting or reusing an invitation token.
- Server-side secret disclosure (`SUPABASE_SECRET_KEY`, `AI_GATEWAY_API_KEY`)
  through any response, log or client bundle.
- Authenticated abuse of the AI routes that lets one account spend another's
  quota, or reach the model provider without a session.
- Stored or reflected XSS in calendar content — event titles, rooms and
  imported timetable labels are all user-controlled text.
- SQL injection or row-level-security bypass through PostgREST.

## Not in scope

These are known, intentional, and not vulnerabilities:

- **`NEXT_PUBLIC_*` values are public.** The Supabase URL and publishable key
  are meant to ship to the browser. They are safe precisely because every table
  is protected by row-level security.
- **`NEXT_PUBLIC_ACCESS_GATE_EMAILS` is a convenience filter, not a boundary.**
  It hides the sign-in form on preview deploys. It is readable in the client
  bundle and does not guard the API. Authorization lives in RLS and in the
  session check on each route.
- The Supabase project reference and the production hostname. Both are
  necessarily public for a hosted app.
- Missing rate limits on unauthenticated endpoints that do no work, absent a
  demonstrated amplification or cost impact.
- Reports generated purely by an automated scanner with no verified impact.
- Social engineering, physical access, or denial of service by volume.

## How the app is protected

- **Row-level security on every user table.** All 17 public tables enable RLS;
  policies scope rows to `auth.uid()`. The only table without RLS lives in a
  `private` schema that PostgREST does not expose.
- **Server-only secrets stay server-side.** `SUPABASE_SECRET_KEY` is read in
  one place (`lib/supabase/admin.ts`) and never crosses into a client
  component. No secret carries a `NEXT_PUBLIC_` prefix.
- **Every AI route requires a session.** `/api/plan`, `/api/command`,
  `/api/extract`, `/api/event-edit`, `/api/go-deeper` and
  `/api/block-suggestions` all reject unauthenticated callers with a 401 before
  touching the model gateway.
- **Invitations are hashed and single-use.** Tokens are stored as hashes;
  claiming one is a single conditional update guarded on `status = 'open'` and
  an unexpired `expires_at`, so a token cannot be redeemed twice. Each user may
  create 10 invitations per 24 hours.
- **Input is validated at the edge.** Every route parses its body with a Zod
  schema carrying explicit length and range bounds before any work happens.

## If you are self-hosting

- Keep `.env.local` out of version control. It is already in `.gitignore`;
  leave it there.
- `SUPABASE_SECRET_KEY` and `SUPABASE_ACCESS_TOKEN` are server-only. If one is
  ever pasted into a client file, a commit or a log,
  rotate it in the provider dashboard rather than deleting the commit.
- Turn **off** "Allow new users to sign up" in Supabase Authentication once
  your own account exists, or your instance is open to the world.
- Apply every migration in `supabase/migrations/` before enabling sync. The
  RLS policies ship inside those migrations, so a partially migrated database
  can be an unprotected one.
- Enable secret scanning and push protection on your fork:
  Settings → Code security.
