/**
 * How long a student has been away.
 *
 * Nothing in this app recorded a last-used time before this module existed, so
 * the stamp is written on every session start and refreshed as the app syncs.
 * The account's copy is authoritative when it is available, because a student
 * who used their phone yesterday has not been away three weeks just because
 * this laptop last saw them in March.
 */

export const INACTIVITY_THRESHOLD_DAYS = 21;

const DAY = 86_400_000;

/**
 * Whole days between two instants, floored.
 *
 * Deliberately measured in elapsed time rather than calendar days: "three weeks
 * away" is a duration, and a student who left on a Friday evening and returned
 * on a Saturday morning has not been away two days.
 */
export function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

export function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The more recent of two stamps, either of which may be missing. */
export function latestSeenAt(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = parseTimestamp(left);
  const b = parseTimestamp(right);
  if (!a) return b ? b.toISOString() : null;
  if (!b) return a.toISOString();
  return (a > b ? a : b).toISOString();
}

/**
 * How long the student has been gone, or null if we have never seen them.
 *
 * A stamp in the future is treated as "just now" rather than as a negative
 * absence — clock skew between a phone and a server is common enough that it
 * should not produce nonsense.
 */
export function daysAway(lastSeenAt: string | null | undefined, now: Date) {
  const seen = parseTimestamp(lastSeenAt);
  if (!seen) return null;
  return Math.max(0, daysBetween(seen, now));
}

export function isReturningUser(
  lastSeenAt: string | null | undefined,
  now: Date,
  thresholdDays: number = INACTIVITY_THRESHOLD_DAYS,
) {
  const away = daysAway(lastSeenAt, now);
  return away !== null && away >= thresholdDays;
}
