create type public.calendar_item_kind as enum ('event', 'task', 'intention');
create type public.calendar_energy_type as enum (
  'deep_focus',
  'light_work',
  'social',
  'movement',
  'recovery',
  'transit'
);
create type public.calendar_priority as enum ('low', 'medium', 'high');
create type public.calendar_flexibility as enum ('fixed', 'flexible', 'elastic');

create table public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind public.calendar_item_kind not null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_min integer not null default 30 check (duration_min between 5 and 720),
  duration_max integer not null default 30 check (duration_max between 5 and 720),
  deadline timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  energy_type public.calendar_energy_type not null default 'light_work',
  priority public.calendar_priority not null default 'medium',
  splittable boolean not null default false,
  flexibility public.calendar_flexibility not null default 'flexible',
  constraints jsonb not null default '[]'::jsonb,
  status text not null default 'inbox'
    check (status in ('inbox', 'scheduled', 'completed', 'archived')),
  source text not null default 'manual'
    check (source in ('manual', 'command', 'document', 'import')),
  source_meta jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_max >= duration_min),
  check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  check (
    (window_start is null and window_end is null)
    or (
      window_start is not null
      and window_end is not null
      and window_end > window_start
    )
  ),
  check (
    status <> 'scheduled'
    or (starts_at is not null and ends_at is not null)
  )
);

create table public.calendar_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  label text not null check (char_length(label) between 1 and 160),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index calendar_items_user_start_idx
  on public.calendar_items (user_id, starts_at)
  where status = 'scheduled';
create index calendar_items_user_deadline_idx
  on public.calendar_items (user_id, deadline)
  where deadline is not null and status not in ('completed', 'archived');
create index calendar_items_user_status_idx
  on public.calendar_items (user_id, status);
create index calendar_history_user_created_idx
  on public.calendar_history (user_id, created_at desc);

create trigger calendar_items_set_updated_at
before update on public.calendar_items
for each row execute function public.set_updated_at();

alter table public.calendar_items enable row level security;
alter table public.calendar_history enable row level security;

revoke all on public.calendar_items, public.calendar_history from anon;
grant select, insert, update, delete on
  public.calendar_items,
  public.calendar_history
to authenticated;
grant usage, select on sequence public.calendar_history_id_seq to authenticated;

create policy "calendar_items_select_own" on public.calendar_items
for select to authenticated
using ((select auth.uid()) = user_id);
create policy "calendar_items_insert_own" on public.calendar_items
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "calendar_items_update_own" on public.calendar_items
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "calendar_items_delete_own" on public.calendar_items
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "calendar_history_select_own" on public.calendar_history
for select to authenticated
using ((select auth.uid()) = user_id);
create policy "calendar_history_insert_own" on public.calendar_history
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "calendar_history_delete_own" on public.calendar_history
for delete to authenticated
using ((select auth.uid()) = user_id);
