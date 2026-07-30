-- Cover ownership-scoped foreign keys used by joins and cascades.
create index assignments_user_subject_idx
  on public.assignments (user_id, subject_id);

create index study_blocks_user_assignment_idx
  on public.study_blocks (user_id, assignment_id);

create index reminders_user_assignment_idx
  on public.reminders (user_id, assignment_id);

create index reminders_user_study_block_idx
  on public.reminders (user_id, study_block_id);

create index notification_outbox_user_idx
  on private.notification_outbox (user_id);

-- This event-trigger function is invoked internally by Postgres. Removing RPC
-- access does not affect the event trigger and prevents privilege escalation.
revoke execute on function public.rls_auto_enable()
from public, anon, authenticated;
