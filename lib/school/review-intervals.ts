// Spaced-repetition review intervals, as a student types them.
//
// The field is a comma-separated list of day offsets ("1, 3, 7, 14"). It used
// to re-derive its own displayed value from the parsed list on every
// keystroke, which made the separator impossible to type: the moment the
// comma landed, the trailing empty segment parsed to 0, was filtered out as
// out of range, and the input snapped straight back to the list the student
// already had. Adding a fourth interval simply could not be done, and editing
// an existing one appended digits to its neighbour instead.
//
// Parsing therefore has to be separable from display: the control keeps the
// student's raw text and this turns it into stored values.

/** The range the revision planner will schedule a review in. */
export const REVIEW_INTERVAL_DAY_BOUNDS = { min: 1, max: 90 } as const;

/**
 * The day offsets in a typed list, in order and without repeats.
 *
 * Anything that is not a whole number of days in range is dropped rather than
 * repaired — half-typed input is expected here, and guessing at "1x" would be
 * worse than ignoring it until the student finishes.
 */
export function parseReviewIntervals(text: string): number[] {
  const seen = new Set<number>();
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    if (!Number.isInteger(value)) continue;
    if (
      value < REVIEW_INTERVAL_DAY_BOUNDS.min ||
      value > REVIEW_INTERVAL_DAY_BOUNDS.max
    ) {
      continue;
    }
    seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

/** The canonical text for a stored list, used when the value arrives from elsewhere. */
export function formatReviewIntervals(days: number[]): string {
  return days.join(", ");
}

/**
 * Whether `text` already says exactly what `days` holds.
 *
 * The control re-adopts the canonical text only when the answer is no, so
 * that a student mid-keystroke — "1, 3, 7, " — is left alone even though it
 * parses to the same three numbers.
 */
export function reviewIntervalsMatch(text: string, days: number[]): boolean {
  const parsed = parseReviewIntervals(text);
  return (
    parsed.length === days.length && parsed.every((day, i) => day === days[i])
  );
}
