import test from "node:test";
import assert from "node:assert/strict";
import {
  ANSWERS_REQUEST_THRESHOLD,
  PROPOSAL_CHECK_QUESTIONS,
  proposalCheckState,
  verdictFromEvaluation,
} from "../lib/ai/proposal-check.ts";

const supported = { type: "choice", choice: "none" };
const answersIt = { type: "boolean", probability: 0.9 };

test("the choice question offers exactly the options the reader accepts", () => {
  const offered = Object.keys(PROPOSAL_CHECK_QUESTIONS.unsupportedDetail.criteria);
  assert.deepEqual(offered, ["none", "subject", "date", "time", "location"]);
  assert.equal(PROPOSAL_CHECK_QUESTIONS.answersRequest.type, "boolean");
});

test("a supported proposal is shown to the student", () => {
  assert.deepEqual(
    verdictFromEvaluation({
      unsupportedDetail: supported,
      answersRequest: answersIt,
    }),
    { kind: "accept" },
  );
});

test("an invented detail becomes a question about that detail", () => {
  for (const field of ["subject", "date", "time", "location"]) {
    assert.deepEqual(
      verdictFromEvaluation({
        unsupportedDetail: { type: "choice", choice: field },
        answersRequest: answersIt,
      }),
      { kind: "ask", field },
    );
  }
});

test("a proposal that is not a reading of the request asks what they meant", () => {
  assert.deepEqual(
    verdictFromEvaluation({
      unsupportedDetail: supported,
      answersRequest: { type: "boolean", probability: ANSWERS_REQUEST_THRESHOLD - 0.01 },
    }),
    { kind: "ask", field: "other" },
  );
});

test("only a confident no stops a proposal that invented nothing", () => {
  // Merely unsure is not enough: the student approves or rejects what they see.
  assert.deepEqual(
    verdictFromEvaluation({
      unsupportedDetail: supported,
      answersRequest: { type: "boolean", probability: 0.4 },
    }),
    { kind: "accept" },
  );
});

test("an invented detail outranks a confident answersRequest", () => {
  assert.deepEqual(
    verdictFromEvaluation({
      unsupportedDetail: { type: "choice", choice: "time" },
      answersRequest: { type: "boolean", probability: 0.99 },
    }),
    { kind: "ask", field: "time" },
  );
});

test("an unreachable model accepts the proposal rather than blocking it", () => {
  assert.deepEqual(verdictFromEvaluation(null), { kind: "accept" });
  assert.deepEqual(verdictFromEvaluation({}), { kind: "accept" });
});

test("an answer naming an option that was never offered is ignored", () => {
  assert.deepEqual(
    verdictFromEvaluation({ unsupportedDetail: { type: "choice", choice: "room" } }),
    { kind: "accept" },
  );
  assert.deepEqual(
    verdictFromEvaluation({ unsupportedDetail: { type: "boolean", probability: 0.9 } }),
    { kind: "accept" },
  );
});

test("the state carries the proposal and everything it was allowed to draw on", () => {
  const state = proposalCheckState({
    now: "2026-09-21T10:00:00Z",
    timezone: "Europe/Copenhagen",
    studentMessages: "bio test",
    knownSubjects: [{ name: "Biology" }],
    timetableClasses: [{ subjectId: "b" }],
    proposal: { kind: "proposal", title: "Biology test" },
  });
  assert.deepEqual(Object.keys(state), [
    "now",
    "timezone",
    "studentMessages",
    "knownSubjects",
    "timetableClasses",
    "proposal",
  ]);
  assert.equal(state.proposal.title, "Biology test");
});
