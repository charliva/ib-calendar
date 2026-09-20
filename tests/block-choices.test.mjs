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

test("builds at most two paths, led by recovery", () => {
  const choice = buildBlockChoice(input());
  assert.ok(choice);
  assert.equal(choice.context.label, "After school");
  assert.ok(choice.suggestions.length >= 1 && choice.suggestions.length <= 2);
  assert.equal(choice.suggestions[0].category, "recovery");
  const categories = choice.suggestions.map((suggestion) => suggestion.category);
  assert.equal(new Set(categories).size, categories.length, "categories must be unique");
  // The meaningful suggestion no longer surfaces user intentions. It picks
  // from PERSONAL_TEMPLATES instead. The test fixture's intention must not
  // reach the panel.
  for (const suggestion of choice.suggestions) {
    assert.notEqual(suggestion.sourceType, "intention");
    assert.notEqual(suggestion.sourceType, "exploration");
  }
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
  // Picker emits at most 2 suggestions in PR1. With a 5-minute block and
  // no assignments or intentions, recovery and responsibility are the only
  // candidates, both clamped to 5.
  assert.ok(choice.suggestions.length >= 1 && choice.suggestions.length <= 2);
  for (const suggestion of choice.suggestions) {
    assert.equal(suggestion.estimatedDuration, 5);
  }
});

