import type { EnergyRequirement } from "../calendar-engine.ts";
import type { CurrentStudyLocation } from "../now-recommender.ts";
import {
  type BlockChoice,
  type BlockChoiceInput,
  type BlockSuggestionCategory,
  type BlockSuggestionSource,
  type TimeBlock,
  type TimeBlockType,
} from "./types.ts";

// The catalogue of things a student might do in a given block, and the scoring
// that picks between them. Activities are deliberately ordinary: the point is
// to suggest something plausible for the next twenty minutes, not to plan.

export function suggestionId(
  category: BlockSuggestionCategory,
  sourceType: BlockSuggestionSource,
  sourceId: string | null,
) {
  return `${category}:${sourceType}:${sourceId ?? "default"}`;
}

export function recentPenalty(
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

export function chooseActivity(
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

export function activityDuration(activity: ContextualActivity, block: TimeBlock) {
  return Math.max(5, Math.min(activity.minutes, block.context.availableMinutes));
}

const socialContext = /sleepover|friend|girlfriend|boyfriend|party|visit|social/;

export const lightActivities: ContextualActivity[] = [
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

export const usefulActivities: ContextualActivity[] = [
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
