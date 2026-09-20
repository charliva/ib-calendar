import test from "node:test";
import assert from "node:assert/strict";
import {
  classCalendarItems,
  snapEventMinutes,
  isClassEvent,
  withoutImportedDuplicates,
} from "../lib/calendar/interactions.ts";
import {
  itemToRow,
  makeItem,
  TIMETABLE_IMPORT_MARKER,
} from "../lib/calendar-engine.ts";
import { rowToItem } from "../lib/db/queries/calendar.ts";
import {
  classToRow,
  rowToClass,
  classExceptionToRow,
  rowToClassException,
} from "../lib/school.ts";
import { eventEditSchema } from "../lib/calendar/event-edit-schema.ts";

const subject = {
  id: "english",
  name: "English",
  shortName: "Eng",
  teacher: "",
  room: "G4",
  color: "#8b7abb",
  icon: "book",
  createdAt: "2026-09-01",
};
const lesson = {
  id: "lesson",
  subjectId: subject.id,
  weekday: 1,
  startTime: "08:30",
  endTime: "10:00",
  weekPattern: "every",
  teacher: "",
  room: "G4",
  validFrom: "2026-09-14",
  validUntil: null,
  energyUsage: 4,
  locationContext: "school",
  createdAt: "2026-09-01",
};
test("classes snap to all four school periods while ordinary events use quarter hours", () => {
  for (const [start, end] of [
    [510, 600],
    [630, 720],
    [750, 840],
    [850, 940],
  ])
    assert.deepEqual(snapEventMinutes(start + 10, 60, true), {
      start,
      duration: end - start,
    });
  assert.deepEqual(snapEventMinutes(643, 60, false), {
    start: 645,
    duration: 60,
  });
});
test("Option bypasses school magnets and preserves five-minute precision", () => {
  assert.deepEqual(snapEventMinutes(642, 60, true, true), {
    start: 640,
    duration: 60,
  });
  assert.deepEqual(snapEventMinutes(647, 60, false, true), {
    start: 645,
    duration: 60,
  });
  assert.deepEqual(snapEventMinutes(1000, 60, true), {
    start: 1005,
    duration: 60,
  });
});
test("class calendar projection includes room, energy and stable occurrence identity", () => {
  const events = classCalendarItems(
    [lesson],
    [],
    [subject],
    new Date("2026-09-14T00:00"),
    new Date("2026-09-21T23:00"),
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].room, "G4");
  assert.equal(events[0].energyUsage, 4);
  assert.equal(events[0].id, "class:lesson:2026-09-14");
  assert.equal(isClassEvent(events[0]), true);
});
test("moving a class occurrence preserves its identity and leaves the following week intact", () => {
  const exception = {
    id: "exception",
    classId: lesson.id,
    occurrenceDate: "2026-09-14",
    status: "rescheduled",
    replacementDate: "2026-09-15",
    replacementStartTime: "10:30",
    replacementEndTime: "12:00",
    replacementRoom: "D7",
    replacementTitle: "English workshop",
    energyUsage: 2,
    locationContext: "library",
    notes: "",
    createdAt: "2026-09-14",
  };
  const events = classCalendarItems(
    [lesson],
    [exception],
    [subject],
    new Date("2026-09-14T00:00"),
    new Date("2026-09-21T23:00"),
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].occurrenceDate, "2026-09-14");
  assert.equal(new Date(events[0].startsAt).getDay(), 2);
  assert.equal(events[0].title, "English workshop");
  assert.equal(events[0].energyUsage, 2);
  assert.equal(events[0].taskContext, "library");
  assert.equal(events[1].room, "G4");
  const restored = rowToClassException(classExceptionToRow(exception));
  assert.equal(restored.energyUsage, 2);
  assert.equal(restored.replacementTitle, "English workshop");
});
test("one-off classes and cancellation cannot delete future lessons", () => {
  assert.equal(
    classCalendarItems(
      [{ ...lesson, validUntil: lesson.validFrom }],
      [],
      [subject],
      new Date("2026-09-14"),
      new Date("2026-10-01"),
    ).length,
    1,
  );
  const events = classCalendarItems(
    [lesson],
    [
      {
        id: "cancel",
        classId: lesson.id,
        occurrenceDate: "2026-09-14",
        status: "cancelled",
      },
    ],
    [subject],
    new Date("2026-09-14"),
    new Date("2026-09-21T23:00"),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].occurrenceDate, "2026-09-21");
});
test("homework completion, energy and class links survive persistence", () => {
  const item = makeItem({
    kind: "task",
    title: "Read chapter 4",
    status: "completed",
    energyUsage: 5,
    taskContext: "city",
    linkedClassId: "lesson",
    linkedOccurrenceDate: "2026-09-14",
  });
  const restored = rowToItem(itemToRow(item));
  assert.equal(restored.status, "completed");
  assert.equal(restored.energyUsage, 5);
  assert.equal(restored.linkedClassId, "lesson");
  assert.equal(restored.linkedOccurrenceDate, "2026-09-14");
  assert.equal(restored.taskContext, "city");
  assert.equal(rowToClass(classToRow(lesson)).energyUsage, 4);
});
test("legacy energy values migrate deterministically and invalid edits are rejected", () => {
  assert.equal(
    makeItem({ kind: "event", title: "Legacy", energyType: "deep_focus" })
      .energyUsage,
    5,
  );
  assert.equal(
    makeItem({ kind: "event", title: "Rest", energyType: "recovery" })
      .energyUsage,
    1,
  );
  assert.equal(eventEditSchema.safeParse({ energyUsage: 6 }).success, false);
  assert.equal(
    eventEditSchema.safeParse({ startsAt: "tomorrow" }).success,
    false,
  );
  assert.equal(
    eventEditSchema.safeParse({ energyUsage: 3, repeat: "b", isClass: true })
      .success,
    true,
  );
});

