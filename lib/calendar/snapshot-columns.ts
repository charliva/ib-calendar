// What the cloud snapshot asks Supabase for.
//
// Every snapshot is fetched again on every sync, so a column nobody reads is
// not a one-off cost: it is paid on every poll, on every realtime nudge, and
// by every tab that comes back to the foreground. These lists name exactly
// what the `rowTo…` mappers read, which is why they live in their own module
// — `tests/snapshot-columns.test.mjs` watches the mappers and fails if one of
// them starts reading a column that is no longer being fetched.

/**
 * `calendar_items`, as `rowToItem` reads it.
 *
 * Omits `user_id` (the caller already filtered on it), `updated_at`,
 * `completed_at` and `source_meta` — all written by the app, none read back.
 */
export const CALENDAR_ITEM_COLUMNS = [
  "id",
  "kind",
  "title",
  "description",
  "room",
  "starts_at",
  "ends_at",
  "duration_min",
  "duration_max",
  "deadline",
  "window_start",
  "window_end",
  "energy_type",
  "energy_usage",
  "linked_class_id",
  "linked_occurrence_date",
  "priority",
  "splittable",
  "flexibility",
  "constraints",
  "assignment_id",
  "assessment_id",
  "intention_id",
  "subject_id",
  "revision_stage",
  "review_offset_days",
  "learned_at",
  "work_item_type",
  "task_context",
  "computer_required",
  "work_type",
  "required_energy",
  "status",
  "source",
  "created_at",
];

/**
 * `assignments`, as `rowToAssignment` reads it.
 *
 * Omits the planner's own working notes — `source_text`, `ai_reason`,
 * `ai_plan`, `ai_model` — which can run to several kilobytes a row and are
 * never read back into state.
 */
export const ASSIGNMENT_COLUMNS = [
  "id",
  "subject_id",
  "title",
  "due_at",
  "estimated_minutes",
  "urgency",
  "priority",
  "status",
  "submission_method",
  "notes",
  "grade_weight",
  "task_context",
  "computer_required",
  "work_type",
  "required_energy",
  "allowed_weekdays",
  "allowed_window_start",
  "allowed_window_end",
  "min_session_minutes",
  "max_session_minutes",
  "splittable",
  "actual_minutes",
  "created_at",
];

/** `time_block_choices`, as `rowToBlockChoice` reads it. */
export const BLOCK_CHOICE_COLUMNS = [
  "id",
  "block_key",
  "block_type",
  "starts_at",
  "ends_at",
  "context",
  "suggestions",
  "selected_suggestion_id",
  "status",
  "selected_at",
  "created_at",
  "updated_at",
];

/**
 * `calendar_history`, for the list.
 *
 * Emphatically not `snapshot`: each one is a complete copy of the calendar at
 * that moment, and the history list shows only a label and a time. The
 * snapshot is read one row at a time, when a student opens an entry.
 */
export const HISTORY_LIST_COLUMNS = ["id", "label", "created_at"];

/**
 * How far back the block picker's own record is worth reading.
 *
 * `buildBlockChoice` only asks whether the block happening *now* has already
 * been answered, so anything older is fetched and never looked at. Each row
 * carries its suggestions and context as JSON, which made thirty days of them
 * one of the larger reads in the snapshot.
 */
export const BLOCK_CHOICE_WINDOW_DAYS = 14;
export const BLOCK_CHOICE_LIMIT = 80;
