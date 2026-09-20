import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readStylesheet } from "./helpers/stylesheet.mjs";

const calendar = readFileSync(
  new URL("../app/time-calendar.tsx", import.meta.url),
  "utf8",
);
const styles = readStylesheet();
const calendarUi = readFileSync(
  new URL("../app/calendar-ui.tsx", import.meta.url),
  "utf8",
);

test("class occurrences receive a dedicated visual hook", () => {
  assert.match(calendar, /isClassEvent\(item\) \? "is-class-event"/);
});

test("class glass preserves subject color and violet refraction", () => {
  assert.match(styles, /\.calendar-block\.is-class-event/);
  assert.match(calendarUi, /export function classGlassStyle/);
  assert.match(calendarUi, /127 112 232 \/ 7%/);
  assert.match(calendarUi, /backgroundImage/);
  assert.match(styles, /backdrop-filter: blur\(11px\) saturate\(1\.16\)/);
});
