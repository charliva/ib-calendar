import assert from "node:assert/strict";
import test from "node:test";

import { buildAttentionSnapshot } from "../lib/attention-engine.ts";
import {
  makeItem,
  TIMETABLE_IMPORT_MARKER,
} from "../lib/calendar-engine.ts";
import { makeIntention } from "../lib/intentions.ts";
import { DEFAULT_SCHOOL_DAY_SETTINGS } from "../lib/school.ts";

const now = new Date("2026-08-10T16:00:00+02:00");

function input(overrides = {}) {
  return {
    now,
    items: [],
    assignments: [],
    assessments: [],
    intentions: [],
    subjects: [],
    classes: [],
    classExceptions: [],
    settings: DEFAULT_SCHOOL_DAY_SETTINGS,
    currentLocation: "home",
    currentEnergy: "medium",
    computerAvailable: true,
    learningSignals: [],
    ...overrides,
  };
}

test("puts a current commitment in NOW and the following event in NEXT", () => {
  const current = makeItem({
    kind: "event",
    title: "Chemistry",
    startsAt: "2026-08-10T15:30:00+02:00",
    endsAt: "2026-08-10T16:30:00+02:00",
    flexibility: "fixed",
    status: "scheduled",
  });
  const next = makeItem({
    kind: "event",
    title: "English",
    startsAt: "2026-08-10T17:00:00+02:00",
    endsAt: "2026-08-10T18:00:00+02:00",
    flexibility: "fixed",
    status: "scheduled",
  });
  const snapshot = buildAttentionSnapshot(input({ items: [next, current] }));
  assert.equal(snapshot.now?.title, "Chemistry");
  assert.equal(snapshot.next?.title, "English");
  assert.equal(snapshot.next?.label, "Next commitment");
  assert.match(snapshot.next?.reason ?? "", /fixed commitment/i);
});

test("does not describe flexible scheduled work as a commitment", () => {
  const flexible = makeItem({
    kind: "task",
    title: "Chemistry practice",
    startsAt: "2026-08-10T17:00:00+02:00",
    endsAt: "2026-08-10T17:30:00+02:00",
    flexibility: "elastic",
    status: "scheduled",
  });

  const snapshot = buildAttentionSnapshot(input({ items: [flexible] }));

  assert.equal(snapshot.next?.title, "Chemistry practice");
  assert.equal(snapshot.next?.label, "Planned possibility");
  assert.doesNotMatch(snapshot.next?.reason ?? "", /fixed commitment/i);
});

test("presents imported timetable lessons as classes rather than commitments", () => {
  const imported = (title, startsAt, endsAt) => makeItem({
    kind: "event",
    title,
    startsAt,
    endsAt,
    flexibility: "fixed",
    status: "scheduled",
    source: "document",
    constraints: [TIMETABLE_IMPORT_MARKER],
  });
  const current = imported(
    "Chemistry",
    "2026-08-10T15:30:00+02:00",
    "2026-08-10T16:30:00+02:00",
  );
  const next = imported(
    "English",
    "2026-08-10T17:00:00+02:00",
    "2026-08-10T18:00:00+02:00",
  );
  const later = imported(
    "Global Politics",
    "2026-08-10T18:30:00+02:00",
    "2026-08-10T19:30:00+02:00",
  );

  const snapshot = buildAttentionSnapshot(input({ items: [later, next, current] }));

  assert.equal(snapshot.now?.label, "Class now");
  assert.equal(snapshot.next?.label, "Next class");
  assert.equal(snapshot.later[0]?.label, "Class later");
  for (const card of [snapshot.now, snapshot.next, snapshot.later[0]]) {
    assert.match(card?.reason ?? "", /imported timetable/i);
    assert.doesNotMatch(card?.reason ?? "", /commitment/i);
  }
});

test("presents midnight-bounded calendar items as all-day events", () => {
  const allDay = makeItem({
    kind: "event",
    title: "Sleepover at Ida",
    startsAt: "2026-08-10T00:00:00+02:00",
    endsAt: "2026-08-11T00:00:00+02:00",
    flexibility: "fixed",
    status: "scheduled",
  });

  const snapshot = buildAttentionSnapshot(input({ items: [allDay] }));

  assert.equal(snapshot.now?.label, "All-day event");
  assert.equal(snapshot.now?.detail, "All day");
  assert.match(snapshot.now?.reason ?? "", /all-day event/i);
  assert.doesNotMatch(snapshot.now?.reason ?? "", /commitment/i);
});

test("offers a fitting intention without manufacturing calendar events", () => {
  const intention = makeIntention({
    title: "Read for an hour",
    cadence: "daily",
    targetMinutes: 60,
    preferredSessionMinutes: 30,
    allowedWindowStart: "15:00",
    allowedWindowEnd: "21:00",
    requiredEnergy: "low",
  });
  const snapshot = buildAttentionSnapshot(input({ intentions: [intention] }));
  assert.equal(snapshot.now?.source, "intention");
  assert.equal(snapshot.intentionOpportunity?.intention.id, intention.id);
  assert.equal(snapshot.items, undefined);
});

test("keeps an urgent assignment visible in LATER when a class owns NOW", () => {
  const classItem = makeItem({
    kind: "event",
    title: "Theory of Knowledge",
    startsAt: "2026-08-10T15:30:00+02:00",
    endsAt: "2026-08-10T16:30:00+02:00",
    flexibility: "fixed",
    status: "scheduled",
  });
  const assignment = {
    id: "assignment-1",
    subjectId: null,
    title: "English commentary",
    dueAt: "2026-08-11T18:00:00+02:00",
    estimatedMinutes: 90,
    priority: "high",
    status: "inbox",
    submissionMethod: "",
    notes: "",
    gradeWeight: null,
    taskContext: "anywhere",
    computerRequired: false,
    workType: "creative_project",
    requiredEnergy: "high",
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: "15:00",
    allowedWindowEnd: "21:00",
    minSessionMinutes: 30,
    maxSessionMinutes: 90,
    splittable: true,
    createdAt: "2026-08-09T12:00:00Z",
  };
  const snapshot = buildAttentionSnapshot(
    input({ items: [classItem], assignments: [assignment] }),
  );
  assert.equal(snapshot.now?.title, "Theory of Knowledge");
  assert.ok(snapshot.later.some((card) => card.title === "English commentary"));
});
