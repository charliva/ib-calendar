create table public.learning_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject_id uuid,
  source_type text not null
    check (source_type in ('calendar_item', 'subject', 'assignment', 'assessment', 'intention', 'topic', 'question', 'note')),
  source_id uuid,
  source_title text not null check (char_length(source_title) between 1 and 300),
  challenge_level text not null
    check (challenge_level in ('too_easy', 'good_challenge', 'difficult', 'not_understood')),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete set null (subject_id)
);

create index learning_signals_user_recent_idx
  on public.learning_signals (user_id, created_at desc);
create index learning_signals_user_subject_recent_idx
  on public.learning_signals (user_id, subject_id, created_at desc)
  where subject_id is not null;
create index learning_signals_user_source_idx
  on public.learning_signals (user_id, source_type, source_id, created_at desc)
  where source_id is not null;

alter table public.learning_signals enable row level security;
revoke all on public.learning_signals from public, anon;
grant select, insert, update, delete on public.learning_signals to authenticated;

create policy "learning_signals_select_own" on public.learning_signals
for select to authenticated using ((select auth.uid()) = user_id);
create policy "learning_signals_insert_own" on public.learning_signals
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "learning_signals_update_own" on public.learning_signals
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "learning_signals_delete_own" on public.learning_signals
for delete to authenticated using ((select auth.uid()) = user_id);

create table public.explorations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject_id uuid,
  source_type text not null
    check (source_type in ('calendar_item', 'subject', 'assignment', 'assessment', 'intention', 'topic', 'question', 'note')),
  source_id uuid,
  source_title text not null check (char_length(source_title) between 1 and 300),
  source_context text check (source_context is null or char_length(source_context) <= 4000),
  challenge_level text
    check (challenge_level is null or challenge_level in ('too_easy', 'good_challenge', 'difficult', 'not_understood')),
  framing text not null check (char_length(framing) between 1 and 1000),
  directions jsonb not null check (jsonb_typeof(directions) = 'array'),
  status text not null default 'generated'
    check (status in ('generated', 'saved', 'completed', 'dismissed')),
  prompt_version smallint not null default 1 check (prompt_version between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete set null (subject_id)
);

create index explorations_user_recent_idx
  on public.explorations (user_id, created_at desc);
create index explorations_user_source_recent_idx
  on public.explorations (user_id, source_type, source_id, created_at desc)
  where source_id is not null;
create index explorations_user_saved_idx
  on public.explorations (user_id, updated_at desc)
  where status in ('saved', 'completed');

create trigger explorations_set_updated_at
before update on public.explorations
for each row execute function public.set_updated_at();

alter table public.explorations enable row level security;
revoke all on public.explorations from public, anon;
grant select, insert, update, delete on public.explorations to authenticated;

create policy "explorations_select_own" on public.explorations
for select to authenticated using ((select auth.uid()) = user_id);
create policy "explorations_insert_own" on public.explorations
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "explorations_update_own" on public.explorations
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "explorations_delete_own" on public.explorations
for delete to authenticated using ((select auth.uid()) = user_id);
