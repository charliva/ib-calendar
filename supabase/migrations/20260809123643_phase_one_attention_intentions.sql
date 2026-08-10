-- Phase 1: intentions are durable goals. Calendar items are only commitments
-- or proposed opportunities linked back to an intention.

create table public.intentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  priority public.calendar_priority not null default 'medium',
  cadence text not null default 'flexible'
    check (cadence in ('daily', 'weekly', 'flexible')),
  target_sessions integer not null default 1
    check (target_sessions between 1 and 30),
  target_minutes integer not null default 60
    check (target_minutes between 5 and 10080),
  preferred_session_minutes integer not null default 30
    check (preferred_session_minutes between 5 and 240),
  horizon_start date not null default current_date,
  horizon_end date,
  task_context public.school_task_context not null default 'anywhere',
  work_type text,
  required_energy text not null default 'medium',
  allowed_weekdays smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[],
  allowed_window_start time without time zone not null default '15:00',
  allowed_window_end time without time zone not null default '21:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (horizon_end is null or horizon_end >= horizon_start),
  check (
    work_type is null
    or work_type in (
      'deep_focus',
      'light_work',
      'reading',
      'memorization',
      'problem_solving',
      'creative_project'
    )
  ),
  check (required_energy in ('low', 'medium', 'high')),
  check (
    cardinality(allowed_weekdays) between 1 and 7
    and allowed_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  check (allowed_window_end > allowed_window_start),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete set null (subject_id)
);

create index intentions_user_active_idx
  on public.intentions (user_id, priority desc, created_at)
  where status = 'active';
create index intentions_user_subject_idx
  on public.intentions (user_id, subject_id)
  where subject_id is not null;

create trigger intentions_set_updated_at
before update on public.intentions
for each row execute function public.set_updated_at();

alter table public.intentions enable row level security;
revoke all on public.intentions from public, anon;
grant select, insert, update, delete on public.intentions to authenticated;

create policy "intentions_select_own" on public.intentions
for select to authenticated using ((select auth.uid()) = user_id);
create policy "intentions_insert_own" on public.intentions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "intentions_update_own" on public.intentions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "intentions_delete_own" on public.intentions
for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.calendar_items
  add column intention_id uuid,
  add column subject_id uuid,
  add constraint calendar_items_intention_kind
    check (intention_id is null or kind = 'task'),
  add constraint calendar_items_user_intention_fkey
    foreign key (user_id, intention_id)
    references public.intentions (user_id, id) on delete set null (intention_id),
  add constraint calendar_items_user_subject_fkey
    foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete set null (subject_id);

create index calendar_items_user_intention_idx
  on public.calendar_items (user_id, intention_id)
  where intention_id is not null;
create index calendar_items_user_subject_idx
  on public.calendar_items (user_id, subject_id)
  where subject_id is not null;

-- Preserve existing intention-shaped calendar rows as legacy possibility
-- ranges while giving each one a durable intention identity. New scheduling
-- creates linked task rows instead of duplicating the intention itself.
insert into public.intentions (
  id,
  user_id,
  title,
  notes,
  status,
  priority,
  cadence,
  target_sessions,
  target_minutes,
  preferred_session_minutes,
  horizon_start,
  horizon_end,
  task_context,
  work_type,
  required_energy,
  created_at,
  updated_at
)
select
  item.id,
  item.user_id,
  item.title,
  item.description,
  case
    when item.status = 'completed' then 'completed'
    when item.status = 'archived' then 'archived'
    else 'active'
  end,
  item.priority,
  'flexible',
  1,
  greatest(5, item.duration_min),
  least(240, greatest(5, item.duration_min)),
  coalesce(item.window_start::date, item.starts_at::date, item.created_at::date),
  coalesce(item.deadline::date, item.window_end::date),
  item.task_context,
  item.work_type,
  item.required_energy,
  item.created_at,
  item.updated_at
from public.calendar_items item
where item.kind = 'intention'
on conflict (id) do nothing;

-- The legacy rows keep kind=intention, so they cannot use intention_id under
-- the new task-only link constraint. Their matching intention uses the same id
-- and can be reconciled by the application without changing the old row.
