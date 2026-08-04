import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentProgress,
  planAssignment,
} from "../lib/assignment-planner.ts";
import { makeItem } from "../lib/calendar-engine.ts";

const assignment = {
  id: "history-essay",
  subjectId: "history",
  title: "History Essay",
  dueAt: "2026-07-31T18:00:00.000Z",
  estimatedMinutes: 180,
  priority: "medium",
  status: "inbox",
  submissionMethod: "",
  notes: "",
  gradeWeight: null,
  taskContext: "home",
  computerRequired: true,
  allowedWeekdays: [2, 3, 4, 5],
  allowedWindowStart: "15:00",
  allowedWindowEnd: "21:00",
  minSessionMinutes: 30,
  maxSessionMinutes: 75,
  splittable: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

test("decomposes remaining work into linked, conflict-free sessions", () => {
  const blockingEvent = makeItem({
    id: "dinner",
    kind: "event",
    title: "Dinner",
    startsAt: "2026-07-30T17:00:00.000Z",
    endsAt: "2026-07-30T18:00:00.000Z",
    durationMin: 60,
    durationMax: 60,
    flexibility: "fixed",
  });
  const result = planAssignment(
    assignment,
    [blockingEvent],
    new Date("2026-07-28T12:00:00.000Z"),
  );

  assert.ok(result.proposal);
  assert.equal(result.scheduledMinutes, 180);
  assert.equal(result.unscheduledMinutes, 0);
  const sessions = result.proposal.changes.map((change) => change.after);
  assert.ok(sessions.length >= 3);
  for (const session of sessions) {
    assert.equal(session.assignmentId, assignment.id);
    assert.ok(new Date(session.endsAt) <= new Date(assignment.dueAt));
    assert.equal(
      new Date(session.startsAt) < new Date(blockingEvent.endsAt) &&
        new Date(session.endsAt) > new Date(blockingEvent.startsAt),
      false,
    );
  }
});

test("derives planned and completed progress from session state", () => {
  const planned = makeItem({
    kind: "task",
    title: "Planned",
    assignmentId: assignment.id,
    startsAt: "2026-07-29T15:00:00.000Z",
    endsAt: "2026-07-29T16:00:00.000Z",
    durationMin: 30,
    durationMax: 75,
    status: "scheduled",
  });
  const completed = makeItem({
    kind: "task",
    title: "Completed",
    assignmentId: assignment.id,
    startsAt: "2026-07-28T15:00:00.000Z",
    endsAt: "2026-07-28T15:45:00.000Z",
    durationMin: 30,
    durationMax: 75,
    status: "completed",
  });
  const progress = assignmentProgress(assignment, [planned, completed]);
  assert.equal(progress.plannedMinutes, 105);
  assert.equal(progress.completedMinutes, 45);
  assert.equal(progress.remainingMinutes, 75);
});
