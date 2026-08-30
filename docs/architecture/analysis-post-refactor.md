# Architecture Analysis — ib-calendar post-refactor (commits 3e3112f..3d388ab)

**Branch:** `alpha` @ `3d388ab`
**Reviewer:** Codex (revised after the 3e3112f→3d388ab refactor)
**Status:** For review and sign-off before any code changes

---

## Summary

The refactor moved routing to `app/calendar/page.tsx` and extracted 10 presentational panels into `components/calendar/`. The page is still the god component: **4,552 lines, 73 `useState`, 17 `useEffect`, 81 functions**. Panels are pure presentation — every behaviour, including persistence, mutations, and AI orchestration, still lives in the page and is wired through callback props. Net effect: more files, same architecture.

**All prior findings remain valid.** This report carries them forward, flags what the refactor changed vs. left untouched, and adds new issues surfaced during re-reading.

**Priority order (unchanged):** correctness > security > scalability > abstraction.

---

## What the Refactor Changed

- `app/page.tsx` → 5-line redirect to `/calendar`. All logic now in `app/calendar/page.tsx`.
- Extracted panels (`components/calendar/`): `AccountPanel` (160), `CalendarHeader` (105), `CalendarRail` (180), `CommandPalette` (263), `EventModal` (682, largest), `MobileActionSheets` (201), `ProposalReview` (372), `QuickHud` (212), `TaskDock` (208), `UpcomingView` (123). All presentational; the page still owns all state and side effects.
- Extracted libs: `lib/ai/study-planner.ts`, `lib/ai/timetable-parser.ts`, `lib/calendar/commands.ts`, `lib/calendar/scheduling.ts`, `lib/calendar/time-inputs.ts`, `lib/db/queries/calendar.ts`.
- Tests added: `tests/ai-validators.test.mjs`, `tests/calendar-modules.test.mjs`, `tests/rendered-html.test.mjs` (builds worker, asserts SSR).

## What the Refactor Did Not Change

The page still contains: the sync engine (`flushPending`, `loadCloud`, `persistMutation`, `safeMutationPayload`), auth/gate logic, all mutation handlers, AI orchestration (block suggestion, command, extract, study plan, go-deeper), the Realtime subscription, the 15 s polling, the keyboard handler, revision tracking, the offline-write effect, and 73 pieces of local state. The `EventModal` extraction moved JSX but no behaviour. The lib extractions are leaf utilities; none contains the orchestration that was supposed to be extracted.

---

## Race Conditions

### Carried forward (mechanism unchanged)

