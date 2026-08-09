alter table public.profiles
  add column school_location text not null default '',
  add column travel_before_school_minutes integer not null default 30,
  add column travel_home_minutes integer not null default 30,
  add column recovery_after_home_minutes integer not null default 30,
  add column schoolwork_cutoff time without time zone not null default '21:00',
  add column preferred_study_start time without time zone not null default '16:00',
  add column preferred_study_end time without time zone not null default '19:00',
  add column allow_commute_scheduling boolean not null default false,
  add column school_computer_access boolean not null default false,
  add column minimum_free_period_minutes integer not null default 20;

alter table public.profiles
  add constraint profiles_school_location_length
    check (char_length(school_location) <= 240),
  add constraint profiles_school_travel_valid
    check (
      travel_before_school_minutes between 0 and 180
      and travel_home_minutes between 0 and 180
    ),
  add constraint profiles_recovery_valid
    check (recovery_after_home_minutes between 0 and 180),
  add constraint profiles_study_window_valid
    check (preferred_study_end > preferred_study_start),
  add constraint profiles_minimum_free_period_valid
    check (minimum_free_period_minutes between 10 and 180);

comment on column public.profiles.allow_commute_scheduling is
  'Explicit override allowing automatic suggestions inside derived commute windows.';
comment on column public.profiles.school_computer_access is
  'Whether computer-required work is suitable during school free periods.';
