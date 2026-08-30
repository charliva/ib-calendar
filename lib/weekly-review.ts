import {
  dateKey,
  startOfWeek,
  TIMETABLE_IMPORT_MARKER,
  type CalendarItem,
} from "./calendar-engine.ts";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  Subject,
} from "./school.ts";
import { lessonOccurrences } from "./school-day-engine.ts";

export type WeeklyReviewEntry = {
  id: string;
  title: string;
  kind: "Class" | "Assignment" | "Test";
  sourceType: "calendar_item" | "assignment" | "assessment";
  detail: string;
  subjectId: string | null;
  subjectName: string;
  subjectColor: string;
  date: string;
};

export type WeeklyReviewInput = {
  items: CalendarItem[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  assignments: Assignment[];
  assessments: Assessment[];
};

export function reviewWeekBounds(now: Date) {
  const weekStart = startOfWeek(now);
  const weekEnd = startOfWeek(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return { weekStart, weekEnd };
}

export function isWeeklyReviewAvailable({
  now,
  items,
  classes,
  classExceptions,
  assignments,
  assessments,
  completedReviewWeeks,
}: {
  now: Date;
  items: CalendarItem[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  assignments: Assignment[];
  assessments: Assessment[];
  completedReviewWeeks: string[];
}) {
  if (now.getDay() !== 6 && now.getDay() !== 0) return false;
  const { weekStart, weekEnd } = reviewWeekBounds(now);
  const weekKey = dateKey(weekStart);
  if (completedReviewWeeks.includes(weekKey)) return false;
  const inCurrentWeek = (value: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    return date >= weekStart && date < weekEnd;
  };
  const hasImportedLessons = items.some(
    (item) =>
      item.kind === "event" &&
      item.constraints.includes(TIMETABLE_IMPORT_MARKER) &&
      inCurrentWeek(item.startsAt),
  );
  return (
    items.some((item) => {
      if (item.kind !== "event") return false;
      const date = item.endsAt ?? item.startsAt;
      return Boolean(date && new Date(date) <= now && inCurrentWeek(date));
    }) ||
    (!hasImportedLessons &&
      lessonOccurrences(
        classes,
        classExceptions,
        weekStart,
        weekEnd,
      ).some((lesson) => lesson.end <= now)) ||
    assignments.some(
      (assignment) =>
        assignment.status === "completed" &&
        inCurrentWeek(assignment.dueAt),
    ) ||
    assessments.some(
      (assessment) =>
        assessment.status === "completed" &&
        inCurrentWeek(assessment.scheduledAt),
    )
  );
}

export function collectWeeklyReviewEntries(
  {
    items,
    subjects,
    classes,
    classExceptions,
    assignments,
    assessments,
  }: WeeklyReviewInput,
  weekStart: Date,
  weekEnd: Date,
): WeeklyReviewEntry[] {
  const result: WeeklyReviewEntry[] = [];
  const inWeek = (value: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    return date >= weekStart && date < weekEnd;
  };
  const hasImportedLessons = items.some(
    (item) =>
      item.kind === "event" &&
      item.constraints.includes(TIMETABLE_IMPORT_MARKER) &&
      inWeek(item.startsAt),
  );
  if (!hasImportedLessons) {
    for (const lesson of lessonOccurrences(
      classes,
      classExceptions,
      weekStart,
      weekEnd,
    )) {
      const subject = subjects.find(
        (entry) =>
          entry.id ===
          classes.find((schoolClass) => schoolClass.id === lesson.classId)
            ?.subjectId,
      );
      if (!subject) continue;
      result.push({
        id: `lesson:${lesson.classId}:${lesson.start.toISOString()}`,
        title: subject.name,
        kind: "Class",
        sourceType: "calendar_item",
        detail: `${Math.round(
          (lesson.end.getTime() - lesson.start.getTime()) / 60_000,
        )} min`,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        date: lesson.start.toISOString(),
      });
    }
  }
  for (const item of items) {
    if (!item.subjectId) continue;
    const subject = subjects.find((entry) => entry.id === item.subjectId);
    if (!subject) continue;
    const date = item.startsAt ?? item.deadline;
    if (!date) continue;
    const reviewDate = new Date(date);
    if (reviewDate < weekStart || reviewDate >= weekEnd) continue;
    if (item.kind === "event") {
      result.push({
        id: item.id,
        title: item.title,
        kind:
          item.kind === "event"
            ? "Class"
            : item.assessmentId
              ? "Test"
              : "Assignment",
        sourceType: "calendar_item",
        detail: `${item.durationMin} min`,
        subjectId: item.subjectId,
        subjectName: subject.name,
        subjectColor: subject.color,
        date,
      });
    }
  }

  for (const assignment of assignments) {
    if (assignment.status !== "completed" || !assignment.dueAt) continue;
    const date = new Date(assignment.dueAt);
    if (date < weekStart || date >= weekEnd) continue;
    const subject = subjects.find(
      (entry) => entry.id === assignment.subjectId,
    );
    if (!subject) continue;
    result.push({
      id: assignment.id,
      title: assignment.title,
      kind: "Assignment",
      sourceType: "assignment",
      detail: "Marked complete",
      subjectId: assignment.subjectId,
      subjectName: subject.name,
      subjectColor: subject.color,
      date: assignment.dueAt,
    });
  }

  for (const assessment of assessments) {
    if (assessment.status !== "completed") continue;
    const date = new Date(assessment.scheduledAt);
    if (date < weekStart || date >= weekEnd) continue;
    const subject = subjects.find(
      (entry) => entry.id === assessment.subjectId,
    );
    if (!subject) continue;
    result.push({
      id: assessment.id,
      title: assessment.title,
      kind: "Test",
      sourceType: "assessment",
      detail: "Marked complete",
      subjectId: assessment.subjectId,
      subjectName: subject.name,
      subjectColor: subject.color,
      date: assessment.scheduledAt,
    });
  }

  return result.sort((first, second) => first.date.localeCompare(second.date));
}
