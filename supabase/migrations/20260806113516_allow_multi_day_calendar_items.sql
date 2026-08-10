alter table public.calendar_items
  drop constraint if exists calendar_items_duration_min_check,
  drop constraint if exists calendar_items_duration_max_check;

alter table public.calendar_items
  add constraint calendar_items_duration_min_check
    check (duration_min between 5 and 525600),
  add constraint calendar_items_duration_max_check
    check (duration_max between 5 and 525600);;