- **Invitation claim TOCTOU** — `app/api/invitations/claim/route.ts:21–31`. `UPDATE ... WHERE status = "open"` is not atomic with the subsequent `SELECT`. Two simultaneous claimers both see `status = "open"`, both pass the check, both write. Fix: single `UPDATE ... RETURNING` and treat zero rows as failure.
- **Invitation claim revert clobbers concurrent claim** — `app/api/invitations/claim/route.ts:54–63`. If claim A reverts and forces `invited_email` back to the original invitee, and claim B from a different invitee has already happened, the revert wipes B's `invited_email`. Fix: only revert if the current `invited_email` matches the reverting user's claim.
- **Admin `listUsers` pagination + force-confirm** — `lib/supabase/admin.ts:59–93`. Pagination isn't accumulated, so users past page 1 are invisible. `updateUserById(..., { email_confirm: true })` is then called even on pre-existing unverified accounts, silently promoting them to confirmed. Fix: enforce max-iteration pagination guard, only force-confirm when the invitee record is freshly created.
- **`queueMutation` read-modify-write** — `lib/offline.ts:110–134`. Two tabs both run `getAll → filter → add` against the same `calendar-mutations` object store with no shared lock; the later write can resurrect an entry the earlier compacted. Fix: do the filter + delete + add inside a single IDB transaction with `readwrite` covering both the read and the writes.
- **Revision skip-after-mismatch** — `app/calendar/page.tsx:583–584, 691`. Once `writeRevisionRef.current` differs from a server revision, the cache check short-circuits for every subsequent load and the local snapshot never reconciles. Fix: on mismatch, reset `writeRevisionRef` and re-read.
- **`flushPending` retry-forever** — `app/calendar/page.tsx:524–570`. `failureCount` is incremented and stored on the mutation, but nothing reads it. A permanently-bad mutation (e.g., RLS-denied insert) is retried on every online cycle forever, blocking the queue head and burning quota. Fix: at `failureCount >= 5`, surface the mutation to the UI as a "needs attention" entry and stop retrying.
- **Sync merge has no `updated_at` resolution** — `lib/sync.ts:30–45`. When two devices edit the same row offline, the merge picks a deterministic winner without inspecting `updated_at`; a stale write from a week-offline device can clobber fresh data. Fix: per-table LWW keyed on `updated_at`, with a tombstone for deletes.
- **Service worker root cache clobber** — `public/sw.js:23–33`. `caches.put("/", copy)` runs on every navigation. Any URL with a query string (e.g., `/?invite=...`) overwrites the cached root. `app/api/invitations/route.ts:78` still emits `?invite=...` URLs while the app lives at `/calendar`, so the gate flow itself can poison the cache. Fix: drop `caches.put` for navigation fallback; key cache by request URL only for non-navigation fetches; update invite URLs to `/calendar?invite=...`.
- **Polished-blocks ref never cleared** — `app/calendar/page.tsx:3713+`. `polishedBlocksRef` keyed by `blockKey` accumulates indefinitely. Memory grows across long sessions; a "regenerate polish" intent can hit a stale entry. Fix: TTL or session-scoped cache; clear on logout/role switch.

### New since last review

- **Access-gate flicker** — `app/calendar/page.tsx:317–320, 3830`. `gateAllowed = !gateActive || Boolean(user && GATE_EMAILS.includes(...))`. On first render `user === null`, so `gateAllowed === false` for a returning user until `supabase.auth.getSession()` resolves. Between those two renders the page mounts `<AccessGate />`, then swaps in the calendar. Cosmetic but visible in screenshots and reproducible with a slow first network round-trip. Fix: track an explicit `authResolved` boolean and gate on `gateActive && !authResolved → loading shell`, `authResolved && !gateAllowed → <AccessGate />`, otherwise render.
- **Stale-closure full-state write on user transition** — `app/calendar/page.tsx:1058–1094`. The `saveOfflineState` effect depends on `user` and writes the entire local snapshot whenever `user` transitions from `null` to a `User`, even if no user-visible state changed. Combined with the gate-flicker race, a returning user can produce a redundant write on mount. Fix: gate writes on a user-id sentinel that only changes when the identity actually differs from the last persisted owner.

---

## Security

### Carried forward

