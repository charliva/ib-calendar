-- Batch 1: school-native data.
-- Assignments remain independent from calendar placements. A calendar task may
-- reference an assignment, but its scheduled start/end never replace due_at.

alter type public.assignment_status
  add value if not exists 'submitted' before 'completed';

create type public.school_week_pattern as enum ('every', 'a', 'b');
create type public.lesson_exception_status as enum ('cancelled', 'rescheduled');
create type public.school_task_context as enum (
  'school',
  'home',
  'library',
  'anywhere'
);

alter table public.subjects
  add column short_name text,
  add column teacher text,
  add column room text,
  add column icon text,
  add column updated_at timestamptz not null default now();

update public.subjects
set short_name = upper(left(regexp_replace(name, '[^[:alnum:]]', '', 'g'), 8))
where short_name is null;

alter table public.subjects
  alter column short_name set not null,
  add constraint subjects_short_name_length
    check (char_length(short_name) between 1 and 12),
  add constraint subjects_teacher_length
    check (teacher is null or char_length(teacher) <= 120),
  add constraint subjects_room_length
    check (room is null or char_length(room) <= 80),
  add constraint subjects_icon_length
    check (icon is null or char_length(icon) <= 16);

create trigger subjects_set_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  week_pattern public.school_week_pattern not null default 'every',
  teacher text,
  room text,
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (end_time > start_time),
  check (valid_until is null or valid_until >= valid_from),
  check (teacher is null or char_length(teacher) <= 120),
  check (room is null or char_length(room) <= 80),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete cascade
);

create table public.class_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  class_id uuid not null,
  occurrence_date date not null,
  status public.lesson_exception_status not null,
  replacement_date date,
  replacement_start_time time,
  replacement_end_time time,
  replacement_room text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, class_id, occurrence_date),
  check (
    status = 'cancelled'
    or (
      replacement_date is not null
      and replacement_start_time is not null
      and replacement_end_time is not null
      and replacement_end_time > replacement_start_time
    )
  ),
  check (replacement_room is null or char_length(replacement_room) <= 80),
  foreign key (user_id, class_id)
    references public.classes (user_id, id) on delete cascade
);

alter table public.assignments
  add column priority public.calendar_priority not null default 'medium',
  add column submission_method text,
  add column notes text,
  add column grade_weight numeric(5, 2),
  add column task_context public.school_task_context not null default 'anywhere',
  add column computer_required boolean not null default false,
  add constraint assignments_submission_method_length
    check (
      submission_method is null
      or char_length(submission_method) <= 160
    ),
  add constraint assignments_grade_weight_range
    check (grade_weight is null or grade_weight between 0 and 100);

update public.assignments
set priority = coalesce(urgency::text::public.calendar_priority, 'medium')
where urgency is not null;

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  subject_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  scheduled_at timestamptz not null,
  ends_at timestamptz,
  assessment_type text not null
    check (char_length(assessment_type) between 1 and 80),
  importance public.calendar_priority not null default 'medium',
  weight numeric(5, 2),
  notes text,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (ends_at is null or ends_at > scheduled_at),
  check (weight is null or weight between 0 and 100),
  foreign key (user_id, subject_id)
    references public.subjects (user_id, id) on delete set null (subject_id)
);

-- Calendar tasks can be work sessions for an assignment, but remain separate
-- mutable placements. due_at continues to live only on assignments.
alter table public.calendar_items
  add column assignment_id uuid,
  add column task_context public.school_task_context not null default 'anywhere',
  add column computer_required boolean not null default false,
  add constraint calendar_items_user_id_id_key unique (user_id, id),
  add constraint calendar_items_assignment_kind
    check (assignment_id is null or kind = 'task'),
  add constraint calendar_items_user_assignment_fkey
    foreign key (user_id, assignment_id)
    references public.assignments (user_id, id) on delete set null (assignment_id);

create index classes_user_subject_idx
  on public.classes (user_id, subject_id);
create index classes_user_timetable_idx
  on public.classes (user_id, weekday, start_time);
create index class_exceptions_user_class_idx
  on public.class_exceptions (user_id, class_id);
create index class_exceptions_user_date_idx
  on public.class_exceptions (user_id, occurrence_date);
create index assessments_user_subject_idx
  on public.assessments (user_id, subject_id);
create index assessments_user_scheduled_idx
  on public.assessments (user_id, scheduled_at)
  where status = 'upcoming';
create index calendar_items_user_assignment_idx
  on public.calendar_items (user_id, assignment_id)
  where assignment_id is not null;

create trigger classes_set_updated_at
before update on public.classes
for each row execute function public.set_updated_at();
create trigger class_exceptions_set_updated_at
before update on public.class_exceptions
for each row execute function public.set_updated_at();
create trigger assessments_set_updated_at
before update on public.assessments
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;
alter table public.class_exceptions enable row level security;
alter table public.assessments enable row level security;

revoke all on
  public.classes,
  public.class_exceptions,
  public.assessments
from public, anon;

grant select, insert, update, delete on
  public.classes,
  public.class_exceptions,
  public.assessments
to authenticated;

create policy "classes_select_own" on public.classes
for select to authenticated using ((select auth.uid()) = user_id);
create policy "classes_insert_own" on public.classes
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "classes_update_own" on public.classes
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "classes_delete_own" on public.classes
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "class_exceptions_select_own" on public.class_exceptions
for select to authenticated using ((select auth.uid()) = user_id);
create policy "class_exceptions_insert_own" on public.class_exceptions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "class_exceptions_update_own" on public.class_exceptions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "class_exceptions_delete_own" on public.class_exceptions
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "assessments_select_own" on public.assessments
for select to authenticated using ((select auth.uid()) = user_id);
create policy "assessments_insert_own" on public.assessments
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "assessments_update_own" on public.assessments
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "assessments_delete_own" on public.assessments
for delete to authenticated using ((select auth.uid()) = user_id);
