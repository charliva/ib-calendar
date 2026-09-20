import assert from "node:assert/strict";
import test from "node:test";
import { calendarViewFromSearch } from "../lib/calendar/view-state.ts";
import { buildAttentionSnapshot } from "../lib/attention-engine.ts";
import { makeItem, TIMETABLE_IMPORT_MARKER } from "../lib/calendar-engine.ts";
import { DEFAULT_SCHOOL_DAY_SETTINGS } from "../lib/school.ts";
import { relevantCommandItems } from "../lib/calendar/scheduling.ts";

function input(overrides = {}) {
  return {
    now: new Date(2026, 8, 14, 10),
    items: [],
    assignments: [],
    assessments: [],
    intentions: [],
    subjects: [],
    classes: [],
    classExceptions: [],
    settings: DEFAULT_SCHOOL_DAY_SETTINGS,
    currentLocation: "school",
    currentEnergy: "medium",
    computerAvailable: true,
    learningSignals: [],
    ...overrides,
  };
}

test("calendar links accept real dates and supported views only", () => {
  assert.deepEqual(calendarViewFromSearch("?view=week&date=2026-09-14"), {
    view: "week",
    date: "2026-09-14",
  });
  assert.deepEqual(calendarViewFromSearch("?view=home&date=2026-02-30"), {
    view: "upcoming",
    date: null,
  });
  assert.deepEqual(calendarViewFromSearch("?view=bogus&date=not-a-date"), {
    view: null,
    date: null,
  });
});

test("briefing retains rooms and every remaining imported class while surfacing assignments", () => {
  const lesson = (title, start, room) =>
    makeItem({
      title,
      room,
      kind: "event",
      source: "document",
      status: "scheduled",
      startsAt: new Date(2026, 8, 14, start).toISOString(),
      endsAt: new Date(2026, 8, 14, start + 1).toISOString(),
      constraints: [TIMETABLE_IMPORT_MARKER],
      flexibility: "fixed",
    });
  const snapshot = buildAttentionSnapshot(
    input({
      items: [
        lesson("Chemistry", 10, "C204"),
        lesson("Maths", 11, "B12"),
        lesson("English", 13, "A8"),
      ],
      assignments: [
        {
          id: "essay",
          title: "English essay",
          status: "inbox",
          estimatedMinutes: 90,
          dueAt: new Date(2026, 8, 15, 18).toISOString(),
          priority: "high",
        },
      ],
    }),
  );
  assert.equal(snapshot.todayClasses.length, 3);
  assert.equal(snapshot.todayClasses[0].room, "C204");
  assert.equal(snapshot.todayClasses[2].title, "English");
  assert.ok(
    snapshot.obligations.some((card) => card.title === "English essay"),
  );
  assert.ok(!snapshot.obligations.some((card) => card.title === "Maths"));
});

test("recurring briefing respects cancellation and room fallback", () => {
  const classes = [
    {
      id: "maths",
      subjectId: "subject",
      weekday: 1,
      startTime: "10:00",
      endTime: "11:00",
      validFrom: "2026-01-01",
      validUntil: null,
      weekPattern: "every",
      room: "",
    },
  ];
  const subjects = [{ id: "subject", name: "Mathematics", room: "B12" }];
  assert.equal(
    buildAttentionSnapshot(input({ classes, subjects })).todayClasses[0].room,
    "B12",
  );
  assert.equal(
    buildAttentionSnapshot(
      input({
        classes,
        subjects,
        classExceptions: [
          {
            classId: "maths",
            occurrenceDate: "2026-09-14",
            status: "cancelled",
          },
        ],
      }),
    ).todayClasses.length,
    0,
  );
});

test("NLP editing keeps the explicitly selected event above similarly named events", () => {
  const target = makeItem({ title: "Study", id: "specific-target" });
  const others = Array.from({ length: 70 }, () => makeItem({ title: "Study" }));
  assert.equal(
    relevantCommandItems("For Study (id: specific-target), move to tomorrow", [
      ...others,
      target,
    ])[0].id,
    target.id,
  );
});
