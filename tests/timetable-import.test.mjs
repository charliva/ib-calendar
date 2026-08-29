import assert from "node:assert/strict";
import test from "node:test";
import { validateProposal } from "../lib/calendar-engine.ts";
import {
  isImportedTimetableItem,
  isItemInWeek,
  normalizeTimetableLessons,
  reconcileTimetableImport,
  subjectsAreSimilar,
  timetableRoomForItem,
} from "../lib/timetable-import.ts";

const existingMath = {
  id: "math-aa",
  name: "Mathematics: Analysis and Approaches",
  shortName: "Math AA",
  teacher: "Ms Euler",
  room: "M12",
  color: "#527fca",
  icon: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("turns screenshot lessons into one-off fixed events", () => {
  const [lesson] = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Biology HL",
        description: "Room B12 · Ms Jensen",
        startsAt: "2026-08-03T08:15:00+02:00",
        endsAt: "2026-08-03T09:00:00+02:00",
        energyType: "deep_focus",
        priority: "medium",
        constraints: ["Room B12"],
        evidence: "Monday column, first lesson",
      },
    ],
    "2026-08-03",
  );

  assert.equal(lesson.item.flexibility, "fixed");
  assert.equal(lesson.item.status, "scheduled");
  assert.equal(lesson.item.durationMin, 45);
  assert.equal(isImportedTimetableItem(lesson.item), true);
  assert.equal(isItemInWeek(lesson.item, "2026-08-03"), true);
  assert.equal(timetableRoomForItem(lesson.item), "B12");
});

test("keeps screenshot rooms on individual class occurrences", () => {
  const lessons = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Chemistry",
        room: "KE103",
        startsAt: "2026-08-03T10:00:00+02:00",
        endsAt: "2026-08-03T11:00:00+02:00",
        evidence: "Monday chemistry cell",
      },
      {
        kind: "event",
        title: "Chemistry",
        room: "Lab 2",
        startsAt: "2026-08-05T10:00:00+02:00",
        endsAt: "2026-08-05T11:00:00+02:00",
        evidence: "Wednesday chemistry cell",
      },
    ],
    "2026-08-03",
  );

  assert.deepEqual(
    lessons.map(({ item }) => item.room),
    ["KE103", "Lab 2"],
  );
});

test("tolerates legacy imported items without newer room or constraint fields", () => {
  const legacyItem = {
    kind: "event",
    source: "document",
    description: "Room KE103",
  };

  assert.equal(isImportedTimetableItem(legacyItem), false);
  assert.equal(timetableRoomForItem(legacyItem), "");
});

test("drops duplicates, fuzzy entries, and lessons outside the selected week", () => {
  const valid = {
    kind: "event",
    title: "English",
    startsAt: "2026-08-04T10:00:00+02:00",
    endsAt: "2026-08-04T11:00:00+02:00",
    evidence: "Tuesday column",
  };
  const result = reconcileTimetableImport(
    [
      valid,
      valid,
      { ...valid, title: "No time", startsAt: null, endsAt: null },
      {
        ...valid,
        title: "Next week",
        startsAt: "2026-08-10T10:00:00+02:00",
        endsAt: "2026-08-10T11:00:00+02:00",
      },
    ],
    "2026-08-03",
  );

  assert.equal(result.lessons.length, 1);
  assert.equal(result.rejected.length, 3);
  assert.deepEqual(
    result.rejected.map(({ reason }) => reason),
    [
      "The same lesson and time was already detected.",
      "The row is missing an exact start or end time.",
      "The lesson is outside the selected week.",
    ],
  );
});

test("an approved reimport may replace prior fixed screenshot events", () => {
  const [lesson] = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "History",
        startsAt: "2026-08-05T09:00:00+02:00",
        endsAt: "2026-08-05T10:00:00+02:00",
        evidence: "Wednesday History block",
      },
    ],
    "2026-08-03",
  );
  const result = validateProposal(
    {
      id: "replacement",
      title: "Replace week",
      summary: "Approved screenshot replacement",
      source: "document",
      changes: [
        {
          id: "delete-old",
          type: "delete",
          itemId: lesson.item.id,
          reason: "Replace the previous import",
          before: lesson.item,
          after: null,
        },
      ],
    },
    [lesson.item],
  );

  assert.equal(result.valid, true);
});

