import assert from "node:assert/strict";
import test from "node:test";

import {
  getEraLabel,
  getJapaneseCalendarDetails,
  getRokuyoFromLunarDate,
} from "../lib/japanese-calendar.ts";

function localDate(year, month, day) {
  return new Date(year, month - 1, day, 12);
}

test("formats Japanese imperial years across era boundaries", () => {
  assert.equal(getEraLabel(localDate(2026, 8, 13)), "令和8年");
  assert.equal(getEraLabel(localDate(2019, 5, 1)), "令和元年");
  assert.equal(getEraLabel(localDate(2019, 4, 30)), "平成31年");
  assert.equal(getEraLabel(localDate(1989, 1, 7)), "昭和64年");
});

test("normalizes leap lunar months before calculating Rokuyo", () => {
  assert.equal(getRokuyoFromLunarDate(4, 9), "赤口");
  assert.equal(getRokuyoFromLunarDate(-4, 9), "赤口");
});

test("returns the era, Rokuyo, and visual tone for a Gregorian date", () => {
  assert.deepEqual(getJapaneseCalendarDetails(localDate(2026, 8, 13)), {
    era: "令和8年",
    rokuyo: "先勝",
    tone: "neutral",
  });
});