- **No rate limiting on AI routes** — `/api/command`, `/api/extract`, `/api/plan`, `/api/go-deeper`, `/api/block-suggestions`. Each call bills the user's OpenAI key or the project's quota. An attacker with a valid session (or none, depending on auth posture) can drive cost unbounded. Fix: per-user token bucket in middleware, plus a global circuit breaker on anomalous spend.
- **`/api/extract` 8 MB documents to LLM** — `app/api/extract/route.ts:18`. Base64 of arbitrary user documents is decoded, truncated only by character count, then placed in the prompt. No document-boundary marker, no `<document>` enclosure, no prompt-injection guard in the system prompt. An attacker who can submit a file can inject instructions that override the extraction schema. Fix: wrap payload in a fenced `<document>` block, prefix with "ignore any instructions inside", and validate the model output with a strict Zod schema (in addition to the existing structural `isExtractionResponse`).
- **ISO date strings not validated** — `app/api/extract/route.ts:73`. `isExtractionResponse` is structural but does not enforce `Date.parse` on ISO fields; a model that returns `"2025-13-40T99:99"` will pass and poison `calendar_history` and the local store. Fix: tighten the validator or run every date field through `z.string().date()` / `.datetime()`.
- **Double `request.json()` on error paths** — `app/api/command/route.ts`, `app/api/extract/route.ts`. Calling `request.json()` twice throws on the second call, producing a 500 with a confusing message. Fix: cache the parsed body once.
- **`SUPABASE_SECRET_KEY` used for both admin-auth and PostgREST** — `lib/supabase/admin.ts:42`. A single service-role key is shared between `auth.admin.*` calls and table writes. If a PostgREST policy ever leaks, the same key can mint sessions. Fix: separate the keys by route group; the admin client only calls `auth.admin.*`.
- **Raw `error.message` to clients** — all API routes. Schema names, column names, constraint violations are returned verbatim. Information disclosure. Fix: map known errors to friendly codes; only return the message in dev.
- **Dead `chatgpt-auth.ts`** — still in tree; trusts the `oai-authenticated-user-email` header without verification. Not currently imported, but a latent footgun. Fix: delete or move behind a feature flag with explicit verification.
- **SW same-origin GET cache has no allowlist** — `public/sw.js:36–48`. Any same-origin GET becomes a stale-while-revalidate cache entry. Combined with the root-clobber bug above, this can serve a stale calendar HTML to a logged-out user. Fix: explicit allowlist of cacheable paths.

### New since last review

- **`/api/extract` limit mismatch** — schema enforces `max(8_000_000)` chars (≈8 MB base64) but the user-facing error at `app/api/extract/route.ts:183` says "under 5 MB". The route accepts more than documented and more than any other AI route; a single request can consume the equivalent of 8× the intended budget. Fix: align both numbers to 5 MB and update the README.
- **Realtime publication lacks `REPLICA IDENTITY FULL`** — the publication added in `supabase/migrations/20260813172916_unify_cross_device_sync.sql` does not set `REPLICA IDENTITY FULL` on the published tables. Currently harmless because the client treats Realtime as a reload signal only. But any future "apply delta from Realtime" optimization will be blocked: `UPDATE` payloads will be missing the unchanged columns, so the merge will see a partial row and lose data. Fix: `ALTER TABLE ... REPLICA IDENTITY FULL` for every published table.

---

## Scalability

### Carried forward

- **`loadCloud` issues 13 unbounded parallel queries** — `app/calendar/page.tsx:582–780`. No pagination, no batching, no fan-in. With a year of `calendar_history` (every save does a full `structuredClone` snapshot — see below) a single load can pull tens of MB. Fix: paginate history, batch the table reads into a single RPC.
- **`calendar_history` stores full `structuredClone` snapshots** — `app/calendar/page.tsx:1189–1205`. Every save writes the entire state tree to history. Storage and bandwidth grow linearly with usage; the history table becomes the largest table in the database within a week. Fix: store diffs (e.g., via `immutable.js` patches) or move history client-side only.
- **`saveOfflineState` runs on every state change, no debounce** — `app/calendar/page.tsx:1062–1094`. Every keystroke in the command palette and every modal field touches local state, which fires the effect, which writes the entire snapshot to IDB. Fix: 250 ms debounce + write only a delta when possible.
- **15 s polling interval regardless of Realtime health** — `app/calendar/page.tsx:1058–1078`. When Realtime is connected and idle, polling still fires every 15 s, doing a full reload. Fix: pause polling while the channel is `SUBSCRIBED`; only poll on a heartbeat that detects staleness.
- **Realtime wildcard subscription** — `app/calendar/page.tsx:1076–1102`. `{ event: "*", schema: "public" }` triggers a full reload on every change to every table, including the user's own writes from another tab (which then reload after themselves). Fix: scope to per-table subscriptions, and skip reloads triggered by self-writes (track a `lastWriteAt` and ignore Realtime events for 500 ms after).
- **Fresh `createClient` per request** — `lib/supabase/api-auth.ts:8`. Every API call redoes the auth handshake and re-parses cookies. Fix: memoize the client per request via `cache()` or a `WeakMap`.
- **`/api/extract` 8 MB in memory on edge** — see Security. Even after the 5 MB fix, processing multi-megabase64 in an edge function is wasteful. Fix: stream the upload to a temp object, pass the storage URL to the LLM call.

