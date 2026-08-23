import assert from "node:assert/strict";
import test from "node:test";
import { planAssignment } from "../lib/assignment-planner.ts";
import { makeItem } from "../lib/calendar-engine.ts";
import { normalizeTimetableLessons } from "../lib/timetable-import.ts";
import {
  detectFreePeriods,
  energyForTime,
  protectedSchoolRanges,
  recommendForFreePeriod,
  recommendationsForFreePeriod,
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

test("weekly screenshot lessons drive free-period detection", () => {
  const imported = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "English",
        startsAt: "2026-07-31T10:00:00+02:00",
        endsAt: "2026-07-31T11:25:00+02:00",
        evidence: "Friday English block",
      },
      {
        kind: "event",
        title: "Biology",
        startsAt: "2026-07-31T12:10:00+02:00",
        endsAt: "2026-07-31T13:00:00+02:00",
        evidence: "Friday Biology block",
      },
    ],
    "2026-07-27",
  ).map(({ item }) => item);
  const periods = detectFreePeriods(
    [],
    [],
    settings,
    new Date("2026-07-31T08:00:00+02:00"),
    new Date("2026-07-31T15:00:00+02:00"),
    imported,
  );

  assert.equal(periods.length, 1);
  assert.equal(periods[0].durationMinutes, 45);
  const suitability = studySlotSuitability(
    new Date("2026-07-31T11:30:00+02:00"),
    new Date("2026-07-31T12:00:00+02:00"),
    {
      taskContext: "school",
      computerRequired: false,
      energyType: "light_work",
    },
    [],
    [],
    settings,
    imported,
  );
  assert.equal(suitability.suitable, true);
  assert.match(suitability.reason, /45-minute free period/);
});

test("a screenshot week replaces recurring lesson assumptions", () => {
  const imported = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Early seminar",
        startsAt: "2026-07-31T08:00:00+02:00",
        endsAt: "2026-07-31T09:00:00+02:00",
        evidence: "Friday early seminar",
      },
      {
        kind: "event",
        title: "Late lab",
        startsAt: "2026-07-31T14:00:00+02:00",
        endsAt: "2026-07-31T15:00:00+02:00",
        evidence: "Friday late lab",
      },
    ],
    "2026-07-27",
  ).map(({ item }) => item);
  const periods = detectFreePeriods(
    classes,
    [],
    settings,
    new Date("2026-07-31T07:00:00+02:00"),
    new Date("2026-07-31T16:00:00+02:00"),
    imported,
  );

  assert.equal(periods.length, 1);
  assert.equal(periods[0].durationMinutes, 300);
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

test("free-period recommendations include unscheduled calendar events", () => {
  const period = detectFreePeriods(
    classes,
    [],
    settings,
    new Date("2026-07-31T08:00:00+02:00"),
    new Date("2026-07-31T08:00:00+02:00"),
  )[0];
  const event = makeItem({
    id: "student-council",
    kind: "event",
    title: "Plan student council event",
    durationMin: 25,
    durationMax: 40,
    priority: "high",
    taskContext: "school",
    status: "inbox",
  });

  const recommendation = recommendForFreePeriod(
    period,
    [{ ...baseAssignment, priority: "medium" }],
    [event],
    settings,
  );

  assert.equal(recommendation?.sourceType, "calendar_item");
  assert.equal(recommendation?.sourceId, event.id);
  assert.equal(recommendation?.durationMinutes, 25);
});

test("free periods expose several ranked calendar previews", () => {
  const period = detectFreePeriods(
    classes,
    [],
    settings,
    new Date("2026-07-31T08:00:00+02:00"),
    new Date("2026-07-31T08:00:00+02:00"),
  )[0];
  const items = [
    makeItem({
      id: "club-planning",
      kind: "event",
      title: "Plan club meeting",
      priority: "high",
      durationMin: 20,
      taskContext: "school",
    }),
    makeItem({
      id: "library-return",
      kind: "task",
      title: "Return library books",
      priority: "low",
      durationMin: 10,
      taskContext: "school",
    }),
  ];

  const recommendations = recommendationsForFreePeriod(
    period,
    [baseAssignment],
    items,
    settings,
  );

  assert.equal(recommendations.length, 3);
  assert.deepEqual(
    recommendations.map((entry) => entry.sourceId),
    ["club-planning", baseAssignment.id, "library-return"],
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
