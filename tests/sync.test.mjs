import assert from "node:assert/strict";
import test from "node:test";

import {
  compactPendingMutations,
  mutationIdentity,
  prepareMutation,
} from "../lib/sync.ts";

test("time-block mutations share a cross-device identity by block key", () => {
  const first = {
    id: 1,
    table: "time_block_choices",
    action: "upsert",
    recordId: "device-a-id",
    payload: { id: "device-a-id", block_key: "2026-08-13:evening" },
    ownerKey: "user-1",
  };
  const second = {
    ...first,
    id: 2,
    recordId: "device-b-id",
    payload: {
      id: "device-b-id",
      block_key: "2026-08-13:evening",
      status: "selected",
    },
  };

  assert.equal(mutationIdentity(first), mutationIdentity(second));
  const compacted = compactPendingMutations([first, second]);
  assert.deepEqual(compacted.supersededIds, [1]);
  assert.equal(compacted.mutations.length, 1);
  assert.equal(compacted.mutations[0].payload.status, "selected");
});

test("time-block upserts target the actual unique constraint", () => {
  const prepared = prepareMutation(
    {
      table: "time_block_choices",
      action: "upsert",
      recordId: "local-id",
      payload: { id: "local-id", block_key: "today:school" },
    },
    "user-1",
  );

  assert.equal(prepared.onConflict, "user_id,block_key");
  assert.equal(prepared.payload.user_id, "user-1");
});

test("compaction preserves fields from an upsert followed by an update", () => {
  const compacted = compactPendingMutations([
    {
      id: 10,
      table: "calendar_items",
      action: "upsert",
      recordId: "item-1",
      payload: { id: "item-1", title: "Draft", status: "inbox" },
    },
    {
      id: 11,
      table: "calendar_items",
      action: "update",
      recordId: "item-1",
      payload: { title: "Final" },
    },
  ]);

  assert.equal(compacted.mutations[0].action, "upsert");
  assert.deepEqual(compacted.mutations[0].payload, {
    id: "item-1",
    title: "Final",
    status: "inbox",
  });
});
