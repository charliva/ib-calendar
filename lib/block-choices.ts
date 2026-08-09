import {
  dateKey,
  durationMinutes,
  isCalendarSpanItem,
  type CalendarItem,
  type EnergyRequirement,
} from "./calendar-engine.ts";
import type { Intention } from "./intentions.ts";
import {
  recommendNow,
  type CurrentStudyLocation,
  type NowRecommendation,
} from "./now-recommender.ts";
import { schoolLessonRanges } from "./school-day-engine.ts";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
  Subject,
} from "./school.ts";
import type { Exploration, LearningSignal } from "./study-intelligence.ts";

const MINUTE = 60_000;
const DAY = 86_400_000;

export type TimeBlockType =
  | "morning"
  | "travel_to_school"
  | "school"
  | "travel_home"
  | "after_school"
  | "evening"
  | "night";

export type BlockSuggestionCategory =
  | "recovery"
  | "responsibility"
  | "meaningful";

export type BlockChoiceStatus =
  | "suggested"
  | "selected"
  | "started"
  | "completed"
  | "skipped";

export type BlockSuggestionSource =
  | "recovery"
  | "recommendation"
  | "intention"
  | "exploration"
  | "calendar_item"
  | "generic";

export type BlockSuggestion = {
  id: string;
  category: BlockSuggestionCategory;
  sourceType: BlockSuggestionSource;
  sourceId: string | null;
  title: string;
  description: string;
  estimatedDuration: number;
  reason: string | null;
};

export type TimeBlockContext = {
  label: string;
  location: CurrentStudyLocation;
  availableMinutes: number;
  flexible: boolean;
  fixedTitle: string | null;
  activeEventTitles?: string[];
  schoolStartsAt?: string | null;
  schoolEndsAt?: string | null;
  aiPolished?: boolean;
};

export type TimeBlock = {
  key: string;
  type: TimeBlockType;
  startsAt: string;
  endsAt: string;
  context: TimeBlockContext;
};

