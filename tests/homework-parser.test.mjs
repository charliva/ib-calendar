import assert from "node:assert/strict";
import test from "node:test";
import {
  looksLikeHomeworkCommand,
  parseHomework,
} from "../lib/homework-parser.ts";

const subjects = [
  {
    id: "chemistry",
    name: "Chemistry",
    shortName: "CHEM",
    teacher: "",
    room: "",
    color: "#7f70e8",
    icon: "",
    createdAt: "",
  },
  {
    id: "biology",
    name: "Biology",
    shortName: "BIO",
    teacher: "",
    room: "",
    color: "#69ae91",
    icon: "",
    createdAt: "",
  },
  {
    id: "french",
    name: "French",
    shortName: "FR",
    teacher: "",
    room: "",
    color: "#699ec2",
    icon: "",
    createdAt: "",
  },
];

const now = new Date("2026-07-30T12:00:00+02:00");

test("parses subject, page range, weekday, and reading type", () => {
  const result = parseHomework(
    "Chemistry pages 52-57 Thursday",
    subjects,
    now,
  );
  assert.equal(result.subjectId, "chemistry");
  assert.equal(result.title, "Pages 52-57");
  assert.equal(result.taskType, "reading");
  assert.equal(result.deadline, "2026-07-30T16:00:00.000Z");
  assert.equal(looksLikeHomeworkCommand(result.rawText, result), true);
});

test("parses an explicit time and writing task", () => {
  const result = parseHomework(
    "Biology essay Friday 18:00",
    subjects,
    now,
  );
  assert.equal(result.subjectId, "biology");
  assert.equal(result.title, "Essay");
  assert.equal(result.taskType, "writing");
  assert.equal(result.estimatedMinutes, 90);
  assert.equal(result.deadline, "2026-07-31T16:00:00.000Z");
});

test("parses relative dates and vocabulary", () => {
  const result = parseHomework("French vocab tomorrow", subjects, now);
  assert.equal(result.subjectId, "french");
  assert.equal(result.title, "Vocab");
  assert.equal(result.taskType, "vocabulary");
  assert.equal(result.deadline, "2026-07-31T16:00:00.000Z");
});

test("does not steal calendar transformations from Cmd+K", () => {
  const result = parseHomework(
    "Move Biology tomorrow one hour later",
    subjects,
    now,
  );
  assert.equal(looksLikeHomeworkCommand(result.rawText, result), false);
});
