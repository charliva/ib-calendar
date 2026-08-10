import { assignmentProgress } from "./assignment-planner.ts";
import {
  durationMinutes,
  isAllDayItem,
  type CalendarItem,
  type EnergyRequirement,
} from "./calendar-engine.ts";
import { intentionProgress, type Intention } from "./intentions.ts";
import {
  recommendNow,
  type CurrentStudyLocation,
  type NowRecommendation,
} from "./now-recommender.ts";
import { examCountdown, revisionProgress } from "./revision-planner.ts";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
  Subject,
} from "./school.ts";
import type { LearningSignal } from "./study-intelligence.ts";
import { isImportedTimetableItem } from "./timetable-import.ts";

const DAY = 86_400_000;

export type AttentionSource =
  | "calendar_item"
  | "recommendation"
  | "assignment"
  | "assessment"
  | "intention"
  | "class";

export type AttentionCard = {
  id: string;
  source: AttentionSource;
  sourceId: string | null;
  title: string;
  label: string;
  detail: string;
  reason: string;
  startsAt: string | null;
  endsAt: string | null;
  deadline: string | null;
};

export type IntentionOpportunity = {
  intention: Intention;
  durationMinutes: number;
  reason: string;
};

export type AttentionSnapshot = {
  now: AttentionCard | null;
  next: AttentionCard | null;
  later: AttentionCard[];
  recommendation: NowRecommendation | null;
  intentionOpportunity: IntentionOpportunity | null;
  availableMinutes: number;
  freeTimeIsValid: boolean;
};

