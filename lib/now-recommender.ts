import {
  assignmentProgress,
  formatWorkMinutes,
} from "./assignment-planner.ts";
import {
  dateKey,
  durationMinutes,
  type CalendarItem,
  type EnergyRequirement,
  type EnergyType,
  type Priority,
  type SchoolWorkType,
  type TaskContext,
} from "./calendar-engine.ts";
import { examCountdown, revisionProgress } from "./revision-planner.ts";
import {
  energyFitScore,
  energyTypeForWorkType,
  lessonOccurrences,
  protectedSchoolRanges,
} from "./school-day-engine.ts";
import {
  DEFAULT_FOCUS_TEMPLATES,
  type Assessment,
  type Assignment,
  type ClassException,
  type SchoolClass,
  type SchoolDaySettings,
  type Subject,
} from "./school.ts";

const MINUTE = 60_000;
const DAY = 86_400_000;

export type CurrentStudyLocation =
  | "home"
  | "school"
  | "library"
  | "commute";

export type NowRecommendation = {
  id: string;
  source: "assignment" | "assessment" | "calendar_item";
  sourceId: string;
  title: string;
  durationMinutes: number;
  detail: string;
  reasons: string[];
  score: number;
  assignmentId: string | null;
  assessmentId: string | null;
  calendarItemId: string | null;
  workType: SchoolWorkType | null;
  requiredEnergy: EnergyRequirement;
  energyType: EnergyType;
  taskContext: TaskContext;
  computerRequired: boolean;
  revisionStage: string | null;
  deadline: string | null;
};

export type FixedCommitment = {
  title: string;
  startsAt: string;
  endsAt: string;
  current: boolean;
};

export type NowRecommendationResult = {
  availableMinutes: number;
  nextFixed: FixedCommitment | null;
  recommendations: NowRecommendation[];
  blockedReason: string | null;
};

