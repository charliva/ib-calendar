import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarSwipeDirection,
  weekSwipeDirection,
} from "../lib/week-swipe.ts";

test("maps a left swipe to the next week and a right swipe to the previous week", () => {
  assert.equal(
    weekSwipeDirection(
      { x: 240, y: 120, at: 0 },
      { x: 120, y: 126, at: 240 },
    ),
    1,
  );
  assert.equal(
    weekSwipeDirection(
      { x: 120, y: 120, at: 0 },
      { x: 240, y: 126, at: 240 },
    ),
    -1,
  );
});

test("the shared calendar gesture keeps the established week direction", () => {
  const start = { x: 220, y: 100, at: 0 };
  const end = { x: 100, y: 106, at: 240 };

  assert.equal(calendarSwipeDirection(start, end), 1);
  assert.equal(calendarSwipeDirection(start, end), weekSwipeDirection(start, end));
});

test("ignores vertical, short, and slow gestures", () => {
  assert.equal(
    weekSwipeDirection(
      { x: 160, y: 100, at: 0 },
      { x: 170, y: 220, at: 200 },
    ),
    0,
  );
  assert.equal(
    weekSwipeDirection(
      { x: 160, y: 100, at: 0 },
      { x: 125, y: 102, at: 200 },
    ),
    0,
  );
  assert.equal(
    weekSwipeDirection(
      { x: 240, y: 100, at: 0 },
      { x: 120, y: 102, at: 1_200 },
    ),
    0,
  );
});
