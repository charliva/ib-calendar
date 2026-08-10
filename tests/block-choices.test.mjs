import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlockChoice,
  inferCurrentTimeBlock,
  updateBlockChoice,
} from "../lib/block-choices.ts";
import {
  makeItem,
  TIMETABLE_IMPORT_MARKER,
} from "../lib/calendar-engine.ts";
import { makeIntention } from "../lib/intentions.ts";
import { DEFAULT_SCHOOL_DAY_SETTINGS } from "../lib/school.ts";

const settings = {
  ...DEFAULT_SCHOOL_DAY_SETTINGS,
  travelHomeMinutes: 30,
  travelBeforeSchoolMinutes: 30,
  schoolworkCutoff: "21:00",
};

function importedClass(title, startsAt, endsAt) {
  return makeItem({
    title,
    kind: "event",
    startsAt,
    endsAt,
    durationMin: 60,
    durationMax: 60,
    flexibility: "fixed",
    constraints: [TIMETABLE_IMPORT_MARKER],
    status: "scheduled",
    source: "document",
  });
}

function assignment(overrides = {}) {
  return {
    id: "chemistry-homework",
    subjectId: null,
    title: "Chemistry questions",
    dueAt: "2026-08-11T18:00:00.000Z",
    estimatedMinutes: 60,
    priority: "high",
    status: "inbox",
    submissionMethod: "",
    notes: "",
    gradeWeight: null,
    taskContext: "home",
    computerRequired: false,
    workType: "problem_solving",
    requiredEnergy: "medium",
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: "08:00",
    allowedWindowEnd: "21:00",
    minSessionMinutes: 20,
    maxSessionMinutes: 45,
    splittable: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    now: new Date("2026-08-10T15:00:00.000Z"),
    items: [
      importedClass(
        "Chemistry",
        "2026-08-10T08:30:00.000Z",
        "2026-08-10T09:30:00.000Z",
      ),
      importedClass(
        "English",
        "2026-08-10T13:00:00.000Z",
        "2026-08-10T14:00:00.000Z",
      ),
    ],
    assignments: [assignment()],
    assessments: [],
    intentions: [
      makeIntention({
        id: "calendar-project",
        title: "Work on the calendar app",
        notes: "Build one useful interaction.",
        taskContext: "home",
        workType: "creative_project",
        preferredSessionMinutes: 60,
        allowedWindowStart: "00:00",
        allowedWindowEnd: "23:59",
      }),
    ],
    explorations: [],
    subjects: [],
    classes: [],
    classExceptions: [],
    settings,
    currentEnergy: "medium",
    computerAvailable: true,
    learningSignals: [],
    recentChoices: [],
    ...overrides,
  };
}

test("builds exactly one recovery, responsibility, and meaningful path", () => {
  const choice = buildBlockChoice(input());
  assert.ok(choice);
  assert.equal(choice.context.label, "After school");
  assert.equal(choice.suggestions.length, 3);
  assert.deepEqual(
    choice.suggestions.map((suggestion) => suggestion.category),
    ["recovery", "responsibility", "meaningful"],
  );
  assert.equal(choice.suggestions[1].title, "Chemistry questions");
  assert.equal(choice.suggestions[2].title, "Work on the calendar app");
  assert.ok(
    choice.suggestions.every(
      (suggestion) =>
        suggestion.estimatedDuration > 0 &&
        suggestion.estimatedDuration <= choice.context.availableMinutes,
    ),
  );
});

test("does not offer three paths during a fixed event", () => {
  const now = new Date("2026-08-10T13:30:00.000Z");
  const fixedInput = input({ now });
  const block = inferCurrentTimeBlock(fixedInput);
  assert.equal(block.context.flexible, false);
  assert.equal(buildBlockChoice(fixedInput), null);
});

test("keeps every option inside a very short remaining block", () => {
  const choice = buildBlockChoice(
    input({
      now: new Date("2026-08-10T15:55:00.000Z"),
      assignments: [],
      intentions: [],
    }),
  );
  assert.ok(choice);
  assert.equal(choice.context.availableMinutes, 5);
  assert.deepEqual(
    choice.suggestions.map((suggestion) => suggestion.estimatedDuration),
    [5, 5, 5],
  );
});

test("selecting a path changes only lightweight block state", () => {
  const choice = buildBlockChoice(input());
  assert.ok(choice);
  const meaningful = choice.suggestions[2];
  const selected = updateBlockChoice(
    choice,
    meaningful.id,
    "selected",
    new Date("2026-08-10T15:01:00.000Z"),
  );
  assert.equal(selected.selectedSuggestionId, meaningful.id);
  assert.equal(selected.status, "selected");
  assert.equal(input().items.length, 2);

  const changed = updateBlockChoice(
    selected,
    null,
    "suggested",
    new Date("2026-08-10T15:02:00.000Z"),
  );
  assert.equal(changed.selectedSuggestionId, null);
  assert.equal(changed.status, "suggested");
});

