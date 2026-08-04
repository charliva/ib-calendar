import assert from "node:assert/strict";
import test from "node:test";
import { planAssignment } from "../lib/assignment-planner.ts";
import {
  detectFreePeriods,
  energyForTime,
  protectedSchoolRanges,
  studySlotSuitability,
  suggestAssignmentForFreePeriod,
} from "../lib/school-day-engine.ts";

const settings = {
  schoolLocation: "Example School",
  schoolDayStart: "08:00",
  schoolDayEnd: "15:00",
  travelBeforeSchoolMinutes: 30,
  travelHomeMinutes: 30,
  recoveryAfterHomeMinutes: 30,
  schoolworkCutoff: "21:00",
  preferredStudyStart: "16:00",
  preferredStudyEnd: "19:00",
  allowCommuteScheduling: false,
  schoolComputerAccess: false,
  minimumFreePeriodMinutes: 20,
  lowEnergyStart: "19:00",
  lowEnergyEnd: "21:00",
  focusTemplates: {},
};

const classes = [
  {
    id: "english",
    subjectId: "english-subject",
    weekday: 5,
    startTime: "10:00",
    endTime: "11:25",
    weekPattern: "every",
    teacher: "",
    room: "",
    validFrom: "2026-01-01",
    validUntil: null,
    createdAt: "",
  },
  {
    id: "biology",
    subjectId: "biology-subject",
    weekday: 5,
    startTime: "12:10",
    endTime: "13:00",
    weekPattern: "every",
    teacher: "",
    room: "",
    validFrom: "2026-01-01",
    validUntil: null,
    createdAt: "",
  },
];

const baseAssignment = {
  id: "reading",
  subjectId: "english-subject",
  title: "English reading",
  dueAt: "2026-08-03T18:00:00.000Z",
  estimatedMinutes: 25,
  priority: "medium",
  status: "inbox",
  submissionMethod: "",
  notes: "",
  gradeWeight: null,
  taskContext: "anywhere",
  computerRequired: false,
  workType: "reading",
  requiredEnergy: "medium",
  allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
  allowedWindowStart: "08:00",
  allowedWindowEnd: "21:00",
  minSessionMinutes: 20,
  maxSessionMinutes: 45,
  splittable: true,
  createdAt: "",
};

test("detects useful gaps between real lesson occurrences", () => {
  const day = new Date("2026-07-31T08:00:00+02:00");
  const periods = detectFreePeriods(classes, [], settings, day, day);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].durationMinutes, 45);
  assert.equal(periods[0].start.getHours(), 11);
  assert.equal(periods[0].start.getMinutes(), 25);
});

test("free-period suggestions reject incompatible contexts and computers", () => {
  const period = detectFreePeriods(
    classes,
    [],
    settings,
    new Date("2026-07-31T08:00:00+02:00"),
    new Date("2026-07-31T08:00:00+02:00"),
  )[0];
  const homeOnly = { ...baseAssignment, id: "home", taskContext: "home" };
  const desktopOnly = {
    ...baseAssignment,
    id: "desktop",
    computerRequired: true,
    priority: "high",
  };
  assert.equal(
    suggestAssignmentForFreePeriod(
      period,
      [homeOnly, desktopOnly, baseAssignment],
      settings,
    )?.id,
    baseAssignment.id,
  );
});

test("protects commute, recovery, cutoff, and context", () => {
  const day = new Date("2026-07-31T08:00:00+02:00");
  const ranges = protectedSchoolRanges(
    classes,
    [],
    settings,
    day,
    day,
    { energyType: "deep_focus" },
  );
  assert.ok(ranges.some((range) => range.kind === "commute"));
  assert.ok(ranges.some((range) => range.kind === "recovery"));

  const afterArrival = studySlotSuitability(
    new Date("2026-07-31T13:40:00+02:00"),
    new Date("2026-07-31T14:05:00+02:00"),
    {
      taskContext: "home",
      computerRequired: false,
      energyType: "deep_focus",
    },
    classes,
    [],
    settings,
  );
  assert.equal(afterArrival.suitable, false);
  assert.match(afterArrival.reason, /waits 30 minutes/);

  const afterCutoff = studySlotSuitability(
    new Date("2026-07-31T21:00:00+02:00"),
    new Date("2026-07-31T21:25:00+02:00"),
    {
      taskContext: "anywhere",
      computerRequired: false,
      energyType: "light_work",
    },
    classes,
    [],
    settings,
  );
  assert.equal(afterCutoff.suitable, false);
});

test("assignment planning prefers suitable study windows", () => {
  const result = planAssignment(
    baseAssignment,
    [],
    new Date("2026-07-31T08:00:00+02:00"),
    { classes, classExceptions: [], settings },
  );
  assert.ok(result.proposal);
  const session = result.proposal.changes[0].after;
  const hour = new Date(session.startsAt).getHours();
  assert.ok(
    hour === 11 || (hour >= 16 && hour < 19),
    session.startsAt,
  );
});

test("high and easy work prefer different energy windows", () => {
  assert.equal(
    energyForTime(
      new Date("2026-07-31T16:00:00+02:00"),
      new Date("2026-07-31T16:30:00+02:00"),
      settings,
    ),
    "high",
  );
  assert.equal(
    energyForTime(
      new Date("2026-07-31T19:00:00+02:00"),
      new Date("2026-07-31T19:30:00+02:00"),
      settings,
    ),
    "low",
  );
  const easy = planAssignment(
    { ...baseAssignment, id: "easy", requiredEnergy: "low" },
    [],
    new Date("2026-07-31T08:00:00+02:00"),
    { classes, classExceptions: [], settings },
  );
  assert.ok(easy.proposal);
  assert.equal(new Date(easy.proposal.changes[0].after.startsAt).getHours(), 19);
  const demanding = planAssignment(
    { ...baseAssignment, id: "demanding", requiredEnergy: "high" },
    [],
    new Date("2026-07-31T08:00:00+02:00"),
    { classes, classExceptions: [], settings },
  );
  assert.ok(demanding.proposal);
  assert.equal(
    new Date(demanding.proposal.changes[0].after.startsAt).getHours(),
    16,
  );
});
