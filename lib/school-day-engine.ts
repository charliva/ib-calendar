import {
  dateKey,
  startOfWeek,
  TIMETABLE_IMPORT_MARKER,
  type CalendarItem,
  type EnergyRequirement,
  type EnergyType,
  type SchoolWorkType,
  type TaskContext,
} from "./calendar-engine.ts";
import type {
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
} from "./school.ts";
import { classRunsInWeek } from "./school/week-pattern.ts";

const MINUTE = 60_000;
const DAY = 86_400_000;
// A nominal half-hour between lessons is a changeover, not time a student can
// realistically commit to work. Keep enough room to leave, reset, and arrive.
export const MINIMUM_ACTIONABLE_FREE_PERIOD_MINUTES = 45;

export type TimeRange = {
  start: Date;
  end: Date;
  kind: "lesson" | "commute" | "recovery" | "free_period";
};

export type FreePeriod = TimeRange & {
  kind: "free_period";
  durationMinutes: number;
};

export type StudySlotSuitability = {
  suitable: boolean;
  context: "school" | "home" | "commute";
  preferred: boolean;
  reason: string;
};

export type SchoolSchedulingContext = {
  classes: SchoolClass[];
  classExceptions: ClassException[];
  settings: SchoolDaySettings;
  calendarItems?: CalendarItem[];
};

export function energyForTime(
  start: Date,
  end: Date,
  settings: SchoolDaySettings,
): EnergyRequirement {
  const preferredStart = atTime(start, settings.preferredStudyStart);
  const preferredEnd = atTime(start, settings.preferredStudyEnd);
  if (start >= preferredStart && end <= preferredEnd) return "high";
  const lowStart = atTime(start, settings.lowEnergyStart || "19:00");
  const lowEnd = atTime(start, settings.lowEnergyEnd || "21:00");
  if (start >= lowStart && end <= lowEnd) return "low";
  return "medium";
}

export function energyFitScore(
  required: EnergyRequirement,
  available: EnergyRequirement,
) {
  if (required === "high") {
    return available === "high" ? 4 : available === "medium" ? 2 : 0;
  }
  if (required === "medium") {
    return available === "medium" ? 4 : available === "high" ? 3 : 1;
  }
  return available === "low" ? 4 : available === "medium" ? 3 : 2;
}

export function energyTypeForWorkType(
  workType: SchoolWorkType | null,
): EnergyType {
  return workType === "deep_focus" ||
    workType === "problem_solving" ||
    workType === "creative_project"
    ? "deep_focus"
    : "light_work";
}

