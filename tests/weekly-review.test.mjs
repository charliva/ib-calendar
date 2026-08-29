import assert from "node:assert/strict";
import test from "node:test";
import { makeItem } from "../lib/calendar-engine.ts";
import { isWeeklyReviewAvailable, collectWeeklyReviewEntries } from "../lib/weekly-review.ts";

const saturday = new Date(2026, 7, 29, 10, 0, 0, 0);
const subject = {
  id: "math",
  name: "Mathematics",
  shortName: "Math",
  teacher: "",
  room: "",
  color: "#7f70e8",
  icon: "",
  createdAt: "2026-08-24T00:00:00.000Z",
};
const occurredClass = makeItem({
  id: "class-1",
  kind: "event",
  title: "Mathematics",
  subjectId: subject.id,
  startsAt: "2026-08-26T08:00:00.000Z",
  endsAt: "2026-08-26T09:00:00.000Z",
  status: "scheduled",
  source: "import",
});
const recurringClass = {
  id: "recurring-math",
  subjectId: subject.id,
  weekday: 3,
  startTime: "08:00",
  endTime: "09:00",
  weekPattern: "every",
  teacher: "",
  room: "",
  validFrom: "2026-08-24",
  validUntil: null,
  createdAt: "2026-08-24T00:00:00.000Z",
};

test("a scheduled class that has occurred makes the weekend review available", () => {
  assert.equal(
    isWeeklyReviewAvailable({
      now: saturday,
      items: [occurredClass],
      assignments: [],
      assessments: [],
      completedReviewWeeks: [],
    }),
    true,
  );
});

test("the receipt includes a class the user attended without marking it complete", () => {
  const { weekStart, weekEnd } = { weekStart: new Date(2026, 7, 24), weekEnd: new Date(2026, 7, 31) };
  const entries = collectWeeklyReviewEntries(
    {
      items: [occurredClass],
      subjects: [subject],
      classes: [],
      classExceptions: [],
      assignments: [],
      assessments: [],
    },
    weekStart,
    weekEnd,
  );

  assert.deepEqual(entries.map((entry) => entry.title), ["Mathematics"]);
  assert.equal(entries[0]?.kind, "Class");
});

test("a recurring lesson makes the weekend review available and appears in the receipt", () => {
  const input = {
    classes: [recurringClass],
    classExceptions: [],
  };
  assert.equal(
    isWeeklyReviewAvailable({
      now: saturday,
      items: [],
      assignments: [],
      assessments: [],
      completedReviewWeeks: [],
      ...input,
    }),
    true,
  );

  const entries = collectWeeklyReviewEntries(
    {
      items: [],
      subjects: [subject],
      assignments: [],
      assessments: [],
      ...input,
    },
    new Date(2026, 7, 24),
    new Date(2026, 7, 31),
  );

  assert.deepEqual(entries.map((entry) => entry.title), ["Mathematics"]);
  assert.equal(entries[0]?.kind, "Class");
});
