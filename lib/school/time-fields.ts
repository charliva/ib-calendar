// The seven clock-time fields on the school day, and what a usable value is.
//
// Every one of them lands in a `time not null` column in
// supabase/migrations/20260730220740_school_day_intelligence.sql. An empty
// string is not merely odd there, it is unwritable: Postgres answers
// `invalid input syntax for type time: ""`, the upsert is rejected, and the
// mutation sits in the outbox retrying every fifteen seconds until it burns
// through its failure budget and is dead-lettered. The student is told their
// changes are "waiting to sync" the whole time.
//
// Clearing a time input is the ordinary way to reach that: <input type="time">
// reads back "" when emptied, and the submit guards in SchoolDaySection
// compare the pair for ordering — which catches an emptied *end* ("" sorts
// before any real time) but lets an emptied *start* through, because
// "15:00" <= "" is false.
//
// Sibling of lib/school/minute-bounds.ts, which does the same job for the
// four minute columns.

/** Fields stored as `time` in the database, in the order the form presents them. */
export const SCHOOL_DAY_TIME_FIELDS = [
  "schoolDayStart",
  "schoolDayEnd",
  "schoolworkCutoff",
  "preferredStudyStart",
  "preferredStudyEnd",
  "lowEnergyStart",
  "lowEnergyEnd",
] as const;

/** Matches "HH:MM" and "HH:MM:SS", the two shapes a time input can produce. */
const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function isSchoolDayTime(value: unknown): value is string {
  return typeof value === "string" && CLOCK_TIME.test(value);
}

/**
 * A clock time the database will accept, falling back to `fallback` when the
 * value is empty, half-typed or otherwise not a time.
 *
 * Seconds are dropped: the columns keep them, but nothing in the app reads
 * below the minute, and carrying them makes two equal times compare unequal.
 */
export function clampSchoolDayTime(value: unknown, fallback: string): string {
  if (!isSchoolDayTime(value)) return fallback;
  return value.slice(0, 5);
}