test("treats an active sleepover as context instead of occupying the whole block", () => {
  const sleepover = makeItem({
    title: "Sleepover at Ida",
    kind: "event",
    startsAt: "2026-08-10T00:00:00.000Z",
    endsAt: "2026-08-11T00:00:00.000Z",
    durationMin: 24 * 60,
    durationMax: 24 * 60,
    flexibility: "fixed",
    status: "scheduled",
  });
  const sleepoverInput = input({
    items: [...input().items, sleepover],
    assignments: [],
  });
  const block = inferCurrentTimeBlock(sleepoverInput);
  const choice = buildBlockChoice(sleepoverInput);

  assert.equal(block.context.flexible, true);
  assert.deepEqual(block.context.activeEventTitles, ["Sleepover at Ida"]);
  assert.ok(choice);
  assert.equal(choice.suggestions[0].title, "Take a quiet breather");
  assert.equal(choice.suggestions[2].title, "Be present with the people here");
});

test("uses flexible timed events as context but fixed timed appointments still occupy attention", () => {
  const flexiblePlan = makeItem({
    title: "See a friend",
    kind: "event",
    startsAt: "2026-08-10T14:30:00.000Z",
    endsAt: "2026-08-10T16:30:00.000Z",
    durationMin: 120,
    durationMax: 120,
    flexibility: "flexible",
    status: "scheduled",
  });
  const flexibleInput = input({ items: [...input().items, flexiblePlan] });
  assert.equal(inferCurrentTimeBlock(flexibleInput).context.flexible, true);
  assert.ok(buildBlockChoice(flexibleInput));

  const appointment = makeItem({
    ...flexiblePlan,
    id: "dentist",
    title: "Dentist",
    flexibility: "fixed",
  });
  const fixedInput = input({ items: [...input().items, appointment] });
  assert.equal(inferCurrentTimeBlock(fixedInput).context.fixedTitle, "Dentist");
  assert.equal(buildBlockChoice(fixedInput), null);
});

test("anchors the school context at the first and last class starts", () => {
  const betweenClasses = input({ now: new Date("2026-08-10T10:00:00.000Z") });
  const block = inferCurrentTimeBlock(betweenClasses);

  assert.equal(block.type, "school");
  assert.equal(block.context.label, "School gap");
  assert.equal(block.context.schoolStartsAt, "2026-08-10T08:30:00.000Z");
  assert.equal(block.context.schoolEndsAt, "2026-08-10T13:00:00.000Z");

  const lastClass = inferCurrentTimeBlock(
    input({ now: new Date("2026-08-10T13:30:00.000Z") }),
  );
  assert.equal(lastClass.context.flexible, false);
  assert.equal(lastClass.context.label, "Class time");
});

test("handles one-class and no-class days without inventing a school gap", () => {
  const oneClass = importedClass(
    "Chemistry",
    "2026-08-10T08:30:00.000Z",
    "2026-08-10T09:30:00.000Z",
  );
  const afterOnlyClass = inferCurrentTimeBlock(
    input({
      now: new Date("2026-08-10T10:30:00.000Z"),
      items: [oneClass],
    }),
  );
  assert.equal(afterOnlyClass.type, "after_school");
  assert.equal(afterOnlyClass.context.schoolStartsAt, "2026-08-10T08:30:00.000Z");
  assert.equal(afterOnlyClass.context.schoolEndsAt, "2026-08-10T08:30:00.000Z");

  const noClass = inferCurrentTimeBlock(
    input({
      now: new Date("2026-08-10T15:00:00.000Z"),
      items: [],
    }),
  );
  assert.equal(noClass.type, "after_school");
  assert.equal(noClass.context.label, "Afternoon");
  assert.equal(noClass.context.schoolStartsAt, null);
  assert.equal(noClass.context.schoolEndsAt, null);
});

test("chooses concrete light, useful, and meaningful activities from contextual pools", () => {
  const choice = buildBlockChoice(
    input({
      assignments: [],
      intentions: [],
      explorations: [],
      items: input().items,
    }),
  );
  assert.ok(choice);
  assert.match(
    choice.suggestions[0].title,
    /Lie down|calming game|music|Gilmore Girls|yoga/,
  );
  assert.match(
    choice.suggestions[1].title,
    /10-minute clean|Read a book|Organize school work/,
  );
  assert.match(choice.suggestions[2].title, /Journal|Write|walk/);
});
