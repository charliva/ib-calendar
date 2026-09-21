import {
  dateKey,
  makeItem,
  type CalendarItem,
} from "../calendar-engine.ts";
import { lessonOccurrences } from "../school-day-engine.ts";
import type { ClassException, SchoolClass, Subject } from "../school.ts";
import {
  importedLessonMatchesClass,
  isImportedTimetableItem,
} from "../timetable-import.ts";

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
/**
 * The lesson occurrences left after removing any that an imported timetable
 * already covers.
 *
 * A week imported from a screenshot and a recurring fallback lesson can
 * describe the same slot. The School tab has always resolved that — it drops
 * the recurring lesson when `importedLessonMatchesClass` says the import
 * covers it — but the calendar did not, so an imported week drew each lesson
 * twice, once from the import and once from the recurrence. The exclusion the
 * calendar did have compared an item's id against a class id, which imported
 * items (a fresh uuid, no classId) can never match.
 *
 * The import wins, because it is what the student's timetable actually said
 * that week.
 */
export function withoutImportedDuplicates(
  occurrences: CalendarItem[],
  classes: SchoolClass[],
  items: CalendarItem[],
) {
  const imported = items.filter(isImportedTimetableItem);
  if (imported.length === 0) return occurrences;
  return occurrences.filter((occurrence) => {
    const lesson = classes.find((entry) => entry.id === occurrence.classId);
    if (!lesson || !occurrence.startsAt) return true;
    const day = dateKey(new Date(occurrence.startsAt));
    return !imported.some((item) =>
      importedLessonMatchesClass(item, lesson, day),
    );
  });
}
