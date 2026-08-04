import {
  durationMinutes,
  makeItem,
  type CalendarItem,
  type CalendarProposal,
} from "./calendar-engine.ts";
import type { Assignment } from "./school.ts";
import {
  energyFitScore,
  energyForTime,
  energyTypeForWorkType,
  protectedSchoolRanges,
  studySlotSuitability,
  type SchoolSchedulingContext,
} from "./school-day-engine.ts";

export type AssignmentProgress = {
  sessions: CalendarItem[];
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
};

export type AssignmentPlan = {
  proposal: CalendarProposal | null;
  scheduledMinutes: number;
  unscheduledMinutes: number;
};

const MINUTE = 60_000;
const DAY = 86_400_000;

export function assignmentProgress(
  assignment: Assignment,
  items: CalendarItem[],
): AssignmentProgress {
  const sessions = items.filter(
    (item) => item.assignmentId === assignment.id && item.status !== "archived",
  );
  const plannedMinutes = sessions
    .filter((item) => item.status === "scheduled" || item.status === "completed")
    .reduce((total, item) => total + durationMinutes(item), 0);
  const completedMinutes = sessions
    .filter((item) => item.status === "completed")
    .reduce((total, item) => total + durationMinutes(item), 0);
  return {
    sessions,
    plannedMinutes,
    completedMinutes,
    remainingMinutes: Math.max(0, assignment.estimatedMinutes - plannedMinutes),
  };
}

