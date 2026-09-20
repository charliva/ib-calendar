-- Homework and flexible work now share calendar_items. Preserve every legacy
-- capture by promoting it before the old capture table is removed.
alter table public.calendar_items
  add column if not exists work_item_type text;

alter table public.calendar_items
  drop constraint if exists calendar_items_work_item_type_valid,
  add constraint calendar_items_work_item_type_valid
    check (work_item_type is null or work_item_type in ('task', 'homework', 'review'));

update public.calendar_items
set work_item_type = case
  when homework_capture_id is not null then 'homework'
  when kind = 'task' and title ~* '(^|[-:][[:space:]]*)review session([[:space:]]|$)'
    then 'review'
  when kind = 'task' then 'task'
  else null
end
where work_item_type is null;

update public.calendar_items item
set
  work_item_type = 'homework',
  subject_id = coalesce(item.subject_id, capture.subject_id),
  deadline = coalesce(item.deadline, capture.deadline),
  work_type = coalesce(
    item.work_type,
    case capture.task_type
      when 'reading' then 'reading'
      when 'vocabulary' then 'memorization'
      when 'practice' then 'problem_solving'
      when 'writing' then 'creative_project'
      when 'project' then 'creative_project'
      when 'revision' then 'deep_focus'
      else null
    end
  )
from public.homework_captures capture
where item.user_id = capture.user_id
  and item.id = capture.scheduled_calendar_item_id;

insert into public.calendar_items (
  id,
  user_id,
  kind,
  title,
  description,
  duration_min,
  duration_max,
  deadline,
  energy_type,
  priority,
  splittable,
  flexibility,
  constraints,
  assignment_id,
  subject_id,
  work_type,
  required_energy,
  status,
  source,
  completed_at,
  work_item_type,
  created_at,
  updated_at
)
select
  capture.id,
  capture.user_id,
  'task'::public.calendar_item_kind,
  capture.title,
  capture.raw_text,
  capture.estimated_minutes,
  capture.estimated_minutes,
  capture.deadline,
  case
    when capture.task_type in ('reading', 'vocabulary')
      then 'light_work'::public.calendar_energy_type
    else 'deep_focus'::public.calendar_energy_type
  end,
  'medium'::public.calendar_priority,
  false,
  'flexible'::public.calendar_flexibility,
  '[]'::jsonb,
  capture.converted_assignment_id,
  capture.subject_id,
  case capture.task_type
    when 'reading' then 'reading'
    when 'vocabulary' then 'memorization'
    when 'practice' then 'problem_solving'
    when 'writing' then 'creative_project'
    when 'project' then 'creative_project'
    when 'revision' then 'deep_focus'
    else null
  end,
  case
    when capture.task_type in ('practice', 'writing', 'project') then 'high'
    when capture.task_type in ('reading', 'vocabulary') then 'low'
    else 'medium'
  end,
  case capture.status
    when 'completed' then 'completed'
    when 'converted' then 'archived'
    when 'archived' then 'archived'
    else 'inbox'
  end,
  'manual',
  case when capture.status = 'completed' then capture.updated_at else null end,
  'homework',
  capture.created_at,
  capture.updated_at
from public.homework_captures capture
where not exists (
  select 1
  from public.calendar_items item
  where item.user_id = capture.user_id
    and item.id = capture.scheduled_calendar_item_id
)
on conflict (id) do nothing;

create index if not exists calendar_items_user_work_item_type_idx
  on public.calendar_items (user_id, work_item_type)
  where work_item_type is not null and status not in ('completed', 'archived');

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'homework_captures'
  ) then
    alter publication supabase_realtime drop table public.homework_captures;
  end if;
end
$$;

alter table public.calendar_items
  drop constraint if exists calendar_items_user_homework_capture_fkey,
  drop column if exists homework_capture_id;

drop table if exists public.homework_captures;
