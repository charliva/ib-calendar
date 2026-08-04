alter table public.assignments
  add column work_type text,
  add column required_energy text not null default 'medium',
  add constraint assignments_work_type_valid
    check (
      work_type is null
      or work_type in (
        'deep_focus',
        'light_work',
        'reading',
        'memorization',
        'problem_solving',
        'creative_project'
      )
    ),
  add constraint assignments_required_energy_valid
    check (required_energy in ('low', 'medium', 'high'));

alter table public.calendar_items
  add column work_type text,
  add column required_energy text not null default 'medium',
  add constraint calendar_items_work_type_valid
    check (
      work_type is null
      or work_type in (
        'deep_focus',
        'light_work',
        'reading',
        'memorization',
        'problem_solving',
        'creative_project'
      )
    ),
  add constraint calendar_items_required_energy_valid
    check (required_energy in ('low', 'medium', 'high'));

alter table public.profiles
  add column low_energy_start time without time zone not null default '19:00',
  add column low_energy_end time without time zone not null default '21:00',
  add column focus_templates jsonb not null default
    '{
      "deep_focus":{"durationMin":45,"durationMax":60},
      "light_work":{"durationMin":25,"durationMax":25},
      "reading":{"durationMin":25,"durationMax":25},
      "memorization":{"durationMin":20,"durationMax":20,"reviewAfterDays":[1,3]},
      "problem_solving":{"durationMin":45,"durationMax":45},
      "creative_project":{"durationMin":50,"durationMax":50}
    }'::jsonb,
  add constraint profiles_low_energy_window_valid
    check (low_energy_end > low_energy_start),
  add constraint profiles_focus_templates_object
    check (jsonb_typeof(focus_templates) = 'object');

comment on column public.assignments.work_type is
  'Optional cognitive work type used by deterministic scheduling and recommendations.';
comment on column public.assignments.required_energy is
  'Minimum preferred cognitive energy for this task; low-energy slots remain possible but rank lower.';
comment on column public.profiles.focus_templates is
  'User-customizable focus-session duration templates keyed by work type.';
