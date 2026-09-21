// The cloud snapshot used to ask for `*` on every table and for every
// `calendar_history.snapshot` — a complete copy of the calendar, fifty of them,
// on every sync. Narrowing those reads is what these tests protect, and the
// hazard that comes with narrowing them: a mapper that starts reading a column
// nobody fetches any more silently produces a field full of defaults.
//
// So rather than restating the column lists, these watch the mappers. Each row
// handed to a mapper is a proxy that records every column it touches; if that
// set is not covered by the list the snapshot asks for, the mapper is reading
// something that will arrive undefined in production.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSIGNMENT_COLUMNS,
  BLOCK_CHOICE_COLUMNS,
  BLOCK_CHOICE_LIMIT,
  BLOCK_CHOICE_WINDOW_DAYS,
  CALENDAR_ITEM_COLUMNS,
  HISTORY_LIST_COLUMNS,
} from "../lib/calendar/snapshot-columns.ts";
import { rowToItem } from "../lib/db/queries/calendar.ts";
import { rowToAssignment } from "../lib/school.ts";
import { rowToBlockChoice } from "../lib/block-choices.ts";

/** Runs `mapper` over a row that reports which columns it was asked for. */
function columnsReadBy(mapper) {
  const touched = new Set();
  const row = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string") return undefined;
        touched.add(key);
        return undefined;
      },
      has(_target, key) {
        if (typeof key === "string") touched.add(key);
        return true;
      },
    },
  );
  mapper(row);
  return touched;
}

test("every column rowToItem reads is one the snapshot fetches", () => {
  const missing = [...columnsReadBy(rowToItem)].filter(
    (column) => !CALENDAR_ITEM_COLUMNS.includes(column),
  );
  assert.deepEqual(missing, []);
});

test("every column rowToAssignment reads is one the snapshot fetches", () => {
  const missing = [...columnsReadBy(rowToAssignment)].filter(
    (column) => !ASSIGNMENT_COLUMNS.includes(column),
  );
  assert.deepEqual(missing, []);
});

test("every column rowToBlockChoice reads is one the snapshot fetches", () => {
  const missing = [...columnsReadBy(rowToBlockChoice)].filter(
    (column) => !BLOCK_CHOICE_COLUMNS.includes(column),
  );
  assert.deepEqual(missing, []);
});

test("the history list never carries the snapshots themselves", () => {
  // The whole point: a label and a time are what the list shows, and the
  // snapshot behind an entry is a full copy of the calendar. Fetching fifty of
  // them on every sync is what put the account over its egress quota.
  assert.ok(!HISTORY_LIST_COLUMNS.includes("snapshot"));
  assert.deepEqual(HISTORY_LIST_COLUMNS, ["id", "label", "created_at"]);
});

test("no column list asks for user_id, which the caller already knows", () => {
  for (const columns of [
    CALENDAR_ITEM_COLUMNS,
    ASSIGNMENT_COLUMNS,
    BLOCK_CHOICE_COLUMNS,
    HISTORY_LIST_COLUMNS,
  ]) {
    assert.ok(!columns.includes("user_id"));
  }
});

test("the block picker's window stays small enough to be worth reading", () => {
  // buildBlockChoice only ever looks for today's block key, so this window
  // exists to cover a device that has been offline for a while, not to build
  // an archive. Each row carries its suggestions as JSON.
  assert.ok(BLOCK_CHOICE_WINDOW_DAYS <= 14);
  assert.ok(BLOCK_CHOICE_LIMIT <= 100);
});
