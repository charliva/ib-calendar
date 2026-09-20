# Calendar interaction rollout

The day and week calendars share a compact event editor, class-only filter, selection, and direct manipulation. Shift-click toggles selection; Delete/Backspace opens bulk confirmation and Enter confirms. Single deletion uses a second click. Option/Alt uses five-minute precision and bypasses school-period magnets.

Classes appear as projected timetable occurrences, so ordinary edits and deletion affect only that occurrence. Recurrence editing offers Once, Weekly, Week A, and Week B; future edits preserve the past. Homework can link to a subject and an optional class occurrence, and completed homework remains subdued in the grid.

## Database deployment

Apply `supabase/migrations/20260914094420_calendar_interactions.sql` before enabling cloud sync with this release. It adds numeric energy usage, class location and occurrence overrides, homework links, and the City context. The legacy energy column remains for compatibility with older clients; the new editor uses the numeric scale. Existing values are backfilled without deleting original data.

The migration has not been applied to a remote database. Local Supabase verification requires Docker or Podman, neither of which was available during implementation. Do not treat browser tests of offline persistence as verification of the remote migration.

The `/api/event-edit` endpoint requires an authenticated session and configured AI Gateway access. Common time, room, context, recurrence, and energy edits also have an offline parser. Live AI output was not exercised without a signed-in test session.

## Verification

Typecheck, lint (existing warnings only), production build, and 150 tests passed. Browser checks covered class creation and period snapping, immediate room edits, local text editing, homework completion, multi-selection, keyboard bulk confirmation, and preservation of the following week's class. Desktop editor appearance was inspected from a browser recording. A mobile day check found no horizontal overflow; subsequent preview resizing and screenshot calls timed out, limiting the final mobile visual check.