export type AttentionInput = {
  now: Date;
  items: CalendarItem[];
  assignments: Assignment[];
  assessments: Assessment[];
  intentions: Intention[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  settings: SchoolDaySettings;
  currentLocation: CurrentStudyLocation;
  currentEnergy: EnergyRequirement;
  computerAvailable: boolean;
  learningSignals: LearningSignal[];
};

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function priorityScore(value: "low" | "medium" | "high") {
  return value === "high" ? 30 : value === "medium" ? 20 : 10;
}

function contextFits(
  expected: Intention["taskContext"],
  actual: CurrentStudyLocation,
) {
  return expected === "anywhere" || expected === actual;
}

function energyFits(required: EnergyRequirement, current: EnergyRequirement) {
  if (required === "high") return current === "high";
  if (required === "medium") return current !== "low";
  return true;
}

function intentionOpportunity(
  input: AttentionInput,
  availableMinutes: number,
): IntentionOpportunity | null {
  const weekday = input.now.getDay() === 0 ? 7 : input.now.getDay();
  const today = input.now.toISOString().slice(0, 10);
  const clock = `${String(input.now.getHours()).padStart(2, "0")}:${String(
    input.now.getMinutes(),
  ).padStart(2, "0")}`;
  return input.intentions
    .filter(
      (intention) =>
        intention.status === "active" &&
        intention.horizonStart <= today &&
        (!intention.horizonEnd || intention.horizonEnd >= today) &&
        intention.allowedWeekdays.includes(weekday) &&
        intention.allowedWindowStart <= clock &&
        intention.allowedWindowEnd > clock &&
        contextFits(intention.taskContext, input.currentLocation) &&
        energyFits(intention.requiredEnergy, input.currentEnergy) &&
        intention.preferredSessionMinutes <= availableMinutes,
    )
    .map((intention) => {
      const progress = intentionProgress(intention, input.items, input.now);
      const horizonUrgency = intention.horizonEnd
        ? Math.max(
            0,
            14 -
              Math.ceil(
                (new Date(`${intention.horizonEnd}T23:59:59`).getTime() -
                  input.now.getTime()) /
                  DAY,
              ),
          )
        : 0;
      return {
        intention,
        durationMinutes: Math.min(
          availableMinutes,
          intention.preferredSessionMinutes,
          progress.remainingMinutes || intention.preferredSessionMinutes,
        ),
        reason:
          progress.completedMinutes > 0
            ? `${progress.completedMinutes} minutes toward this intention in the current period.`
            : "This intention fits the time and context you have now.",
        score:
          priorityScore(intention.priority) +
          horizonUrgency +
          (progress.completedSessions < intention.targetSessions ? 8 : 0),
      };
    })
    .filter((entry) => entry.durationMinutes >= 5)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

type CalendarCardPosition = "now" | "next" | "later";

function cardForCalendarItem(
  item: CalendarItem,
  position: CalendarCardPosition,
): AttentionCard {
  const importedClass = isImportedTimetableItem(item);
  const allDay = isAllDayItem(item);
  const label = importedClass
    ? position === "now"
      ? "Class now"
      : position === "next"
        ? "Next class"
        : "Class later"
    : allDay
      ? position === "next"
        ? "Upcoming all-day event"
        : "All-day event"
      : position === "now"
        ? item.flexibility === "fixed"
          ? "Happening now"
          : "Current session"
        : position === "next"
          ? item.flexibility === "fixed"
            ? "Next commitment"
            : "Planned possibility"
          : item.flexibility === "fixed"
            ? "Scheduled later"
            : "Planned later";
  return {
    id: `calendar:${item.id}`,
    source: "calendar_item",
    sourceId: item.id,
    title: item.title,
    label,
    detail: allDay
      ? "All day"
      : item.startsAt && item.endsAt
        ? `${formatClock(item.startsAt)}–${formatClock(item.endsAt)}`
        : `${durationMinutes(item)} minutes`,
    reason: importedClass
      ? "A class from your imported timetable."
      : allDay
        ? "An all-day event on your calendar."
        : item.flexibility === "fixed"
        ? "A fixed commitment on your calendar."
        : "A study session already placed on your calendar.",
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    deadline: item.deadline,
  };
}

function cardForRecommendation(recommendation: NowRecommendation): AttentionCard {
  return {
    id: recommendation.id,
    source: "recommendation",
    sourceId: recommendation.sourceId,
    title: recommendation.title,
    label: "Best use of this window",
    detail: `${recommendation.durationMinutes} minutes`,
    reason: recommendation.reasons[0] ?? recommendation.detail,
    startsAt: null,
    endsAt: null,
    deadline: recommendation.deadline,
  };
}

export function buildAttentionSnapshot(input: AttentionInput): AttentionSnapshot {
  const result = recommendNow(input);
  const activeCalendar = input.items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.startsAt &&
        item.endsAt &&
        new Date(item.endsAt) > input.now,
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
    );
  const currentItem = activeCalendar.find(
    (item) =>
      new Date(item.startsAt!) <= input.now && new Date(item.endsAt!) > input.now,
  );
  const upcomingItems = activeCalendar.filter(
    (item) => new Date(item.startsAt!) > input.now,
  );
  const recommendation = result.recommendations[0] ?? null;
  const opportunity = intentionOpportunity(input, result.availableMinutes);

  let now: AttentionCard | null = null;
  if (currentItem) {
    now = cardForCalendarItem(currentItem, "now");
  } else if (result.nextFixed?.current) {
    now = {
      id: `class:${result.nextFixed.startsAt}`,
      source: "class",
      sourceId: null,
      title: result.nextFixed.title,
      label: "Class now",
      detail: `Until ${formatClock(result.nextFixed.endsAt)}`,
      reason: "Your timetable says this lesson is in progress.",
      startsAt: result.nextFixed.startsAt,
      endsAt: result.nextFixed.endsAt,
      deadline: null,
    };
  } else if (recommendation) {
    now = cardForRecommendation(recommendation);
  } else if (opportunity) {
    now = {
      id: `intention:${opportunity.intention.id}`,
      source: "intention",
      sourceId: opportunity.intention.id,
      title: opportunity.intention.title,
      label: "A worthwhile possibility",
      detail: `${opportunity.durationMinutes} minutes`,
      reason: opportunity.reason,
      startsAt: null,
      endsAt: null,
      deadline: opportunity.intention.horizonEnd,
    };
  }

  let next: AttentionCard | null = null;
  const firstUpcoming = upcomingItems[0];
  if (firstUpcoming) {
    next = cardForCalendarItem(firstUpcoming, "next");
  } else if (result.nextFixed && !result.nextFixed.current) {
    next = {
      id: `class:${result.nextFixed.startsAt}`,
      source: "class",
      sourceId: null,
      title: result.nextFixed.title,
      label: "Next class",
      detail: `Starts ${formatClock(result.nextFixed.startsAt)}`,
      reason: "This is the next fixed point in your day.",
      startsAt: result.nextFixed.startsAt,
      endsAt: result.nextFixed.endsAt,
      deadline: null,
    };
  } else if (!recommendation && opportunity && now?.source !== "intention") {
    next = {
      id: `intention:${opportunity.intention.id}`,
      source: "intention",
      sourceId: opportunity.intention.id,
      title: opportunity.intention.title,
      label: "Could fit next",
      detail: `${opportunity.durationMinutes} minutes`,
      reason: opportunity.reason,
      startsAt: null,
      endsAt: null,
      deadline: opportunity.intention.horizonEnd,
    };
  }

  const later: Array<AttentionCard & { score: number }> = [];
  for (const item of upcomingItems.slice(next?.source === "calendar_item" ? 1 : 0, 5)) {
    later.push({
      ...cardForCalendarItem(item, "later"),
      score: 100 - Math.min(90, (new Date(item.startsAt!).getTime() - input.now.getTime()) / DAY),
    });
  }
  for (const assignment of input.assignments) {
    if (["completed", "submitted", "archived"].includes(assignment.status)) continue;
    const progress = assignmentProgress(assignment, input.items);
    if (progress.completedMinutes >= assignment.estimatedMinutes) continue;
    const due = assignment.dueAt ? new Date(assignment.dueAt) : null;
    if (due && due.getTime() - input.now.getTime() > 21 * DAY) continue;
    later.push({
      id: `assignment:${assignment.id}`,
      source: "assignment",
      sourceId: assignment.id,
      title: assignment.title,
      label: "Assignment",
      detail: due ? `Due ${due.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : "No hard deadline",
      reason: `${Math.max(0, assignment.estimatedMinutes - progress.completedMinutes)} minutes remain.`,
      startsAt: null,
      endsAt: null,
      deadline: assignment.dueAt,
      score: priorityScore(assignment.priority) + (due ? Math.max(0, 21 - (due.getTime() - input.now.getTime()) / DAY) : 0),
    });
  }
  for (const assessment of input.assessments) {
    if (assessment.status !== "upcoming" || new Date(assessment.scheduledAt) <= input.now) continue;
    const progress = revisionProgress(assessment, input.items);
    later.push({
      id: `assessment:${assessment.id}`,
      source: "assessment",
      sourceId: assessment.id,
      title: assessment.title,
      label: "Assessment",
      detail: `${examCountdown(assessment, input.now)} days away`,
      reason: `${progress.remainingMinutes} revision minutes remain unplanned.`,
      startsAt: null,
      endsAt: null,
      deadline: assessment.scheduledAt,
      score: priorityScore(assessment.importance) + Math.max(0, 21 - examCountdown(assessment, input.now)),
    });
  }
  for (const intention of input.intentions.filter((entry) => entry.status === "active")) {
    if (now?.sourceId === intention.id || next?.sourceId === intention.id) continue;
    const progress = intentionProgress(intention, input.items, input.now);
    later.push({
      id: `intention:${intention.id}`,
      source: "intention",
      sourceId: intention.id,
      title: intention.title,
      label: "Active intention",
      detail: intention.cadence === "flexible" ? "When it fits" : `${intention.targetSessions}× ${intention.cadence}`,
      reason: `${progress.remainingMinutes} target minutes remain in this period.`,
      startsAt: null,
      endsAt: null,
      deadline: intention.horizonEnd,
      score: priorityScore(intention.priority),
    });
  }

  const seen = new Set<string>([now?.id, next?.id].filter(Boolean) as string[]);
  const rankedLater = later
    .sort((a, b) => b.score - a.score)
    .filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    })
    .slice(0, 6)
    .map(({ score, ...card }) => {
      void score;
      return card;
    });

  return {
    now,
    next,
    later: rankedLater,
    recommendation,
    intentionOpportunity: opportunity,
    availableMinutes: result.availableMinutes,
    freeTimeIsValid: result.freeTimeIsValid && !opportunity,
  };
}
