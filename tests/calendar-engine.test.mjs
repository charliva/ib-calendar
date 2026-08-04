import assert from "node:assert/strict";
import test from "node:test";
import {
  capacityForDay,
  makeItem,
  scheduleInsights,
  validatePlacement,
} from "../lib/calendar-engine.ts";

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
