-- Batch 2: a low-friction capture layer.
-- A capture can link to a calendar work block and/or an assignment, but is
-- never itself either of those objects.

create table public.homework_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  raw_text text not null check (char_length(raw_text) between 1 and 600),
  title text not null check (char_length(title) between 1 and 300),
  subject_id uuid,
  deadline timestamptz,
  task_type text not null default 'other'
    check (
      task_type in (
        'reading',
        'writing',
        'practice',
        'revision',
        'vocabulary',
        'project',
        'other'
      )
    ),
  estimated_minutes integer not null default 30
    check (estimated_minutes between 5 and 720),
  status text not null default 'captured'
    check (status in ('captured', 'scheduled', 'converted', 'archived')),
  converted_assignment_id uuid,
  scheduled_calendar_item_id uuid,
  parsed_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, converted_assignment_id),
  unique (user_id, scheduled_calendar_item_id),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete set null (subject_id),
  foreign key (user_id, converted_assignment_id)
    references public.assignments (user_id, id)
    on delete set null (converted_assignment_id),
  foreign key (user_id, scheduled_calendar_item_id)
    references public.calendar_items (user_id, id)
    on delete set null (scheduled_calendar_item_id)
);

alter table public.calendar_items
  add column homework_capture_id uuid,
  add constraint calendar_items_user_homework_capture_fkey
    foreign key (user_id, homework_capture_id)
    references public.homework_captures (user_id, id)
    on delete set null (homework_capture_id);

create index homework_captures_user_active_idx
  on public.homework_captures (user_id, created_at desc)
  where status in ('captured', 'scheduled');
create index homework_captures_user_subject_idx
  on public.homework_captures (user_id, subject_id);
create index homework_captures_user_deadline_idx
  on public.homework_captures (user_id, deadline)
  where deadline is not null and status in ('captured', 'scheduled');
create index homework_captures_user_assignment_idx
  on public.homework_captures (user_id, converted_assignment_id)
  where converted_assignment_id is not null;
create index homework_captures_user_calendar_item_idx
  on public.homework_captures (user_id, scheduled_calendar_item_id)
  where scheduled_calendar_item_id is not null;
create index calendar_items_user_homework_capture_idx
  on public.calendar_items (user_id, homework_capture_id)
  where homework_capture_id is not null;

create trigger homework_captures_set_updated_at
before update on public.homework_captures
for each row execute function public.set_updated_at();

alter table public.homework_captures enable row level security;

revoke all on public.homework_captures from public, anon;
grant select, insert, update, delete on public.homework_captures
to authenticated;

create policy "homework_captures_select_own" on public.homework_captures
for select to authenticated
using ((select auth.uid()) = user_id);
create policy "homework_captures_insert_own" on public.homework_captures
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "homework_captures_update_own" on public.homework_captures
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "homework_captures_delete_own" on public.homework_captures
for delete to authenticated
using ((select auth.uid()) = user_id);
