import {
  dateKey,
  durationMinutes,
  makeItem,
  type CalendarItem,
} from "../calendar-engine.ts";
import { lessonOccurrences } from "../school-day-engine.ts";
import type { ClassException, SchoolClass, Subject } from "../school.ts";
import { isImportedTimetableItem } from "../timetable-import.ts";

export const SCHOOL_PERIODS = [
  [510, 600],
  [630, 720],
  [750, 840],
  [850, 940],
] as const;
export const ENERGY_USAGE_LABELS = [
  "Very light",
  "Light",
  "Moderate",
  "Demanding",
  "Very demanding",
];
export type ClassRepeat = "once" | "every" | "a" | "b";
export type EditorOptions = {
  isClass: boolean;
  repeat: ClassRepeat;
  scope: "occurrence" | "future";
  subjectName?: string;
};
export const isClassEvent = (item: CalendarItem) =>
  Boolean(item.classId) || isImportedTimetableItem(item);
export function snapEventMinutes(
  start: number,
  duration: number,
  isClass: boolean,
  precise = false,
) {
  if (isClass && !precise) {
    const period = SCHOOL_PERIODS.find(
      ([a, b]) =>
        Math.abs(start - a) <= 20 || Math.abs(start + duration - b) <= 20,
    );
    if (period) return { start: period[0], duration: period[1] - period[0] };
  }
  const step = precise ? 5 : 15;
  return {
    start: Math.max(
      0,
      Math.min(1440 - duration, Math.round(start / step) * step),
    ),
    duration,
  };
}
/**
 * The lessons that fall between `from` and `to`, as calendar items.
 *
 * `weekPatternAnchor` decides which side of a fortnight each week is on. It is
 * a school's fact, not the software's, so it has to come from the student's
 * settings — omitting it silently falls back to a 2020 epoch, which is how the
 * calendar ended up rendering Week A / Week B lessons one week out of phase
 * with the School tab and the free-period panel, both of which do pass it.
 */
export function classCalendarItems(
  classes: SchoolClass[],
  exceptions: ClassException[],
  subjects: Subject[],
  from: Date,
  to: Date,
  weekPatternAnchor?: string,
) {
  return lessonOccurrences(
    classes,
    exceptions,
    from,
    to,
    weekPatternAnchor,
  ).flatMap(
    (occurrence) => {
      const lesson = classes.find((entry) => entry.id === occurrence.classId);
      if (!lesson) return [];
      const subject = subjects.find((entry) => entry.id === lesson.subjectId);
      const exception = exceptions.find(
        (entry) =>
          entry.classId === lesson.id &&
          entry.status === "rescheduled" &&
          entry.replacementDate === dateKey(occurrence.start) &&
          entry.replacementStartTime === localTime(occurrence.start),
      );
      const occurrenceDate =
        exception?.occurrenceDate ?? dateKey(occurrence.start);
      return [
        makeItem({
          id: `class:${lesson.id}:${occurrenceDate}`,
          classId: lesson.id,
          occurrenceDate,
          kind: "event",
          title: exception?.replacementTitle || subject?.name || "Class",
          subjectId: lesson.subjectId,
          room: exception
            ? exception.replacementRoom
            : lesson.room || subject?.room || "",
          startsAt: occurrence.start.toISOString(),
          endsAt: occurrence.end.toISOString(),
          durationMin:
            (occurrence.end.getTime() - occurrence.start.getTime()) / 60000,
          flexibility: "fixed",
          taskContext:
            (exception?.locationContext as CalendarItem["taskContext"]) ||
            lesson.locationContext ||
            "school",
          energyUsage: exception?.energyUsage ?? lesson.energyUsage ?? 3,
          status: "scheduled",
        }),
      ];
    },
  );
}
export function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function editedTiming(
  item: CalendarItem,
  startsAt: string,
  endsAt: string,
): CalendarItem {
  const minutes = durationMinutes({ ...item, startsAt, endsAt });
  return {
    ...item,
    startsAt,
    endsAt,
    durationMin: minutes,
    durationMax: minutes,
  };
}
