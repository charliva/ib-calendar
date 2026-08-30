# Plan: Block-Suggestion Safety Floor (PR1 of 2)

Companion to the `grill-me` session on widening block suggestions for any IB student. This is **PR1 only**: the safety floor that prevents the picker from emitting personal, branded, or oversized suggestions **before** the AI ever sees them. PR2 (schema shrink to `length: 1 | 2`, AI prompt rewrite, panel copy) is a separate, gated plan.

**Audience target (settled):** MYP through pre-uni (ages ~14–19). Reading age ~13.

**Why this lands as PR1, not the whole change:** the existing picker at `lib/block-choices.ts` has at least one literal `gilmore-girls` entry in the `lightActivities` array (line ~478) and routes user-created `intention` and `exploration` records straight into the suggestion stream. Any AI polish on top is moot until that input is clean. PR1 makes the picker safe regardless of what the model does with it.

**Branch workflow:** per `AGENTS.md`, this lands on `alpha` first, runs `vercel deploy --yes` as a preview, and is validated with `npm run typecheck && npm run lint && npm test` before promotion. No production touch.

**Issue tracking:** a single GitHub Issue covers PR1; per `docs/agents/issue-tracker.md` use `gh issue create` and apply the canonical triage label per `docs/agents/triage-labels.md`.

---

## Goals (in priority order)

0. **The chokepoint invariant.** No caller may render or return picker suggestions without passing through `filterSuggestionsForPicker()`. The safety function can evolve later; the important thing is that there is one mandatory choke point. **Unknown, malformed, or unapproved suggestions fail closed** — they are dropped, never passed through.
1. **No personal content** in the picker. `intention` and `exploration` sources cannot reach the block-suggestion pipeline.
2. **No branded media** in the picker. Hard blocklist of app/show/brand names, applied at the source.
3. **No oversized suggestions.** Duration caps per category, enforced before the AI endpoint.
4. **Personal category reborn as a generic, auditable template list.** Wind-down templates stay; Personal templates move to their own file with a unit test.
5. **Two options per block, one when nothing else fits.** The schema at the API endpoint is not changed in PR1 — this is **picker behavior only** and surfaces in the picker output; PR2 is what shrinks the API schema and rewrites the AI prompt. (See "Out of scope, not deferred" at the bottom for the nuance.)

## Non-goals (explicitly)

- AI prompt rewrite. `app/api/block-suggestions/route.ts` is **not touched** in PR1.
- API schema shrink from `length: 3` to `length: 1 | 2`. PR2 only.
- Panel copy in `app/block-choice-panel.tsx`. PR2 only.
- Onboarding changes. Out of scope entirely (per Q4 of the grill session).
- Renaming the user-facing category labels (`recovery / responsibility / meaningful` → `Wind down / School / Personal`). That is a label-string change in the panel and lives in PR2 alongside the copy pass.
- Auto-tuning of duration caps from usage data. PR1 only adds the logging hook (see "Observability" below); the algorithm that acts on the logs is a future PR.

## File-by-file changes

### `lib/block-suggestion-safety.ts` (new)

A new module with no dependencies on the rest of `block-choices.ts`. Pure functions, easy to unit test in isolation.

Exports:

