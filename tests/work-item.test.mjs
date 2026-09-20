import assert from "node:assert/strict";
import test from "node:test";

import { makeItem, itemToRow } from "../lib/calendar-engine.ts";
import { rowToItem } from "../lib/db/queries/calendar.ts";

test("homework is persisted as one calendar work item", () => {
  const homework = makeItem({
    id: "work-1",
    kind: "task",
    title: "Read chapter four",
    workItemType: "homework",
    deadline: "2026-09-18T16:00:00.000Z",
  });

  const restored = rowToItem({
    ...itemToRow(homework),
    created_at: "2026-09-15T12:00:00.000Z",
  });

  assert.equal(restored.workItemType, "homework");
  assert.equal("homework_capture_id" in itemToRow(homework), false);
});

test("ordinary tasks remain work items without an alternate queue", () => {
  assert.equal(
    makeItem({ kind: "task", title: "Tidy notes" }).workItemType,
    "task",
  );
});
