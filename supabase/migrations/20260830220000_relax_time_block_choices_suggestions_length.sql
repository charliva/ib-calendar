-- Relax the time_block_choices.suggestions length check.
--
-- The original migration (20260809151911_add_time_block_choices.sql) required
-- suggestions to be an array of exactly 3 elements, which matched the
-- pre-PR1 picker that always emitted 3 paths per block.
--
-- PR1 (commit c9ee1f9) changed the picker to emit 1 or 2 paths per block
-- to reduce cognitive load. The chokepoint at lib/block-suggestion-safety.ts
-- may drop suggestions, so the picker may legitimately produce fewer than 3.
-- This migration relaxes the constraint to allow 1 to 3 elements, which
-- keeps the picker honest end-to-end: legacy 3-element rows are still
-- accepted, new 1-or-2-element rows are accepted, and the cap is the same.
--
-- The deserializer at lib/block-choices.ts (rowToBlockChoice) still slices
-- to a maximum of 3 as a defensive cap, so this change is forward- and
-- backward-compatible.

alter table public.time_block_choices
  drop constraint time_block_choices_suggestions_check;

alter table public.time_block_choices
  add constraint time_block_choices_suggestions_length_check
    check (
      jsonb_typeof(suggestions) = 'array'
      and jsonb_array_length(suggestions) between 1 and 3
    );
