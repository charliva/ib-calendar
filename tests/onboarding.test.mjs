import assert from "node:assert/strict";
import test from "node:test";
import { TIMETABLE_IMPORT_MARKER, makeItem } from "../lib/calendar-engine.ts";
import {
  INACTIVITY_THRESHOLD_DAYS,
  daysAway,
  isReturningUser,
  latestSeenAt,
} from "../lib/onboarding/activity.ts";
import { resolveOnboardingEntry } from "../lib/onboarding/entry.ts";
import {
  buildStalenessReport,
  releaseStaleItem,
} from "../lib/onboarding/staleness.ts";
import {
  EMPTY_ONBOARDING_STATE,
  mergeOnboardingState,
  readOnboardingState,
  withStepCompleted,
} from "../lib/onboarding/state.ts";
import {
  ONBOARDING_STEPS,
  REQUIRED_STEP_IDS,
  nextStep,
  satisfiedSteps,
  stepById,
} from "../lib/onboarding/steps.ts";

const NOW = new Date("2026-09-19T10:00:00.000Z");
const daysAgo = (count) =>
  new Date(NOW.getTime() - count * 86_400_000).toISOString();

function entry(overrides = {}) {
  return resolveOnboardingEntry({
    cloudLoaded: true,
    isOnline: true,
    state: EMPTY_ONBOARDING_STATE,
    subjectCount: 0,
    lessonCount: 0,
    lastSeenAt: null,
    now: NOW,
    ...overrides,
  });
}

test("a student away longer than the threshold counts as returning", () => {
  assert.equal(isReturningUser(daysAgo(INACTIVITY_THRESHOLD_DAYS), NOW), true);
  assert.equal(
    isReturningUser(daysAgo(INACTIVITY_THRESHOLD_DAYS - 1), NOW),
    false,
  );
  assert.equal(isReturningUser(null, NOW), false);
});

test("a last-seen stamp from the future is treated as just now", () => {
  const tomorrow = new Date(NOW.getTime() + 86_400_000).toISOString();
  assert.equal(daysAway(tomorrow, NOW), 0);
  assert.equal(isReturningUser(tomorrow, NOW), false);
});

test("the more recent of a device and account stamp wins", () => {
  assert.equal(latestSeenAt(daysAgo(30), daysAgo(2)), daysAgo(2));
  assert.equal(latestSeenAt(daysAgo(2), null), daysAgo(2));
  assert.equal(latestSeenAt(null, null), null);
});

test("nothing is decided until the account snapshot has resolved", () => {
  assert.equal(entry({ cloudLoaded: false }).mode, "none");
  assert.equal(entry({ cloudLoaded: false, lastSeenAt: daysAgo(40) }).mode, "none");
});

test("an offline session never starts onboarding", () => {
  assert.equal(entry({ isOnline: false }).mode, "none");
});

test("an empty calendar is a new user however long they were away", () => {
  const result = entry({ lastSeenAt: daysAgo(40) });
  assert.equal(result.mode, "new");
  assert.equal(result.awayDays, 40);
});

test("part-finished setup resumes rather than restarting", () => {
  const state = { ...EMPTY_ONBOARDING_STATE, completedSteps: ["subjects"] };
  assert.equal(entry({ state, subjectCount: 2 }).mode, "resuming");
  assert.equal(entry({ state }).mode, "resuming");
});

test("a real calendar plus a long absence is a returning user", () => {
  const state = { ...EMPTY_ONBOARDING_STATE, completedAt: daysAgo(90) };
  const result = entry({
    state,
    subjectCount: 6,
    lessonCount: 30,
    lastSeenAt: daysAgo(25),
  });
  assert.equal(result.mode, "returning");
  assert.equal(result.awayDays, 25);
});

test("a student who finished setup and uses the app sees nothing", () => {
  const state = { ...EMPTY_ONBOARDING_STATE, completedAt: daysAgo(90) };
  assert.equal(
    entry({ state, subjectCount: 6, lessonCount: 30, lastSeenAt: daysAgo(1) })
      .mode,
    "none",
  );
});

test("a dismissed setup is not forced back on the student", () => {
  const state = {
    ...EMPTY_ONBOARDING_STATE,
    completedSteps: ["subjects"],
    dismissedAt: daysAgo(5),
  };
  assert.equal(entry({ state, subjectCount: 4, lessonCount: 12 }).mode, "none");
});

test("the developer override bypasses every rule", () => {
  assert.equal(
    entry({ cloudLoaded: false, forcedMode: "returning" }).mode,
    "returning",
  );
});

test("completion merges as a union across devices", () => {
  const laptop = { ...EMPTY_ONBOARDING_STATE, completedSteps: ["subjects", "timetable"] };
  const phone = { ...EMPTY_ONBOARDING_STATE, completedSteps: ["subjects"] };
  const merged = mergeOnboardingState(laptop, phone);
  assert.deepEqual(merged.completedSteps.sort(), ["subjects", "timetable"]);
});

test("progress recorded against an older step list is discarded", () => {
  assert.deepEqual(
    readOnboardingState({ version: 0, completedSteps: ["subjects"] }),
    EMPTY_ONBOARDING_STATE,
  );
  assert.deepEqual(readOnboardingState(null), EMPTY_ONBOARDING_STATE);
  assert.deepEqual(readOnboardingState("nonsense"), EMPTY_ONBOARDING_STATE);
});

