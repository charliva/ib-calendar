-- A lightweight, durable decision for one contextual part of a day. Suggestions
-- remain JSON because they are a cached recommendation snapshot, not tasks or
-- calendar commitments with independent lifecycles.
create table public.time_block_choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  block_key text not null check (char_length(block_key) between 1 and 160),
  block_type text not null
    check (block_type in ('morning', 'travel_to_school', 'school', 'travel_home', 'after_school', 'evening', 'night')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context) = 'object'),
  suggestions jsonb not null
    check (jsonb_typeof(suggestions) = 'array' and jsonb_array_length(suggestions) = 3),
  selected_suggestion_id text,
  status text not null default 'suggested'
    check (status in ('suggested', 'selected', 'started', 'completed', 'skipped')),
  selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, block_key),
  check (ends_at > starts_at),
  check (
    (selected_suggestion_id is null and status = 'suggested')
    or (selected_suggestion_id is not null and status <> 'suggested')
  )
);

create index time_block_choices_user_recent_idx
  on public.time_block_choices (user_id, starts_at desc);

create trigger time_block_choices_set_updated_at
before update on public.time_block_choices
for each row execute function public.set_updated_at();

alter table public.time_block_choices enable row level security;
revoke all on public.time_block_choices from public, anon;
grant select, insert, update, delete on public.time_block_choices to authenticated;

create policy "time_block_choices_select_own" on public.time_block_choices
for select to authenticated using ((select auth.uid()) = user_id);
create policy "time_block_choices_insert_own" on public.time_block_choices
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "time_block_choices_update_own" on public.time_block_choices
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "time_block_choices_delete_own" on public.time_block_choices
for delete to authenticated using ((select auth.uid()) = user_id);
