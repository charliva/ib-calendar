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
import {
  rowToItem,
  safeMutationPayload,
} from "../lib/db/queries/calendar.ts";
import {
  fromLocalInput,
  toLocalInput,
} from "../lib/calendar/time-inputs.ts";

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

test("maps a database row back to a synced calendar item", () => {
  const item = rowToItem({
    id: "item-1",
    kind: "task",
    title: "Read chapter",
    description: null,
    room: null,
    starts_at: "2026-08-29T09:00:00.000Z",
    ends_at: null,
    duration_min: 30,
    duration_max: 30,
    deadline: null,
    window_start: null,
    window_end: null,
    energy_type: "deep_focus",
    priority: "medium",
    splittable: false,
    flexibility: "flexible",
    constraints: [],
    assignment_id: null,
    assessment_id: null,
    intention_id: null,
    subject_id: null,
    revision_stage: null,
    review_offset_days: null,
    learned_at: null,
    homework_capture_id: null,
    task_context: "school",
    computer_required: false,
    work_type: null,
    required_energy: "medium",
    status: "scheduled",
    source: "manual",
    created_at: "2026-08-29T08:00:00.000Z",
  });
  assert.equal(item.syncStatus, "synced");
  assert.equal(item.endsAt, "2026-08-29T09:30:00.000Z");
});

test("repairs invalid offline calendar mutation payloads", () => {
  const mutation = {
    id: 1,
    table: "calendar_items",
    action: "upsert",
    recordId: "item-1",
    payload: {
      id: "item-1",
      starts_at: "2026-08-29T09:00:00.000Z",
      ends_at: "2026-08-29T08:00:00.000Z",
      duration_min: 45,
      window_start: "2026-08-29T10:00:00.000Z",
      window_end: "2026-08-29T09:00:00.000Z",
      status: "scheduled",
    },
    ownerKey: "user-1",
  };
  const payload = safeMutationPayload(mutation);
  assert.equal(payload.ends_at, "2026-08-29T09:45:00.000Z");
  assert.equal(payload.window_start, null);
  assert.equal(payload.window_end, null);
});

test("converts local datetime inputs without shifting wall time", () => {
  const localValue = toLocalInput(new Date(2026, 7, 29, 9, 30).toISOString());
  assert.equal(localValue, "2026-08-29T09:30");
  assert.equal(fromLocalInput(localValue), new Date(2026, 7, 29, 9, 30).toISOString());
  assert.equal(toLocalInput(null), "");
  assert.equal(fromLocalInput(""), null);
});
