alter table public.assessments
  add column estimated_revision_minutes integer not null default 240,
  add column allowed_weekdays smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[],
  add column revision_window_start time without time zone not null default '15:00',
  add column revision_window_end time without time zone not null default '21:00',
  add column min_revision_session_minutes integer not null default 25,
  add column max_revision_session_minutes integer not null default 60,
  add column spaced_repetition_enabled boolean not null default false,
  add column review_intervals_days smallint[] not null default array[1, 3, 7, 14]::smallint[];

alter table public.assessments
  add constraint assessments_revision_estimate_valid
    check (estimated_revision_minutes between 0 and 3000),
  add constraint assessments_revision_weekdays_valid
    check (
      cardinality(allowed_weekdays) between 1 and 7
      and allowed_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  add constraint assessments_revision_window_valid
    check (revision_window_end > revision_window_start),
  add constraint assessments_revision_session_minutes_valid
    check (
      min_revision_session_minutes between 5 and 180
      and max_revision_session_minutes between min_revision_session_minutes and 240
    ),
  add constraint assessments_review_intervals_valid
    check (
      cardinality(review_intervals_days) between 1 and 8
      and 0 < all(review_intervals_days)
      and 90 >= all(review_intervals_days)
    );

alter table public.calendar_items
  add column assessment_id uuid,
  add column revision_stage text,
  add column review_offset_days smallint,
  add column learned_at timestamptz,
  add constraint calendar_items_assessment_kind
    check (assessment_id is null or kind = 'task'),
  add constraint calendar_items_revision_stage_length
    check (revision_stage is null or char_length(revision_stage) between 1 and 80),
  add constraint calendar_items_review_offset_valid
    check (review_offset_days is null or review_offset_days between 1 and 90),
  add constraint calendar_items_user_assessment_fkey
    foreign key (user_id, assessment_id)
    references public.assessments (user_id, id) on delete set null (assessment_id);

create index calendar_items_user_assessment_idx
  on public.calendar_items (user_id, assessment_id)
  where assessment_id is not null;

comment on column public.assessments.review_intervals_days is
  'Configurable spaced-repetition intervals used to propose review sessions after material is learned.';
comment on column public.calendar_items.learned_at is
  'When this revision material was marked learned; review proposals remain separate calendar items.';