test("finishing every required step marks setup complete", () => {
  let state = EMPTY_ONBOARDING_STATE;
  for (const id of REQUIRED_STEP_IDS) {
    state = withStepCompleted(state, id, REQUIRED_STEP_IDS, NOW.toISOString());
  }
  assert.equal(state.completedAt, NOW.toISOString());
  assert.equal(state.dismissedAt, null);
});

test("finishing a step clears an earlier dismissal", () => {
  const dismissed = { ...EMPTY_ONBOARDING_STATE, dismissedAt: daysAgo(3) };
  const resumed = withStepCompleted(
    dismissed,
    "subjects",
    REQUIRED_STEP_IDS,
    NOW.toISOString(),
  );
  assert.equal(resumed.dismissedAt, null);
});

test("the step list runs setup before the concepts that depend on it", () => {
  const ids = ONBOARDING_STEPS.map((step) => step.id);
  assert.ok(ids.indexOf("subjects") < ids.indexOf("timetable"));
  assert.ok(ids.indexOf("timetable") < ids.indexOf("flexible-blocks"));
  assert.deepEqual(REQUIRED_STEP_IDS, ["subjects", "timetable", "school-day"]);
});

test("a replay skips setup steps whose data already exists", () => {
  assert.deepEqual(
    satisfiedSteps({ subjectCount: 5, lessonCount: 20, hasSchoolDaySettings: true }),
    ["subjects", "timetable", "school-day"],
  );
  assert.deepEqual(
    satisfiedSteps({ subjectCount: 0, lessonCount: 0, hasSchoolDaySettings: false }),
    [],
  );
});

test("the next step is the first one outstanding", () => {
  assert.equal(nextStep([]).id, "welcome");
  assert.equal(nextStep(["welcome", "subjects"]).id, "timetable");
  assert.equal(nextStep(ONBOARDING_STEPS.map((step) => step.id)), null);
});

test("work left scheduled in the past is reported as stranded", () => {
  const items = [
    makeItem({
      id: "essay",
      kind: "task",
      title: "History essay",
      status: "scheduled",
      flexibility: "flexible",
      durationMin: 60,
      startsAt: daysAgo(20),
      endsAt: daysAgo(20),
    }),
    makeItem({
      id: "lesson",
      kind: "event",
      title: "Physics",
      status: "scheduled",
      flexibility: "fixed",
      startsAt: daysAgo(20),
      endsAt: daysAgo(20),
      constraints: [TIMETABLE_IMPORT_MARKER, "Week of 2026-08-24"],
    }),
    makeItem({
      id: "future",
      kind: "task",
      title: "Maths problems",
      status: "scheduled",
      flexibility: "flexible",
      startsAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
      endsAt: new Date(NOW.getTime() + 90_000_000).toISOString(),
    }),
  ];
  const report = buildStalenessReport({
    items,
    now: NOW,
    currentWeekStart: new Date("2026-09-14T00:00:00.000Z"),
    pendingMutationCount: 4,
    awayDays: 21,
  });
  assert.deepEqual(
    report.strandedItems.map((item) => item.id),
    ["essay"],
  );
  assert.equal(report.strandedMinutes, 60);
  assert.equal(report.latestImportedWeek, "2026-08-24");
  assert.equal(report.timetableCoversCurrentWeek, false);
  assert.equal(report.pendingMutationCount, 4);
});

test("releasing a stranded item clears the constraints that block a re-plan", () => {
  const item = makeItem({
    id: "revision",
    kind: "task",
    title: "Revise topic 3",
    status: "scheduled",
    flexibility: "flexible",
    startsAt: daysAgo(20),
    endsAt: daysAgo(20),
    windowStart: daysAgo(21),
    windowEnd: daysAgo(20),
    deadline: daysAgo(19),
  });
  const released = releaseStaleItem(item, NOW);
  assert.equal(released.status, "inbox");
  assert.equal(released.startsAt, null);
  assert.equal(released.endsAt, null);
  assert.equal(released.windowStart, null);
  assert.equal(released.windowEnd, null);
  assert.equal(released.deadline, null);
});

test("releasing keeps a due date that has not passed yet", () => {
  const future = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();
  const item = makeItem({
    id: "coursework",
    kind: "task",
    title: "Coursework draft",
    status: "scheduled",
    flexibility: "flexible",
    startsAt: daysAgo(5),
    endsAt: daysAgo(5),
    deadline: future,
  });
  const released = releaseStaleItem(item, NOW);
  assert.equal(released.deadline, future);
  assert.equal(released.status, "inbox");
});

test("every anchored step says where its anchor can be found", () => {
  // A coachmark cannot point at an element that is not rendered. Three of these
  // anchors only exist in a particular view, and one only once the work dock is
  // open, so a step that names an anchor must also say how to reveal it.
  const anchored = ONBOARDING_STEPS.filter((step) => step.anchor);
  assert.ok(anchored.length > 0);
  for (const step of anchored) {
    assert.ok(
      step.requiresView || step.requiresDock || step.anchor === "settings",
      `step "${step.id}" anchors to "${step.anchor}" without saying how to reveal it`,
    );
  }
});

test("steps that render as centred cards need no view", () => {
  for (const step of ONBOARDING_STEPS.filter((step) => !step.anchor)) {
    assert.equal(step.requiresView, undefined);
    assert.equal(step.requiresDock, undefined);
  }
});

test("the subject and timetable steps both live in the school workspace", () => {
  assert.equal(stepById("subjects").requiresView, "school");
  assert.equal(stepById("timetable").requiresView, "school");
  assert.equal(stepById("capture").requiresView, "upcoming");
  assert.equal(stepById("flexible-blocks").requiresDock, true);
});
