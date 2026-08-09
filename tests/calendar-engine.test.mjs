import assert from "node:assert/strict";
import test from "node:test";
import {
  capacityForDay,
  flexibilityForNewItem,
  isCalendarSpanItem,
  isLongSpanItem,
  isMultiDayItem,
  itemOverlapsDay,
  itemToRow,
  makeItem,
  scheduleInsights,
  TIMETABLE_IMPORT_MARKER,
  validatePlacement,
  withResizedDuration,
} from "../lib/calendar-engine.ts";

test("new events are flexible unless they are imported classes", () => {
  assert.equal(makeItem({ title: "Dentist", kind: "event" }).flexibility, "flexible");
  assert.equal(
    flexibilityForNewItem({ kind: "event", flexibility: "fixed" }),
    "flexible",
  );
  assert.equal(
    flexibilityForNewItem({
      kind: "event",
      flexibility: "flexible",
      constraints: [TIMETABLE_IMPORT_MARKER],
    }),
    "fixed",
  );
  assert.equal(
    flexibilityForNewItem({ kind: "task", flexibility: "elastic" }),
    "elastic",
  );
});

test("serializes an occurrence-specific room", () => {
  const item = makeItem({
    title: "Chemistry",
    kind: "event",
    room: "KE103",
  });

  assert.equal(item.room, "KE103");
  assert.equal(itemToRow(item).room, "KE103");
});

test("manual edge resizing expands the allowed duration before validation", () => {
  const event = makeItem({
    title: "Study group",
    kind: "event",
    startsAt: "2026-08-10T10:00:00.000Z",
    endsAt: "2026-08-10T11:00:00.000Z",
    durationMin: 60,
    durationMax: 60,
    status: "scheduled",
  });

  const extended = withResizedDuration(event, 90);
  assert.deepEqual([extended.durationMin, extended.durationMax], [60, 90]);
  assert.equal(
    validatePlacement(
      extended,
      "2026-08-10T09:30:00.000Z",
      "2026-08-10T11:00:00.000Z",
      [],
      { allowFixedChange: true },
    ).valid,
    true,
  );

  const shortened = withResizedDuration(event, 30);
  assert.deepEqual([shortened.durationMin, shortened.durationMax], [30, 60]);
});

test("capacity splits an overnight event across its actual days", () => {
  const overnight = makeItem({
    title: "Overnight trip",
    kind: "event",
    startsAt: "2026-08-03T23:30:00",
    endsAt: "2026-08-04T00:30:00",
    durationMin: 60,
    durationMax: 60,
    status: "scheduled",
  });

  assert.equal(capacityForDay([overnight], "2026-08-03").total, 30);
  assert.equal(capacityForDay([overnight], "2026-08-04").total, 30);
  assert.equal(isCalendarSpanItem(overnight), true);
});

test("multi-day spans cover intermediate days with an exclusive end", () => {
  const examWeek = makeItem({
    title: "Exam week",
    kind: "intention",
    startsAt: "2026-08-03T00:00:00",
    endsAt: "2026-08-08T00:00:00",
    durationMin: 5 * 24 * 60,
    durationMax: 5 * 24 * 60,
    status: "scheduled",
  });

  assert.equal(isMultiDayItem(examWeek), true);
  assert.equal(isLongSpanItem(examWeek), true);
  assert.equal(itemOverlapsDay(examWeek, "2026-08-05"), true);
  assert.equal(itemOverlapsDay(examWeek, "2026-08-08"), false);
  assert.equal(capacityForDay([examWeek], "2026-08-05").total, 0);

  const classDuringExamWeek = makeItem({
    title: "Math exam",
    kind: "event",
    startsAt: "2026-08-05T09:00:00",
    endsAt: "2026-08-05T11:00:00",
    durationMin: 120,
    durationMax: 120,
    status: "scheduled",
  });
  assert.equal(
    validatePlacement(
      classDuringExamWeek,
      classDuringExamWeek.startsAt,
      classDuringExamWeek.endsAt,
      [examWeek],
    ).valid,
    true,
  );
});

test("a one-day all-day event is treated as a long span", () => {
  const holiday = makeItem({
    title: "Holiday",
    kind: "event",
    startsAt: "2026-08-06T00:00:00",
    endsAt: "2026-08-07T00:00:00",
    durationMin: 24 * 60,
    durationMax: 24 * 60,
    status: "scheduled",
  });

  assert.equal(isMultiDayItem(holiday), false);
  assert.equal(isLongSpanItem(holiday), true);
  assert.equal(capacityForDay([holiday], "2026-08-06").total, 0);
});

test("separate focus sessions are not reported as consecutive", () => {
  const focus = [9, 13, 17].map((hour) =>
    makeItem({
      title: `Focus ${hour}`,
      kind: "task",
      startsAt: `2026-08-03T${hour}:00:00`,
      endsAt: `2026-08-03T${hour + 1}:00:00`,
      durationMin: 60,
      durationMax: 60,
      energyType: "deep_focus",
      flexibility: "elastic",
      status: "scheduled",
    }),
  );

  assert.equal(
    scheduleInsights(focus, "2026-08-03").some((insight) =>
      insight.includes("consecutive deep focus"),
    ),
    false,
  );
});

test("fixed placements compare instants instead of ISO formatting", () => {
  const fixed = makeItem({
    title: "Class",
    kind: "event",
    startsAt: "2026-08-03T10:00:00.000Z",
    endsAt: "2026-08-03T11:00:00.000Z",
    durationMin: 60,
    durationMax: 60,
    flexibility: "fixed",
    status: "scheduled",
  });

  const result = validatePlacement(
    fixed,
    "2026-08-03T12:00:00+02:00",
    "2026-08-03T13:00:00+02:00",
    [],
  );
  assert.equal(result.valid, true);
});

test("new items normalize impossible duration ranges", () => {
  const item = makeItem({
    title: "Short task",
    kind: "task",
    durationMin: 2,
    durationMax: 1,
  });

  assert.equal(item.durationMin, 5);
  assert.equal(item.durationMax, 5);
});
