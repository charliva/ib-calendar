alter table public.calendar_items
  add column room text;

alter table public.calendar_items
  add constraint calendar_items_room_length
  check (room is null or char_length(room) <= 80);
