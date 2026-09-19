import assert from "node:assert/strict";
import test from "node:test";
import {
  planRevisionRunway,
  planSpacedReviews,
  revisionProgress,
} from "../lib/revision-planner.ts";
import { makeItem } from "../lib/calendar-engine.ts";

const assessment = {
  id: "biology-exam",
  subjectId: "biology",
  title: "Biology Exam",
  scheduledAt: "2026-08-11T08:00:00.000Z",
  endsAt: "2026-08-11T10:00:00.000Z",
  assessmentType: "Exam",
  importance: "high",
  weight: 25,
  notes: "",
  status: "upcoming",
  estimatedRevisionMinutes: 240,
  allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
  revisionWindowStart: "15:00",
  revisionWindowEnd: "21:00",
  minRevisionSessionMinutes: 25,
  maxRevisionSessionMinutes: 60,
  spacedRepetitionEnabled: true,
  reviewIntervalsDays: [1, 3, 7, 14],
  createdAt: "2026-07-01T00:00:00.000Z",
};

test("builds an increasingly targeted revision runway around conflicts", () => {
  const event = makeItem({
    id: "fixed-event",
    kind: "event",
    title: "Fixed event",
    startsAt: "2026-08-03T13:00:00.000Z",
    endsAt: "2026-08-03T15:00:00.000Z",
    durationMin: 120,
    durationMax: 120,
    flexibility: "fixed",
  });
  const result = planRevisionRunway(
    assessment,
    [event],
    new Date("2026-07-30T10:00:00.000Z"),
  );
  assert.ok(result.proposal);
  assert.equal(result.scheduledMinutes, 240);
  assert.equal(result.unscheduledMinutes, 0);
  const sessions = result.proposal.changes.map((change) => change.after);
  assert.equal(sessions.length, 6);
  assert.equal(sessions[0].revisionStage, "Overview & scope");
  assert.equal(sessions.at(-1).revisionStage, "Final review");
  for (const session of sessions) {
    assert.equal(session.assessmentId, assessment.id);
    assert.ok(new Date(session.endsAt) <= new Date(assessment.scheduledAt));
    assert.equal(
      new Date(session.startsAt) < new Date(event.endsAt) &&
        new Date(session.endsAt) > new Date(event.startsAt),
      false,
    );
  }
});

test("learned material proposes configured reviews that fit before the exam", () => {
  const learned = makeItem({
    kind: "task",
    title: "Biology Exam · Core concepts",
    assessmentId: assessment.id,
    revisionStage: "Core concepts",
    startsAt: "2026-07-30T13:00:00.000Z",
    endsAt: "2026-07-30T13:40:00.000Z",
    durationMin: 25,
    durationMax: 60,
    status: "completed",
    learnedAt: "2026-07-30T13:40:00.000Z",
  });
  const proposal = planSpacedReviews(
    learned,
    assessment,
    [learned],
    new Date("2026-07-30T13:40:00.000Z"),
  );
  assert.ok(proposal);
  const offsets = proposal.changes.map(
    (change) => change.after.reviewOffsetDays,
  );
  assert.deepEqual(offsets, [1, 3, 7]);
});

test("revision progress is derived from linked calendar sessions", () => {
  const planned = makeItem({
    kind: "task",
    title: "Overview",
    assessmentId: assessment.id,
    revisionStage: "Overview & scope",
    startsAt: "2026-08-01T13:00:00.000Z",
    endsAt: "2026-08-01T13:40:00.000Z",
    durationMin: 25,
    durationMax: 60,
    status: "scheduled",
  });
  const learned = {
    ...planned,
    id: "learned-session",
    learnedAt: "2026-08-01T13:40:00.000Z",
    status: "completed",
  };
  const progress = revisionProgress(assessment, [planned, learned]);
  assert.equal(progress.plannedMinutes, 80);
  assert.equal(progress.learnedMinutes, 40);
  assert.equal(progress.remainingMinutes, 160);
});