- `BLOCKED_TERMS: readonly string[]` — the brand/app/show blocklist. ~25 entries (see "Blocklist contents" below).
- `MAX_DURATION_MIN: { recovery: 30; responsibility: 90; meaningful: 45 }` — duration caps per category. Exported as a `const` so the future auto-tuner can replace the values in one place.
- `ALLOWED_PICKER_SOURCES: readonly BlockSuggestionSource[]` — the allowlist of `sourceType` values the picker is permitted to emit: `["recovery", "recommendation", "generic"]`. Intention and exploration are not in the list.
- `containsBlockedTerm(text: string): boolean` — case-insensitive whole-word match against `BLOCKED_TERMS`. Uses `\b` boundaries so "lyric" doesn't match "Spotify".
- `enforceDurationCap(suggestion: BlockSuggestion): BlockSuggestion` — returns a new suggestion with `estimatedDuration` clamped to the per-category cap, or rejects (returns `null`) if the input's `estimatedDuration` is `< 5` or `> 360` (the existing Zod range — keep it, don't widen it in PR1).
- `filterSuggestionsForPicker(suggestions: BlockSuggestion[]): BlockSuggestion[]` — **the only public chokepoint** for picker suggestions. Applies, in order: source allowlist, blocklist check on `title` and `description`, duration cap. Returns the survivors in the same order. **Does not** enforce a 1-or-2 cap (that's PR2). **Fails closed**: any suggestion with an unknown `sourceType`, unknown `category`, missing `id`, empty `title`, missing `description`, or any field whose value does not match the `BlockSuggestion` shape is dropped. The caller receives the survivors; nothing else. This is the invariant from goal 0.

### `lib/personal-templates.ts` (new)

A static array of Personal-category templates, exported as `PERSONAL_TEMPLATES`. Each entry is:

```ts
type PersonalTemplate = {
  id: string;                      // stable, kebab-case, used as sourceId
  minutes: number;                 // ≤ 30 by the test below
  locations?: CurrentStudyLocation[];     // optional location filter
  blocks?: TimeBlockType[];              // optional block filter
  ambient?: RegExp;                       // optional ambient-text filter
  score: number;                          // tie-breaker
  low: string;                            // noun-fragment rendering
  high: string;                           // short encouraging sentence
};
```

The picker reads `input.currentEnergy` and chooses `low` (energy === "low") or `high` (anything else). This is the energy-aware behavior settled in the grill session.

Initial template list (15 entries — see "Personal template list" below for the full content).

### `lib/block-choices.ts` (modified)

Targeted edits, no rewrites. Three changes:

1. **Remove the `gilmore-girls` entry from `lightActivities`** and the `listen-to-music` and `calming-game` entries stay (they're not branded). Reviewer note in the PR description calls out that any future `lightActivities` entry with a brand name in the `title` will fail the new `personal-templates` test and the PR review will catch it.
2. **Replace the `meaningfulSuggestion()` body** so it pulls from `PERSONAL_TEMPLATES` instead of `meaningfulActivities` + `input.intentions` + `input.explorations`. The new function:
   - Filters `PERSONAL_TEMPLATES` by `block.context.location`, `block.type`, and `ambientText(block)` using the same `chooseActivity()` helper that already exists.
   - Picks the highest-scoring template that fits.
   - Renders `title: high` or `low` based on `input.currentEnergy`.
   - Sets `category: "meaningful"`, `sourceType: "generic"`, `sourceId: template.id`, `estimatedDuration: activityDuration(template, block)` (capped at 30 via the existing `activityDuration` helper — the new test will assert this).
   - Reason text: "Wind down if energy is low; push into something chosen for interest, connection, or creativity when you have it." on `high`, "Rest is a valid use of this block." on `low`. (Final wording is a one-liner copy edit during PR review.)
3. **Wire `filterSuggestionsForPicker()`** into the end of `buildBlockChoice()` so every emitted `BlockSuggestion` is post-processed by the safety filter before the function returns. This is the single integration point that makes the blocklist effective end-to-end without touching `app/api/block-suggestions/route.ts`. A comment at the top of `buildBlockChoice` states the chokepoint invariant for future readers; the integration test asserts it.

The existing `responsibilitySuggestion()`, `responsibilityFallback()`, and `recoverySuggestion()` functions are **unchanged** in PR1. Their output is already safe (School comes from `now-recommender`, Wind down from `lightActivities` minus the one branded entry).

### `lib/block-choices.ts` (PR1 also: picker length cap)

The grill session settled on `length: 1 | 2` per block. PR1 is allowed to enforce the *picker* length cap without changing the *API* schema. Concretely:

- After `filterSuggestionsForPicker`, `buildBlockChoice` returns at most **2** suggestions per block.
- The order is preserved: Wind down first if present, then School, then Personal. (Same order as the current 3-slot list, just capped.)
- When the safety filter reduces 3 → 0, the block is skipped (`buildBlockChoice` returns `null`). The existing `inferCurrentTimeBlock` and the calendar already handle the `null` case.

This means the panel, in PR1, may show 1 or 2 cards instead of 3. The user-facing change is visible but small. **The API still says `length: 3`**; PR2 will align the API to `length: 1 | 2` and the panel will stop accepting 3.


### `tests/block-suggestion-safety.test.mjs` (new)

Four unit-test groups, each a `test()` block, no shared state:

1. **Blocklist tests** — assert `containsBlockedTerm` returns `true` for `"Watch Gilmore Girls tonight"`, `"open spotify"`, `"TikTok break"`, `"youtube video"`, and `false` for `"go for a walk"`, `"lyric sheet"`, `"call a friend"`. The boundary cases ("lyric" vs "Spotify") are the whole point.
2. **Duration cap tests** — assert `enforceDurationCap` returns the input unchanged for in-range durations, clamps to the cap for over-range, and returns `null` for `< 5` or `> 360`. Test all three categories.
3. **Source allowlist tests** — assert `filterSuggestionsForPicker` drops any suggestion whose `sourceType` is `"intention"` or `"exploration"` and keeps `recovery`, `recommendation`, and `generic`.
4. **Personal template tests** — assert every entry in `PERSONAL_TEMPLATES` has both `low` and `high` non-empty strings, both pass `containsBlockedTerm`, and every `minutes` value is `≤ 30`. These three assertions are the long-term guardrail against the Gilmore Girls problem coming back via a new template.
5. **Fail-closed property test (load-bearing)** — the chokepoint invariant is asserted as a *property*, not a fixture. For each of the following malformed inputs, assert that `filterSuggestionsForPicker` returns an array that does **not** contain the input: (a) suggestion with an unknown `sourceType` like `"custom"`, (b) suggestion with an unknown `category` like `"fun"`, (c) suggestion with an empty-string `id`, (d) suggestion with an empty `title`, (e) suggestion with a missing `description`, (f) suggestion with a non-string `estimatedDuration`. The test passes if every malformed input is dropped — i.e. the chokepoint **fails closed**, not merely that the 15 known-good templates are clean.

### `tests/personal-templates.test.mjs` (new, optional split)

If the test list above feels long for one file, the Personal template tests move to their own file. Either way they live in `tests/` next to the other `*.test.mjs` files. The repo's `package.json` test script picks them up automatically via `tests/*.test.mjs`.

### `tests/block-choices.test.mjs` (modified)

Two new test cases added to the existing file:

1. **Integration: picker never emits a blocked term.** Build a `BlockChoiceInput` with: (a) one Wind-down `lightActivities` entry whose `title` contains `"Gilmore Girls"` deliberately re-inserted as a test fixture (a new constant `BLOCKED_WIND_DOWN` in the test file, not a mutation of `lightActivities`); (b) one assignment due in 1 hour; (c) a current intention titled `"Watch Gilmore Girls with Sam"`. Call `buildBlockChoice`. Assert the result is not `null`, every emitted suggestion's `title` and `description` pass `containsBlockedTerm`, and no suggestion's `sourceType` is `"intention"` or `"exploration"`.
2. **Integration: picker caps at 2.** Same input shape, but with three valid suggestion candidates. Assert `buildBlockChoice(...).suggestions.length ≤ 2`. Also assert: when no valid candidates survive, `buildBlockChoice` returns `null`.
3. **Integration: chokepoint is mandatory, not bypassable.** Add a comment to the top of `buildBlockChoice` in `lib/block-choices.ts` stating the invariant. The integration test asserts the invariant indirectly by inserting a candidate whose `sourceType` is `"intention"` directly into the input *before* the picker runs (using a `BlockChoiceInput` extension field if needed, or by exposing a test-only hook in the build script). Assert `buildBlockChoice` still drops the bypass attempt — i.e. the chokepoint is at the *output* of the picker, not at its input, so bypassing the input doesn't help.

### `lib/block-choices.ts` (modified, observability hook)

In `buildBlockChoice`, just before returning, **if `process.env.SYLLABI_DEV_TELEMETRY === "true"`**, log one structured JSON line per emitted suggestion to `console.info`. The flag is **default off** in every environment. To enable locally or on the `alpha` preview, set it explicitly in `.env.local` or in the Vercel project env vars. Production (`main`) never has it on by accident. This is intentional: an instrumentation decision should not be coupled to deployment semantics (e.g. `VERCEL_ENV`), and a missing flag must mean "telemetry off", not "telemetry on by default for this environment name".

```json
{ "event": "block_suggestion_emitted", "category": "meaningful", "sourceType": "generic", "sourceId": "walk", "energy": "high", "minutes": 25, "blocked": false }
```

This is the v1 logging that future PRs will use to auto-tune the duration caps. It logs only when `SYLLABI_DEV_TELEMETRY=true` — no production noise, no surprise on a new environment. The future auto-tuner reads these lines from preview logs and proposes new `MAX_DURATION_MIN` values; it does not change anything in production by itself.

---

## Blocklist contents

Initial `BLOCKED_TERMS` (case-insensitive, `\b`-anchored). Grouped so a reviewer can audit a cluster at a glance.

- **Streaming video:** `Netflix`, `YouTube`, `TikTok`, `Disney+`, `Hulu`, `Prime Video`, `HBO`
- **Streaming music / podcasts:** `Spotify`, `Apple Music`, `SoundCloud`, `Audible`
- **Specific shows the prior picker had:** `Gilmore Girls`
- **Social media apps:** `Instagram`, `Snapchat`, `BeReal`, `Twitter`, `X (the app)`, `Facebook`, `Reddit`, `Discord`, `Twitch`
- **Gaming platforms:** `Steam`, `PlayStation`, `Xbox`, `Nintendo`
- **Generic catch-alls (the only ones that risk false positives):** none in v1. If a false positive shows up in QA, add the brand and a comment.

Total: ~25 entries. The list lives in `lib/block-suggestion-safety.ts` as a `readonly` array. The unit test in `tests/block-suggestion-safety.test.mjs` enumerates each one in a `forEach` and asserts the matcher catches it.

---

## Personal template list

15 entries. Each `low` is a noun fragment (1–3 words, no verb); each `high` is one sentence, plain English, reading age ~13, ending with a period.

| id | minutes | low | high |
|---|---|---|---|
| `walk` | 20 | `Walk.` | `Take a short walk. Leave your phone behind for the first five minutes.` |
| `snack` | 10 | `Snack.` | `Make yourself a real snack, not a quick one, and sit down to eat it.` |
| `stretch` | 8 | `Stretch.` | `Stand up and stretch for a few minutes. Your back will thank you.` |
| `tidy` | 15 | `Tidy.` | `Tidy one corner of your room. Not the whole thing — just one corner.` |
| `read` | 20 | `Read.` | `Read a few pages of something you actually want to read.` |
| `drink-water` | 5 | `Water.` | `Pour a full glass of water and drink it slowly.` |
| `message-friend` | 10 | `Message a friend.` | `Send a short message to someone you haven't talked to in a while.` |
| `cook` | 30 | `Cook.` | `Cook something simple from scratch. The doing is the point.` |
| `sketch` | 15 | `Sketch.` | `Draw anything — the view, your hand, a shape. No skill required.` |
| `playlist` | 15 | `Make a playlist.` | `Make a short playlist for the week. Three to five songs is enough.` |
| `sit-outside` | 15 | `Sit outside.` | `Step outside, even for five minutes. Notice three things you can hear.` |
| `learn-something-fun` | 20 | `Learn something fun.` | `Pick one thing you've always wondered about and look up a short answer.` |
| `call-family` | 15 | `Call family.` | `Call a family member just to say hi. No agenda.` |
| `photo-walk` | 20 | `Photo walk.` | `Take five photos of things you walk past every day but never look at.` |
| `practice-instrument` | 25 | `Practice.` | `Practice one thing you already know. Get it smooth, then stop.` |

Locations and block filters are not set in v1; the picker applies the existing `chooseActivity` filter, which already handles "this is for `home`" / "this is for `after_school`" via the `lightActivities` shape. The Personal templates use the same shape.

The **Personal template test** asserts no `low` or `high` string contains a `BLOCKED_TERMS` entry, which is the long-term safety net.

---

## Out of scope, not deferred

- The renaming of `recovery / responsibility / meaningful` to `Wind down / School / Personal` in the panel UI. That's a label change in `app/block-choice-panel.tsx`'s `categoryCopy` map. It belongs in PR2 because the panel rewrite is also where the 1-or-2 card layout change happens. Calling it out here so it doesn't get forgotten in PR2.
- The AI prompt rewrite that says "two calm choices, not three." The endpoint at `app/api/block-suggestions/route.ts` still receives 3 IDs and still returns 3 polished suggestions in PR1. The picker is what emits ≤ 2 to the UI. PR2 aligns the AI to the new shape.

## Out of scope, deferred indefinitely

- Auto-tuning of `MAX_DURATION_MIN` from usage logs. PR1 only adds the dev-mode log line; reading the logs and proposing new caps is a future PR gated on having ≥ 4 weeks of preview data.
- Onboarding changes (curriculum discovery screen, etc.). Per Q4 of the grill session, onboarding is a separate workstream.
- Opening the app to non-IB audiences. Per Q1 of the grill session, the audience is IB-only with friendlier language; no curriculum-agnostic mode is planned.

## Verification checklist (run before opening the PR)

```
npm run typecheck
npm run lint
npm test
```

All three must be green. Then:

- `git checkout alpha && git merge --no-ff <branch>` (per `AGENTS.md`).
- `git push origin alpha && vercel deploy --yes`.
- Smoke-check the preview: open a block, confirm 1 or 2 cards (not 3), confirm no card title contains a brand name from `BLOCKED_TERMS`, confirm a "watch Gilmore Girls" intention in the test data does not surface.

## Environment variables

PR1 introduces one new env flag. The default is **off in every environment**. Production must never have it on by accident.

```text
SYLLABI_DEV_TELEMETRY=true
```

Set explicitly in `.env.local` for local development, and in the Vercel project env vars for the `alpha` preview. Do not set it for `main`. The flag gates the dev-mode log line described above; it is not used for any user-facing feature.

## Reviewer note for the PR description

> **Why PR1 ships before PR2:** the existing picker has a literal `gilmore-girls` activity and routes user `intention` records directly into suggestions. PR1 removes both vectors at the source so the picker is safe regardless of what the AI does next. PR2 then aligns the API schema and the AI prompt to the new "two options, simple language" model on a known-safe base.

