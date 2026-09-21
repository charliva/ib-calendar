import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarItem, HistoryEntry } from "@/lib/calendar-engine";
import { rowToItem } from "@/lib/db/queries/calendar";
import {
  rowToAssessment,
  rowToAssignment,
  rowToClass,
  rowToClassException,
  rowToSchoolDaySettings,
  rowToSubject,
  type Assessment,
  type Assignment,
  type ClassException,
  type SchoolClass,
  type SchoolDaySettings,
  type Subject,
} from "@/lib/school";
import { rowToIntention, type Intention } from "@/lib/intentions";
import {
  rowToExploration,
  rowToLearningSignal,
  type Exploration,
  type LearningSignal,
} from "@/lib/study-intelligence";
import { rowToBlockChoice, type BlockChoice } from "@/lib/block-choices";
import {
  rowToAccountPreferences,
  type AccountPreferences,
} from "@/lib/settings/account-preferences";
import {
  ASSIGNMENT_COLUMNS,
  BLOCK_CHOICE_COLUMNS,
  BLOCK_CHOICE_LIMIT,
  BLOCK_CHOICE_WINDOW_DAYS,
  CALENDAR_ITEM_COLUMNS,
  HISTORY_LIST_COLUMNS,
} from "@/lib/calendar/snapshot-columns";

/** Everything one account holds, as the calendar keeps it in memory. */
export type CloudSnapshot = {
  items: CalendarItem[];
  history: HistoryEntry[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  assignments: Assignment[];
  assessments: Assessment[];
  intentions: Intention[];
  learningSignals: LearningSignal[];
  explorations: Exploration[];
  blockChoices: BlockChoice[];
  schoolDaySettings: SchoolDaySettings;
  accountPreferences: AccountPreferences;
  /** Setup progress recorded by whichever device the student used last. */
  onboardingState: unknown;
  /** When the account last saw any device, for the returning-user surface. */
  lastSeenAt: string | null;
};

type Row = Record<string, unknown>;

/**
 * The rows of one result, as the `rowTo…` mappers want them.
 *
 * PostgREST's types only resolve a column list it can read as a string
 * literal; the lists below are assembled from arrays, which widens them to
 * `string`, and the client then types the result as its "could not parse
 * this" placeholder rather than as rows. They are ordinary rows — every
 * mapper validates each field it reads — so this says so once instead of
 * spreading a double cast across a dozen call sites.
 */
function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

/**
 * Reads one account's whole calendar in a single round of parallel queries.
 *
 * It is all-or-nothing on purpose: if any table errors, this throws rather
 * than returning a partial snapshot, because applying half a snapshot would
 * silently drop records the caller is about to overwrite local state with.
 *
 * The bounded queries (history, signals, explorations, block choices) are
 * trimmed to what the UI actually shows; older rows stay in the database.
 *
 * History is the one table read in two steps. Each `calendar_history` row
 * carries a complete copy of the calendar as it stood at that moment, and the
 * history list only ever shows a label and a timestamp — so the fifty labels
 * come down here and the snapshot itself is fetched by `fetchHistoryItems`
 * if and when the student opens one. Fetching them eagerly made this single
 * call megabytes wide, repeated on every sync.
 */
export async function fetchCloudSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<CloudSnapshot> {
  const [
    itemResult,
    historyResult,
    subjectResult,
    classResult,
    exceptionResult,
    assignmentResult,
    assessmentResult,
    intentionResult,
    signalResult,
    explorationResult,
    blockChoiceResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from("calendar_items")
      .select(CALENDAR_ITEM_COLUMNS.join(","))
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("calendar_history")
      .select(HISTORY_LIST_COLUMNS.join(","))
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("subjects").select("*").eq("user_id", userId).order("name"),
    supabase
      .from("classes")
      .select("*")
      .eq("user_id", userId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("class_exceptions")
      .select("*")
      .eq("user_id", userId)
      .order("occurrence_date"),
    supabase
      .from("assignments")
      .select(ASSIGNMENT_COLUMNS.join(","))
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("due_at"),
    supabase
      .from("assessments")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_at"),
    supabase
      .from("intentions")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("learning_signals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("explorations")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("time_block_choices")
      .select(BLOCK_CHOICE_COLUMNS.join(","))
      .eq("user_id", userId)
      .gte(
        "starts_at",
        new Date(
          Date.now() - BLOCK_CHOICE_WINDOW_DAYS * 86_400_000,
        ).toISOString(),
      )
      .order("starts_at", { ascending: false })
      .limit(BLOCK_CHOICE_LIMIT),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);

  const error =
    itemResult.error ??
    historyResult.error ??
    subjectResult.error ??
    classResult.error ??
    exceptionResult.error ??
    assignmentResult.error ??
    assessmentResult.error ??
    intentionResult.error ??
    signalResult.error ??
    explorationResult.error ??
    blockChoiceResult.error ??
    profileResult.error;
  if (error) throw error;

  return {
    items: rows(itemResult.data).map(rowToItem),
    history: rows(historyResult.data).map((entry) => ({
      id: String(entry.id),
      label: String(entry.label),
      // Deliberately empty: the snapshot arrives only if the student opens
      // this entry. See `itemsPending` and `fetchHistoryItems` below.
      items: [],
      itemsPending: true,
      createdAt: String(entry.created_at),
    })),
    subjects: rows(subjectResult.data).map(rowToSubject),
    classes: rows(classResult.data).map(rowToClass),
    classExceptions: rows(exceptionResult.data).map(rowToClassException),
    assignments: rows(assignmentResult.data).map(rowToAssignment),
    assessments: rows(assessmentResult.data).map(rowToAssessment),
    intentions: rows(intentionResult.data).map(rowToIntention),
    learningSignals: rows(signalResult.data).map(rowToLearningSignal),
    explorations: rows(explorationResult.data).map(rowToExploration),
    blockChoices: rows(blockChoiceResult.data).map(rowToBlockChoice),
    schoolDaySettings: rowToSchoolDaySettings(
      profileResult.data as Row | null,
    ),
    accountPreferences: rowToAccountPreferences(
      profileResult.data as Row | null,
    ),
    onboardingState:
      (profileResult.data as Row | null)?.onboarding_state ?? null,
    lastSeenAt:
      typeof (profileResult.data as Row | null)?.last_seen_at === "string"
        ? ((profileResult.data as Row).last_seen_at as string)
        : null,
  };
}

/**
 * The calendar as it stood at one history entry.
 *
 * Read on demand, because it is large and almost never wanted: a student
 * looks at the history list far more often than they restore from it.
 * Returns an empty list for an entry that no longer exists, which restores
 * to "everything was deleted" — the same thing the row itself would say.
 */
export async function fetchHistoryItems(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
): Promise<CalendarItem[]> {
  const { data, error } = await supabase
    .from("calendar_history")
    .select("snapshot")
    .eq("user_id", userId)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  const snapshot = (data as Row | null)?.snapshot;
  return Array.isArray(snapshot) ? (snapshot as CalendarItem[]) : [];
}
