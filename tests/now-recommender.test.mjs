import assert from "node:assert/strict";
import test from "node:test";
import { makeItem } from "../lib/calendar-engine.ts";
import { recommendNow } from "../lib/now-recommender.ts";
import {
  DEFAULT_FOCUS_TEMPLATES,
  DEFAULT_SCHOOL_DAY_SETTINGS,
} from "../lib/school.ts";

const now = new Date("2026-08-03T10:00:00.000Z");
const settings = {
  ...DEFAULT_SCHOOL_DAY_SETTINGS,
  schoolworkCutoff: "21:00",
  focusTemplates: DEFAULT_FOCUS_TEMPLATES,
};

function assignment(overrides = {}) {
  return {
    id: "english-reading",
    subjectId: null,
    title: "English reading",
    dueAt: "2026-08-04T18:00:00.000Z",
    estimatedMinutes: 50,
    priority: "medium",
    status: "inbox",
    submissionMethod: "",
    notes: "",
    gradeWeight: null,
    taskContext: "anywhere",
    computerRequired: false,
    workType: "reading",
    requiredEnergy: "low",
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: "08:00",
    allowedWindowEnd: "21:00",
    minSessionMinutes: 20,
    maxSessionMinutes: 30,
    splittable: true,
    createdAt: "",
    ...overrides,
  };
}

function assessment(overrides = {}) {
  return {
    id: "biology-exam",
    subjectId: null,
    title: "Biology exam",
    scheduledAt: "2026-08-08T09:00:00.000Z",
    endsAt: null,
    assessmentType: "exam",
    importance: "high",
    weight: null,
    notes: "",
    status: "upcoming",
    estimatedRevisionMinutes: 180,
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    revisionWindowStart: "08:00",
    revisionWindowEnd: "21:00",
    minRevisionSessionMinutes: 20,
    maxRevisionSessionMinutes: 45,
    spacedRepetitionEnabled: true,
    reviewIntervalsDays: [1, 3, 7, 14],
    createdAt: "",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    now,
    items: [
      makeItem({
        id: "chemistry",
        title: "Chemistry",
        kind: "event",
        flexibility: "fixed",
        startsAt: "2026-08-03T10:32:00.000Z",
        endsAt: "2026-08-03T11:20:00.000Z",
        status: "scheduled",
      }),
    ],
    assignments: [assignment()],
    assessments: [assessment()],
    subjects: [],
    classes: [],
    classExceptions: [],
    settings,
    currentLocation: "school",
    currentEnergy: "low",
    computerAvailable: false,
    ...overrides,
  };
}

test("recommends explainable work that fits before the next event", () => {
  const result = recommendNow(input());

  assert.equal(result.availableMinutes, 32);
  assert.equal(result.nextFixed?.title, "Chemistry");
  assert.ok(result.recommendations.length >= 2);
  assert.equal(result.recommendations[0].title, "English reading");
  assert.equal(result.recommendations[0].durationMinutes, 25);
  assert.ok(result.recommendations[0].reasons.includes("Due tomorrow"));
  assert.ok(
    result.recommendations[0].reasons.some((reason) =>
      reason.includes("low-energy"),
    ),
  );
});

test("filters work that needs unavailable tools or the wrong context", () => {
  const result = recommendNow(
    input({
      assignments: [
        assignment({
          id: "desktop-project",
          title: "Desktop project",
          priority: "high",
          taskContext: "home",
          computerRequired: true,
        }),
        assignment(),
      ],
    }),
  );

  assert.equal(
    result.recommendations.some(
      (recommendation) => recommendation.title === "Desktop project",
    ),
    false,
  );
});

test("uses the revision runway stage as an exam approaches", () => {
  const result = recommendNow(
    input({
      assignments: [],
      assessments: [
        assessment({
          scheduledAt: "2026-08-05T09:00:00.000Z",
        }),
      ],
      currentEnergy: "high",
    }),
  );

  assert.equal(result.recommendations[0].revisionStage, "Practice questions");
  assert.equal(result.recommendations[0].workType, "problem_solving");
  assert.ok(result.recommendations[0].reasons.includes("Exam in 2 days"));
});

test("does not offer another session while a fixed commitment is active", () => {
  const result = recommendNow(
    input({
      items: [
        makeItem({
          title: "Chemistry",
          kind: "event",
          flexibility: "fixed",
          startsAt: "2026-08-03T09:30:00.000Z",
          endsAt: "2026-08-03T10:30:00.000Z",
          status: "scheduled",
        }),
      ],
    }),
  );

  assert.equal(result.availableMinutes, 0);
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.blockedReason, "Chemistry is in progress.");
});

test("offers a linked flexible session that was planned for later", () => {
  const planned = makeItem({
    id: "planned-reading",
    title: "English reading · work session",
    kind: "task",
    startsAt: "2026-08-03T15:00:00.000Z",
    endsAt: "2026-08-03T15:25:00.000Z",
    durationMin: 20,
    durationMax: 30,
    deadline: "2026-08-04T18:00:00.000Z",
    flexibility: "elastic",
    assignmentId: "english-reading",
    taskContext: "anywhere",
    workType: "reading",
    requiredEnergy: "low",
    status: "scheduled",
  });
  const result = recommendNow(input({ items: [planned], assessments: [] }));

  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].calendarItemId, "planned-reading");
  assert.match(result.recommendations[0].detail, /start it early/);
});

test("commutes reject deep work even when commute scheduling is enabled", () => {
  const result = recommendNow(
    input({
      items: [],
      assignments: [
        assignment({
          title: "Hard problem set",
          workType: "problem_solving",
          requiredEnergy: "high",
        }),
        assignment(),
      ],
      assessments: [],
      currentLocation: "commute",
      currentEnergy: "medium",
      settings: { ...settings, allowCommuteScheduling: true },
    }),
  );

  assert.equal(
    result.recommendations.some(
      (recommendation) => recommendation.title === "Hard problem set",
    ),
    false,
  );
  assert.equal(result.recommendations[0].title, "English reading");
});

test("does not squeeze a task below its minimum duration", () => {
  const result = recommendNow(
    input({
      items: [
        makeItem({
          title: "Next class",
          kind: "event",
          flexibility: "fixed",
          startsAt: "2026-08-03T10:15:00.000Z",
          endsAt: "2026-08-03T11:00:00.000Z",
          status: "scheduled",
        }),
        makeItem({
          title: "Long task",
          kind: "task",
          durationMin: 20,
          durationMax: 45,
          flexibility: "elastic",
          status: "inbox",
        }),
      ],
      assignments: [],
      assessments: [],
    }),
  );

  assert.equal(result.availableMinutes, 15);
  assert.equal(result.recommendations.length, 0);
});

test("an assignment minimum overrides a shorter focus template", () => {
  const result = recommendNow(
    input({
      items: [],
      assessments: [],
      assignments: [
        assignment({
          estimatedMinutes: 90,
          minSessionMinutes: 60,
          maxSessionMinutes: 90,
          workType: "reading",
        }),
      ],
    }),
  );

  assert.equal(result.recommendations[0].durationMinutes, 60);
});
