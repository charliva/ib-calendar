-- Additive rollout retains the legacy energy type for older/offline clients.
alter type public.school_task_context add value if not exists 'city';
alter table public.calendar_items add column if not exists energy_usage smallint check (energy_usage between 1 and 5);
update public.calendar_items set energy_usage = case energy_type::text when 'deep_focus' then 5 when 'light_work' then 2 when 'recovery' then 1 when 'transit' then 2 else 3 end where energy_usage is null;
alter table public.classes add column if not exists energy_usage smallint not null default 3 check (energy_usage between 1 and 5);
alter table public.classes add column if not exists location_context text not null default 'school' check (location_context in ('school','home','library','city','anywhere'));
alter table public.calendar_items add column if not exists linked_class_id uuid;
alter table public.calendar_items add constraint calendar_items_linked_class_owner_fk
  foreign key (user_id, linked_class_id) references public.classes(user_id, id) on delete set null (linked_class_id);
alter table public.calendar_items add column if not exists linked_occurrence_date date;
alter table public.class_exceptions add column if not exists replacement_title text;
alter table public.class_exceptions add column if not exists energy_usage smallint check (energy_usage between 1 and 5);
alter table public.class_exceptions add column if not exists location_context text;
