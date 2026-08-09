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

const MINUTE = 60_000;
const DAY = 86_400_000;

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

function weekPatternFor(day: Date) {
  const monday = new Date(day);
  const weekday = monday.getDay() === 0 ? 7 : monday.getDay();
  monday.setDate(monday.getDate() - weekday + 1);
  monday.setHours(0, 0, 0, 0);
  const epoch = new Date(2020, 0, 6);
  const week = Math.floor((monday.getTime() - epoch.getTime()) / (7 * DAY));
  return Math.abs(week) % 2 === 0 ? "a" : "b";
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
        (schoolClass.weekPattern !== "every" &&
          schoolClass.weekPattern !== weekPatternFor(day))
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
      if (durationMinutes >= settings.minimumFreePeriodMinutes) {
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
  task?: { energyType: EnergyType },
  calendarItems: CalendarItem[] = [],
): TimeRange[] {
  const lessons = schoolLessonRanges(
    classes,
    exceptions,
    from,
    to,
    calendarItems,
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
          first.start.getTime() -
            settings.travelBeforeSchoolMinutes * MINUTE,
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
      task?.energyType === "deep_focus" &&
      settings.recoveryAfterHomeMinutes > 0
    ) {
      ranges.push({
        start: arriveHome,
        end: new Date(
          arriveHome.getTime() +
            settings.recoveryAfterHomeMinutes * MINUTE,
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
  );
  if (dayLessons.length) {
    const first = dayLessons[0];
    const last = dayLessons.at(-1)!;
    const commuteTo = {
      start: new Date(
        first.start.getTime() -
          settings.travelBeforeSchoolMinutes * MINUTE,
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
      task.energyType === "deep_focus" &&
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
    reason: preferred ? "Inside the preferred study window." : "Suitable home study time.",
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
      const priority =
        priorityRank[a.priority] - priorityRank[b.priority];
      if (priority) return priority;
      return (
        new Date(a.dueAt ?? "9999-12-31").getTime() -
        new Date(b.dueAt ?? "9999-12-31").getTime()
      );
    })[0];
}