function atTime(day: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function classDateRangeAllows(schoolClass: SchoolClass, day: Date) {
  const key = dateKey(day);
  return (
    key >= schoolClass.validFrom &&
    (!schoolClass.validUntil || key <= schoolClass.validUntil)
  );
}

export function lessonOccurrences(
  classes: SchoolClass[],
  exceptions: ClassException[],
  from: Date,
  to: Date,
  weekPatternAnchor?: string,
) {
  const first = new Date(from);
  first.setHours(0, 0, 0, 0);
  const last = new Date(to);
  last.setHours(0, 0, 0, 0);
  const ranges: Array<TimeRange & { classId: string }> = [];

  for (
    let timestamp = first.getTime();
    timestamp <= last.getTime();
    timestamp += DAY
  ) {
    const day = new Date(timestamp);
    const weekday = day.getDay() === 0 ? 7 : day.getDay();
    const key = dateKey(day);
    for (const schoolClass of classes) {
      if (
        schoolClass.weekday !== weekday ||
        !classDateRangeAllows(schoolClass, day) ||
        !classRunsInWeek(schoolClass.weekPattern, day, weekPatternAnchor)
      ) {
        continue;
      }
      const exception = exceptions.find(
        (entry) =>
          entry.classId === schoolClass.id && entry.occurrenceDate === key,
      );
      if (exception) continue;
      ranges.push({
        classId: schoolClass.id,
        start: atTime(day, schoolClass.startTime),
        end: atTime(day, schoolClass.endTime),
        kind: "lesson",
      });
    }
  }

  for (const exception of exceptions) {
    if (
      exception.status !== "rescheduled" ||
      !exception.replacementDate ||
      !exception.replacementStartTime ||
      !exception.replacementEndTime
    ) {
      continue;
    }
    const day = new Date(`${exception.replacementDate}T12:00:00`);
    if (day < first || day > new Date(last.getTime() + DAY - 1)) continue;
    ranges.push({
      classId: exception.classId,
      start: atTime(day, exception.replacementStartTime),
      end: atTime(day, exception.replacementEndTime),
      kind: "lesson",
    });
  }
  return ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function schoolLessonRanges(
  classes: SchoolClass[],
  exceptions: ClassException[],
  from: Date,
  to: Date,
  calendarItems: CalendarItem[] = [],
  weekPatternAnchor?: string,
): TimeRange[] {
  const firstDay = new Date(from);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(to);
  lastDay.setHours(23, 59, 59, 999);
  const recurring: TimeRange[] = lessonOccurrences(
    classes,
    exceptions,
    from,
    to,
    weekPatternAnchor,
  );
  const imported: TimeRange[] = calendarItems
    .filter(
      (item) =>
        item.kind === "event" &&
        item.status === "scheduled" &&
        item.startsAt &&
        item.endsAt &&
        item.constraints.includes(TIMETABLE_IMPORT_MARKER),
    )
    .map((item) => ({
      start: new Date(item.startsAt!),
      end: new Date(item.endsAt!),
      kind: "lesson" as const,
    }))
    .filter((lesson) => lesson.start <= lastDay && lesson.end >= firstDay);
  const importedWeeks = new Set(
    imported.map((lesson) => dateKey(startOfWeek(lesson.start))),
  );
  const applicableRecurring = recurring.filter(
    (lesson) => !importedWeeks.has(dateKey(startOfWeek(lesson.start))),
  );
  return [...applicableRecurring, ...imported].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

export function detectFreePeriods(
  classes: SchoolClass[],
  exceptions: ClassException[],
  settings: SchoolDaySettings,
  from: Date,
  to: Date,
  calendarItems: CalendarItem[] = [],
): FreePeriod[] {
  const lessons = schoolLessonRanges(
    classes,
    exceptions,
    from,
    to,
    calendarItems,
    settings.weekPatternAnchor,
  );
  const byDay = new Map<string, TimeRange[]>();
  for (const lesson of lessons) {
    const key = dateKey(lesson.start);
    byDay.set(key, [...(byDay.get(key) ?? []), lesson]);
  }
  const free: FreePeriod[] = [];
  for (const dayLessons of byDay.values()) {
    dayLessons.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let index = 1; index < dayLessons.length; index += 1) {
      const start = dayLessons[index - 1].end;
      const end = dayLessons[index].start;
      const durationMinutes = Math.round(
        (end.getTime() - start.getTime()) / MINUTE,
      );
      if (
        durationMinutes >=
        Math.max(
          MINIMUM_ACTIONABLE_FREE_PERIOD_MINUTES,
          settings.minimumFreePeriodMinutes,
        )
      ) {
        free.push({ start, end, durationMinutes, kind: "free_period" });
      }
    }
  }
  return free;
}

export function protectedSchoolRanges(
  classes: SchoolClass[],
  exceptions: ClassException[],
  settings: SchoolDaySettings,
  from: Date,
  to: Date,
  task?: { energyType: EnergyType; energyUsage?: number },
  calendarItems: CalendarItem[] = [],
): TimeRange[] {
  const lessons = schoolLessonRanges(
    classes,
    exceptions,
    from,
    to,
    calendarItems,
    settings.weekPatternAnchor,
  );
  const byDay = new Map<string, TimeRange[]>();
  for (const lesson of lessons) {
    const key = dateKey(lesson.start);
    byDay.set(key, [...(byDay.get(key) ?? []), lesson]);
  }
  const ranges: TimeRange[] = [...lessons];
  for (const dayLessons of byDay.values()) {
    const first = dayLessons[0];
    const last = dayLessons.at(-1)!;
    const arriveHome = new Date(
      last.end.getTime() + settings.travelHomeMinutes * MINUTE,
    );
    if (!settings.allowCommuteScheduling) {
      ranges.push({
        start: new Date(
          first.start.getTime() - settings.travelBeforeSchoolMinutes * MINUTE,
        ),
        end: first.start,
        kind: "commute",
      });
      ranges.push({
        start: last.end,
        end: arriveHome,
        kind: "commute",
      });
    }
    if (
      (task?.energyUsage != null
        ? task.energyUsage >= 4
        : task?.energyType === "deep_focus") &&
      settings.recoveryAfterHomeMinutes > 0
    ) {
      ranges.push({
        start: arriveHome,
        end: new Date(
          arriveHome.getTime() + settings.recoveryAfterHomeMinutes * MINUTE,
        ),
        kind: "recovery",
      });
    }
    const cutoff = atTime(first.start, settings.schoolworkCutoff);
    ranges.push({
      start: cutoff,
      end: new Date(atTime(first.start, "23:59").getTime() + MINUTE),
      kind: "recovery",
    });
  }
  return ranges;
}

function overlaps(start: Date, end: Date, range: TimeRange) {
  return start < range.end && end > range.start;
}

export function studySlotSuitability(
  start: Date,
  end: Date,
  task: {
    taskContext: TaskContext;
    computerRequired: boolean;
    energyType: EnergyType;
    energyUsage?: number;
  },
  classes: SchoolClass[],
  exceptions: ClassException[],
  settings: SchoolDaySettings,
  calendarItems: CalendarItem[] = [],
): StudySlotSuitability {
  const lessons = schoolLessonRanges(
    classes,
    exceptions,
    start,
    end,
    calendarItems,
    settings.weekPatternAnchor,
  );
  const freePeriods = detectFreePeriods(
    classes,
    exceptions,
    settings,
    start,
    end,
    calendarItems,
  );
  const day = new Date(start);
  const cutoff = atTime(day, settings.schoolworkCutoff);
  const preferredStart = atTime(day, settings.preferredStudyStart);
  const preferredEnd = atTime(day, settings.preferredStudyEnd);
  const preferred = start >= preferredStart && end <= preferredEnd;

  if (end > cutoff) {
    return {
      suitable: false,
      context: "home",
      preferred,
      reason: `Schoolwork ends at ${settings.schoolworkCutoff}.`,
    };
  }
  if (lessons.some((lesson) => overlaps(start, end, lesson))) {
    return {
      suitable: false,
      context: "school",
      preferred,
      reason: "This overlaps a lesson.",
    };
  }

  const freePeriod = freePeriods.find(
    (period) => start >= period.start && end <= period.end,
  );
  if (freePeriod) {
    const contextCompatible =
      task.taskContext === "school" || task.taskContext === "anywhere";
    if (!contextCompatible) {
      return {
        suitable: false,
        context: "school",
        preferred,
        reason: `${task.taskContext} work does not fit a school free period.`,
      };
    }
    if (task.computerRequired && !settings.schoolComputerAccess) {
      return {
        suitable: false,
        context: "school",
        preferred,
        reason: "This needs a computer that is not available at school.",
      };
    }
    return {
      suitable: true,
      context: "school",
      preferred,
      reason: `Useful ${freePeriod.durationMinutes}-minute free period.`,
    };
  }

  const dayLessons = schoolLessonRanges(
    classes,
    exceptions,
    atTime(day, "00:00"),
    atTime(day, "23:59"),
    calendarItems,
    settings.weekPatternAnchor,
  );
  if (dayLessons.length) {
    const first = dayLessons[0];
    const last = dayLessons.at(-1)!;
    const commuteTo = {
      start: new Date(
        first.start.getTime() - settings.travelBeforeSchoolMinutes * MINUTE,
      ),
      end: first.start,
      kind: "commute" as const,
    };
    const arriveHome = new Date(
      last.end.getTime() + settings.travelHomeMinutes * MINUTE,
    );
    const commuteHome = {
      start: last.end,
      end: arriveHome,
      kind: "commute" as const,
    };
    if (
      !settings.allowCommuteScheduling &&
      (overlaps(start, end, commuteTo) || overlaps(start, end, commuteHome))
    ) {
      return {
        suitable: false,
        context: "commute",
        preferred,
        reason: "Protected commute time.",
      };
    }
    if (start >= first.start && start < last.end) {
      return {
        suitable: false,
        context: "school",
        preferred,
        reason: "This is school time but not a verified free period.",
      };
    }
    const recoveryEnd = new Date(
      arriveHome.getTime() + settings.recoveryAfterHomeMinutes * MINUTE,
    );
    if (
      (task.energyUsage != null
        ? task.energyUsage >= 4
        : task.energyType === "deep_focus") &&
      start < recoveryEnd &&
      end > arriveHome
    ) {
      return {
        suitable: false,
        context: "home",
        preferred,
        reason: `Deep work waits ${settings.recoveryAfterHomeMinutes} minutes after arriving home.`,
      };
    }
  }

  if (task.taskContext === "school" || task.taskContext === "library") {
    return {
      suitable: false,
      context: "home",
      preferred,
      reason: `${task.taskContext} context is not available here.`,
    };
  }
  return {
    suitable: true,
    context: "home",
    preferred,
    reason: preferred
      ? "Inside the preferred study window."
      : "Suitable home study time.",
  };
}

export function suggestAssignmentForFreePeriod(
  period: FreePeriod,
  assignments: Assignment[],
  settings: SchoolDaySettings,
) {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  return assignments
    .filter(
      (assignment) =>
        !["completed", "submitted", "archived"].includes(assignment.status) &&
        assignment.minSessionMinutes <= period.durationMinutes &&
        (assignment.taskContext === "school" ||
          assignment.taskContext === "anywhere") &&
        (!assignment.computerRequired || settings.schoolComputerAccess) &&
        (!assignment.dueAt || new Date(assignment.dueAt) > period.start),
    )
    .sort((a, b) => {
      const priority = priorityRank[a.priority] - priorityRank[b.priority];
      if (priority) return priority;
      return (
        new Date(a.dueAt ?? "9999-12-31").getTime() -
        new Date(b.dueAt ?? "9999-12-31").getTime()
      );
    })[0];
}

export type FreePeriodRecommendation =
  | {
      sourceType: "assignment";
      sourceId: string;
      title: string;
      durationMinutes: number;
      assignment: Assignment;
      item: null;
    }
  | {
      sourceType: "calendar_item";
      sourceId: string;
      title: string;
      durationMinutes: number;
      assignment: null;
      item: CalendarItem;
    };

function deadlineTime(value: string | null) {
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

/** Rank both schoolwork and unscheduled calendar items for a verified gap. */
export function recommendationsForFreePeriod(
  period: FreePeriod,
  assignments: Assignment[],
  items: CalendarItem[],
  settings: SchoolDaySettings,
  limit = 3,
): FreePeriodRecommendation[] {
  const assignmentCandidates: FreePeriodRecommendation[] = assignments
    .filter(
      (assignment) =>
        !["completed", "submitted", "archived"].includes(assignment.status) &&
        assignment.minSessionMinutes <= period.durationMinutes &&
        (assignment.taskContext === "school" ||
          assignment.taskContext === "anywhere") &&
        (!assignment.computerRequired || settings.schoolComputerAccess) &&
        (!assignment.dueAt || new Date(assignment.dueAt) > period.start),
    )
    .map((assignment) => ({
      sourceType: "assignment" as const,
      sourceId: assignment.id,
      title: assignment.title,
      durationMinutes: Math.min(
        period.durationMinutes,
        assignment.maxSessionMinutes,
        Math.max(assignment.minSessionMinutes, 25),
      ),
      assignment,
      item: null,
    }));

  const itemCandidates: FreePeriodRecommendation[] = items
    .filter(
      (item) =>
        item.status === "inbox" &&
        item.flexibility !== "fixed" &&
        !item.assignmentId &&
        !item.assessmentId &&
        item.durationMin <= period.durationMinutes &&
        (item.taskContext === "school" || item.taskContext === "anywhere") &&
        (!item.computerRequired || settings.schoolComputerAccess) &&
        (!item.deadline || new Date(item.deadline) > period.start) &&
        (!item.windowStart || new Date(item.windowStart) <= period.start) &&
        (!item.windowEnd || new Date(item.windowEnd) >= period.end),
    )
    .map((item) => ({
      sourceType: "calendar_item" as const,
      sourceId: item.id,
      title: item.title,
      durationMinutes: Math.min(
        period.durationMinutes,
        item.durationMax,
        Math.max(item.durationMin, 25),
      ),
      assignment: null,
      item,
    }));

  const priorityRank = { high: 0, medium: 1, low: 2 };
  return [...assignmentCandidates, ...itemCandidates]
    .sort((a, b) => {
      const aPriority = a.assignment?.priority ?? a.item?.priority ?? "medium";
      const bPriority = b.assignment?.priority ?? b.item?.priority ?? "medium";
      const priority = priorityRank[aPriority] - priorityRank[bPriority];
      if (priority) return priority;
      const aDeadline = a.assignment?.dueAt ?? a.item?.deadline ?? null;
      const bDeadline = b.assignment?.dueAt ?? b.item?.deadline ?? null;
      const deadline = deadlineTime(aDeadline) - deadlineTime(bDeadline);
      if (deadline) return deadline;
      // Prefer a concrete calendar item when urgency is otherwise tied.
      if (a.sourceType === b.sourceType) return 0;
      return a.sourceType === "calendar_item" ? -1 : 1;
    })
    .slice(0, Math.max(0, limit));
}

function freePeriodKey(period: FreePeriod) {
  return period.start.toISOString();
}

/**
 * A school week should not suggest the same piece of work in every open slot.
 * Allocate the strongest distinct option to each period first, then offer one
 * alternate only when the gap is long enough to make that choice useful.
 */
export function recommendationsAcrossFreePeriods(
  periods: FreePeriod[],
  assignments: Assignment[],
  items: CalendarItem[],
  settings: SchoolDaySettings,
) {
  const claimed = new Set<string>();
  const byPeriod = new Map<string, FreePeriodRecommendation[]>();

  for (const period of periods) {
    const ranked = recommendationsForFreePeriod(
      period,
      assignments,
      items,
      settings,
      6,
    );
    const distinct = ranked.filter(
      (recommendation) =>
        !claimed.has(`${recommendation.sourceType}:${recommendation.sourceId}`),
    );
    const limit = period.durationMinutes >= 90 ? 2 : 1;
    const selected = distinct.slice(0, limit);
    selected.forEach((recommendation) =>
      claimed.add(`${recommendation.sourceType}:${recommendation.sourceId}`),
    );
    byPeriod.set(freePeriodKey(period), selected);
  }

  return byPeriod;
}

export function recommendForFreePeriod(
  period: FreePeriod,
  assignments: Assignment[],
  items: CalendarItem[],
  settings: SchoolDaySettings,
): FreePeriodRecommendation | null {
  return (
    recommendationsForFreePeriod(period, assignments, items, settings, 1)[0] ??
    null
  );
}
