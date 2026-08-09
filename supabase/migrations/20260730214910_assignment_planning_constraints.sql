alter table public.assignments
  add column allowed_weekdays smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[],
  add column allowed_window_start time without time zone not null default '15:00',
  add column allowed_window_end time without time zone not null default '21:00',
  add column min_session_minutes integer not null default 30,
  add column max_session_minutes integer not null default 90,
  add column splittable boolean not null default true;

alter table public.assignments
  add constraint assignments_allowed_weekdays_valid
    check (
      cardinality(allowed_weekdays) between 1 and 7
      and allowed_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  add constraint assignments_allowed_window_valid
    check (allowed_window_end > allowed_window_start),
  add constraint assignments_session_minutes_valid
    check (
      min_session_minutes between 5 and 240
      and max_session_minutes between min_session_minutes and 360
    );

comment on column public.assignments.allowed_weekdays is
  'ISO weekdays (Monday=1 through Sunday=7) on which automatic work-session suggestions are allowed.';
comment on column public.assignments.allowed_window_start is
  'Local-time start of the daily window used for deterministic session suggestions.';
comment on column public.assignments.allowed_window_end is
  'Local-time end of the daily window used for deterministic session suggestions.';
