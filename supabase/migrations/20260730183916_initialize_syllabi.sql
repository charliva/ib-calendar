create extension if not exists pg_cron with schema pg_catalog;

create type public.assignment_status as enum (
  'inbox',
  'planned',
  'in_progress',
  'completed',
  'archived'
);

create type public.urgency_level as enum ('low', 'medium', 'high');
create type public.study_block_kind as enum ('homework', 'review', 'practice', 'mock_test');
create type public.reminder_status as enum ('scheduled', 'queued', 'sent', 'failed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Copenhagen',
  school_day_start time not null default '08:00',
  school_day_end time not null default '15:00',
  preferred_focus_minutes integer not null default 30 check (preferred_focus_minutes between 10 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'violet',
  workload_weight numeric(3, 2) not null default 1 check (workload_weight between 0.25 and 3),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  source_text text,
  due_at timestamptz,
  estimated_minutes integer check (estimated_minutes between 5 and 720),
  urgency public.urgency_level,
  status public.assignment_status not null default 'inbox',
  ai_reason text,
  ai_plan jsonb not null default '[]'::jsonb,
  ai_model text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete restrict
);

create table public.study_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  assignment_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  kind public.study_block_kind not null default 'homework',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (user_id, id),
  foreign key (user_id, assignment_id)
    references public.assignments (user_id, id) on delete cascade
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  assignment_id uuid,
  study_block_id uuid,
  remind_at timestamptz not null,
  channel text not null default 'push' check (channel in ('push', 'email', 'in_app')),
  status public.reminder_status not null default 'scheduled',
  delivery_attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assignment_id is not null or study_block_id is not null),
  foreign key (user_id, assignment_id)
    references public.assignments (user_id, id) on delete cascade,
  foreign key (user_id, study_block_id)
    references public.study_blocks (user_id, id) on delete cascade
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index assignments_user_due_idx on public.assignments (user_id, due_at)
  where status not in ('completed', 'archived');
create index study_blocks_user_start_idx on public.study_blocks (user_id, starts_at);
create index reminders_due_idx on public.reminders (remind_at)
  where status = 'scheduled';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger assignments_set_updated_at before update on public.assignments
for each row execute function public.set_updated_at();
create trigger study_blocks_set_updated_at before update on public.study_blocks
for each row execute function public.set_updated_at();
create trigger reminders_set_updated_at before update on public.reminders
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.assignments enable row level security;
alter table public.study_blocks enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on
  public.profiles,
  public.subjects,
  public.assignments,
  public.study_blocks,
  public.reminders,
  public.push_subscriptions
to authenticated;

create policy "profiles_select_own" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
for delete to authenticated using ((select auth.uid()) = id);

create policy "subjects_select_own" on public.subjects
for select to authenticated using ((select auth.uid()) = user_id);
create policy "subjects_insert_own" on public.subjects
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "subjects_update_own" on public.subjects
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "subjects_delete_own" on public.subjects
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "assignments_select_own" on public.assignments
for select to authenticated using ((select auth.uid()) = user_id);
create policy "assignments_insert_own" on public.assignments
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "assignments_update_own" on public.assignments
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "assignments_delete_own" on public.assignments
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "study_blocks_select_own" on public.study_blocks
for select to authenticated using ((select auth.uid()) = user_id);
create policy "study_blocks_insert_own" on public.study_blocks
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "study_blocks_update_own" on public.study_blocks
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "study_blocks_delete_own" on public.study_blocks
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "reminders_select_own" on public.reminders
for select to authenticated using ((select auth.uid()) = user_id);
create policy "reminders_insert_own" on public.reminders
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reminders_update_own" on public.reminders
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "reminders_delete_own" on public.reminders
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "push_subscriptions_select_own" on public.push_subscriptions
for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
for delete to authenticated using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.notification_outbox (
  id bigint generated always as identity primary key,
  reminder_id uuid not null unique references public.reminders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create or replace function private.enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_count integer;
begin
  with due as (
    update public.reminders
    set status = 'queued',
        updated_at = now()
    where status = 'scheduled'
      and remind_at <= now()
    returning id, user_id, assignment_id, study_block_id, channel, remind_at
  ),
  inserted as (
    insert into private.notification_outbox (reminder_id, user_id, payload)
    select
      id,
      user_id,
      jsonb_build_object(
        'reminder_id', id,
        'assignment_id', assignment_id,
        'study_block_id', study_block_id,
        'channel', channel,
        'remind_at', remind_at
      )
    from due
    on conflict (reminder_id) do nothing
    returning 1
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

revoke all on function private.enqueue_due_reminders() from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, update, delete on private.notification_outbox to service_role;
grant execute on function private.enqueue_due_reminders() to service_role;

select cron.schedule(
  'syllabi-queue-due-reminders',
  '* * * * *',
  $$ select private.enqueue_due_reminders(); $$
);
