import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSESSMENT_THRESHOLD,
  COMMAND_GATE_QUESTIONS,
  commandGateState,
  DETAIL_PRESENT_THRESHOLD,
  missingDetailsFromEvaluation,
} from "../lib/ai/command-gate.ts";

const yes = { type: "boolean", probability: 0.95 };
const no = { type: "boolean", probability: 0.03 };

function answers(overrides = {}) {
  return {
    isAssessment: yes,
    hasSubject: yes,
    hasDate: yes,
    hasTime: yes,
    hasLocation: yes,
    ...overrides,
  };
}

test("every question the gate reads is a question it asks", () => {
  const asked = Object.keys(COMMAND_GATE_QUESTIONS);
  for (const id of ["isAssessment", "hasSubject", "hasDate", "hasTime", "hasLocation"]) {
    assert.ok(asked.includes(id), `${id} is read but never asked`);
    assert.equal(COMMAND_GATE_QUESTIONS[id].type, "boolean");
  }
});

test("a complete assessment asks nothing", () => {
  assert.deepEqual(missingDetailsFromEvaluation(answers()), []);
});

test("anything that is not an assessment is left alone", () => {
  // Every detail is missing, but the gate only guards assessments.
  assert.deepEqual(
    missingDetailsFromEvaluation({
      isAssessment: no,
      hasSubject: no,
      hasDate: no,
      hasTime: no,
      hasLocation: no,
    }),
    [],
  );
});

test("missing details come back in the order the clarification presents them", () => {
  assert.deepEqual(
    missingDetailsFromEvaluation(
      answers({ hasTime: no, hasSubject: no, hasLocation: no }),
    ),
    ["subject", "time", "location"],
  );
});

test("a detail the model is only marginally sure of counts as missing", () => {
  const marginal = { type: "boolean", probability: DETAIL_PRESENT_THRESHOLD - 0.01 };
  assert.deepEqual(missingDetailsFromEvaluation(answers({ hasDate: marginal })), [
    "date",
  ]);

  const sure = { type: "boolean", probability: DETAIL_PRESENT_THRESHOLD };
  assert.deepEqual(missingDetailsFromEvaluation(answers({ hasDate: sure })), []);
});

test("an undecided assessment call still engages the gate", () => {
  // The bar is an even one, so exactly-at-threshold is treated as an assessment.
  const undecided = { type: "boolean", probability: ASSESSMENT_THRESHOLD };
  assert.deepEqual(
    missingDetailsFromEvaluation(answers({ isAssessment: undecided, hasDate: no })),
    ["date"],
  );
});

test("no answers at all means fall back, not 'nothing is missing'", () => {
  assert.equal(missingDetailsFromEvaluation(null), null);
  assert.equal(missingDetailsFromEvaluation({}), null);
});

test("one unusable detail answer asks for that detail, not for all of them", () => {
  assert.deepEqual(
    missingDetailsFromEvaluation(
      answers({ hasLocation: { type: "choice", choice: "yes" } }),
    ),
    ["location"],
  );
  assert.deepEqual(
    missingDetailsFromEvaluation(answers({ hasTime: { type: "boolean", probability: 7 } })),
    ["time"],
  );
});

test("the state carries the messages and the subjects the questions refer to", () => {
  const state = commandGateState("chem test friday", [
    { name: "Chemistry", shortName: "Chem", teacher: "R", room: "4" },
  ]);
  assert.equal(state.studentMessages, "chem test friday");
  assert.deepEqual(state.knownSubjects, [{ name: "Chemistry", shortName: "Chem" }]);
});
