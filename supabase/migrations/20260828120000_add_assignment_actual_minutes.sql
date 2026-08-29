alter table public.assignments
  add column if not exists actual_minutes integer;
