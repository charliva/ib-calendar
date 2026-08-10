import {
  durationMinutes,
  makeItem,
  type CalendarItem,
  type CalendarProposal,
} from "./calendar-engine.ts";
import type { Assessment } from "./school.ts";
import {
  energyFitScore,
  energyForTime,
  energyTypeForWorkType,
  protectedSchoolRanges,
  studySlotSuitability,
  type SchoolSchedulingContext,
} from "./school-day-engine.ts";
import type {
  EnergyRequirement,
  SchoolWorkType,
} from "./calendar-engine.ts";

const MINUTE = 60_000;
const DAY = 86_400_000;

export type RevisionProgress = {
  sessions: CalendarItem[];
  plannedMinutes: number;
  learnedMinutes: number;
  remainingMinutes: number;
};

export type RevisionPlan = {
  proposal: CalendarProposal | null;
  scheduledMinutes: number;
  unscheduledMinutes: number;
};

export const REVISION_STAGES = [
  "Overview & scope",
  "Core concepts",
  "Target weak topics",
  "Active recall",
  "Practice questions",
  "Final review",
] as const;

export function examCountdown(assessment: Assessment, now = new Date()) {
  const milliseconds = new Date(assessment.scheduledAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(milliseconds / DAY));
}

export function revisionProgress(
  assessment: Assessment,
  items: CalendarItem[],
): RevisionProgress {
  const sessions = items.filter(
    (item) => item.assessmentId === assessment.id && item.status !== "archived",
  );
  const plannedMinutes = sessions
    .filter((item) => item.status === "scheduled" || item.status === "completed")
    .reduce((total, item) => total + durationMinutes(item), 0);
  const learnedMinutes = sessions
    .filter((item) => Boolean(item.learnedAt))
    .reduce((total, item) => total + durationMinutes(item), 0);
  return {
    sessions,
    plannedMinutes,
    learnedMinutes,
    remainingMinutes: Math.max(
      0,
      assessment.estimatedRevisionMinutes - plannedMinutes,
    ),
  };
}

