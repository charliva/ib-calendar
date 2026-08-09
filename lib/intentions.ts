import { durationMinutes, type CalendarItem, type EnergyRequirement, type Priority, type SchoolWorkType, type TaskContext } from "./calendar-engine.ts";

export type IntentionStatus = "active" | "paused" | "completed" | "archived";
export type IntentionCadence = "daily" | "weekly" | "flexible";

export type Intention = {
  id: string;
  subjectId: string | null;
  title: string;
  notes: string;
  status: IntentionStatus;
  priority: Priority;
  cadence: IntentionCadence;
  targetSessions: number;
  targetMinutes: number;
  preferredSessionMinutes: number;
  horizonStart: string;
  horizonEnd: string | null;
  taskContext: TaskContext;
  workType: SchoolWorkType | null;
  requiredEnergy: EnergyRequirement;
  allowedWeekdays: number[];
  allowedWindowStart: string;
  allowedWindowEnd: string;
  createdAt: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const nullableText = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;
const numeric = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function makeIntention(
  input: Partial<Intention> & Pick<Intention, "title">,
): Intention {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: input.id ?? crypto.randomUUID(),
    subjectId: input.subjectId ?? null,
    title: input.title,
    notes: input.notes ?? "",
    status: input.status ?? "active",
    priority: input.priority ?? "medium",
    cadence: input.cadence ?? "flexible",
    targetSessions: Math.max(1, Math.round(input.targetSessions ?? 1)),
    targetMinutes: Math.max(5, Math.round(input.targetMinutes ?? 60)),
    preferredSessionMinutes: Math.max(
      5,
      Math.min(240, Math.round(input.preferredSessionMinutes ?? 30)),
    ),
    horizonStart: input.horizonStart ?? today,
    horizonEnd: input.horizonEnd ?? null,
    taskContext: input.taskContext ?? "anywhere",
    workType: input.workType ?? null,
    requiredEnergy: input.requiredEnergy ?? "medium",
    allowedWeekdays:
      input.allowedWeekdays?.length ? input.allowedWeekdays : [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: input.allowedWindowStart ?? "15:00",
    allowedWindowEnd: input.allowedWindowEnd ?? "21:00",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function rowToIntention(row: Record<string, unknown>): Intention {
  return makeIntention({
    id: text(row.id),
    subjectId: nullableText(row.subject_id),
    title: text(row.title),
    notes: text(row.notes),
    status: (text(row.status) || "active") as IntentionStatus,
    priority: (text(row.priority) || "medium") as Priority,
    cadence: (text(row.cadence) || "flexible") as IntentionCadence,
    targetSessions: numeric(row.target_sessions, 1),
    targetMinutes: numeric(row.target_minutes, 60),
    preferredSessionMinutes: numeric(row.preferred_session_minutes, 30),
    horizonStart: text(row.horizon_start),
    horizonEnd: nullableText(row.horizon_end),
    taskContext: (text(row.task_context) || "anywhere") as TaskContext,
    workType: nullableText(row.work_type) as SchoolWorkType | null,
    requiredEnergy: (text(row.required_energy) || "medium") as EnergyRequirement,
    allowedWeekdays: Array.isArray(row.allowed_weekdays)
      ? row.allowed_weekdays.map(Number).filter(Number.isInteger)
      : [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: text(row.allowed_window_start).slice(0, 5) || "15:00",
    allowedWindowEnd: text(row.allowed_window_end).slice(0, 5) || "21:00",
    createdAt: text(row.created_at) || new Date().toISOString(),
  });
}

export function intentionToRow(intention: Intention) {
  return {
    id: intention.id,
    subject_id: intention.subjectId,
    title: intention.title,
    notes: intention.notes || null,
    status: intention.status,
    priority: intention.priority,
    cadence: intention.cadence,
    target_sessions: intention.targetSessions,
    target_minutes: intention.targetMinutes,
    preferred_session_minutes: intention.preferredSessionMinutes,
    horizon_start: intention.horizonStart,
    horizon_end: intention.horizonEnd,
    task_context: intention.taskContext,
    work_type: intention.workType,
    required_energy: intention.requiredEnergy,
    allowed_weekdays: intention.allowedWeekdays,
    allowed_window_start: intention.allowedWindowStart,
    allowed_window_end: intention.allowedWindowEnd,
  };
}

export function intentionProgress(
  intention: Intention,
  items: CalendarItem[],
  now = new Date(),
) {
  const periodStart = new Date(now);
  periodStart.setHours(0, 0, 0, 0);
  if (intention.cadence === "weekly") {
    const weekday = periodStart.getDay() === 0 ? 7 : periodStart.getDay();
    periodStart.setDate(periodStart.getDate() - weekday + 1);
  }
  const linked = items.filter(
    (item) =>
      item.intentionId === intention.id &&
      item.status !== "archived" &&
      (!item.startsAt || new Date(item.startsAt) >= periodStart),
  );
  const completed = linked.filter((item) => item.status === "completed");
  return {
    linked,
    completedSessions: completed.length,
    completedMinutes: completed.reduce(
      (total, item) => total + durationMinutes(item),
      0,
    ),
    remainingSessions: Math.max(0, intention.targetSessions - completed.length),
    remainingMinutes: Math.max(
      0,
      intention.targetMinutes -
        completed.reduce((total, item) => total + durationMinutes(item), 0),
    ),
  };
}

