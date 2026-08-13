alter table public.homework_captures
  drop constraint homework_captures_status_check,
  add constraint homework_captures_status_check
    check (
      status in ('captured', 'scheduled', 'converted', 'completed', 'archived')
    );