function isoWeekday(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function atTime(day: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function roundUp(date: Date, step = 15) {
  return new Date(Math.ceil(date.getTime() / (step * MINUTE)) * step * MINUTE);
}

type Gap = { start: Date; end: Date };

function freeGaps(
  assessment: Assessment,
  items: CalendarItem[],
  now: Date,
  onlyDay?: Date,
  school?: SchoolSchedulingContext,
): Gap[] {
  const exam = new Date(assessment.scheduledAt);
  const firstDay = new Date(onlyDay ?? now);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(onlyDay ?? exam);
  lastDay.setHours(0, 0, 0, 0);
  const busy = items
    .filter(
      (item) =>
        item.status === "scheduled" && item.startsAt && item.endsAt,
    )
    .map((item) => ({
      start: new Date(item.startsAt!),
      end: new Date(item.endsAt!),
    }));
  if (school) {
    busy.push(
      ...protectedSchoolRanges(
        school.classes,
        school.classExceptions,
        school.settings,
        firstDay,
        lastDay,
        { energyType: "deep_focus" },
        school.calendarItems,
      ).map((range) => ({ start: range.start, end: range.end })),
    );
  }
  const gaps: Gap[] = [];

  for (
    let timestamp = firstDay.getTime();
    timestamp <= lastDay.getTime();
    timestamp += DAY
  ) {
    const day = new Date(timestamp);
    if (!assessment.allowedWeekdays.includes(isoWeekday(day))) continue;
    let start = atTime(day, assessment.revisionWindowStart);
    let end = atTime(day, assessment.revisionWindowEnd);
    if (start < now) start = roundUp(now);
    if (end > exam) end = exam;
    if (end <= start) continue;
    const blocks = busy
      .filter((block) => block.start < end && block.end > start)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    let cursor = start;
    for (const block of blocks) {
      if (block.start > cursor) {
        gaps.push({
          start: new Date(cursor),
          end: new Date(Math.min(block.start.getTime(), end.getTime())),
        });
      }
      if (block.end > cursor) cursor = block.end;
    }
    if (cursor < end) gaps.push({ start: new Date(cursor), end });
  }
  return gaps;
}

function session(
  assessment: Assessment,
  stage: string,
  start: Date,
  minutes: number,
  options: { reviewOffsetDays?: number } = {},
) {
  const workType: SchoolWorkType = stage.startsWith("Review") ||
    stage === "Active recall"
    ? "memorization"
    : stage === "Overview & scope"
      ? "reading"
      : stage === "Practice questions"
        ? "problem_solving"
        : stage === "Final review"
          ? "light_work"
          : "deep_focus";
  const requiredEnergy: EnergyRequirement =
    workType === "deep_focus" || workType === "problem_solving"
      ? "high"
      : workType === "light_work"
        ? "low"
        : "medium";
  return makeItem({
    kind: "task",
    title: `${assessment.title} · ${stage}`,
    description: `Revision for ${assessment.title}`,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + minutes * MINUTE).toISOString(),
    durationMin: Math.min(assessment.minRevisionSessionMinutes, minutes),
    durationMax: Math.max(assessment.maxRevisionSessionMinutes, minutes),
    deadline: assessment.scheduledAt,
    windowStart: atTime(start, assessment.revisionWindowStart).toISOString(),
    windowEnd: atTime(start, assessment.revisionWindowEnd).toISOString(),
    energyType: energyTypeForWorkType(workType),
    priority: assessment.importance,
    flexibility: "elastic",
    constraints: ["Before exam", "Linked revision runway"],
    assessmentId: assessment.id,
    revisionStage: stage,
    reviewOffsetDays: options.reviewOffsetDays ?? null,
    taskContext: "anywhere",
    computerRequired: false,
    workType,
    requiredEnergy,
    status: "scheduled",
    source: "command",
  });
}

function proposalFor(
  title: string,
  summary: string,
  sessions: CalendarItem[],
): CalendarProposal {
  return {
    id: crypto.randomUUID(),
    title,
    summary,
    source: "command",
    changes: sessions.map((item) => ({
      id: crypto.randomUUID(),
      type: "create",
      itemId: null,
      reason: "Fits before the exam without overlapping the current calendar.",
      before: null,
      after: item,
    })),
  };
}

export function planRevisionRunway(
  assessment: Assessment,
  items: CalendarItem[],
  now = new Date(),
  school?: SchoolSchedulingContext,
): RevisionPlan {
  const progress = revisionProgress(assessment, items);
  if (
    assessment.status !== "upcoming" ||
    new Date(assessment.scheduledAt) <= now ||
    progress.remainingMinutes === 0
  ) {
    return {
      proposal: null,
      scheduledMinutes: 0,
      unscheduledMinutes: progress.remainingMinutes,
    };
  }
  const candidateGaps = freeGaps(
    assessment,
    items,
    now,
    undefined,
    school,
  );
  if (school) {
    for (const gap of candidateGaps) {
      const [hour, minute] = school.settings.preferredStudyStart
        .split(":")
        .map(Number);
      const preferred = new Date(gap.start);
      preferred.setHours(hour, minute, 0, 0);
      if (
        gap.start < preferred &&
        gap.end.getTime() - preferred.getTime() >=
          Math.min(
            assessment.minRevisionSessionMinutes,
            progress.remainingMinutes,
          ) *
            MINUTE
      ) {
        gap.start = preferred;
      }
    }
  }
  const gaps = candidateGaps
    .filter(
      (gap) =>
        (gap.end.getTime() - gap.start.getTime()) / MINUTE >=
        Math.min(
          assessment.minRevisionSessionMinutes,
          progress.remainingMinutes,
        ),
    )
    .filter((gap) => {
      if (!school) return true;
      const end = new Date(
        gap.start.getTime() +
          Math.min(
            assessment.minRevisionSessionMinutes,
            progress.remainingMinutes,
          ) *
            MINUTE,
      );
      return studySlotSuitability(
        gap.start,
        end,
        {
          taskContext: "anywhere",
          computerRequired: false,
          energyType: "deep_focus",
        },
        school.classes,
        school.classExceptions,
        school.settings,
        school.calendarItems,
      ).suitable;
    });
  if (school) {
    gaps.sort((a, b) => {
      const duration = Math.min(
        assessment.minRevisionSessionMinutes,
        progress.remainingMinutes,
      );
      const aFit = studySlotSuitability(
        a.start,
        new Date(a.start.getTime() + duration * MINUTE),
        {
          taskContext: "anywhere",
          computerRequired: false,
          energyType: "deep_focus",
        },
        school.classes,
        school.classExceptions,
        school.settings,
        school.calendarItems,
      );
      const bFit = studySlotSuitability(
        b.start,
        new Date(b.start.getTime() + duration * MINUTE),
        {
          taskContext: "anywhere",
          computerRequired: false,
          energyType: "deep_focus",
        },
        school.classes,
        school.classExceptions,
        school.settings,
        school.calendarItems,
      );
      if (aFit.preferred !== bFit.preferred) return aFit.preferred ? -1 : 1;
      const aEnergy = energyFitScore(
        "high",
        energyForTime(
          a.start,
          new Date(a.start.getTime() + duration * MINUTE),
          school.settings,
        ),
      );
      const bEnergy = energyFitScore(
        "high",
        energyForTime(
          b.start,
          new Date(b.start.getTime() + duration * MINUTE),
          school.settings,
        ),
      );
      if (aEnergy !== bEnergy) return bEnergy - aEnergy;
      return a.start.getTime() - b.start.getTime();
    });
  }
  if (!gaps.length) {
    return {
      proposal: null,
      scheduledMinutes: 0,
      unscheduledMinutes: progress.remainingMinutes,
    };
  }

  const availableDays = new Map<string, Gap>();
  for (const gap of gaps) {
    const key = gap.start.toDateString();
    const current = availableDays.get(key);
    if (
      !current ||
      gap.end.getTime() - gap.start.getTime() >
        current.end.getTime() - current.start.getTime()
    ) {
      availableDays.set(key, gap);
    }
  }
  const days = [...availableDays.values()];
  const idealCount = Math.min(
    days.length,
    REVISION_STAGES.length,
    Math.max(
      1,
      Math.ceil(
        progress.remainingMinutes /
          Math.min(
            assessment.maxRevisionSessionMinutes,
            Math.max(assessment.minRevisionSessionMinutes, 40),
          ),
      ),
    ),
  );
  let remaining = progress.remainingMinutes;
  const planned: CalendarItem[] = [];
  const existingCount = progress.sessions.filter(
    (item) => item.reviewOffsetDays === null,
  ).length;

  for (let index = 0; index < idealCount && remaining > 0; index += 1) {
    const dayIndex =
      idealCount === 1
        ? days.length - 1
        : Math.round((index / (idealCount - 1)) * (days.length - 1));
    const gap = days[dayIndex];
    const sessionsLeft = idealCount - index;
    const target = Math.ceil(remaining / sessionsLeft / 5) * 5;
    const available = Math.floor(
      (gap.end.getTime() - gap.start.getTime()) / MINUTE / 5,
    ) * 5;
    const minutes = Math.min(
      remaining,
      available,
      assessment.maxRevisionSessionMinutes,
      Math.max(assessment.minRevisionSessionMinutes, target),
    );
    if (minutes < Math.min(assessment.minRevisionSessionMinutes, remaining)) {
      continue;
    }
    const stageIndex = Math.min(
      REVISION_STAGES.length - 1,
      existingCount + index,
    );
    planned.push(
      session(assessment, REVISION_STAGES[stageIndex], gap.start, minutes),
    );
    remaining -= minutes;
  }

  const scheduledMinutes = progress.remainingMinutes - remaining;
  return {
    scheduledMinutes,
    unscheduledMinutes: remaining,
    proposal: planned.length
      ? proposalFor(
          `Build revision runway for ${assessment.title}`,
          `${planned.length} targeted session${planned.length === 1 ? "" : "s"} across the ${examCountdown(assessment, now)}-day runway. ${
            remaining > 0
              ? `${remaining} minutes still need space.`
              : "Nothing changes until you apply this preview."
          }`,
          planned,
        )
      : null,
  };
}

export function planSpacedReviews(
  learnedSession: CalendarItem,
  assessment: Assessment,
  items: CalendarItem[],
  learnedAt = new Date(),
  school?: SchoolSchedulingContext,
): CalendarProposal | null {
  if (!assessment.spacedRepetitionEnabled) return null;
  const exam = new Date(assessment.scheduledAt);
  const reviewMinutes = Math.max(
    10,
    Math.min(30, Math.round(durationMinutes(learnedSession) / 2 / 5) * 5),
  );
  const reviews: CalendarItem[] = [];
  const occupied = [...items];

  for (const interval of assessment.reviewIntervalsDays) {
    const target = new Date(learnedAt.getTime() + interval * DAY);
    if (target >= exam) continue;
    target.setHours(0, 0, 0, 0);
    const gap = freeGaps(
      assessment,
      occupied,
      learnedAt,
      target,
      school,
    ).find(
      (candidate) =>
        candidate.end.getTime() - candidate.start.getTime() >=
        reviewMinutes * MINUTE,
    );
    if (!gap) continue;
    const review = session(
      assessment,
      `Review · +${interval} day${interval === 1 ? "" : "s"}`,
      gap.start,
      reviewMinutes,
      { reviewOffsetDays: interval },
    );
    reviews.push(review);
    occupied.push(review);
  }
  return reviews.length
    ? proposalFor(
        `Review ${learnedSession.revisionStage ?? assessment.title}`,
        `${reviews.length} spaced review${reviews.length === 1 ? "" : "s"} proposed at ${assessment.reviewIntervalsDays.join(", ")}-day intervals where they fit before the exam.`,
        reviews,
      )
    : null;
}
