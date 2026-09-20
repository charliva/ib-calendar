import type {
  BlockSuggestion,
  BlockSuggestionCategory,
  BlockSuggestionSource,
} from "./block-choices/types.ts";

/**
 * Block-suggestion safety floor (PR1).
 *
 * The picker at `lib/block-choices.ts` is the only place that builds
 * suggestions for a time block. Every suggestion it emits MUST pass through
 * `filterSuggestionsForPicker` before it reaches any caller that renders or
 * persists it. This module is intentionally dumb: the chokepoint checks a
 * fixed allowlist of sources, a fixed blocklist of brand names, and a fixed
 * set of per-category duration caps. It does not understand the student's
 * preferences, the AI polish endpoint, or the calendar layout. Intelligence
 * lives in the caller; safety lives here.
 *
 * The chokepoint FAILS CLOSED. Any suggestion with an unknown sourceType,
 * unknown category, missing id, empty title, missing description, or any
 * field whose value does not match the BlockSuggestion shape is dropped.
 * The caller receives the survivors; nothing else.
 */

export const ALLOWED_PICKER_SOURCES: readonly BlockSuggestionSource[] = [
  "recovery",
  "recommendation",
  "generic",
] as const;

export const ALLOWED_PICKER_CATEGORIES: readonly BlockSuggestionCategory[] = [
  "recovery",
  "responsibility",
  "meaningful",
] as const;

export const MAX_DURATION_MIN: Readonly<Record<BlockSuggestionCategory, number>> = {
  recovery: 30,
  responsibility: 90,
  meaningful: 45,
};

export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_HARD = 360;

/**
 * Brand and media terms the picker must never surface. The match is
 * case-insensitive and whole-word. The list is intentionally short and
 * reviewable: streaming video, streaming audio, specific shows the prior
 * picker had, social media apps, and gaming platforms. A new entry is
 * added in a PR, not at runtime.
 */
export const BLOCKED_TERMS: readonly string[] = [
  // Streaming video
  "Netflix",
  "YouTube",
  "TikTok",
  "Disney+",
  "Hulu",
  "Prime Video",
  "HBO",
  // Streaming audio / podcasts
  "Spotify",
  "Apple Music",
  "SoundCloud",
  "Audible",
  // Specific shows the prior picker had
  "Gilmore Girls",
  // Social media
  "Instagram",
  "Snapchat",
  "BeReal",
  "Twitter",
  "Facebook",
  "Reddit",
  "Discord",
  "Twitch",
  // Gaming platforms
  "Steam",
  "PlayStation",
  "Xbox",
  "Nintendo",
] as const;

const BLOCKED_TERM_PATTERNS: readonly RegExp[] = BLOCKED_TERMS.map(
  (term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i"),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsBlockedTerm(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  for (const pattern of BLOCKED_TERM_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * The only public chokepoint for picker suggestions. Returns the survivors
 * in their original order. Drops anything that fails the source allowlist,
 * the category allowlist, the shape check, the blocklist, or the duration
 * bounds. Caps each survivor's estimatedDuration at the per-category max.
 *
 * Callers MUST NOT add their own pre-filters. The whole point of the
 * chokepoint is that there is one place that decides what reaches the UI.
 */
export function filterSuggestionsForPicker(
  suggestions: readonly BlockSuggestion[],
): BlockSuggestion[] {
  if (!Array.isArray(suggestions)) return [];
  const result: BlockSuggestion[] = [];
  for (const raw of suggestions) {
    const safe = sanitizeSuggestion(raw);
    if (safe) result.push(safe);
  }
  return result;
}

function sanitizeSuggestion(raw: unknown): BlockSuggestion | null {
  if (!isObject(raw)) return null;
  const id = stringOrNull(raw.id);
  const title = stringOrNull(raw.title);
  const description = stringOrNull(raw.description);
  const sourceType = raw.sourceType;
  const category = raw.category;
  const estimatedDuration = raw.estimatedDuration;
  const reason = raw.reason;
  const sourceId = raw.sourceId;

  if (!id || !title || !description) return null;
  if (!isAllowedSource(sourceType)) return null;
  if (!isAllowedCategory(category)) return null;
  if (typeof estimatedDuration !== "number" || !Number.isFinite(estimatedDuration)) {
    return null;
  }
  if (estimatedDuration < MIN_DURATION_MIN || estimatedDuration > MAX_DURATION_HARD) {
    return null;
  }
  if (reason !== null && reason !== undefined && typeof reason !== "string") {
    return null;
  }
  if (sourceId !== null && sourceId !== undefined && typeof sourceId !== "string") {
    return null;
  }
  if (containsBlockedTerm(title) || containsBlockedTerm(description)) return null;
  if (typeof reason === "string" && containsBlockedTerm(reason)) return null;

  const cap = MAX_DURATION_MIN[category];
  const clampedDuration = Math.min(estimatedDuration, cap);
  return {
    id,
    category,
    sourceType,
    sourceId: typeof sourceId === "string" ? sourceId : null,
    title,
    description,
    estimatedDuration: clampedDuration,
    reason: typeof reason === "string" ? reason : null,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isAllowedSource(value: unknown): value is BlockSuggestionSource {
  return (
    typeof value === "string" &&
    (ALLOWED_PICKER_SOURCES as readonly string[]).includes(value)
  );
}

function isAllowedCategory(value: unknown): value is BlockSuggestionCategory {
  return (
    typeof value === "string" &&
    (ALLOWED_PICKER_CATEGORIES as readonly string[]).includes(value)
  );
}