test("selecting a path changes only lightweight block state", () => {
  const choice = buildBlockChoice(input());
  assert.ok(choice);
  const target = choice.suggestions.find(
    (suggestion) => suggestion.category !== "recovery",
  ) ?? choice.suggestions[0];
  const selected = updateBlockChoice(
    choice,
    target.id,
    "selected",
    new Date("2026-08-10T15:01:00.000Z"),
  );
  assert.equal(selected.selectedSuggestionId, target.id);
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
  // The socialContext short-circuit in the old meaningfulSuggestion has been
  // removed. The Wind-down lane still uses socialContext to pick "Take a quiet
  // breather"; the Personal lane now comes from PERSONAL_TEMPLATES and does
  // not special-case social plans. The test asserts recovery still adapts to
  // the ambient context.
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

test("chooses recovery and useful paths from contextual pools, and never emits Gilmore Girls", () => {
  const choice = buildBlockChoice(
    input({
      assignments: [],
      intentions: [],
      explorations: [],
      items: input().items,
    }),
  );
  assert.ok(choice);
  assert.ok(choice.suggestions.length >= 1 && choice.suggestions.length <= 2);
  // Recovery comes from the lightActivities pool. Gilmore Girls has been
  // removed; the other entries remain.
  assert.match(
    choice.suggestions[0].title,
    /Lie down|calming game|music|yoga/,
  );
  // The chokepoint must drop any suggestion whose title or description
  // contains a blocked term, regardless of where it came from.
  for (const suggestion of choice.suggestions) {
    assert.ok(!/Gilmore Girls/i.test(suggestion.title));
    assert.ok(!/Gilmore Girls/i.test(suggestion.description));
  }
});

// INTEGRATION TESTS FOR THE CHOKEPORT INVARIANT (PR1).
//
// The unit tests in tests/block-suggestion-safety.test.mjs cover the filter
// in isolation. The tests in this file assert the integration: the picker
// at lib/block-choices.ts (buildBlockChoice) must route every emitted
// suggestion through filterSuggestionsForPicker, must not surface user
// intentions or explorations, and must drop any suggestion that would
// contain a blocked brand name even if the input tries to inject one.

test("integration: buildBlockChoice never surfaces user intentions", () => {
  const brandedIntention = makeIntention({
    id: "watch-gilmore",
    title: "Watch Gilmore Girls with Sam",
    notes: "Just one episode.",
    taskContext: "home",
    workType: "creative_project",
    preferredSessionMinutes: 30,
    allowedWindowStart: "00:00",
    allowedWindowEnd: "23:59",
  });
  const choice = buildBlockChoice(
    input({
      intentions: [brandedIntention],
    }),
  );
  assert.ok(choice, "picker should still produce a choice");
  for (const suggestion of choice.suggestions) {
    assert.notEqual(
      suggestion.sourceType,
      "intention",
      `intention must not reach the panel: ${suggestion.title}`,
    );
    assert.ok(
      !/Gilmore Girls/i.test(suggestion.title),
      `blocked term leaked into title: ${suggestion.title}`,
    );
    assert.ok(
      !/Gilmore Girls/i.test(suggestion.description),
      `blocked term leaked into description: ${suggestion.description}`,
    );
  }
});

test("integration: buildBlockChoice never surfaces explorations", () => {
  const exploration = {
    id: "explore-gilmore",
    sourceTitle: "Gilmore Girls rewatch thread",
    framing: "Why does the show still feel relevant?",
    status: "saved",
    directions: [
      { prompt: "Compare its pacing to modern prestige TV." },
    ],
  };
  const choice = buildBlockChoice(
    input({
      explorations: [exploration],
    }),
  );
  assert.ok(choice, "picker should still produce a choice");
  for (const suggestion of choice.suggestions) {
    assert.notEqual(
      suggestion.sourceType,
      "exploration",
      `exploration must not reach the panel: ${suggestion.title}`,
    );
  }
});

test("integration: buildBlockChoice emits at most two suggestions, no matter the input", () => {
  // Heavy input: 5 assignments due, 3 intentions, 2 explorations. The picker
  // still must cap at 2.
  const manyAssignments = Array.from({ length: 5 }, (_, i) =>
    assignment({ id: `a-${i}`, title: `Assignment ${i}` }),
  );
  const manyIntentions = Array.from({ length: 3 }, (_, i) =>
    makeIntention({
      id: `i-${i}`,
      title: `Intention ${i}`,
      taskContext: "home",
      workType: "creative_project",
      preferredSessionMinutes: 20,
      allowedWindowStart: "00:00",
      allowedWindowEnd: "23:59",
    }),
  );
  const choice = buildBlockChoice(
    input({
      assignments: manyAssignments,
      intentions: manyIntentions,
      explorations: [
        {
          id: "e-0",
          sourceTitle: "Source 0",
          framing: "Frame 0",
          status: "saved",
          directions: [{ prompt: "Direction 0" }],
        },
      ],
    }),
  );
  assert.ok(choice, "picker should still produce a choice");
  assert.ok(
    choice.suggestions.length >= 1 && choice.suggestions.length <= 2,
    `picker must cap at 2, got ${choice.suggestions.length}`,
  );
  // First suggestion is always recovery in PR1.
  assert.equal(choice.suggestions[0].category, "recovery");
});

test("integration: buildBlockChoice returns null when safety filter drops everything", () => {
  // Use a now-time that is during a fixed event so buildBlockChoice cannot
  // even start. This is the existing "no flexible block" path and confirms
  // the picker can return null cleanly.
  const fixed = input({
    now: new Date("2026-08-10T13:30:00.000Z"),
  });
  assert.equal(buildBlockChoice(fixed), null);
});

test("integration: personal templates drive the meaningful lane in low energy", () => {
  const choice = buildBlockChoice(
    input({
      assignments: [],
      intentions: [],
      explorations: [],
      items: input().items,
      currentEnergy: "low",
    }),
  );
  assert.ok(choice);
  const personal = choice.suggestions.find((s) => s.category === "meaningful");
  if (personal) {
    const templateIds = PERSONAL_TEMPLATES.map((t) => t.id);
    assert.ok(
      templateIds.includes(personal.sourceId),
      `meaningful sourceId must come from PERSONAL_TEMPLATES, got ${personal.sourceId}`,
    );
    // In low energy, the title should be the noun fragment from the
    // matching template.
    const template = PERSONAL_TEMPLATES.find((t) => t.id === personal.sourceId);
    assert.equal(personal.title, template.low);
  }
});

test("integration: personal templates drive the meaningful lane in high energy", () => {
  const choice = buildBlockChoice(
    input({
      assignments: [],
      intentions: [],
      explorations: [],
      items: input().items,
      currentEnergy: "high",
    }),
  );
  assert.ok(choice);
  const personal = choice.suggestions.find((s) => s.category === "meaningful");
  if (personal) {
    const template = PERSONAL_TEMPLATES.find((t) => t.id === personal.sourceId);
    assert.equal(personal.title, template.high);
  }
});

test("integration: telemetry is silent unless SYLLABI_DEV_TELEMETRY=true", () => {
  const original = process.env.SYLLABI_DEV_TELEMETRY;
  const captured = [];
  const originalInfo = console.info;
  console.info = (line) => captured.push(line);
  try {
    delete process.env.SYLLABI_DEV_TELEMETRY;
    buildBlockChoice(input());
    assert.equal(
      captured.length,
      0,
      "telemetry must not log when the flag is unset",
    );

    process.env.SYLLABI_DEV_TELEMETRY = "true";
    captured.length = 0;
    buildBlockChoice(input());
    assert.ok(
      captured.length > 0,
      "telemetry must log when the flag is set to 'true'",
    );
    for (const line of captured) {
      const parsed = JSON.parse(line);
      assert.equal(parsed.event, "block_suggestion_emitted");
      assert.ok(["recovery", "responsibility", "meaningful"].includes(parsed.category));
      assert.ok(["low", "medium", "high"].includes(parsed.energy));
    }

    process.env.SYLLABI_DEV_TELEMETRY = "false";
    captured.length = 0;
    buildBlockChoice(input());
    assert.equal(
      captured.length,
      0,
      "telemetry must not log when the flag is 'false'",
    );
  } finally {
    console.info = originalInfo;
    if (original === undefined) {
      delete process.env.SYLLABI_DEV_TELEMETRY;
    } else {
      process.env.SYLLABI_DEV_TELEMETRY = original;
    }
  }
});

// Regression test: rowToBlockChoice must re-validate through the chokepoint
// on read. A row written by a pre-PR1 client (3 suggestions including a
// blocked term, or an out-of-band DB write that bypassed the app) must not
// surface a blocked term to the panel.

import { rowToBlockChoice } from "../lib/block-choices.ts";

test("integration: rowToBlockChoice re-validates through the chokepoint on read", () => {
  const dirtyRow = {
    id: "abc",
    block_key: "2026-08-10T15:00-evening",
    block_type: "evening",
    starts_at: "2026-08-10T15:00:00.000Z",
    ends_at: "2026-08-10T18:00:00.000Z",
    context: { label: "After school", location: "home" },
    suggestions: [
      {
        id: "good",
        category: "meaningful",
        sourceType: "generic",
        sourceId: "walk",
        title: "Take a walk",
        description: "Step outside for a few minutes.",
        estimatedDuration: 20,
        reason: null,
      },
      {
        id: "bad",
        category: "meaningful",
        sourceType: "generic",
        sourceId: "watch-gilmore",
        title: "Watch Gilmore Girls",
        description: "One episode, then done.",
        estimatedDuration: 45,
        reason: null,
      },
    ],
    selected_suggestion_id: null,
    status: "suggested",
    selected_at: null,
  };
  const result = rowToBlockChoice(dirtyRow);
  assert.equal(result.suggestions.length, 1, "the chokepoint must drop the dirty row");
  assert.equal(result.suggestions[0].id, "good");
  assert.ok(!/Gilmore Girls/i.test(result.suggestions[0].title));
});
