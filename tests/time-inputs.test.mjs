// Scheduling an item that has no time yet used to throw.
//
// An unscheduled task has `startsAt: null`, so the Starts picker receives
// `value=""`. Reading that as `value.split(":").map(Number)` gave
// `[0, undefined]`, and clicking an hour emitted `String(undefined)` back —
// the literal text "undefined". The editor then composed "T14:undefined" and
// handed it to `fromLocalInput`, whose `new Date(x).toISOString()` throws a
// RangeError on anything unparseable. The result: clicking a time on an inbox
// item did nothing at all, with an uncaught error behind it.
//
// Three things had to hold for that to be a crash, so all three are pinned
// here: the picker never emits a non-numeric part, the conversion is total in
// both directions, and the editor supplies a date when the item has none.

import assert from "node:assert/strict";
import test from "node:test";

import { fromLocalInput, toLocalInput } from "../lib/calendar/time-inputs.ts";
import { localDatePart, localTimePart } from "../components/calendar/date-parts.ts";

test("fromLocalInput returns null instead of throwing on unusable text", () => {
  assert.equal(fromLocalInput(""), null);
  assert.equal(fromLocalInput("T14:undefined"), null);
  assert.equal(fromLocalInput("T14:30"), null);
  assert.equal(fromLocalInput("not a date"), null);
  assert.equal(fromLocalInput("2026-02-30T25:99"), null);
});

test("fromLocalInput still converts a real local datetime", () => {
  const iso = fromLocalInput("2026-09-20T14:30");
  assert.equal(typeof iso, "string");
  assert.equal(new Date(iso).getHours(), 14);
  assert.equal(new Date(iso).getMinutes(), 30);
});

test("toLocalInput yields an empty field for a corrupt stored timestamp", () => {
  assert.equal(toLocalInput(null), "");
  assert.equal(toLocalInput(""), "");
  assert.equal(toLocalInput("garbage"), "");
  assert.equal(toLocalInput("2026-09-20T14:30:00.000Z").length, 16);
});

test("an unscheduled item yields empty date and time parts", () => {
  assert.equal(localDatePart(null), "");
  assert.equal(localTimePart(null), "");
});

// The picker's parse, mirrored: components/calendar/CompactTimePicker.tsx
// keeps this logic in `clockPart`, and the contract that matters to the rest
// of the app is the string it emits.
function clockPart(part, max) {
  const parsed = Number(part);
  if (!part || !Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  return parsed;
}

function emit(value, { hour, minute }) {
  const [hourPart, minutePart] = value.split(":");
  const chosenHour = hour ?? clockPart(hourPart, 23);
  const chosenMinute = minute ?? clockPart(minutePart, 59);
  return `${String(chosenHour ?? 0).padStart(2, "0")}:${String(
    chosenMinute ?? 0,
  ).padStart(2, "0")}`;
}

test("the time picker never emits a non-numeric part", () => {
  assert.equal(emit("", { hour: 14 }), "14:00");
  assert.equal(emit("", { minute: 30 }), "00:30");
  assert.equal(emit("14:", { minute: 30 }), "14:30");
  assert.equal(emit(":30", { hour: 9 }), "09:30");
  assert.equal(emit("09:05", { hour: 11 }), "11:05");
  for (const broken of ["", "14:", ":", "abc", "99:99"]) {
    assert.match(emit(broken, { hour: 8 }), /^\d{2}:\d{2}$/);
  }
});

test("picking a time on an unscheduled item schedules it rather than throwing", () => {
  const draft = { startsAt: null, endsAt: null };
  const today = new Date().toISOString();

  const time = emit(localTimePart(draft.startsAt), { hour: 14 });
  assert.equal(time, "14:00");

  const date = localDatePart(draft.startsAt) || localDatePart(today);
  const startsAt = fromLocalInput(`${date}T${time}`);

  assert.notEqual(startsAt, null);
  assert.equal(new Date(startsAt).getHours(), 14);
  assert.equal(new Date(startsAt).toDateString(), new Date().toDateString());
});
