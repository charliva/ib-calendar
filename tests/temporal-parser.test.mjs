import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTemporalText,
  parseTemporalText,
} from "../lib/temporal-parser.ts";

const thursday = new Date(2026, 7, 13, 9, 0, 0);

test("parses next weekday using the following calendar week", () => {
  assert.equal(
    parseTemporalText("next saturday at 2 pm", "datetime", thursday),
    "2026-08-22T14:00",
  );
});

test("parses upcoming weekdays, relative dates, and typed dates", () => {
  assert.equal(parseTemporalText("saturday 14:30", "datetime", thursday), "2026-08-15T14:30");
  assert.equal(parseTemporalText("tomorrow", "date", thursday), "2026-08-14");
  assert.equal(parseTemporalText("22/8/2026", "date", thursday), "2026-08-22");
});

test("parses standalone times and formats a friendly result", () => {
  assert.equal(parseTemporalText("2 pm", "time", thursday), "14:00");
  assert.equal(formatTemporalText("2026-08-22T14:00", "datetime"), "22/08/2026 · 2:00 PM");
});
