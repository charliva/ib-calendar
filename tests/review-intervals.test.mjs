// The spaced-repetition "Review after (days)" field re-derived its own
// displayed value from the parsed list on every keystroke. That made the
// separator impossible to type: the moment a comma landed, the trailing empty
// segment parsed to 0, was filtered out as out of range, and the input snapped
// back to the list the student already had. A fourth interval could not be
// added at all, and editing an existing one appended digits to its neighbour.
//
// The fix separates the text being typed from the numbers being stored. These
// pin the parsing half, including the mid-keystroke states that used to be
// erased.

import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_INTERVAL_DAY_BOUNDS,
  formatReviewIntervals,
  parseReviewIntervals,
  reviewIntervalsMatch,
} from "../lib/school/review-intervals.ts";

test("an ordinary list parses", () => {
  assert.deepEqual(parseReviewIntervals("1, 3, 7, 14"), [1, 3, 7, 14]);
  assert.deepEqual(parseReviewIntervals("1,3,7"), [1, 3, 7]);
  assert.deepEqual(parseReviewIntervals("  2 ,  5  "), [2, 5]);
});

test("a trailing separator parses to the same list it already had", () => {
  // This is the keystroke that used to erase itself.
  assert.deepEqual(parseReviewIntervals("1, 3, 7, "), [1, 3, 7]);
  assert.equal(reviewIntervalsMatch("1, 3, 7, ", [1, 3, 7]), true);
});

test("a half-typed list is not rewritten out from under the student", () => {
  // "1, 3, 7, " and "1, 3, 7" agree on the numbers, so the control must leave
  // the text alone — that is what lets the comma survive long enough to type
  // a digit after it.
  assert.equal(reviewIntervalsMatch("1, 3, 7,", [1, 3, 7]), true);
  // Typing the "1" of a forthcoming "14" repeats an entry the list already
  // has, so it collapses and still matches — which is what keeps the text
  // untouched while the "4" is still on its way.
  assert.deepEqual(parseReviewIntervals("1, 3, 7, 1"), [1, 3, 7]);
  assert.equal(reviewIntervalsMatch("1, 3, 7, 1", [1, 3, 7]), true);
  // The completed number is a real change, so the stored list grows.
  assert.equal(reviewIntervalsMatch("1, 3, 7, 14", [1, 3, 7]), false);
  assert.deepEqual(parseReviewIntervals("1, 3, 7, 14"), [1, 3, 7, 14]);
});

test("out-of-range and nonsense entries are dropped, not repaired", () => {
  assert.deepEqual(parseReviewIntervals("0, 1, 91, 90"), [1, 90]);
  assert.deepEqual(parseReviewIntervals("-3, 4"), [4]);
  assert.deepEqual(parseReviewIntervals("1.5, 2"), [2]);
  assert.deepEqual(parseReviewIntervals("abc, 3"), [3]);
  assert.deepEqual(parseReviewIntervals(""), []);
  assert.deepEqual(parseReviewIntervals(",,,"), []);
});

test("the bounds are the ones the revision planner will schedule in", () => {
  assert.deepEqual(REVIEW_INTERVAL_DAY_BOUNDS, { min: 1, max: 90 });
});

test("repeats collapse and order is normalised", () => {
  assert.deepEqual(parseReviewIntervals("7, 1, 7, 3"), [1, 3, 7]);
});

test("formatting round-trips", () => {
  assert.equal(formatReviewIntervals([1, 3, 7, 14]), "1, 3, 7, 14");
  assert.deepEqual(
    parseReviewIntervals(formatReviewIntervals([1, 3, 7, 14])),
    [1, 3, 7, 14],
  );
  assert.equal(formatReviewIntervals([]), "");
});

test("changing 14 to 21 does not corrupt its neighbour", () => {
  // Deleting the "4" leaves "1", which is a legal entry that duplicates the
  // first one — it must collapse rather than becoming a fourth interval.
  assert.deepEqual(parseReviewIntervals("1, 3, 7, 1"), [1, 3, 7]);
  assert.deepEqual(parseReviewIntervals("1, 3, 7, 2"), [1, 2, 3, 7]);
  assert.deepEqual(parseReviewIntervals("1, 3, 7, 21"), [1, 3, 7, 21]);
});
