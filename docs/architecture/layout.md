# Where things live

A map of the source tree, written so you can find the file you need without
reading the whole thing first.

## Running it

```bash
npm run dev        # runs `npm run doctor` first, then starts vinext
npm run doctor     # clears stale dev state; safe to run any time
npm run typecheck  # ~4s
npm run test:unit  # domain tests, no build needed
npm run test       # build + tests (rendered-html tests need dist/)
```

If the dev server ever prints its banner and then never serves a request,
`npm run doctor` is the fix; see the comment at the top of `scripts/doctor.mjs`
for why that happens.

## `app/calendar/`

`page.tsx` is the calendar screen. It owns the React state, the effects that
hydrate and sync it, and the JSX. Everything it *does* lives in sibling modules
that it wires together:

| Module | Responsibility |
| --- | --- |
| `view-types.ts` | `Zoom` / `PaletteMode` vocabulary and default view state |
| `legacy-offline.ts` | Migration for state saved before homework became work items |
| `command-payload.ts` | The item projection sent to the command endpoint |
| `cloud-snapshot.ts` | Reads one account's whole calendar from Supabase |
| `use-calendar-navigation.ts` | Stepping the view by button, swipe, or trackpad |
| `use-drag-and-resize.ts` | Dragging items onto the grid and resizing by the edges |
| `use-event-editor.ts` | Opening the compact editor and saving what it produces |
| `edit-event-naturally.ts` | Applying a natural-language instruction to one event |
| `use-work-capture.ts` | One-line text capture |
| `use-command-console.ts` | The command palette's submit path |
| `use-proposals.ts` | Document/timetable extraction and proposal review |
| `use-school-records.ts` | Subjects, lessons, assignments, assessments |
| `use-learning-actions.ts` | Intentions, challenge signals, Go Deeper |
| `use-now-session.ts` | "What should I do now?" |
| `use-account-session.ts` | Sign-in, invitations, sign-out |
| `use-time-calendar-gestures.ts` | Direct manipulation inside the time grid |

The hooks are called in dependency order in `page.tsx`: a hook that consumes
another's result is wired after it. Two call sites depend on that ordering —
`useNowSession` needs `openGoDeeper`, and `useDragAndResize` needs
`persistClassOccurrence` — so keep them below the hooks that produce those.

## `components/school/`

`app/school-workspace.tsx` is now just the shell: tab state, editor drafts, and
the save handlers. The panels and forms are components:

- `tabs/` — `TimetableTab`, `SubjectsTab`, `AssignmentsTab`, `AssessmentsTab`
- `editors/` — one per record type, each taking `draft` / `setDraft` /
  `onSubmit` / `onCancel`
- `types.ts`, `constants.ts`, `format.ts`, `drafts.ts` — the shared vocabulary,
  option lists, date formatting, and blank records
- `LessonCard`, `ImportedLessonCard`, `SchoolEmpty`, `fields.tsx`

Tabs receive `{...props}` from the workspace plus the view state they need, so
adding a prop to `SchoolWorkspaceProps` reaches every tab without extra wiring.

## `lib/block-choices/`

The contextual block picker, split along its own pipeline:

`types.ts` → `blocks.ts` (which block is it) → `activities.ts` (what could fill
it) → `suggestions.ts` (the three offers) → `lib/block-choices.ts` (entry).

Import from `@/lib/block-choices`; it re-exports the types. `types.ts` exists
separately so `personal-templates.ts` and `block-suggestion-safety.ts` can share
the vocabulary without importing the entry file, which imports them back.

## `app/styles/`

`app/globals.css` is an index of `@import`s and nothing else. The import order
is the original source order of the single stylesheet these came from, so the
cascade is unchanged — **a rule that used to win by appearing later still
appears later.** Add new layers at the end.

The directories group by surface: `base/`, `shell/`, `calendar/`, `capture/`,
`editors/`, `overlays/`, `now/`, `school/`, `hud/`, `home/`, `learning/`,
`review/`, `auth/`. `surface/` is the "calm control surface" refinement layer
that overrides the earlier ones, which is why it sits where it does in the
index rather than next to the files it refines.

Tests that assert on CSS should use `tests/helpers/stylesheet.mjs`, which
resolves the import graph; reading `globals.css` alone sees no rules.