test("loosely matches screenshot labels to an existing subject", () => {
  const result = reconcileTimetableImport(
    [
      {
        kind: "event",
        title: "MATH AA HL",
        subjectName: "Math AA HL",
        subjectShortName: "MAA",
        startsAt: "2026-08-06T09:00:00+02:00",
        endsAt: "2026-08-06T10:00:00+02:00",
        evidence: "Thursday Math AA block",
      },
    ],
    "2026-08-03",
    [existingMath],
  );

  assert.equal(result.newSubjects.length, 0);
  assert.equal(result.lessons[0].item.title, existingMath.name);
  assert.equal(result.lessons[0].item.subjectId, existingMath.id);
  assert.equal(
    subjectsAreSimilar("Math AA HL", existingMath.name, "MAA", "Math AA"),
    true,
  );
});

test("creates one proposed subject for equivalent new screenshot labels", () => {
  const result = reconcileTimetableImport(
    [
      {
        kind: "event",
        title: "Biology HL",
        subjectName: "Biology HL",
        subjectShortName: "BIO",
        teacher: "Dr Curie",
        room: "B14",
        startsAt: "2026-08-03T09:00:00+02:00",
        endsAt: "2026-08-03T10:00:00+02:00",
        evidence: "Monday Biology block",
      },
      {
        kind: "event",
        title: "Bio",
        subjectName: "Bio",
        subjectShortName: "BIO",
        startsAt: "2026-08-05T09:00:00+02:00",
        endsAt: "2026-08-05T10:00:00+02:00",
        evidence: "Wednesday Bio block",
      },
    ],
    "2026-08-03",
    [],
  );

  assert.equal(result.newSubjects.length, 1);
  assert.equal(result.newSubjects[0].name, "Biology HL");
  assert.equal(result.newSubjects[0].teacher, "Dr Curie");
  assert.equal(result.newSubjects[0].room, "B14");
  assert.deepEqual(
    result.lessons.map((lesson) => lesson.item.title),
    ["Biology HL", "Biology HL"],
  );
});

test("does not collapse distinct Math AA and Math AI subjects", () => {
  assert.equal(subjectsAreSimilar("Math AA HL", "Math AI SL"), false);
});

test("treats Cohort as assembly even when the model guesses Biology", () => {
  const biology = {
    id: "biology",
    name: "Biology",
    shortName: "BIO",
    teacher: "",
    room: "",
    color: "#318f87",
    icon: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const result = reconcileTimetableImport(
    [
      {
        kind: "event",
        title: "Biology",
        rawLabel: "Cohort",
        itemType: "academic_subject",
        subjectName: "Biology",
        startsAt: "2026-08-10T11:45:00+02:00",
        endsAt: "2026-08-10T15:00:00+02:00",
        evidence: "Mon cell: 11:45-15:00 Cohort pwe-mas, KG108",
      },
    ],
    "2026-08-10",
    [biology],
  );

  assert.equal(result.lessons[0].item.title, "Assembly");
  assert.match(result.lessons[0].item.description, /Cohort/);
  assert.equal(result.newSubjects.length, 1);
  assert.equal(result.newSubjects[0].name, "Assembly");
  assert.equal(result.lessons[0].item.subjectId, result.newSubjects[0].id);
});

test("normalizes school abbreviations and keeps uncertain labels as new subjects", () => {
  const biology = {
    id: "biology",
    name: "Biology",
    shortName: "BIO",
    teacher: "",
    room: "",
    color: "#318f87",
    icon: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const labels = [
    ["GP SL/HL", "Global Politics"],
    ["TOK c", "Theory of Knowledge"],
    ["Dan ab SL", "Danish ab initio"],
    ["Eng A LL HL 1", "English A Language and Literature"],
    ["FILM-X", "FILM-X"],
  ];
  const result = reconcileTimetableImport(
    labels.map(([rawLabel], index) => ({
      kind: "event",
      title: "Biology",
      rawLabel,
      itemType: "academic_subject",
      subjectConfidence: "low",
      subjectName: "Biology",
      startsAt: `2026-08-${String(10 + index).padStart(2, "0")}T10:30:00+02:00`,
      endsAt: `2026-08-${String(10 + index).padStart(2, "0")}T12:00:00+02:00`,
      evidence: `${rawLabel} cell`,
    })),
    "2026-08-10",
    [biology],
  );

  assert.deepEqual(
    result.lessons.map((lesson) => lesson.item.title),
    labels.map(([, expected]) => expected),
  );
  assert.equal(result.newSubjects.some((subject) => subject.name === "FILM-X"), true);
  assert.equal(result.newSubjects.some((subject) => subject.name === "Biology"), false);
});
