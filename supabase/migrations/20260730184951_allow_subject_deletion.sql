alter table public.assignments
  drop constraint assignments_user_id_subject_id_fkey;

alter table public.assignments
  add constraint assignments_user_id_subject_id_fkey
  foreign key (user_id, subject_id)
  references public.subjects (user_id, id)
  on delete set null (subject_id);
