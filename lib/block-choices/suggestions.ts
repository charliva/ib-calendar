import type { EnergyRequirement } from "../calendar-engine.ts";
import { recommendNow, type NowRecommendation } from "../now-recommender.ts";
import { schoolLessonRanges } from "../school-day-engine.ts";
import { PERSONAL_TEMPLATES, type PersonalTemplate } from "../personal-templates.ts";
import {
  MINUTE,
  type BlockChoiceInput,
  type BlockSuggestion,
  type TimeBlock,
} from "./types.ts";
import { atTime } from "./blocks.ts";
import {
  activityDuration,
  chooseActivity,
  lightActivities,
  recentPenalty,
  suggestionId,
  usefulActivities,
} from "./activities.ts";

// The three kinds of suggestion the picker offers for a block: something
// restful, something the student is responsible for, and something meaningful.
// Each returns null when it has nothing honest to offer, so the picker shows
// fewer choices rather than filler.

export function recoverySuggestion(
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

export function responsibilitySuggestion(
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

function personalTemplateFitsBlock(
  template: PersonalTemplate,
  block: TimeBlock,
): boolean {
  if (template.locations && !template.locations.includes(block.context.location)) {
    return false;
  }
  if (template.blocks && !template.blocks.includes(block.type)) {
    return false;
  }
  return true;
}

export function meaningfulSuggestion(
  block: TimeBlock,
  input: BlockChoiceInput,
): BlockSuggestion {
  const available = block.context.availableMinutes;
  const candidates = PERSONAL_TEMPLATES
    .filter((template) => personalTemplateFitsBlock(template, block))
    .filter((template) => template.minutes <= available)
    .sort(
      (a, b) =>
        recentPenalty("generic", a.id, input.recentChoices) -
        recentPenalty("generic", b.id, input.recentChoices) ||
        b.score - a.score,
    );
  const template = candidates[0] ?? PERSONAL_TEMPLATES[0];
  const isLowEnergy = input.currentEnergy === "low";
  const title = isLowEnergy ? template.low : template.high;
  const minutes = Math.max(5, Math.min(template.minutes, available));
  return {
    id: suggestionId("meaningful", "generic", template.id),
    category: "meaningful",
    sourceType: "generic",
    sourceId: template.id,
    title,
    description: isLowEnergy
      ? `Step into a small break. ${title.replace(/\.$/, "")} gives your mind a genuine pause.`
      : `Pick something chosen for interest, not obligation. ${title.replace(/\.$/, "")} fits this block.`,
    estimatedDuration: minutes,
    reason: isLowEnergy
      ? "Your energy is set to low, so a small recharging step fits better than a project."
      : "Wind down is always an option; Personal is the alternative when you have something you want to make room for.",
  };
}

export function emitBlockSuggestionTelemetry(
  suggestions: readonly BlockSuggestion[],
  currentEnergy: EnergyRequirement,
): void {
  if (process.env.SYLLABI_DEV_TELEMETRY !== "true") return;
  for (const suggestion of suggestions) {
    const payload = {
      event: "block_suggestion_emitted",
      category: suggestion.category,
      sourceType: suggestion.sourceType,
      sourceId: suggestion.sourceId,
      energy: currentEnergy,
      minutes: suggestion.estimatedDuration,
      blocked: false,
    };
    console.info(JSON.stringify(payload));
  }
}
