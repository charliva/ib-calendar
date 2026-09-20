// The settings rework dropped the max={180} attributes the old school-day
// form carried, and nothing else bounded the values. The four minute columns
// have CHECK constraints in
// supabase/migrations/20260730220740_school_day_intelligence.sql, so typing
// 999 into "Travel to school" produced a profiles upsert the database refuses
// — which then sat in the outbox retrying every fifteen seconds behind a
// permanent "changes are waiting to sync" notice.
//
// Restoring the attributes is not enough on its own: min/max on a number
// input do not stop a typed value from being submitted. These pin the clamp
// that does.

import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHOOL_DAY_MINUTE_BOUNDS,
  clampSchoolDayMinutes,
} from "../lib/school/minute-bounds.ts";
import {
  DEFAULT_SCHOOL_DAY_SETTINGS,
  normalizeSchoolDaySettings,
} from "../lib/school.ts";

test("the bounds match the database CHECK constraints", () => {
  assert.deepEqual(SCHOOL_DAY_MINUTE_BOUNDS.travelBeforeSchoolMinutes, {
    min: 0,
    max: 180,
  });
  assert.deepEqual(SCHOOL_DAY_MINUTE_BOUNDS.travelHomeMinutes, {
    min: 0,
    max: 180,
  });
  assert.deepEqual(SCHOOL_DAY_MINUTE_BOUNDS.recoveryAfterHomeMinutes, {
    min: 0,
    max: 180,
  });
  // The column allows 10; the app has always been stricter, because a gap
  // shorter than 45 minutes is not usable study time.
  assert.deepEqual(SCHOOL_DAY_MINUTE_BOUNDS.minimumFreePeriodMinutes, {
    min: 45,
    max: 180,
  });
});

test("clamping forces a value into range", () => {
  assert.equal(clampSchoolDayMinutes("travelHomeMinutes", 999), 180);
  assert.equal(clampSchoolDayMinutes("travelHomeMinutes", -5), 0);
  assert.equal(clampSchoolDayMinutes("travelHomeMinutes", 45), 45);
  assert.equal(clampSchoolDayMinutes("minimumFreePeriodMinutes", 10), 45);
  assert.equal(clampSchoolDayMinutes("minimumFreePeriodMinutes", 300), 180);
});

test("an emptied number input does not poison the row", () => {
  // <input type="number"> with no value reads back as "" -> Number("") is 0,
  // but a partially typed "-" or "e" gives NaN.
  assert.equal(clampSchoolDayMinutes("travelHomeMinutes", NaN), 0);
  assert.equal(clampSchoolDayMinutes("minimumFreePeriodMinutes", NaN), 45);
  assert.equal(clampSchoolDayMinutes("travelHomeMinutes", 30.7), 31);
});

test("normalizing settings bounds every minute field", () => {
  const normalized = normalizeSchoolDaySettings({
    ...DEFAULT_SCHOOL_DAY_SETTINGS,
    travelBeforeSchoolMinutes: 999,
    travelHomeMinutes: -10,
    recoveryAfterHomeMinutes: 1440,
    minimumFreePeriodMinutes: 5,
  });

  assert.equal(normalized.travelBeforeSchoolMinutes, 180);
  assert.equal(normalized.travelHomeMinutes, 0);
  assert.equal(normalized.recoveryAfterHomeMinutes, 180);
  assert.equal(normalized.minimumFreePeriodMinutes, 45);
});

test("settings already in range are left exactly as they are", () => {
  const settings = {
    ...DEFAULT_SCHOOL_DAY_SETTINGS,
    travelBeforeSchoolMinutes: 25,
    travelHomeMinutes: 25,
    recoveryAfterHomeMinutes: 40,
    minimumFreePeriodMinutes: 50,
  };
  const normalized = normalizeSchoolDaySettings(settings);

  assert.equal(normalized.travelBeforeSchoolMinutes, 25);
  assert.equal(normalized.travelHomeMinutes, 25);
  assert.equal(normalized.recoveryAfterHomeMinutes, 40);
  assert.equal(normalized.minimumFreePeriodMinutes, 50);
});
