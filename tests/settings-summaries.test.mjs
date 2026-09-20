import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_ONBOARDING_STATE } from "../lib/onboarding/state.ts";
import { DEFAULT_SCHOOL_DAY_SETTINGS } from "../lib/school.ts";
import { anchorForWeekOf } from "../lib/school/week-pattern.ts";
import {
  onboardingSummary,
  profileSummary,
  schoolDaySummary,
  syncSummary,
  weekCycleSummary,
} from "../lib/settings/summaries.ts";

test("the school day reads as times, not as a description of itself", () => {
  assert.equal(
    schoolDaySummary(DEFAULT_SCHOOL_DAY_SETTINGS),
    "08:00–15:00 · study 16:00–19:00",
  );
});

test("a timetable with no alternating lessons says so plainly", () => {
  assert.equal(
    weekCycleSummary(DEFAULT_SCHOOL_DAY_SETTINGS, false, new Date(2026, 8, 16)),
    "Same every week",
  );
});

test("an alternating timetable names the week you are in", () => {
  const today = new Date(2026, 8, 16);
  const settings = {
    ...DEFAULT_SCHOOL_DAY_SETTINGS,
    weekPatternAnchor: anchorForWeekOf(today, "b"),
  };
  assert.equal(
    weekCycleSummary(settings, true, today),
    "Alternates · this is Week B",
  );
});

test("the profile row falls back to the timezone when unnamed", () => {
  assert.equal(
    profileSummary({ displayName: "", timezone: "Europe/Copenhagen" }),
    "Europe/Copenhagen",
  );
  assert.equal(
    profileSummary({ displayName: "  Ada ", timezone: "Europe/London" }),
    "Ada · Europe/London",
  );
});

test("getting started reports progress rather than a description", () => {
  assert.equal(onboardingSummary(EMPTY_ONBOARDING_STATE, 3), "Not started");
  assert.equal(
    onboardingSummary(
      { ...EMPTY_ONBOARDING_STATE, completedSteps: ["subjects"] },
      3,
    ),
    "1 of 3 steps done",
  );
  assert.equal(
    onboardingSummary(
      { ...EMPTY_ONBOARDING_STATE, completedAt: "2026-09-01T00:00:00.000Z" },
      3,
    ),
    "Walkthrough finished",
  );
});

test("sync reports the worst thing that is true", () => {
  assert.equal(
    syncSummary({ hasAccount: false, pendingCount: 4, failedCount: 2 }),
    "This device only",
  );
  assert.equal(
    syncSummary({ hasAccount: true, pendingCount: 4, failedCount: 2 }),
    "2 changes need attention",
  );
  assert.equal(
    syncSummary({ hasAccount: true, pendingCount: 1, failedCount: 0 }),
    "1 waiting to sync",
  );
  assert.equal(
    syncSummary({ hasAccount: true, pendingCount: 0, failedCount: 0 }),
    "Everything synced",
  );
});
