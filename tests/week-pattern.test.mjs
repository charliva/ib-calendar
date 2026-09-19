import assert from "node:assert/strict";
import test from "node:test";

// The A/B cycle is derived from calendar dates, so these tests only mean
// something in a timezone that observes daylight saving. Copenhagen is the
// app's default timezone and its spring transition lands inside the Easter
// break, which is exactly when a student is most likely to be away.
process.env.TZ = "Europe/Copenhagen";

const {
  DEFAULT_WEEK_PATTERN_ANCHOR,
  anchorForWeekOf,
  classRunsInWeek,
  startOfWeekMonday,
  weekPatternFor,
} = await import("../lib/school/week-pattern.ts");

function mondaysBetween(start, end) {
  const mondays = [];
  const cursor = startOfWeekMonday(start);
  while (cursor <= end) {
    mondays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return mondays;
}

test("consecutive weeks always alternate across a spring daylight saving change", () => {
  const patterns = [
    weekPatternFor(new Date(2026, 2, 23)),
    weekPatternFor(new Date(2026, 2, 30)),
    weekPatternFor(new Date(2026, 3, 6)),
  ];
  assert.notEqual(patterns[0], patterns[1]);
  assert.notEqual(patterns[1], patterns[2]);
});

test("consecutive weeks always alternate across an autumn daylight saving change", () => {
  const patterns = [
    weekPatternFor(new Date(2026, 9, 19)),
    weekPatternFor(new Date(2026, 9, 26)),
    weekPatternFor(new Date(2026, 10, 2)),
  ];
  assert.notEqual(patterns[0], patterns[1]);
  assert.notEqual(patterns[1], patterns[2]);
});

test("no two consecutive weeks share a pattern over three school years", () => {
  const mondays = mondaysBetween(new Date(2025, 0, 1), new Date(2028, 0, 1));
  const repeats = [];
  for (let index = 1; index < mondays.length; index += 1) {
    const previous = weekPatternFor(mondays[index - 1]);
    const current = weekPatternFor(mondays[index]);
    if (previous === current) repeats.push(mondays[index].toDateString());
  }
  assert.deepEqual(repeats, []);
});

test("every day within a week reports the same pattern", () => {
  const monday = new Date(2026, 2, 30);
  const expected = weekPatternFor(monday);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(monday);
    day.setDate(day.getDate() + offset);
    assert.equal(weekPatternFor(day), expected);
  }
});

test("the stored anchor makes the week the student identified authoritative", () => {
  const thisWeek = new Date(2026, 8, 16);
  const anchoredToA = anchorForWeekOf(thisWeek, "a");
  const anchoredToB = anchorForWeekOf(thisWeek, "b");
  assert.equal(weekPatternFor(thisWeek, anchoredToA), "a");
  assert.equal(weekPatternFor(thisWeek, anchoredToB), "b");
});

test("an anchor keeps alternating correctly in the weeks after it", () => {
  const thisWeek = new Date(2026, 8, 16);
  const anchor = anchorForWeekOf(thisWeek, "b");
  const nextWeek = new Date(2026, 8, 23);
  const weekAfter = new Date(2026, 8, 30);
  assert.equal(weekPatternFor(nextWeek, anchor), "a");
  assert.equal(weekPatternFor(weekAfter, anchor), "b");
});

test("an anchor is always stored as the Monday of an A week", () => {
  assert.equal(anchorForWeekOf(new Date(2026, 8, 16), "a"), "2026-09-14");
  assert.equal(anchorForWeekOf(new Date(2026, 8, 16), "b"), "2026-09-07");
});

test("a blank or malformed anchor falls back to the historical default", () => {
  const day = new Date(2026, 8, 16);
  const expected = weekPatternFor(day, DEFAULT_WEEK_PATTERN_ANCHOR);
  assert.equal(weekPatternFor(day, ""), expected);
  assert.equal(weekPatternFor(day, "   "), expected);
  assert.equal(weekPatternFor(day, "not-a-date"), expected);
  assert.equal(weekPatternFor(day, undefined), expected);
});

test("the default anchor names itself an A week", () => {
  assert.equal(weekPatternFor(new Date(2020, 0, 6)), "a");
  assert.equal(weekPatternFor(new Date(2020, 0, 13)), "b");
});

test("a class that repeats every week runs regardless of the pattern", () => {
  const anchor = anchorForWeekOf(new Date(2026, 8, 16), "a");
  assert.equal(classRunsInWeek("every", new Date(2026, 8, 16), anchor), true);
  assert.equal(classRunsInWeek("every", new Date(2026, 8, 23), anchor), true);
  assert.equal(classRunsInWeek("a", new Date(2026, 8, 16), anchor), true);
  assert.equal(classRunsInWeek("a", new Date(2026, 8, 23), anchor), false);
  assert.equal(classRunsInWeek("b", new Date(2026, 8, 23), anchor), true);
});
