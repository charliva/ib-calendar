-- Onboarding, re-engagement, and a school-controlled fortnight anchor.
--
-- Three additions to `profiles`, which already doubles as this app's
-- preferences row:
--
--   * `week_pattern_anchor` — schools, not software, decide which week runs the
--     A timetable. The cycle used to be derived from a hardcoded 2020 epoch, so
--     any school out of phase with it saw every fortnightly lesson land on the
--     wrong week with no way to correct it.
--   * `last_seen_at` — nothing recorded when a student last used the app, so a
--     "you have been away" surface had nothing to read. It is backfilled below
--     rather than left null, so re-engagement works on the day it ships instead
--     of three weeks later.
--   * `onboarding_state` — which setup steps a student has finished, mirrored
--     from the device so that completing setup on a laptop does not re-run the
--     tour on a phone.

alter table public.profiles
  add column if not exists week_pattern_anchor date not null default '2020-01-06',
  add column if not exists last_seen_at timestamptz,
  add column if not exists onboarding_state jsonb not null default '{}'::jsonb;

-- Seed last_seen_at from the best evidence already on record. calendar_history
-- gains a row on every undoable action and is indexed (user_id, created_at desc),
-- so this is a cheap read and a far better proxy for "last used" than
-- profiles.updated_at, which only moves when school-day rules are saved.
update public.profiles as p
set last_seen_at = greatest(
  coalesce(activity.last_action, p.updated_at),
  p.updated_at
)
from (
  select user_id, max(created_at) as last_action
  from public.calendar_history
  group by user_id
) as activity
where activity.user_id = p.id
  and p.last_seen_at is null;

-- Students who have a profile but no history at all still get a defensible
-- starting point rather than looking permanently absent.
update public.profiles
set last_seen_at = updated_at
where last_seen_at is null;

create index if not exists profiles_last_seen_at_idx
  on public.profiles (last_seen_at desc);
