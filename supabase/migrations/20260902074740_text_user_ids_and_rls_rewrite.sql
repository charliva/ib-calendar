-- Switch the application's user-identifier columns from `uuid` (a GoTrue
-- concept) to `text` (the natural shape of a Clerk user id). Drop the
-- foreign keys to `auth.users` since the column types no longer match, and
-- rewrite every RLS policy to compare against `public.clerk_uid()` instead
-- of `auth.uid()`.
--
-- The new RLS pattern is the standard Clerk+Supabase integration: a session
-- JWT issued by the `custom_access_token` hook carries the Clerk user id
-- under both `sub` and `clerk_user_id`, and `public.clerk_uid()` reads it
-- out for policies. No application-level join table is needed.

-- ---------------------------------------------------------------------------
-- 1. Drop the foreign-key constraints that reference `auth.users (id)`.
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
  loop
    execute format(
      'alter table %s drop constraint %I',
      constraint_record.tbl,
      constraint_record.conname
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Convert every user-identifier column from `uuid` to `text`.
--    `using user_id::text` preserves any existing GoTrue-issued uuids so
--    production data is not destroyed; legacy accounts simply do not match
--    a Clerk id after the migration. New rows store the Clerk id verbatim.
-- ---------------------------------------------------------------------------
do $$
declare
  table_record record;
begin
  for table_record in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name in ('user_id', 'id')
      and c.table_name in (
        'profiles', 'subjects', 'assignments', 'study_blocks', 'reminders',
        'push_subscriptions', 'calendar_items', 'calendar_history', 'classes',
        'class_exceptions', 'assessments', 'homework_captures', 'intentions',
        'learning_signals', 'explorations', 'time_block_choices', 'invitations'
      )
      and c.data_type = 'uuid'
  loop
    execute format(
      'alter table public.%I alter column %I type text using %I::text',
      table_record.table_name,
      table_record.column_name,
      table_record.column_name
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Switch the column defaults from `auth.uid()` to `public.clerk_uid()`.
-- ---------------------------------------------------------------------------
do $$
declare
  table_record record;
begin
  for table_record in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'user_id'
      and c.table_name in (
        'subjects', 'assignments', 'study_blocks', 'reminders',
        'push_subscriptions', 'calendar_items', 'calendar_history', 'classes',
        'class_exceptions', 'assessments', 'homework_captures', 'intentions',
        'learning_signals', 'explorations', 'time_block_choices'
      )
  loop
    execute format(
      'alter table public.%I alter column user_id set default public.clerk_uid()',
      table_record.table_name
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Drop every existing RLS policy. We re-create the same logic below with
--    `public.clerk_uid()` substituted in.
-- ---------------------------------------------------------------------------
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Re-create the per-row policies. Each pair of actions (select/insert,
--    update, delete) follows the same shape as the original; the only change
--    is `auth.uid() = X` → `public.clerk_uid() = X`.
-- ---------------------------------------------------------------------------

-- profiles (primary-key row matches the Clerk id)
create policy "profiles_select_own" on public.profiles
for select to authenticated using (public.clerk_uid() = id);
create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check (public.clerk_uid() = id);
create policy "profiles_update_own" on public.profiles
for update to authenticated
using (public.clerk_uid() = id)
with check (public.clerk_uid() = id);
create policy "profiles_delete_own" on public.profiles
for delete to authenticated using (public.clerk_uid() = id);

-- subjects
create policy "subjects_select_own" on public.subjects
for select to authenticated using (public.clerk_uid() = user_id);
create policy "subjects_insert_own" on public.subjects
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "subjects_update_own" on public.subjects
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "subjects_delete_own" on public.subjects
for delete to authenticated using (public.clerk_uid() = user_id);

-- assignments
create policy "assignments_select_own" on public.assignments
for select to authenticated using (public.clerk_uid() = user_id);
create policy "assignments_insert_own" on public.assignments
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "assignments_update_own" on public.assignments
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "assignments_delete_own" on public.assignments
for delete to authenticated using (public.clerk_uid() = user_id);

-- study_blocks
create policy "study_blocks_select_own" on public.study_blocks
for select to authenticated using (public.clerk_uid() = user_id);
create policy "study_blocks_insert_own" on public.study_blocks
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "study_blocks_update_own" on public.study_blocks
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "study_blocks_delete_own" on public.study_blocks
for delete to authenticated using (public.clerk_uid() = user_id);

-- reminders
create policy "reminders_select_own" on public.reminders
for select to authenticated using (public.clerk_uid() = user_id);
create policy "reminders_insert_own" on public.reminders
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "reminders_update_own" on public.reminders
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "reminders_delete_own" on public.reminders
for delete to authenticated using (public.clerk_uid() = user_id);

-- push_subscriptions
create policy "push_subscriptions_select_own" on public.push_subscriptions
for select to authenticated using (public.clerk_uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
for delete to authenticated using (public.clerk_uid() = user_id);

-- calendar_items
create policy "calendar_items_select_own" on public.calendar_items
for select to authenticated using (public.clerk_uid() = user_id);
create policy "calendar_items_insert_own" on public.calendar_items
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "calendar_items_update_own" on public.calendar_items
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "calendar_items_delete_own" on public.calendar_items
for delete to authenticated using (public.clerk_uid() = user_id);

-- calendar_history
create policy "calendar_history_select_own" on public.calendar_history
for select to authenticated using (public.clerk_uid() = user_id);
create policy "calendar_history_insert_own" on public.calendar_history
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "calendar_history_delete_own" on public.calendar_history
for delete to authenticated using (public.clerk_uid() = user_id);

-- classes
create policy "classes_select_own" on public.classes
for select to authenticated using (public.clerk_uid() = user_id);
create policy "classes_insert_own" on public.classes
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "classes_update_own" on public.classes
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "classes_delete_own" on public.classes
for delete to authenticated using (public.clerk_uid() = user_id);

-- class_exceptions
create policy "class_exceptions_select_own" on public.class_exceptions
for select to authenticated using (public.clerk_uid() = user_id);
create policy "class_exceptions_insert_own" on public.class_exceptions
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "class_exceptions_update_own" on public.class_exceptions
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "class_exceptions_delete_own" on public.class_exceptions
for delete to authenticated using (public.clerk_uid() = user_id);

-- assessments
create policy "assessments_select_own" on public.assessments
for select to authenticated using (public.clerk_uid() = user_id);
create policy "assessments_insert_own" on public.assessments
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "assessments_update_own" on public.assessments
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "assessments_delete_own" on public.assessments
for delete to authenticated using (public.clerk_uid() = user_id);

-- homework_captures
create policy "homework_captures_select_own" on public.homework_captures
for select to authenticated using (public.clerk_uid() = user_id);
create policy "homework_captures_insert_own" on public.homework_captures
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "homework_captures_update_own" on public.homework_captures
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "homework_captures_delete_own" on public.homework_captures
for delete to authenticated using (public.clerk_uid() = user_id);

-- intentions
create policy "intentions_select_own" on public.intentions
for select to authenticated using (public.clerk_uid() = user_id);
create policy "intentions_insert_own" on public.intentions
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "intentions_update_own" on public.intentions
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "intentions_delete_own" on public.intentions
for delete to authenticated using (public.clerk_uid() = user_id);

-- learning_signals
create policy "learning_signals_select_own" on public.learning_signals
for select to authenticated using (public.clerk_uid() = user_id);
create policy "learning_signals_insert_own" on public.learning_signals
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "learning_signals_update_own" on public.learning_signals
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "learning_signals_delete_own" on public.learning_signals
for delete to authenticated using (public.clerk_uid() = user_id);

-- explorations
create policy "explorations_select_own" on public.explorations
for select to authenticated using (public.clerk_uid() = user_id);
create policy "explorations_insert_own" on public.explorations
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "explorations_update_own" on public.explorations
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "explorations_delete_own" on public.explorations
for delete to authenticated using (public.clerk_uid() = user_id);

-- time_block_choices
create policy "time_block_choices_select_own" on public.time_block_choices
for select to authenticated using (public.clerk_uid() = user_id);
create policy "time_block_choices_insert_own" on public.time_block_choices
for insert to authenticated with check (public.clerk_uid() = user_id);
create policy "time_block_choices_update_own" on public.time_block_choices
for update to authenticated
using (public.clerk_uid() = user_id)
with check (public.clerk_uid() = user_id);
create policy "time_block_choices_delete_own" on public.time_block_choices
for delete to authenticated using (public.clerk_uid() = user_id);

-- invitations: an invitation row is visible to the creator (created_by) or
-- the invitee (claimed_by, set when they accept).
create policy "invitations_select_created_or_claimed" on public.invitations
for select to authenticated using (
  public.clerk_uid() = created_by
  or public.clerk_uid() = claimed_by
);

-- ---------------------------------------------------------------------------
-- 6. Rebuild the supporting index for the invitations table on the new
--    text-typed `created_by` column.
-- ---------------------------------------------------------------------------
drop index if exists public.invitations_created_by_recent_idx;
create index invitations_created_by_recent_idx
  on public.invitations (created_by, created_at desc);
