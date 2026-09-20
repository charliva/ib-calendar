import test from "node:test";
import assert from "node:assert/strict";
import {
  classCalendarItems,
  snapEventMinutes,
  isClassEvent,
} from "../lib/calendar/interactions.ts";
import { itemToRow, makeItem } from "../lib/calendar-engine.ts";
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
