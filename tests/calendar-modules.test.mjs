import assert from "node:assert/strict";
import test from "node:test";
import { makeItem } from "../lib/calendar-engine.ts";
import {
  parsedCommand,
  simpleFallbackProposal,
} from "../lib/calendar/commands.ts";
import {
  itemWithDuration,
  normalizeItemTiming,
  toggleAllDayItem,
} from "../lib/calendar/scheduling.ts";

test("parses command action, subject, and timing", () => {
  const parsed = parsedCommand("Create revision notes today for biology");
  assert.equal(parsed.action, "Create");
  assert.equal(parsed.subject, "revision notes");
  assert.equal(parsed.timing, "today for biology");
});

test("falls back to a local proposal when AI planning is unavailable", () => {
  const proposal = simpleFallbackProposal("add ~45 min study essay");
  assert.equal(proposal.changes.length, 1);
  assert.equal(proposal.changes[0].after?.kind, "task");
  assert.equal(proposal.changes[0].after?.durationMin, 45);
  assert.equal(proposal.changes[0].after?.durationMax, 60);
});

test("applies a minimum duration to timed items", () => {
  const item = makeItem({
    title: "Focus block",
    kind: "task",
    startsAt: "2026-08-29T09:00:00.000Z",
    endsAt: "2026-08-29T10:00:00.000Z",
    durationMin: 60,
    durationMax: 90,
    status: "scheduled",
  });
  const shorter = itemWithDuration(item, 10);
  assert.equal(shorter.endsAt, "2026-08-29T09:10:00.000Z");
  assert.equal(shorter.durationMin, 10);
  assert.equal(shorter.durationMax, 10);
});

test("toggles all-day items back to a one-hour block", () => {
  const item = makeItem({
    title: "Trip",
    kind: "event",
    startsAt: new Date(2026, 7, 29).toISOString(),
    endsAt: new Date(2026, 7, 30).toISOString(),
    durationMin: 1440,
    durationMax: 1440,
    status: "scheduled",
  });
  const timed = toggleAllDayItem(item);
  assert.equal(timed.status, "scheduled");
  assert.equal(timed.durationMin, 60);
  assert.equal(timed.durationMax, 60);
});

test("normalizes invalid scheduled end times", () => {
  const item = makeItem({
    title: "Study",
    kind: "task",
    startsAt: "2026-08-29T09:00:00.000Z",
    endsAt: "2026-08-29T08:00:00.000Z",
    durationMin: 45,
    durationMax: 45,
    status: "scheduled",
  });
  assert.equal(normalizeItemTiming(item).endsAt, "2026-08-29T09:45:00.000Z");
});
