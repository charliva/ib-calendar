import assert from "node:assert/strict";
import test from "node:test";
import {
  isBlockPolishResponse,
  isClarificationResponse,
  isCommandResponse,
  isDeeperResponse,
} from "../lib/ai/study-planner.ts";
import {
  documentMediaType,
  isExtractionResponse,
} from "../lib/ai/timetable-parser.ts";

test("accepts a valid AI command proposal", () => {
  assert.equal(
    isCommandResponse({
      title: "Create task",
      summary: "Add one item",
      changes: [
        {
          type: "create",
          itemId: null,
          reason: "Requested",
          after: { title: "Read", kind: "task" },
        },
      ],
    }),
    true,
  );
});

test("rejects malformed AI command proposals", () => {
  assert.equal(isCommandResponse({ title: "Missing changes" }), false);
  assert.equal(
    isCommandResponse({
      title: "Bad change",
      summary: "Bad",
      changes: [{ type: "replace" }],
    }),
    false,
  );
});

test("validates clarification responses", () => {
  assert.equal(
    isClarificationResponse({
      kind: "clarification",
      message: "Need a time",
      questions: [{ field: "time", label: "When?" }],
    }),
    true,
  );
  assert.equal(
    isClarificationResponse({
      kind: "clarification",
      message: "No questions",
      questions: [],
    }),
    false,
  );
});

test("validates timetable extraction responses", () => {
  assert.equal(
    isExtractionResponse({
      title: "Timetable",
      summary: "Five lessons",
      items: [
        {
          title: "Maths",
          kind: "event",
          evidence: "Mon 09:00",
        },
      ],
    }),
    true,
  );
  assert.equal(
    isExtractionResponse({ title: "Timetable", summary: "No items", items: [] }),
    true,
  );
  assert.equal(isExtractionResponse({ title: "Timetable" }), false);
});

test("validates deeper exploration and block suggestions", () => {
  const directions = [
    {
      kind: "why",
      title: "Why it matters",
      prompt: "Explain the mechanism",
      whyUseful: "Builds understanding",
    },
    {
      kind: "connection",
      title: "Connect topics",
      prompt: "Compare systems",
      whyUseful: "Creates recall paths",
    },
    {
      kind: "application",
      title: "Apply it",
      prompt: "Solve an example",
      whyUseful: "Tests transfer",
    },
    {
      kind: "edge_case",
      title: "Break it",
      prompt: "Find a boundary",
      whyUseful: "Strengthens precision",
    },
  ];
  assert.equal(
    isDeeperResponse({ framing: "Focus", directions }),
    true,
  );
  assert.equal(isDeeperResponse({ framing: "Focus", directions: [] }), false);
  const suggestions = ["recovery", "responsibility", "meaningful"].map(
    (category) => ({
      id: `${category}-1`,
      category,
      title: "Option",
      description: "Description",
      reason: null,
    }),
  );
  assert.equal(isBlockPolishResponse({ suggestions }), true);
  assert.equal(isBlockPolishResponse({ suggestions: suggestions.slice(0, 2) }), false);
});

test("infers upload media types from extensions", () => {
  assert.equal(documentMediaType(new File([], "timetable.png")), "image/png");
  assert.equal(documentMediaType(new File([], "notes.txt")), "text/plain");
});