export type NowRecommendationInput = {
  now: Date;
  items: CalendarItem[];
  assignments: Assignment[];
  assessments: Assessment[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  settings: SchoolDaySettings;
  currentLocation: CurrentStudyLocation;
  currentEnergy: EnergyRequirement;
  computerAvailable: boolean;
};

function priorityScore(priority: Priority) {
  return priority === "high" ? 28 : priority === "medium" ? 18 : 8;
}

function urgencyScore(deadline: string | null, now: Date) {
  if (!deadline) return 4;
  const hours = (new Date(deadline).getTime() - now.getTime()) / (60 * MINUTE);
  if (hours <= 0) return 38;
  if (hours <= 24) return 34;
  if (hours <= 72) return 25;
  if (hours <= 168) return 16;
  return 7;
}

function dueReason(deadline: string | null, now: Date) {
  if (!deadline) return "No hard deadline";
  const due = new Date(deadline);
  const milliseconds = due.getTime() - now.getTime();
  if (milliseconds <= 0) return "Deadline has passed";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateKey(due) === dateKey(tomorrow)) return "Due tomorrow";
  const hours = Math.ceil(milliseconds / (60 * MINUTE));
  if (hours <= 24) return hours === 1 ? "Due in 1 hour" : `Due in ${hours} hours`;
  const days = Math.ceil(milliseconds / DAY);
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

function contextFits(
  context: TaskContext,
  location: CurrentStudyLocation,
) {
  if (context === "anywhere") return true;
  if (location === "commute") return false;
  return context === location;
}

function timeValue(day: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function overlaps(
  start: Date,
  end: Date,
  range: { start: Date; end: Date },
) {
  return start < range.end && end > range.start;
}

function fixedCommitments(input: NowRecommendationInput) {
  const horizon = new Date(input.now.getTime() + 7 * DAY);
  const subjectById = new Map(
    input.subjects.map((subject) => [subject.id, subject]),
  );
  const classById = new Map(
    input.classes.map((schoolClass) => [schoolClass.id, schoolClass]),
  );
  const lessons = lessonOccurrences(
    input.classes,
    input.classExceptions,
    input.now,
    horizon,
  ).map((lesson) => {
    const schoolClass = classById.get(lesson.classId);
    const subject = schoolClass
      ? subjectById.get(schoolClass.subjectId)
      : undefined;
    return {
      title: subject?.name ?? "Class",
      start: lesson.start,
      end: lesson.end,
    };
  });
  const calendar = input.items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.flexibility === "fixed" &&
        item.startsAt &&
        item.endsAt &&
        new Date(item.endsAt) > input.now,
    )
    .map((item) => ({
      title: item.title,
      start: new Date(item.startsAt!),
      end: new Date(item.endsAt!),
    }));
  return [...lessons, ...calendar]
    .filter((entry) => entry.end > input.now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function durationFor(
  workType: SchoolWorkType | null,
  minimum: number,
  maximum: number,
  remaining: number,
  available: number,
  settings: SchoolDaySettings,
  splittable = true,
) {
  const template = workType
    ? (settings.focusTemplates?.[workType] ??
      DEFAULT_FOCUS_TEMPLATES[workType])
    : DEFAULT_FOCUS_TEMPLATES.light_work;
  const preferredMin = Math.max(5, minimum || template.durationMin);
  const preferredMax = Math.max(
    preferredMin,
    maximum || template.durationMax,
  );
  const targetDuration = Math.max(
    preferredMin,
    Math.min(preferredMax, template.durationMax),
  );
  if (!splittable && remaining > available) return 0;
  if (available < Math.min(preferredMin, remaining)) return 0;
  return Math.max(
    5,
    Math.min(remaining, available, targetDuration),
  );
}

function protectedReason(
  start: Date,
  end: Date,
  energyType: EnergyType,
  requiredEnergy: EnergyRequirement,
  input: NowRecommendationInput,
) {
  const cutoff = timeValue(start, input.settings.schoolworkCutoff);
  if (end > cutoff) {
    return `Schoolwork ends at ${input.settings.schoolworkCutoff}.`;
  }
  if (
    input.currentLocation === "commute" &&
    !input.settings.allowCommuteScheduling
  ) {
    return "Commute time is protected.";
  }
  if (
    input.currentLocation === "commute" &&
    (energyType === "deep_focus" || requiredEnergy === "high")
  ) {
    return "High-focus work does not fit a commute.";
  }
  const ranges = protectedSchoolRanges(
    input.classes,
    input.classExceptions,
    input.settings,
    start,
    end,
    { energyType },
  );
  const lesson = ranges.find(
    (range) => range.kind === "lesson" && overlaps(start, end, range),
  );
  if (lesson) return "A lesson is in progress.";
  const commute = ranges.find(
    (range) => range.kind === "commute" && overlaps(start, end, range),
  );
  if (commute && !input.settings.allowCommuteScheduling) {
    return "Commute time is protected.";
  }
  const recovery = ranges.find(
    (range) => range.kind === "recovery" && overlaps(start, end, range),
  );
  if (
    recovery &&
    input.currentLocation === "home" &&
    energyType === "deep_focus"
  ) {
    return "Deep work is protected during after-school recovery.";
  }
  return null;
}

function allowedNow(assignment: Assignment, now: Date, minutes: number) {
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  if (!assignment.allowedWeekdays.includes(weekday)) return false;
  const start = timeValue(now, assignment.allowedWindowStart);
  const end = timeValue(now, assignment.allowedWindowEnd);
  return now >= start && new Date(now.getTime() + minutes * MINUTE) <= end;
}

function explanationForEnergy(
  required: EnergyRequirement,
  current: EnergyRequirement,
) {
  if (required === current) return `Matches your ${current}-energy setting`;
  if (energyFitScore(required, current) >= 3) {
    return `Comfortable with ${current} energy`;
  }
  return `Needs ${required} energy`;
}

function recommendationScore(
  priority: Priority,
  deadline: string | null,
  now: Date,
  requiredEnergy: EnergyRequirement,
  currentEnergy: EnergyRequirement,
  duration: number,
  available: number,
  progressBonus = 0,
) {
  return (
    priorityScore(priority) +
    urgencyScore(deadline, now) +
    energyFitScore(requiredEnergy, currentEnergy) * 6 +
    (duration <= available ? 12 : 0) +
    progressBonus
  );
}

function revisionProfile(days: number): {
  stage: string;
  workType: SchoolWorkType;
  requiredEnergy: EnergyRequirement;
} {
  if (days <= 1) {
    return {
      stage: "Final review",
      workType: "light_work",
      requiredEnergy: "low",
    };
  }
  if (days <= 3) {
    return {
      stage: "Practice questions",
      workType: "problem_solving",
      requiredEnergy: "high",
    };
  }
  if (days <= 7) {
    return {
      stage: "Active recall",
      workType: "memorization",
      requiredEnergy: "medium",
    };
  }
  return {
    stage: "Overview & scope",
    workType: "reading",
    requiredEnergy: "medium",
  };
}

export function recommendNow(
  input: NowRecommendationInput,
): NowRecommendationResult {
  const commitments = fixedCommitments(input);
  const currentFixed = commitments.find(
    (entry) => entry.start <= input.now && entry.end > input.now,
  );
  const next = currentFixed ?? commitments.find((entry) => entry.start > input.now);
  const nextFixed = next
    ? {
        title: next.title,
        startsAt: next.start.toISOString(),
        endsAt: next.end.toISOString(),
        current: Boolean(currentFixed),
      }
    : null;
  if (currentFixed) {
    return {
      availableMinutes: 0,
      nextFixed,
      recommendations: [],
      blockedReason: `${currentFixed.title} is in progress.`,
    };
  }

  const cutoff = timeValue(input.now, input.settings.schoolworkCutoff);
  const availableUntil = next
    ? Math.min(next.start.getTime(), cutoff.getTime())
    : cutoff.getTime();
  const availableMinutes = Math.max(
    0,
    Math.min(120, Math.floor((availableUntil - input.now.getTime()) / MINUTE)),
  );
  if (availableMinutes < 5) {
    return {
      availableMinutes,
      nextFixed,
      recommendations: [],
      blockedReason:
        input.now >= cutoff
          ? `Schoolwork ends at ${input.settings.schoolworkCutoff}.`
          : "There is not enough time before the next fixed event.",
    };
  }

  const recommendations: NowRecommendation[] = [];
  for (const assignment of input.assignments) {
    if (
      ["completed", "submitted", "archived"].includes(assignment.status) ||
      !contextFits(assignment.taskContext, input.currentLocation) ||
      (assignment.computerRequired && !input.computerAvailable)
    ) {
      continue;
    }
    const progress = assignmentProgress(assignment, input.items);
    const workRemaining = Math.max(
      0,
      assignment.estimatedMinutes - progress.completedMinutes,
    );
    const unplanned = Math.min(progress.remainingMinutes, workRemaining);
    if (unplanned <= 0) continue;
    const duration = durationFor(
      assignment.workType,
      assignment.minSessionMinutes,
      assignment.maxSessionMinutes,
      unplanned,
      availableMinutes,
      input.settings,
      assignment.splittable,
    );
    if (!duration || !allowedNow(assignment, input.now, duration)) continue;
    const energyType = energyTypeForWorkType(assignment.workType);
    const requiredEnergy = assignment.requiredEnergy ?? "medium";
    const end = new Date(input.now.getTime() + duration * MINUTE);
    if (
      protectedReason(
        input.now,
        end,
        energyType,
        requiredEnergy,
        input,
      )
    ) {
      continue;
    }
    const progressPercent = assignment.estimatedMinutes
      ? Math.round(
          (progress.completedMinutes / assignment.estimatedMinutes) * 100,
        )
      : 0;
    recommendations.push({
      id: `assignment:${assignment.id}`,
      source: "assignment",
      sourceId: assignment.id,
      title: assignment.title,
      durationMinutes: duration,
      detail: `${formatWorkMinutes(progress.completedMinutes)} of ${formatWorkMinutes(assignment.estimatedMinutes)} completed`,
      reasons: [
        dueReason(assignment.dueAt, input.now),
        explanationForEnergy(requiredEnergy, input.currentEnergy),
        `${duration} minutes fits before your next commitment`,
      ],
      score: recommendationScore(
        assignment.priority,
        assignment.dueAt,
        input.now,
        requiredEnergy,
        input.currentEnergy,
        duration,
        availableMinutes,
        progressPercent >= 50 ? 5 : 0,
      ),
      assignmentId: assignment.id,
      assessmentId: null,
      calendarItemId: null,
      workType: assignment.workType,
      requiredEnergy,
      energyType,
      taskContext: assignment.taskContext,
      computerRequired: assignment.computerRequired,
      revisionStage: null,
      deadline: assignment.dueAt,
    });
  }

  for (const assessment of input.assessments) {
    if (
      assessment.status !== "upcoming" ||
      new Date(assessment.scheduledAt) <= input.now
    ) {
      continue;
    }
    const progress = revisionProgress(assessment, input.items);
    if (progress.remainingMinutes <= 0) continue;
    const days = examCountdown(assessment, input.now);
    const profile = revisionProfile(days);
    const duration = durationFor(
      profile.workType,
      assessment.minRevisionSessionMinutes,
      assessment.maxRevisionSessionMinutes,
      progress.remainingMinutes,
      availableMinutes,
      input.settings,
    );
    if (!duration) continue;
    const energyType = energyTypeForWorkType(profile.workType);
    const end = new Date(input.now.getTime() + duration * MINUTE);
    if (
      protectedReason(
        input.now,
        end,
        energyType,
        profile.requiredEnergy,
        input,
      )
    ) {
      continue;
    }
    recommendations.push({
      id: `assessment:${assessment.id}`,
      source: "assessment",
      sourceId: assessment.id,
      title: `${assessment.title} · ${profile.stage}`,
      durationMinutes: duration,
      detail: `${formatWorkMinutes(progress.plannedMinutes)} of ${formatWorkMinutes(assessment.estimatedRevisionMinutes)} planned`,
      reasons: [
        days === 1 ? "Exam tomorrow" : `Exam in ${days} days`,
        `${profile.stage} suits this point in the runway`,
        explanationForEnergy(profile.requiredEnergy, input.currentEnergy),
      ],
      score: recommendationScore(
        assessment.importance,
        assessment.scheduledAt,
        input.now,
        profile.requiredEnergy,
        input.currentEnergy,
        duration,
        availableMinutes,
        days <= 3 ? 10 : 0,
      ),
      assignmentId: null,
      assessmentId: assessment.id,
      calendarItemId: null,
      workType: profile.workType,
      requiredEnergy: profile.requiredEnergy,
      energyType,
      taskContext: "anywhere",
      computerRequired: false,
      revisionStage: profile.stage,
      deadline: assessment.scheduledAt,
    });
  }

  for (const item of input.items) {
    const startsSoon = Boolean(
      item.startsAt &&
      new Date(item.startsAt).getTime() >= input.now.getTime() - 5 * MINUTE &&
      new Date(item.startsAt).getTime() <=
        input.now.getTime() + 20 * MINUTE,
    );
    const movableScheduled = Boolean(
      item.status === "scheduled" &&
      item.flexibility !== "fixed" &&
      item.startsAt &&
      item.endsAt &&
      new Date(item.endsAt) > input.now,
    );
    if (
      item.kind === "event" ||
      item.status === "completed" ||
      item.status === "archived" ||
      (item.status !== "inbox" && !movableScheduled) ||
      !contextFits(item.taskContext, input.currentLocation) ||
      (item.computerRequired && !input.computerAvailable)
    ) {
      continue;
    }
    const expectedDuration = durationMinutes(item);
    const canAdjustDuration =
      item.flexibility === "elastic" || item.splittable;
    const duration = canAdjustDuration
      ? Math.min(availableMinutes, item.durationMax)
      : expectedDuration;
    if (
      duration < item.durationMin ||
      duration > item.durationMax ||
      (!canAdjustDuration && duration > availableMinutes)
    ) {
      continue;
    }
    const end = new Date(input.now.getTime() + duration * MINUTE);
    if (
      protectedReason(
        input.now,
        end,
        item.energyType,
        item.requiredEnergy ?? "medium",
        input,
      )
    ) {
      continue;
    }
    const plannedFor = item.startsAt
      ? new Date(item.startsAt).toLocaleString(undefined, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    recommendations.push({
      id: `calendar:${item.id}`,
      source: "calendar_item",
      sourceId: item.id,
      title: item.title,
      durationMinutes: duration,
      detail: startsSoon
        ? "Already planned for now"
        : plannedFor
          ? `Planned for ${plannedFor} · start it early`
          : "From your task inbox",
      reasons: [
        dueReason(item.deadline, input.now),
        explanationForEnergy(item.requiredEnergy ?? "medium", input.currentEnergy),
        `${duration} minutes fits now`,
      ],
      score: recommendationScore(
        item.priority,
        item.deadline,
        input.now,
        item.requiredEnergy ?? "medium",
        input.currentEnergy,
        duration,
        availableMinutes,
        startsSoon ? 18 : movableScheduled ? 10 : 0,
      ),
      assignmentId: item.assignmentId,
      assessmentId: item.assessmentId,
      calendarItemId: item.id,
      workType: item.workType,
      requiredEnergy: item.requiredEnergy ?? "medium",
      energyType: item.energyType,
      taskContext: item.taskContext,
      computerRequired: item.computerRequired,
      revisionStage: item.revisionStage,
      deadline: item.deadline,
    });
  }

  const seenSources = new Set<string>();
  const ranked = recommendations
    .sort((a, b) => b.score - a.score || a.durationMinutes - b.durationMinutes)
    .filter((recommendation) => {
      const sourceKey = recommendation.assignmentId
        ? `assignment:${recommendation.assignmentId}`
        : recommendation.assessmentId
          ? `assessment:${recommendation.assessmentId}`
          : recommendation.id;
      if (seenSources.has(sourceKey)) return false;
      seenSources.add(sourceKey);
      return true;
    })
    .slice(0, 3);

  return {
    availableMinutes,
    nextFixed,
    recommendations: ranked,
    blockedReason: null,
  };
}