export type BlockChoice = {
  id: string;
  blockKey: string;
  blockType: TimeBlockType;
  startsAt: string;
  endsAt: string;
  context: TimeBlockContext;
  suggestions: BlockSuggestion[];
  selectedSuggestionId: string | null;
  status: BlockChoiceStatus;
  selectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlockChoiceInput = {
  now: Date;
  items: CalendarItem[];
  assignments: Assignment[];
  assessments: Assessment[];
  intentions: Intention[];
  explorations: Exploration[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  settings: SchoolDaySettings;
  currentEnergy: EnergyRequirement;
  computerAvailable: boolean;
  learningSignals: LearningSignal[];
  recentChoices: BlockChoice[];
};

const blockLabels: Record<TimeBlockType, string> = {
  morning: "Morning",
  travel_to_school: "Travel to school",
  school: "School",
  travel_home: "Travel home",
  after_school: "After school",
  evening: "Evening",
  night: "Night",
};

function atTime(day: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function blockKey(type: TimeBlockType, start: Date, end: Date) {
  const clock = (value: Date) =>
    `${String(value.getHours()).padStart(2, "0")}${String(value.getMinutes()).padStart(2, "0")}`;
  return `${dateKey(start)}:v2:${type}:${clock(start)}-${clock(end)}`;
}

function makeBlock(
  type: TimeBlockType,
  start: Date,
  end: Date,
  location: CurrentStudyLocation,
  now: Date,
  flexible = true,
  fixedTitle: string | null = null,
  label = blockLabels[type],
): TimeBlock {
  return {
    key: blockKey(type, start, end),
    type,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    context: {
      label,
      location,
      availableMinutes: Math.max(
        0,
        Math.floor((end.getTime() - Math.max(now.getTime(), start.getTime())) / MINUTE),
      ),
      flexible,
      fixedTitle,
    },
  };
}

function activeBlockingItem(items: CalendarItem[], now: Date) {
  return items.find(
    (item) =>
      item.status === "scheduled" &&
      item.flexibility === "fixed" &&
      item.startsAt &&
      item.endsAt &&
      !isCalendarSpanItem(item) &&
      new Date(item.startsAt) <= now &&
      new Date(item.endsAt) > now,
  );
}

function activeAmbientItems(items: CalendarItem[], now: Date) {
  return items.filter(
    (item) =>
      item.status === "scheduled" &&
      item.startsAt &&
      item.endsAt &&
      (isCalendarSpanItem(item) || item.flexibility === "flexible") &&
      new Date(item.startsAt) <= now &&
      new Date(item.endsAt) > now,
  );
}

export function inferCurrentTimeBlock(
  input: Pick<
    BlockChoiceInput,
    "now" | "items" | "classes" | "classExceptions" | "settings"
  >,
): TimeBlock {
  const { now, items, classes, classExceptions, settings } = input;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const lessons = schoolLessonRanges(
    classes,
    classExceptions,
    dayStart,
    new Date(dayEnd.getTime() - 1),
    items,
  ).filter((range) => dateKey(range.start) === dateKey(now));
  const ambientTitles = activeAmbientItems(items, now).map((item) => item.title);
  const firstLesson = lessons[0];
  const lastLesson = lessons.at(-1);
  const contextBlock = (...args: Parameters<typeof makeBlock>) => {
    const block = makeBlock(...args);
    return {
      ...block,
      context: {
        ...block.context,
        activeEventTitles: ambientTitles,
        schoolStartsAt: firstLesson?.start.toISOString() ?? null,
        schoolEndsAt: lastLesson?.start.toISOString() ?? null,
      },
    };
  };

  const currentLesson = lessons.find(
    (lesson) => lesson.start <= now && lesson.end > now,
  );
  if (currentLesson) {
    return contextBlock(
      "school",
      currentLesson.start,
      currentLesson.end,
      "school",
      now,
      false,
      "Class",
      "Class time",
    );
  }

  const blockingItem = activeBlockingItem(items, now);
  if (blockingItem?.startsAt && blockingItem.endsAt) {
    return contextBlock(
      now.getHours() >= 21 ? "night" : now.getHours() >= 18 ? "evening" : "after_school",
      new Date(blockingItem.startsAt),
      new Date(blockingItem.endsAt),
      "home",
      now,
      false,
      blockingItem.title,
      "Current activity",
    );
  }

  const nextFixedStart = items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.flexibility === "fixed" &&
        item.startsAt &&
        item.endsAt &&
        !isCalendarSpanItem(item) &&
        new Date(item.startsAt) > now &&
        dateKey(new Date(item.startsAt)) === dateKey(now),
    )
    .map((item) => new Date(item.startsAt!))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const finish = (candidate: Date) =>
    nextFixedStart && nextFixedStart < candidate ? nextFixedStart : candidate;

  if (lessons.length) {
    const first = lessons[0];
    const last = lessons.at(-1)!;
    const commuteStart = new Date(
      first.start.getTime() - settings.travelBeforeSchoolMinutes * MINUTE,
    );
    const arriveHome = new Date(
      last.end.getTime() + settings.travelHomeMinutes * MINUTE,
    );
    if (now < commuteStart) {
      return contextBlock(
        "morning",
        atTime(now, "05:30"),
        finish(commuteStart),
        "home",
        now,
      );
    }
    if (now < first.start) {
      return contextBlock(
        "travel_to_school",
        commuteStart,
        finish(first.start),
        "commute",
        now,
      );
    }
    if (now < last.start) {
      const previous = [...lessons].reverse().find((lesson) => lesson.end <= now);
      const next = lessons.find((lesson) => lesson.start > now);
      return contextBlock(
        "school",
        previous?.end ?? first.start,
        finish(next?.start ?? last.end),
        "school",
        now,
        true,
        null,
        "School gap",
      );
    }
    if (now < arriveHome) {
      return contextBlock(
        "travel_home",
        last.end,
        finish(arriveHome),
        "commute",
        now,
      );
    }
    const eveningStart = atTime(now, "18:00");
    if (now < eveningStart) {
      return contextBlock(
        "after_school",
        arriveHome,
        finish(eveningStart),
        "home",
        now,
      );
    }
  }

  const noon = atTime(now, "12:00");
  const evening = atTime(now, "18:00");
  const night = atTime(now, settings.schoolworkCutoff || "21:00");
  if (!lessons.length && now < noon) {
    return contextBlock("morning", atTime(now, "05:30"), finish(noon), "home", now);
  }
  if (now < evening) {
    return contextBlock(
      "after_school",
      lessons.length ? new Date(lessons.at(-1)!.end) : noon,
      finish(evening),
      "home",
      now,
      true,
      null,
      lessons.length ? "After school" : "Afternoon",
    );
  }
  if (now < night) {
    return contextBlock("evening", evening, finish(night), "home", now);
  }
  return contextBlock("night", night, finish(dayEnd), "home", now);
}

function suggestionId(
  category: BlockSuggestionCategory,
  sourceType: BlockSuggestionSource,
  sourceId: string | null,
) {
  return `${category}:${sourceType}:${sourceId ?? "default"}`;
}

function recentPenalty(
  sourceType: BlockSuggestionSource,
  sourceId: string | null,
  recent: BlockChoice[],
) {
  if (!sourceId) return 0;
  let penalty = 0;
  for (const choice of recent) {
    const suggestion = choice.suggestions.find(
      (entry) => entry.sourceType === sourceType && entry.sourceId === sourceId,
    );
    if (!suggestion) continue;
    penalty += choice.selectedSuggestionId === suggestion.id ? -2 : 7;
  }
  return penalty;
}

type ContextualActivity = {
  id: string;
  title: string;
  description: string;
  minutes: number;
  blocks?: TimeBlockType[];
  locations?: CurrentStudyLocation[];
  energy?: EnergyRequirement[];
  ambient?: RegExp;
  score?: number;
};

function ambientText(block: TimeBlock) {
  return (block.context.activeEventTitles ?? []).join(" ").toLowerCase();
}

function activityScore(
  activity: ContextualActivity,
  block: TimeBlock,
  input: BlockChoiceInput,
  sourceType: BlockSuggestionSource,
) {
  if (activity.blocks && !activity.blocks.includes(block.type)) return -Infinity;
  if (activity.locations && !activity.locations.includes(block.context.location)) {
    return -Infinity;
  }
  if (activity.energy && !activity.energy.includes(input.currentEnergy)) return -Infinity;
  if (activity.ambient && !activity.ambient.test(ambientText(block))) return -Infinity;

  const seed = input.now.getDate() + input.now.getDay() + activity.id.length;
  return (
    (activity.score ?? 0) +
    (seed % 4) -
    recentPenalty(sourceType, activity.id, input.recentChoices)
  );
}

function chooseActivity(
  activities: ContextualActivity[],
  block: TimeBlock,
  input: BlockChoiceInput,
  sourceType: BlockSuggestionSource,
) {
  return activities
    .map((activity) => ({
      activity,
      score: activityScore(activity, block, input, sourceType),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort(
      (a, b) =>
        b.score - a.score || a.activity.id.localeCompare(b.activity.id),
    )[0]?.activity;
}

function activityDuration(activity: ContextualActivity, block: TimeBlock) {
  return Math.max(5, Math.min(activity.minutes, block.context.availableMinutes));
}

const socialContext = /sleepover|friend|girlfriend|boyfriend|party|visit|social/;

const lightActivities: ContextualActivity[] = [
  {
    id: "social-breather",
    title: "Take a quiet breather",
    description: "Step away for a few minutes, lie down, or listen to music before rejoining the day.",
    minutes: 20,
    ambient: socialContext,
    score: 12,
  },
  {
    id: "lie-down",
    title: "Lie down for a while",
    description: "Get comfortable and let your attention settle without needing to achieve anything.",
    minutes: 30,
    locations: ["home"],
    energy: ["low", "medium"],
    score: 7,
  },
  {
    id: "calming-game",
    title: "Play a calming game",
    description: "Play something gentle for a contained stretch and let the block stay low-pressure.",
    minutes: 45,
    locations: ["home"],
    blocks: ["after_school", "evening", "night"],
    score: 6,
  },
  {
    id: "listen-to-music",
    title: "Listen to music",
    description: "Put on something you like and give your mind a genuine pause.",
    minutes: 25,
    score: 5,
  },
  {
    id: "gilmore-girls",
    title: "Watch Gilmore Girls",
    description: "Watch an episode and let that be enough for this part of the day.",
    minutes: 45,
    locations: ["home"],
    blocks: ["after_school", "evening", "night"],
    score: 5,
  },
  {
    id: "gentle-yoga",
    title: "Do some gentle yoga",
    description: "Stretch and move slowly for a few minutes to reset physically.",
    minutes: 15,
    locations: ["home"],
    score: 5,
  },
  {
    id: "easy-journey",
    title: "Keep the journey easy",
    description: "Listen to music and let the trip remain mentally light.",
    minutes: 30,
    locations: ["commute"],
    score: 10,
  },
  {
    id: "school-reset",
    title: "Take the gap",
    description: "Get water or food, step outside, and let this free period be restorative.",
    minutes: 20,
    locations: ["school"],
    score: 10,
  },
];

const usefulActivities: ContextualActivity[] = [
  {
    id: "ten-minute-clean",
    title: "Do a 10-minute clean",
    description: "Reset one small area, stop after ten minutes, and enjoy the clearer space.",
    minutes: 10,
    locations: ["home"],
    score: 6,
  },
  {
    id: "read-a-book",
    title: "Read a book",
    description: "Read a few pages of a book you already care about; no notes required.",
    minutes: 20,
    score: 5,
  },
  {
    id: "organize-school-work",
    title: "Organize school work",
    description: "Put loose notes, files, and upcoming tasks into order, then stop.",
    minutes: 15,
    locations: ["home", "school"],
    score: 7,
  },
  {
    id: "review-last-lesson",
    title: "Review the last lesson",
    description: "Turn the last class into a few clear notes or questions while it is still fresh.",
    minutes: 15,
    locations: ["school"],
    score: 9,
  },
  {
    id: "capture-loose-ends",
    title: "Capture today’s loose ends",
    description: "Write down homework and unanswered questions from today, then leave them for later.",
    minutes: 10,
    locations: ["commute"],
    score: 9,
  },
  {
    id: "prepare-tomorrow",
    title: "Prepare for tomorrow",
    description: "Pack what you need and identify the one school item that matters most tomorrow.",
    minutes: 10,
    blocks: ["evening", "night", "morning"],
    locations: ["home"],
    score: 8,
  },
];

const meaningfulActivities: ContextualActivity[] = [
  {
    id: "be-present-socially",
    title: "Be present with the people here",
    description: "Let the social plan be the meaningful choice instead of squeezing productivity around it.",
    minutes: 45,
    ambient: socialContext,
    score: 13,
  },
  {
    id: "journal",
    title: "Journal for a few minutes",
    description: "Write down what is on your mind or what surprised you today without polishing it.",
    minutes: 15,
    locations: ["home"],
    score: 7,
  },
  {
    id: "write",
    title: "Write something",
    description: "Spend a contained stretch writing an idea, scene, reflection, or argument you care about.",
    minutes: 30,
    score: 6,
  },
  {
    id: "walk",
    title: "Go for a walk",
    description: "Leave the screen behind and walk without needing the time to produce anything.",
    minutes: 30,
    locations: ["home", "school"],
    score: 6,
  },
  {
    id: "morning-curiosity",
    title: "Read something interesting",
    description: "Follow a question or idea before the demands of the day take over.",
    minutes: 20,
    blocks: ["morning", "travel_to_school"],
    score: 8,
  },
  {
    id: "connect",
    title: "Connect with someone",
    description: "Message or spend time with someone you care about, with no productivity angle attached.",
    minutes: 20,
    blocks: ["school", "travel_home", "after_school", "evening"],
    score: 5,
  },
];

function recoverySuggestion(
  block: TimeBlock,
  input: BlockChoiceInput,
): BlockSuggestion {
  const longSchoolDay = schoolLessonRanges(
    input.classes,
    input.classExceptions,
    atTime(input.now, "00:00"),
    atTime(input.now, "23:59"),
    input.items,
  ).reduce((total, lesson) => total + (lesson.end.getTime() - lesson.start.getTime()) / MINUTE, 0) >= 300;
  const activity =
    chooseActivity(lightActivities, block, input, "recovery") ??
    lightActivities[2];
  return {
    id: suggestionId("recovery", "recovery", activity.id),
    category: "recovery",
    sourceType: "recovery",
    sourceId: activity.id,
    title: activity.title,
    description: activity.description,
    estimatedDuration: activityDuration(activity, block),
    reason:
      input.currentEnergy === "low"
        ? "Your energy is set to low, so recovery deserves a real place among the choices."
        : longSchoolDay
          ? "This follows a long school day."
          : "Rest is a valid use of this block.",
  };
}

function responsibilityFallback(
  block: TimeBlock,
  input: BlockChoiceInput,
): BlockSuggestion {
  const activity =
    chooseActivity(usefulActivities, block, input, "generic") ??
    usefulActivities[1];
  return {
    id: suggestionId("responsibility", "generic", activity.id),
    category: "responsibility",
    sourceType: "generic",
    sourceId: activity.id,
    title: activity.title,
    description: activity.description,
    estimatedDuration: activityDuration(activity, block),
    reason: "No urgent task needs to take over this block.",
  };
}

function responsibilitySuggestion(
  block: TimeBlock,
  input: BlockChoiceInput,
): BlockSuggestion {
  if (block.type === "night") return responsibilityFallback(block, input);
  const result = recommendNow({
    now: input.now,
    items: input.items,
    assignments: input.assignments,
    assessments: input.assessments,
    subjects: input.subjects,
    classes: input.classes,
    classExceptions: input.classExceptions,
    settings: input.settings,
    currentLocation: block.context.location,
    currentEnergy: input.currentEnergy,
    computerAvailable: input.computerAvailable,
    learningSignals: input.learningSignals,
  });
  const selected = [...result.recommendations]
    .sort(
      (a, b) =>
        b.score - recentPenalty("recommendation", b.id, input.recentChoices) -
        (a.score - recentPenalty("recommendation", a.id, input.recentChoices)),
    )[0];
  if (!selected) return responsibilityFallback(block, input);
  return {
    id: suggestionId("responsibility", "recommendation", selected.id),
    category: "responsibility",
    sourceType: "recommendation",
    sourceId: selected.id,
    title: selected.title,
    description: responsibilityDescription(selected),
    estimatedDuration: Math.min(selected.durationMinutes, block.context.availableMinutes),
    reason: selected.reasons[0] ?? selected.detail,
  };
}

function responsibilityDescription(recommendation: NowRecommendation) {
  if (recommendation.source === "assessment") {
    return `Give ${recommendation.durationMinutes} focused minutes to ${recommendation.title}, then reassess.`;
  }
  return `Move ${recommendation.title} forward for ${recommendation.durationMinutes} minutes without giving it the whole block.`;
}

function contextFits(
  expected: Intention["taskContext"],
  actual: CurrentStudyLocation,
) {
  return expected === "anywhere" || expected === actual;
}

function meaningfulSuggestion(
  block: TimeBlock,
  input: BlockChoiceInput,
): BlockSuggestion {
  const available = block.context.availableMinutes;
  if (socialContext.test(ambientText(block))) {
    const activity = meaningfulActivities[0];
    return {
      id: suggestionId("meaningful", "generic", activity.id),
      category: "meaningful",
      sourceType: "generic",
      sourceId: activity.id,
      title: activity.title,
      description: activity.description,
      estimatedDuration: activityDuration(activity, block),
      reason: "Your active social plan is context for the block, not an obstacle to planning it.",
    };
  }
  const personalItems = input.items
    .filter(
      (item) =>
        item.kind === "task" &&
        !item.assignmentId &&
        !item.assessmentId &&
        !item.subjectId &&
        !["completed", "archived"].includes(item.status) &&
        item.durationMin <= available &&
        (item.taskContext === "anywhere" || item.taskContext === block.context.location),
    )
    .sort(
      (a, b) =>
        recentPenalty("calendar_item", a.id, input.recentChoices) -
        recentPenalty("calendar_item", b.id, input.recentChoices),
    );
  const personalItem = personalItems[0];
  if (personalItem) {
    const minutes = Math.min(available, durationMinutes(personalItem));
    return {
      id: suggestionId("meaningful", "calendar_item", personalItem.id),
      category: "meaningful",
      sourceType: "calendar_item",
      sourceId: personalItem.id,
      title: personalItem.title,
      description: `Give ${minutes} minutes to ${personalItem.title} because it matters to you, not because school demands it.`,
      estimatedDuration: minutes,
      reason: "A personal item already in your system fits this block.",
    };
  }

  const intention = input.intentions
    .filter(
      (entry) =>
        entry.status === "active" &&
        contextFits(entry.taskContext, block.context.location) &&
        entry.preferredSessionMinutes <= available,
    )
    .sort(
      (a, b) =>
        recentPenalty("intention", a.id, input.recentChoices) -
          recentPenalty("intention", b.id, input.recentChoices) ||
        (a.subjectId ? 1 : 0) - (b.subjectId ? 1 : 0),
    )[0];
  if (intention) {
    return {
      id: suggestionId("meaningful", "intention", intention.id),
      category: "meaningful",
      sourceType: "intention",
      sourceId: intention.id,
      title: intention.title,
      description: intention.notes || `Spend a contained session moving ${intention.title} forward.`,
      estimatedDuration: Math.min(available, intention.preferredSessionMinutes),
      reason: "This is something you chose to make room for, rather than a fixed obligation.",
    };
  }

  const exploration = input.explorations
    .filter((entry) => entry.status === "saved" || entry.status === "generated")
    .sort(
      (a, b) =>
        recentPenalty("exploration", a.id, input.recentChoices) -
        recentPenalty("exploration", b.id, input.recentChoices),
    )[0];
  if (exploration) {
    return {
      id: suggestionId("meaningful", "exploration", exploration.id),
      category: "meaningful",
      sourceType: "exploration",
      sourceId: exploration.id,
      title: `Explore ${exploration.sourceTitle}`,
      description: exploration.directions[0]?.prompt || exploration.framing,
      estimatedDuration: Math.min(30, available),
      reason: "You previously marked this as worth thinking about more deeply.",
    };
  }

  const activity =
    chooseActivity(meaningfulActivities, block, input, "generic") ??
    meaningfulActivities[2];
  return {
    id: suggestionId("meaningful", "generic", activity.id),
    category: "meaningful",
    sourceType: "generic",
    sourceId: activity.id,
    title: activity.title,
    description: activity.description,
    estimatedDuration: activityDuration(activity, block),
    reason: "A good block can include something chosen for interest, connection, or creativity.",
  };
}

export function buildBlockChoice(input: BlockChoiceInput): BlockChoice | null {
  const block = inferCurrentTimeBlock(input);
  if (!block.context.flexible || block.context.availableMinutes < 5) return null;
  const existing = input.recentChoices.find(
    (choice) => choice.blockKey === block.key,
  );
  if (existing) return existing;
  const nowIso = input.now.toISOString();
  const suggestions = [
    recoverySuggestion(block, input),
    responsibilitySuggestion(block, input),
    meaningfulSuggestion(block, input),
  ];
  return {
    id: crypto.randomUUID(),
    blockKey: block.key,
    blockType: block.type,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    context: block.context,
    suggestions,
    selectedSuggestionId: null,
    status: "suggested",
    selectedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function updateBlockChoice(
  choice: BlockChoice,
  selectedSuggestionId: string | null,
  status: BlockChoiceStatus,
  now = new Date(),
): BlockChoice {
  const hasSelection = Boolean(
    selectedSuggestionId &&
      choice.suggestions.some((suggestion) => suggestion.id === selectedSuggestionId),
  );
  return {
    ...choice,
    selectedSuggestionId: hasSelection ? selectedSuggestionId : null,
    status: hasSelection ? (status === "suggested" ? "selected" : status) : "suggested",
    selectedAt: hasSelection ? now.toISOString() : null,
    updatedAt: now.toISOString(),
  };
}

export function blockChoiceToRow(choice: BlockChoice) {
  return {
    id: choice.id,
    block_key: choice.blockKey,
    block_type: choice.blockType,
    starts_at: choice.startsAt,
    ends_at: choice.endsAt,
    context: choice.context,
    suggestions: choice.suggestions,
    selected_suggestion_id: choice.selectedSuggestionId,
    status: choice.status,
    selected_at: choice.selectedAt,
  };
}

export function rowToBlockChoice(row: Record<string, unknown>): BlockChoice {
  return {
    id: String(row.id),
    blockKey: String(row.block_key),
    blockType: row.block_type as TimeBlockType,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    context: row.context as TimeBlockContext,
    suggestions: Array.isArray(row.suggestions)
      ? (row.suggestions as BlockSuggestion[]).slice(0, 3)
      : [],
    selectedSuggestionId:
      typeof row.selected_suggestion_id === "string"
        ? row.selected_suggestion_id
        : null,
    status: row.status as BlockChoiceStatus,
    selectedAt: typeof row.selected_at === "string" ? row.selected_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
