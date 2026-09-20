// promoteLegacyOfflineHomework runs once per app start against whatever is
// still sitting in this device's IndexedDB from before homework captures
// became ordinary work items. Two bugs made it destructive rather than
// idempotent, and both are pinned here.
//
//  1. It re-queued an upsert for every item it classified as a review, even
//     when the item already carried that type — so a device that had been
//     offline pushed its stale copy over a newer server row on every boot.
//  2. It matched captures against item ids only. Scheduling a capture minted
//     a calendar item under a new id and recorded the link in
//     scheduledCalendarItemId, so every already-scheduled piece of homework
//     came back as a duplicate inbox copy and was uploaded.
//
// supabase/migrations/20260915085253_merge_work_items.sql is the authority
// for both: it backfills work_item_type server-side, and it skips a capture
// `where not exists (... item.id = capture.scheduled_calendar_item_id)`.

import assert from "node:assert/strict";
import test from "node:test";

import { promoteLegacyOfflineHomework } from "../lib/calendar/legacy-offline.ts";
import { makeItem } from "../lib/calendar-engine.ts";

const review = makeItem({
  id: "item-review",
  kind: "task",
  title: "Biology - review session",
  workItemType: "review",
  startsAt: "2026-09-21T15:00:00.000Z",
  endsAt: "2026-09-21T15:30:00.000Z",
  status: "scheduled",
});

test("an already-migrated review item is not re-queued", () => {
  const { changed } = promoteLegacyOfflineHomework([review], {});
  assert.deepEqual(changed, []);
});

test("re-running the migration stays quiet on its own output", () => {
  const first = promoteLegacyOfflineHomework([review], {});
  const second = promoteLegacyOfflineHomework(first.items, {});
  const third = promoteLegacyOfflineHomework(second.items, {});
  assert.deepEqual(second.changed, []);
  assert.deepEqual(third.changed, []);
});

test("an untyped legacy review session is promoted exactly once", () => {
  const legacy = { ...review, workItemType: null };
  const first = promoteLegacyOfflineHomework([legacy], {});
  assert.equal(first.changed.length, 1);
  assert.equal(first.changed[0].workItemType, "review");

  const second = promoteLegacyOfflineHomework(first.items, {});
  assert.deepEqual(second.changed, []);
});

test("a capture already scheduled as an item is not duplicated", () => {
  const scheduled = makeItem({
    id: "item-from-capture",
    kind: "task",
    title: "Read chapter four",
    status: "scheduled",
  });
  const { items, changed } = promoteLegacyOfflineHomework([scheduled], {
    homeworkCaptures: [
      {
        id: "capture-1",
        title: "Read chapter four",
        estimatedMinutes: 30,
        status: "converted",
        scheduledCalendarItemId: "item-from-capture",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "item-from-capture");
  assert.deepEqual(changed, []);
});

test("a capture that was never scheduled is still promoted", () => {
  const { items, changed } = promoteLegacyOfflineHomework([], {
    homeworkCaptures: [
      {
        id: "capture-2",
        title: "Finish the problem set",
        estimatedMinutes: 45,
        status: "pending",
        scheduledCalendarItemId: null,
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "capture-2");
  assert.equal(items[0].workItemType, "homework");
  assert.equal(items[0].status, "inbox");
  assert.equal(changed.length, 1);
});

test("a capture pointing at an item this device no longer has is kept", () => {
  // The link is stale, so the work would otherwise vanish entirely.
  const { items } = promoteLegacyOfflineHomework([], {
    homeworkCaptures: [
      {
        id: "capture-3",
        title: "Essay plan",
        estimatedMinutes: 60,
        status: "pending",
        scheduledCalendarItemId: "an-item-that-is-gone",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "capture-3");
});
