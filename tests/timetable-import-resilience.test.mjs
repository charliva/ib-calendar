import assert from "node:assert/strict";
import test from "node:test";

import { validateProposal } from "../lib/calendar-engine.ts";
import {
  importedLessonMatchesClass,
  normalizeTimetableLessons,
  removeSubjectFromTimetableProposal,
} from "../lib/timetable-import.ts";

test("simultaneous rows from one timetable remain applicable", () => {
  const lessons = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Math",
        startsAt: "2026-09-14T08:30:00+02:00",
        endsAt: "2026-09-14T10:00:00+02:00",
        evidence: "Monday left cell",
      },
      {
        kind: "event",
        title: "TOK",
        startsAt: "2026-09-14T08:30:00+02:00",
        endsAt: "2026-09-14T10:00:00+02:00",
        evidence: "Monday right cell",
      },
    ],
    "2026-09-14",
  );
  const result = validateProposal(
    {
      id: "import",
      title: "Import timetable",
      summary: "Two simultaneous lanes",
      source: "document",
      changes: lessons.map(({ item }, index) => ({
        id: String(index),
        type: "create",
        itemId: null,
        reason: "Visible in timetable",
        before: null,
        after: item,
      })),
    },
    [],
  );

  assert.equal(result.valid, true);
  assert.match(result.results[1].warnings.join(" "), /overlaps/i);
});

test("an imported lesson still cannot silently replace an unrelated fixed event", () => {
  const [lesson] = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Math",
        startsAt: "2026-09-14T08:30:00+02:00",
        endsAt: "2026-09-14T10:00:00+02:00",
        evidence: "Monday Math",
      },
    ],
    "2026-09-14",
  );
  const appointment = {
    ...lesson.item,
    id: "dentist",
    title: "Dentist",
    source: "manual",
    constraints: [],
  };
  const result = validateProposal(
    {
      id: "import",
      title: "Import timetable",
      summary: "Preserve appointments",
      source: "document",
      changes: [
        {
          id: "lesson",
          type: "create",
          itemId: null,
          reason: "Detected",
          before: null,
          after: lesson.item,
        },
      ],
    },
    [appointment],
  );

  assert.equal(result.valid, false);
  assert.match(result.results[0].errors.join(" "), /Dentist/);
});

test("an imported row only replaces its matching recurring class", () => {
  const [imported] = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Math",
        subjectId: "math",
        startsAt: "2026-09-14T08:30:00+02:00",
        endsAt: "2026-09-14T10:00:00+02:00",
        evidence: "Monday Math",
      },
    ],
    "2026-09-14",
  );
  const matching = {
    id: "math-rule",
    subjectId: imported.item.subjectId,
    weekday: 1,
    startTime: "08:30",
    endTime: "10:00",
  };
  const unrelated = { ...matching, id: "english-rule", subjectId: "english" };

  assert.equal(importedLessonMatchesClass(imported.item, matching, "2026-09-14"), true);
  assert.equal(importedLessonMatchesClass(imported.item, unrelated, "2026-09-14"), false);
});

test("removing a proposed subject also removes its dependent lessons", () => {
  const [lesson] = normalizeTimetableLessons(
    [
      {
        kind: "event",
        title: "Unfamiliar course",
        startsAt: "2026-09-14T10:30:00+02:00",
        endsAt: "2026-09-14T12:00:00+02:00",
        evidence: "Monday unfamiliar cell",
      },
    ],
    "2026-09-14",
  );

  const proposal = {
    id: "subject-review",
    title: "Review subjects",
    summary: "One unknown subject",
    source: "document",
    changes: [
      {
        id: "lesson",
        type: "create",
        itemId: null,
        reason: "Detected",
        before: null,
        after: lesson.item,
      },
    ],
  };
  const next = removeSubjectFromTimetableProposal(
    proposal,
    lesson.item.subjectId,
  );

  assert.equal(next.changes.length, 0);
});