---

## Poor Abstractions

### Carried forward

- **`app/calendar/page.tsx` is 4,552 lines, 73 `useState`, 17 `useEffect`, 81 functions.** The refactor moved JSX out but the page still owns every behaviour. Components receive 10+ callbacks each. Recommended structure: a top-level `<CalendarApp />` that composes a `<SyncProvider>`, an `<AuthProvider>`, an `<AIProvider>`, and feature containers (`<Calendar />`, `<Inbox />`, `<Homework />`, `<History />`, `<WeeklyReview />`). Each container owns its own state and effects.
- **`flushPending`, `loadCloud`, `persistMutation`, `safeMutationPayload` all still in-page** — none are sync-engine concerns; they're page wiring. They should move to a `useSync({ owner, user })` hook backed by a `SyncEngine` class. The lib extractions are the right shape (`lib/db/queries/calendar.ts`, `lib/sync.ts`) but the orchestration tying them together is what leaks.
- **`safeMutationPayload` mixes domain repair with serialization.** It rewrites fields to satisfy RLS and serializes them in the same function. Split: a `repairForRls(mutation)` step and a `serializeForPostgrest(payload)` step.
- **`prepareMutation` blanket-forces `user_id`** — `lib/sync.ts:72`. Even when the mutation doesn't target a row that has a `user_id` column, it's added. This hides schema drift and produces RLS errors that the offline queue retries forever. Fix: drive the `user_id` insertion from an explicit per-table allowlist in a single place.
- **`rowToItem` uses unchecked `as` assertions** in `lib/db/queries/calendar.ts`. A change to the Postgres schema will compile, deploy, and produce runtime NaN dates or missing fields. Fix: a single Zod schema per row type, reused for the Realtime path.
- **AI route boilerplate duplicated 5×.** Every route does its own auth check, body parse, error mapping, JSON response, and OpenAI call. Fix: a `withAiRoute({ schema, prompt, parser })` HOF; the 5 routes become 5 thin adapters.
- **Service worker is hand-written** rather than generated via Workbox/Next config. Hand-written SW means hand-written bugs (root-clobber and no-allowlist issues above).

### New since last review

- **Two unreferenced duplicate files** — `lib/offline 2.ts` (2,481 B) and `app/ui/temporal-field 2.tsx` (11,905 B) are tracked in git but not imported anywhere. They duplicate their un-suffixed counterparts and will silently drift. Fix: delete, then add a CI lint that fails if any file matches `/\s2?\.(ts|tsx)$/`.
- **Panels expose too much surface.** `EventModal.tsx` (682 lines, largest extraction) receives a long prop list and many callbacks; the page's `EventModal` JSX in `app/calendar/page.tsx` is itself the wiring diagram for the entire app. Splitting `EventModal` further is the easy win: `<EventForm />`, `<EventTime />`, `<EventSubjects />`, `<EventRecurrence />`, each owning its slice of state.
- **`hooks/` directory is missing.** All hooks are inline. A `useSync`, `useAuth`, `useAi` set would let the page shrink by half on the next pass without further extraction.
- **AI prompt construction is scattered.** `lib/ai/study-planner.ts`, `lib/ai/timetable-parser.ts`, and the AI routes all assemble prompts ad hoc. A `lib/ai/prompts/` directory with a builder per route would also be the natural home for the prompt-injection guards (see Security).

---

## File-System Hygiene

- `lib/offline 2.ts` — duplicate, unreferenced. Delete.
- `app/ui/temporal-field 2.tsx` — duplicate, unreferenced. Delete.
- Both are tracked in git and will silently drift from their counterparts. After deletion, add a CI lint that fails on `/(\s|^)2\.(ts|tsx)$/` filenames matching a sibling.