export function formatWorkMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function atTime(day: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function isoWeekday(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function roundUp(date: Date, step = 15) {
  return new Date(Math.ceil(date.getTime() / (step * MINUTE)) * step * MINUTE);
}

type Gap = { start: Date; end: Date; cursor: Date };

function availableGaps(
  assignment: Assignment,
  items: CalendarItem[],
  now: Date,
  school?: SchoolSchedulingContext,
): Gap[] {
  if (!assignment.dueAt) return [];
  const energyType = energyTypeForWorkType(assignment.workType);
  const due = new Date(assignment.dueAt);
  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const busy = items
    .filter(
      (item) =>
        item.status === "scheduled" && item.startsAt && item.endsAt,
    )
    .map((item) => ({
      start: new Date(item.startsAt!),
      end: new Date(item.endsAt!),
    }));
  if (school) {
    busy.push(
      ...protectedSchoolRanges(
        school.classes,
        school.classExceptions,
        school.settings,
        now,
        due,
        { energyType },
      ).map((range) => ({ start: range.start, end: range.end })),
    );
  }
  const gaps: Gap[] = [];

  for (
    let timestamp = startDay.getTime();
    timestamp <= dueDay.getTime();
    timestamp += DAY
  ) {
    const day = new Date(timestamp);
    if (!assignment.allowedWeekdays.includes(isoWeekday(day))) continue;
    let windowStart = atTime(day, assignment.allowedWindowStart);
    let windowEnd = atTime(day, assignment.allowedWindowEnd);
    if (windowStart < now) windowStart = roundUp(now);
    if (windowEnd > due) windowEnd = due;
    if (windowEnd <= windowStart) continue;

    const dayBusy = busy
      .filter(({ start, end }) => start < windowEnd && end > windowStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    let cursor = windowStart;
    for (const block of dayBusy) {
      if (block.start > cursor) {
        gaps.push({
          start: new Date(cursor),
          end: new Date(Math.min(block.start.getTime(), windowEnd.getTime())),
          cursor: new Date(cursor),
        });
      }
      if (block.end > cursor) cursor = new Date(block.end);
      if (cursor >= windowEnd) break;
    }
    if (cursor < windowEnd) {
      gaps.push({ start: new Date(cursor), end: windowEnd, cursor: new Date(cursor) });
    }
  }
  return gaps.filter(
    (gap) => gap.end.getTime() - gap.start.getTime() >= 5 * MINUTE,
  );
}

export function planAssignment(
  assignment: Assignment,
  items: CalendarItem[],
  now = new Date(),
  school?: SchoolSchedulingContext,
): AssignmentPlan {
  const progress = assignmentProgress(assignment, items);
  const energyType = energyTypeForWorkType(assignment.workType);
  if (!assignment.dueAt || progress.remainingMinutes === 0) {
    return { proposal: null, scheduledMinutes: 0, unscheduledMinutes: progress.remainingMinutes };
  }

  const gaps = availableGaps(assignment, items, now, school);
  if (school) {
    if (
      assignment.taskContext === "home" ||
      assignment.taskContext === "anywhere"
    ) {
      for (const gap of gaps) {
        const targetTime =
          assignment.requiredEnergy === "low"
            ? school.settings.lowEnergyStart || "19:00"
            : school.settings.preferredStudyStart;
        const [hour, minute] = targetTime
          .split(":")
          .map(Number);
        const preferred = new Date(gap.start);
        preferred.setHours(hour, minute, 0, 0);
        if (
          gap.cursor < preferred &&
          gap.end.getTime() - preferred.getTime() >=
            Math.min(
              assignment.minSessionMinutes,
              progress.remainingMinutes,
            ) *
              MINUTE
        ) {
          gap.cursor = preferred;
        }
      }
    }
    gaps.sort((a, b) => {
      const aEnd = new Date(
        a.cursor.getTime() +
          Math.min(assignment.minSessionMinutes, progress.remainingMinutes) *
            MINUTE,
      );
      const bEnd = new Date(
        b.cursor.getTime() +
          Math.min(assignment.minSessionMinutes, progress.remainingMinutes) *
            MINUTE,
      );
      const aFit = studySlotSuitability(
        a.cursor,
        aEnd,
        {
          taskContext: assignment.taskContext,
          computerRequired: assignment.computerRequired,
          energyType,
        },
        school.classes,
        school.classExceptions,
        school.settings,
      );
      const bFit = studySlotSuitability(
        b.cursor,
        bEnd,
        {
          taskContext: assignment.taskContext,
          computerRequired: assignment.computerRequired,
          energyType,
        },
        school.classes,
        school.classExceptions,
        school.settings,
      );
      if (aFit.suitable !== bFit.suitable) return aFit.suitable ? -1 : 1;
      if (
        (assignment.requiredEnergy ?? "medium") !== "low" &&
        aFit.preferred !== bFit.preferred
      ) {
        return aFit.preferred ? -1 : 1;
      }
      const aEnergy = energyFitScore(
        assignment.requiredEnergy ?? "medium",
        energyForTime(a.cursor, aEnd, school.settings),
      );
      const bEnergy = energyFitScore(
        assignment.requiredEnergy ?? "medium",
        energyForTime(b.cursor, bEnd, school.settings),
      );
      if (aEnergy !== bEnergy) return bEnergy - aEnergy;
      if (aFit.preferred !== bFit.preferred) return aFit.preferred ? -1 : 1;
      return a.cursor.getTime() - b.cursor.getTime();
    });
  }
  const distinctDays = new Set(gaps.map((gap) => gap.start.toDateString())).size;
  let remaining = progress.remainingMinutes;
  const sessions: CalendarItem[] = [];

  for (const gap of gaps) {
    if (remaining <= 0) break;
    const daysLeft = Math.max(1, distinctDays - sessions.length);
    const balanced = Math.ceil(remaining / daysLeft / 15) * 15;
    const desired = assignment.splittable
      ? Math.min(assignment.maxSessionMinutes, Math.max(assignment.minSessionMinutes, balanced))
      : remaining;
    const available = Math.floor((gap.end.getTime() - gap.cursor.getTime()) / MINUTE / 5) * 5;
    const minimum = Math.min(assignment.minSessionMinutes, remaining);
    const length = Math.min(desired, available, remaining);
    if (length < minimum) continue;

    const start = new Date(gap.cursor);
    const end = new Date(start.getTime() + length * MINUTE);
    if (school) {
      const suitability = studySlotSuitability(
        start,
        end,
        {
          taskContext: assignment.taskContext,
          computerRequired: assignment.computerRequired,
          energyType,
        },
        school.classes,
        school.classExceptions,
        school.settings,
      );
      if (!suitability.suitable) continue;
    }
    sessions.push(
      makeItem({
        kind: "task",
        title: `${assignment.title} · work session`,
        description: `Planned work for ${assignment.title}`,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        durationMin: Math.min(assignment.minSessionMinutes, length),
        durationMax: assignment.splittable
          ? Math.max(length, assignment.maxSessionMinutes)
          : length,
        deadline: assignment.dueAt,
        windowStart: gap.start.toISOString(),
        windowEnd: gap.end.toISOString(),
        energyType,
        priority: assignment.priority,
        splittable: false,
        flexibility: assignment.splittable ? "elastic" : "flexible",
        constraints: [
          `Linked to ${assignment.title}`,
          `${assignment.allowedWindowStart}–${assignment.allowedWindowEnd}`,
        ],
        assignmentId: assignment.id,
        taskContext: assignment.taskContext,
        computerRequired: assignment.computerRequired,
        workType: assignment.workType,
        requiredEnergy: assignment.requiredEnergy ?? "medium",
        status: "scheduled",
        source: "command",
      }),
    );
    remaining -= length;
    gap.cursor = end;
  }

  if (!sessions.length) {
    return {
      proposal: null,
      scheduledMinutes: 0,
      unscheduledMinutes: progress.remainingMinutes,
    };
  }
  const scheduledMinutes = progress.remainingMinutes - remaining;
  return {
    scheduledMinutes,
    unscheduledMinutes: remaining,
    proposal: {
      id: crypto.randomUUID(),
      title: `Plan ${assignment.title}`,
      summary:
        remaining > 0
          ? `${formatWorkMinutes(scheduledMinutes)} fits before the deadline; ${formatWorkMinutes(remaining)} still needs a slot.`
          : `${formatWorkMinutes(scheduledMinutes)} split into ${sessions.length} movable work session${sessions.length === 1 ? "" : "s"}. Nothing changes until you apply this preview.`,
      source: "command",
      changes: sessions.map((session) => ({
        id: crypto.randomUUID(),
        type: "create" as const,
        itemId: null,
        reason: "Fits the assignment window, deadline, and current calendar.",
        before: null,
        after: session,
      })),
    },
  };
}
