// Two ways the school-day settings form lost a student's work.
//
//  1. It reset its draft whenever the settings prop changed identity.
//     rowToSchoolDaySettings builds a fresh object literal on every read and
//     the account snapshot is re-read every fifteen seconds, so that fired on
//     every poll — roughly four times a minute, whatever the student was
//     typing. Comparison has to be by value.
//
//  2. All seven clock fields land in `time not null` columns. An emptied
//     <input type="time"> reads back "", and the form's ordering guards only
//     catch that at the end of a pair, because "15:00" <= "" is false. An
//     emptied *start* reached the upsert, Postgres answered `invalid input
//     syntax for type time: ""`, and the mutation retried in the outbox behind
//     a permanent "waiting to sync" notice until it was dead-lettered.

import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHOOL_DAY_TIME_FIELDS,
  clampSchoolDayTime,
  isSchoolDayTime,
} from "../lib/school/time-fields.ts";
import { sameSchoolDaySettings } from "../lib/school/settings-equality.ts";
import {
  DEFAULT_SCHOOL_DAY_SETTINGS,
  normalizeSchoolDaySettings,
} from "../lib/school.ts";

test("every time column the row builder writes is covered", () => {
  assert.deepEqual([...SCHOOL_DAY_TIME_FIELDS], [
    "schoolDayStart",
    "schoolDayEnd",
    "schoolworkCutoff",
    "preferredStudyStart",
    "preferredStudyEnd",
    "lowEnergyStart",
    "lowEnergyEnd",
  ]);
});

test("a real clock time is recognised, a half-typed one is not", () => {
  assert.equal(isSchoolDayTime("08:00"), true);
  assert.equal(isSchoolDayTime("23:59"), true);
  assert.equal(isSchoolDayTime("08:00:30"), true);
  assert.equal(isSchoolDayTime(""), false);
  assert.equal(isSchoolDayTime("8:00"), false);
  assert.equal(isSchoolDayTime("24:00"), false);
  assert.equal(isSchoolDayTime("08:60"), false);
  assert.equal(isSchoolDayTime(null), false);
  assert.equal(isSchoolDayTime(undefined), false);
});

test("an emptied field falls back rather than reaching the column", () => {
  assert.equal(clampSchoolDayTime("", "08:00"), "08:00");
  assert.equal(clampSchoolDayTime(null, "16:00"), "16:00");
  assert.equal(clampSchoolDayTime("nonsense", "21:00"), "21:00");
  assert.equal(clampSchoolDayTime("09:30", "08:00"), "09:30");
  // Seconds are dropped so two equal times compare equal.
  assert.equal(clampSchoolDayTime("09:30:00", "08:00"), "09:30");
});

test("normalizing repairs an emptied start, which the ordering guards miss", () => {
  const normalized = normalizeSchoolDaySettings({
    ...DEFAULT_SCHOOL_DAY_SETTINGS,
    schoolDayStart: "",
    lowEnergyStart: "",
  });
  assert.equal(normalized.schoolDayStart, DEFAULT_SCHOOL_DAY_SETTINGS.schoolDayStart);
  assert.equal(normalized.lowEnergyStart, DEFAULT_SCHOOL_DAY_SETTINGS.lowEnergyStart);
  // "15:00" <= "" is false, which is exactly why the form let this through.
  assert.equal(DEFAULT_SCHOOL_DAY_SETTINGS.schoolDayEnd <= "", false);
});

test("times the student actually chose are left alone", () => {
  const chosen = {
    ...DEFAULT_SCHOOL_DAY_SETTINGS,
    schoolDayStart: "08:25",
    schoolDayEnd: "15:40",
    preferredStudyStart: "16:30",
  };
  const normalized = normalizeSchoolDaySettings(chosen);
  assert.equal(normalized.schoolDayStart, "08:25");
  assert.equal(normalized.schoolDayEnd, "15:40");
  assert.equal(normalized.preferredStudyStart, "16:30");
});

test("a re-read of unchanged settings is recognised as unchanged", () => {
  // This is the poll: same values, brand new object.
  const fromPoll = { ...DEFAULT_SCHOOL_DAY_SETTINGS, focusTemplates: { ...DEFAULT_SCHOOL_DAY_SETTINGS.focusTemplates } };
  assert.notEqual(fromPoll, DEFAULT_SCHOOL_DAY_SETTINGS);
  assert.equal(sameSchoolDaySettings(fromPoll, DEFAULT_SCHOOL_DAY_SETTINGS), true);
});

test("a genuine change is still seen", () => {
  assert.equal(
    sameSchoolDaySettings(DEFAULT_SCHOOL_DAY_SETTINGS, {
      ...DEFAULT_SCHOOL_DAY_SETTINGS,
      schoolDayStart: "09:00",
    }),
    false,
  );
  assert.equal(
    sameSchoolDaySettings(DEFAULT_SCHOOL_DAY_SETTINGS, {
      ...DEFAULT_SCHOOL_DAY_SETTINGS,
      minimumFreePeriodMinutes: 60,
    }),
    false,
  );
});

test("a change buried in the focus templates is seen too", () => {
  const types = Object.keys(DEFAULT_SCHOOL_DAY_SETTINGS.focusTemplates);
  const first = types[0];
  const template = DEFAULT_SCHOOL_DAY_SETTINGS.focusTemplates[first];
  const field = Object.keys(template)[0];
  assert.equal(
    sameSchoolDaySettings(DEFAULT_SCHOOL_DAY_SETTINGS, {
      ...DEFAULT_SCHOOL_DAY_SETTINGS,
      focusTemplates: {
        ...DEFAULT_SCHOOL_DAY_SETTINGS.focusTemplates,
        [first]: { ...template, [field]: template[field] + 1 },
      },
    }),
    false,
  );
});
