-- All user-owned application state uses one Realtime publication so every
-- signed-in device can invalidate its local snapshot after a committed change.
do $$
declare
  relation_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach relation_name in array array[
    'profiles',
    'subjects',
    'assignments',
    'classes',
    'class_exceptions',
    'assessments',
    'homework_captures',
    'calendar_items',
    'calendar_history',
    'intentions',
    'learning_signals',
    'explorations',
    'time_block_choices'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        relation_name
      );
    end if;
  end loop;
end
$$;
