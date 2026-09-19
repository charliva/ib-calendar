import type { CurrentStudyLocation } from "./now-recommender.ts";
import type { TimeBlockType } from "./block-choices/types.ts";
import type { EnergyRequirement } from "./calendar-engine.ts";

/**
 * Personal templates (PR1).
 *
 * The "Personal" category used to be filled by user-created intentions and
 * saved explorations. That made the picker emit suggestions like "Watch
 * Gilmore Girls" that made sense for one student and no one else. PR1
 * replaces that whole branch with a static list of generic, reviewable
 * templates. New entries land in this file via a PR.
 *
 * Each template has two renderings: `low` (noun fragment, used when the
 * student's current energy is "low") and `high` (short encouraging sentence,
 * used otherwise). The picker reads `input.currentEnergy` and chooses
 * which string becomes the suggestion's `title`.
 *
 * The unit test in `tests/personal-templates.test.mjs` asserts every
 * `low` and `high` string is free of `BLOCKED_TERMS` and every `minutes`
 * value is ≤ 30. That test is the long-term guardrail against a new
 * template reintroducing branded media.
 */

export type PersonalTemplate = {
  id: string;
  minutes: number;
  locations?: CurrentStudyLocation[];
  blocks?: TimeBlockType[];
  score: number;
  low: string;
  high: string;
};

export const PERSONAL_TEMPLATES: readonly PersonalTemplate[] = [
  {
    id: "walk",
    minutes: 20,
    score: 10,
    low: "Walk.",
    high: "Take a short walk. Leave your phone behind for the first five minutes.",
  },
  {
    id: "snack",
    minutes: 10,
    score: 9,
    low: "Snack.",
    high: "Make yourself a real snack, not a quick one, and sit down to eat it.",
  },
  {
    id: "stretch",
    minutes: 8,
    score: 6,
    low: "Stretch.",
    high: "Stand up and stretch for a few minutes. Your back will thank you.",
  },
  {
    id: "tidy",
    minutes: 15,
    locations: ["home"],
    score: 7,
    low: "Tidy.",
    high: "Tidy one corner of your room. Not the whole thing, just one corner.",
  },
  {
    id: "read",
    minutes: 20,
    score: 5,
    low: "Read.",
    high: "Read a few pages of something you actually want to read.",
  },
  {
    id: "drink-water",
    minutes: 5,
    score: 4,
    low: "Water.",
    high: "Pour a full glass of water and drink it slowly.",
  },
  {
    id: "message-friend",
    minutes: 10,
    score: 6,
    low: "Message a friend.",
    high: "Send a short message to someone you haven't talked to in a while.",
  },
  {
    id: "cook",
    minutes: 30,
    locations: ["home"],
    score: 8,
    low: "Cook.",
    high: "Cook something simple from scratch. The doing is the point.",
  },
  {
    id: "sketch",
    minutes: 15,
    score: 5,
    low: "Sketch.",
    high: "Draw anything, the view, your hand, a shape. No skill required.",
  },
  {
    id: "playlist",
    minutes: 15,
    score: 5,
    low: "Make a playlist.",
    high: "Make a short playlist for the week. Three to five songs is enough.",
  },
  {
    id: "sit-outside",
    minutes: 15,
    score: 7,
    low: "Sit outside.",
    high: "Step outside, even for five minutes. Notice three things you can hear.",
  },
  {
    id: "learn-something-fun",
    minutes: 20,
    score: 6,
    low: "Learn something fun.",
    high: "Pick one thing you've always wondered about and look up a short answer.",
  },
  {
    id: "call-family",
    minutes: 15,
    score: 5,
    low: "Call family.",
    high: "Call a family member just to say hi. No agenda.",
  },
  {
    id: "photo-walk",
    minutes: 20,
    score: 5,
    low: "Photo walk.",
    high: "Take five photos of things you walk past every day but never look at.",
  },
  {
    id: "practice-instrument",
    minutes: 25,
    locations: ["home"],
    score: 6,
    low: "Practice.",
    high: "Practice one thing you already know. Get it smooth, then stop.",
  },
] as const;

export function pickPersonalTemplate(
  candidates: readonly PersonalTemplate[],
  currentEnergy: EnergyRequirement,
): { template: PersonalTemplate; title: string; minutes: number } | null {
  if (candidates.length === 0) return null;
  const template = candidates[0];
  const title = currentEnergy === "low" ? template.low : template.high;
  return { template, title, minutes: template.minutes };
}
