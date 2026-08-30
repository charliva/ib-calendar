import {
  makeItem,
  type CalendarItem,
  type EnergyType,
  type Flexibility,
  type ItemKind,
  type Priority,
  type TaskContext,
} from "../../calendar-engine.ts";
import { normalizeItemTiming } from "../../calendar/scheduling.ts";
import type { PendingMutation } from "../../offline.ts";

export function rowToItem(row: Record<string, unknown>): CalendarItem {
  return normalizeItemTiming(
    makeItem({
      id: String(row.id),
      kind: row.kind as ItemKind,
      title: String(row.title),
      description: String(row.description ?? ""),
      room: String(row.room ?? ""),
      startsAt: (row.starts_at as string | null) ?? null,
      endsAt: (row.ends_at as string | null) ?? null,
      durationMin: Number(row.duration_min ?? 30),
      durationMax: Number(row.duration_max ?? 30),
      deadline: (row.deadline as string | null) ?? null,
      windowStart: (row.window_start as string | null) ?? null,
      windowEnd: (row.window_end as string | null) ?? null,
      energyType: row.energy_type as EnergyType,
      priority: row.priority as Priority,
      splittable: Boolean(row.splittable),
      flexibility: row.flexibility as Flexibility,
      constraints: Array.isArray(row.constraints)
        ? row.constraints.filter(
            (constraint): constraint is string =>
              typeof constraint === "string",
          )
        : [],
      assignmentId: (row.assignment_id as string | null) ?? null,
      assessmentId: (row.assessment_id as string | null) ?? null,
      intentionId: (row.intention_id as string | null) ?? null,
      subjectId: (row.subject_id as string | null) ?? null,
      revisionStage: (row.revision_stage as string | null) ?? null,
      reviewOffsetDays:
        row.review_offset_days === null || row.review_offset_days === undefined
          ? null
          : Number(row.review_offset_days),
      learnedAt: (row.learned_at as string | null) ?? null,
      homeworkCaptureId: (row.homework_capture_id as string | null) ?? null,
      taskContext: (row.task_context as TaskContext) ?? "anywhere",
      computerRequired: Boolean(row.computer_required),
      workType: (row.work_type as CalendarItem["workType"]) ?? null,
      requiredEnergy:
        (row.required_energy as CalendarItem["requiredEnergy"]) ?? "medium",
      status: row.status as CalendarItem["status"],
      source: row.source as CalendarItem["source"],
      createdAt: String(row.created_at),
      syncStatus: "synced",
    }),
  );
}

export function syncErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const message =
      typeof candidate.message === "string" ? candidate.message : "";
    const hint = typeof candidate.hint === "string" ? candidate.hint : "";
    const details =
      typeof candidate.details === "string" ? candidate.details : "";
    return (
      [message, hint || details].filter(Boolean).join(" ") || "Sync failed"
    );
  }
  return "Sync failed";
}

export function safeMutationPayload(mutation: PendingMutation) {
  if (mutation.table !== "calendar_items" || !mutation.payload) {
    return mutation.payload;
  }
  const payload = { ...mutation.payload };
  const start =
    typeof payload.starts_at === "string" ? new Date(payload.starts_at) : null;
  const end =
    typeof payload.ends_at === "string" ? new Date(payload.ends_at) : null;
  const validStart = start && Number.isFinite(start.getTime());
  const validEnd = end && Number.isFinite(end.getTime());

  if (validStart && (!validEnd || end <= start)) {
    const minutes = Math.max(5, Number(payload.duration_min ?? 30));
    payload.ends_at = new Date(
      start.getTime() + minutes * 60_000,
    ).toISOString();
  } else if (!validStart && validEnd) {
    payload.starts_at = null;
    payload.ends_at = null;
    if (payload.status === "scheduled") payload.status = "inbox";
  } else if (!validStart && !validEnd && payload.status === "scheduled") {
    payload.status = "inbox";
  }

  const windowStart =
    typeof payload.window_start === "string"
      ? new Date(payload.window_start)
      : null;
  const windowEnd =
    typeof payload.window_end === "string"
      ? new Date(payload.window_end)
      : null;
  if (
    (windowStart && !Number.isFinite(windowStart.getTime())) ||
    (windowEnd && !Number.isFinite(windowEnd.getTime())) ||
    Boolean(windowStart) !== Boolean(windowEnd) ||
    (windowStart && windowEnd && windowEnd <= windowStart)
  ) {
    payload.window_start = null;
    payload.window_end = null;
  }
  return payload;
}
