import assert from "node:assert/strict";
import test from "node:test";
import {
  clarificationFor,
  missingAssessmentDetails,
} from "../lib/command-clarification.ts";

const subjects = [
  { name: "Chemistry", shortName: "CHEM" },
  { name: "Global Politics", shortName: "GPO" },
];

test("asks for every material detail before creating a vague test", () => {
  assert.deepEqual(missingAssessmentDetails("oh my god i have a test next week", subjects), [
    "subject",
    "date",
    "time",
    "location",
  ]);
});

test("uses accumulated answers and asks only for what remains", () => {
  assert.deepEqual(
    missingAssessmentDetails(
      "I have a test next week. Chemistry, Tuesday 18/8 at 2 pm",
      subjects,
    ),
    ["location"],
  );
  assert.match(clarificationFor(["location"]).message, /Where is it/);
});

test("allows a complete assessment capture through", () => {
  assert.deepEqual(
    missingAssessmentDetails(
      "Chemistry test Tuesday 18/8 at 2 pm in room KE103",
      subjects,
    ),
    [],
  );
});
