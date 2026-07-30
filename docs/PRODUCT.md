# Syllabi product brainstorm

## Product promise

“Write the homework once; Syllabi turns it into a plan you can actually finish.”

The best interaction model is **capture first, plan second**. A student should
be able to type “Physics test next Thursday” in a few seconds. The system can
ask one small follow-up only when a missing detail materially changes the plan.

## MVP — make this excellent first

### 1. Frictionless homework inbox

- One input with keyboard and voice capture.
- Natural-language dates: “Friday”, “in two weeks”, “before class”.
- Subject suggestion based on title and recent work.
- An Inbox for incomplete captures instead of blocking save.
- Undo and a small “AI understood this as…” confirmation.

### 2. Explainable AI scheduling

The AI SDK route should return structured output, not prose. Every suggestion
contains urgency, estimated effort, a proposed start, study steps, and a short
reason.

Urgency should consider:

- time until due;
- estimated effort versus free time;
- subject difficulty and the student’s confidence;
- test versus ordinary homework;
- prerequisite work;
- overdue work and recent reschedules;
- sleep, school hours, quiet hours, and existing events.

The calendar must show the reason and allow **accept, edit, or move**. Each
override is useful feedback: “Charlie tends to study Physics after 16:00.”

### 3. Tests as plans, not single events

- Create a Test with date, subject, topics, confidence, and target grade.
- Work backward into short sessions: recall, practice, mixed practice, mock,
  and final review.
- Use spaced repetition rather than placing every session near the test.
- After each session, ask one tap: “Too easy / right level / too hard.”
- Automatically re-plan missed sessions without creating an impossible day.

### 4. Trustworthy reminders

- In-app and Web Push first; email as an optional fallback.
- “Start in 10 minutes”, due-soon, and missed-block reminders.
- Quiet hours, per-subject controls, and a daily reminder cap.
- Escalate only when genuinely urgent; avoid notification fatigue.
- Show reminder history and why a reminder was sent.

Supabase Auth JWTs identify users and RLS protects their rows. A pg_cron job
queues due reminders every minute. Delivery should happen in an Edge Function
using a separate server credential stored in Vault—not a user JWT or a secret
shipped to the browser.

### 5. Cross-device and offline

- Supabase is the source of truth.
- IndexedDB stores the local calendar and a pending-mutation outbox.
- New homework, edits, and completion work without a connection.
- Sync automatically on reconnect and show Pending / Synced / Needs attention.
- Resolve ordinary conflicts by `updated_at`; ask the user only when both
  devices changed the same important field.
- Cache the app shell and the next few weeks, not the student’s entire history.

### 6. Mobile behavior

- Capture reachable with one thumb from every screen.
- Agenda view is the default on phones; week view can swipe horizontally.
- Touch targets are at least 44px.
- Installable PWA with clear offline and sync status.
- Respect safe areas, reduced motion, and system text sizing.

## Strong follow-up features

1. **Workload radar** — flag overloaded days before the student accepts a plan.
2. **Energy-aware planning** — hard subjects during high-energy windows.
3. **Catch-up mode** — find the smallest realistic plan after missed work.
4. **Focus mode** — one task, timer, materials checklist, and distraction notes.
5. **Teacher/LMS import** — import assignments, but keep the quick inbox.
6. **Parent/mentor sharing** — opt-in read-only summaries, never surveillance.
7. **Weekly review** — planned versus actual effort and one suggested adjustment.
8. **Calendar interoperability** — read busy time and publish study blocks.

## Explicit non-goals for the first release

- A full school information system.
- Autonomous submission of homework.
- Silent calendar changes without user confirmation.
- Grade predictions that look more certain than the available data.
- Social feeds, streak pressure, or punitive missed-task UX.

## Recommended build order

1. Supabase Auth, RLS, subjects, and assignment sync.
2. Offline outbox and conflict-safe reconnect.
3. AI schedule endpoint fed with real free/busy windows.
4. Test plans and re-planning.
5. Web Push subscription plus Edge Function delivery.
6. Calendar import and learning from user overrides.

## Success metrics

- Median capture time under 10 seconds.
- At least 70% of suggested blocks accepted without large edits.
- Fewer overdue tasks week over week.
- Reminder dismissals decrease without completion decreasing.
- Offline changes sync without data loss.