// The calendar used to call lessonOccurrences without the student's week
// anchor, so it fell back to the hardcoded 2020 epoch while the School tab,
// the free-period panel and the settings summary all passed the real one.
// Any school out of phase with that epoch saw its fortnightly lessons render
// on the wrong weeks, and the two halves of the app disagreed with each other.
test("A/B lessons follow the student's week anchor, not a hardcoded epoch", () => {
  const weekAOnly = { ...lesson, weekPattern: "a" };
  const mondayOfWeekOne = new Date("2026-09-14T00:00");
  const mondayOfWeekTwo = new Date("2026-09-21T00:00");

  const inWeek = (anchor, monday) =>
    classCalendarItems(
      [weekAOnly],
      [],
      [subject],
      monday,
      new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000),
      anchor,
    ).length;

  // Anchoring on the 14th makes that week the A week.
  assert.equal(inWeek("2026-09-14", mondayOfWeekOne), 1);
  assert.equal(inWeek("2026-09-14", mondayOfWeekTwo), 0);

  // A school one week out of phase gets the mirror image. If the anchor were
  // ignored, both anchors would give the same answer.
  assert.equal(inWeek("2026-09-21", mondayOfWeekOne), 0);
  assert.equal(inWeek("2026-09-21", mondayOfWeekTwo), 1);
});

test("a lesson that runs every week ignores the anchor entirely", () => {
  const monday = new Date("2026-09-14T00:00");
  const to = new Date("2026-09-20T23:00");
  for (const anchor of ["2026-09-14", "2026-09-21", undefined]) {
    assert.equal(
      classCalendarItems([lesson], [], [subject], monday, to, anchor).length,
      1,
    );
  }
});

// An imported week and a recurring fallback lesson can describe the same slot.
// The School tab has always dropped the recurrence in that case; the calendar
// drew both, so every lesson in an imported week appeared twice. The exclusion
// the calendar did have compared an item's id against a class id, which an
// imported item — a fresh uuid with no classId — can never match.
function importedLesson(overrides = {}) {
  return makeItem({
    id: "imported-1",
    kind: "event",
    title: "English",
    subjectId: subject.id,
    source: "document",
    constraints: [TIMETABLE_IMPORT_MARKER],
    startsAt: new Date("2026-09-14T08:30").toISOString(),
    endsAt: new Date("2026-09-14T10:00").toISOString(),
    status: "scheduled",
    ...overrides,
  });
}

test("an imported lesson replaces the recurring one it covers", () => {
  const occurrences = classCalendarItems(
    [lesson],
    [],
    [subject],
    new Date("2026-09-14T00:00"),
    new Date("2026-09-20T23:00"),
  );
  assert.equal(occurrences.length, 1);

  const deduped = withoutImportedDuplicates(
    occurrences,
    [lesson],
    [importedLesson()],
  );
  assert.deepEqual(deduped, []);
});

test("a recurring lesson the import does not cover is kept", () => {
  const occurrences = classCalendarItems(
    [lesson],
    [],
    [subject],
    new Date("2026-09-14T00:00"),
    new Date("2026-09-20T23:00"),
  );

  // Same slot, different day.
  const otherDay = importedLesson({
    startsAt: new Date("2026-09-15T08:30").toISOString(),
    endsAt: new Date("2026-09-15T10:00").toISOString(),
  });
  assert.equal(
    withoutImportedDuplicates(occurrences, [lesson], [otherDay]).length,
    1,
  );

  // Same day, different time.
  const otherTime = importedLesson({
    startsAt: new Date("2026-09-14T11:00").toISOString(),
    endsAt: new Date("2026-09-14T12:30").toISOString(),
  });
  assert.equal(
    withoutImportedDuplicates(occurrences, [lesson], [otherTime]).length,
    1,
  );

  // An ordinary calendar item at the same time is not an import.
  const ordinary = makeItem({
    id: "not-an-import",
    kind: "event",
    title: "English",
    subjectId: subject.id,
    startsAt: new Date("2026-09-14T08:30").toISOString(),
    endsAt: new Date("2026-09-14T10:00").toISOString(),
  });
  assert.equal(
    withoutImportedDuplicates(occurrences, [lesson], [ordinary]).length,
    1,
  );
});

test("with nothing imported the occurrences are returned untouched", () => {
  const occurrences = classCalendarItems(
    [lesson],
    [],
    [subject],
    new Date("2026-09-14T00:00"),
    new Date("2026-09-20T23:00"),
  );
  assert.equal(withoutImportedDuplicates(occurrences, [lesson], []), occurrences);
});
