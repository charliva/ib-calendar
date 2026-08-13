import assert from "node:assert/strict";
import test from "node:test";

import {
  homeworkCaptureToRow,
  rowToHomeworkCapture,
} from "../lib/school.ts";

test("completed homework round-trips through the synced row format", () => {
  const capture = rowToHomeworkCapture({
    id: "capture-1",
    raw_text: "Read chapter four",
    title: "Read chapter four",
    subject_id: null,
    deadline: null,
    task_type: "reading",
    estimated_minutes: 30,
    status: "completed",
    converted_assignment_id: null,
    scheduled_calendar_item_id: null,
    parsed_meta: {},
    created_at: "2026-08-13T12:00:00.000Z",
  });

  assert.equal(capture.status, "completed");
  assert.equal(homeworkCaptureToRow(capture).status, "completed");
});
