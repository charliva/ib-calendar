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
 * Reads one account's whole calendar in a single round of parallel queries.
 *
 * It is all-or-nothing on purpose: if any table errors, this throws rather
 * than returning a partial snapshot, because applying half a snapshot would
 * silently drop records the caller is about to overwrite local state with.
 *
 * The bounded queries (history, signals, explorations, block choices) are
 * trimmed to what the UI actually shows; older rows stay in the database.
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
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at"),
    supabase
      .from("calendar_history")
      .select("id,label,snapshot,created_at")
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
      .select("*")
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
      .select("*")
      .eq("user_id", userId)
      .gte("starts_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("starts_at", { ascending: false })
      .limit(150),
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
    items: (itemResult.data ?? []).map((row) => rowToItem(row as Row)),
    history: (historyResult.data ?? []).map((entry) => ({
      id: String(entry.id),
      label: entry.label,
      items: Array.isArray(entry.snapshot)
        ? (entry.snapshot as CalendarItem[])
        : [],
      createdAt: entry.created_at,
    })),
    subjects: (subjectResult.data ?? []).map((row) => rowToSubject(row as Row)),
    classes: (classResult.data ?? []).map((row) => rowToClass(row as Row)),
    classExceptions: (exceptionResult.data ?? []).map((row) =>
      rowToClassException(row as Row),
    ),
    assignments: (assignmentResult.data ?? []).map((row) =>
      rowToAssignment(row as Row),
    ),
    assessments: (assessmentResult.data ?? []).map((row) =>
      rowToAssessment(row as Row),
    ),
    intentions: (intentionResult.data ?? []).map((row) =>
      rowToIntention(row as Row),
    ),
    learningSignals: (signalResult.data ?? []).map((row) =>
      rowToLearningSignal(row as Row),
    ),
    explorations: (explorationResult.data ?? []).map((row) =>
      rowToExploration(row as Row),
    ),
    blockChoices: (blockChoiceResult.data ?? []).map((row) =>
      rowToBlockChoice(row as Row),
    ),
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
