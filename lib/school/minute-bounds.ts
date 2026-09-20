// The ranges the database will accept for the school-day minute fields.
//
// These mirror the CHECK constraints in
// supabase/migrations/20260730220740_school_day_intelligence.sql. A value
// outside them is not merely odd, it is unwritable: the upsert is rejected,
// the mutation sits in the outbox retrying every fifteen seconds, and the
// student is told changes are "waiting to sync" forever. Keeping the numbers
// in one place means the form, the normalizer and the schema cannot drift
// apart again — the settings rework dropped the form's max attributes and
// nothing else was checking.
//
// `minimumFreePeriodMinutes` floors at 45 rather than the database's 10: a
// gap shorter than that is not usable study time, so the app has always been
// stricter than the column.

export const SCHOOL_DAY_MINUTE_BOUNDS = {
  travelBeforeSchoolMinutes: { min: 0, max: 180 },
  travelHomeMinutes: { min: 0, max: 180 },
  recoveryAfterHomeMinutes: { min: 0, max: 180 },
  minimumFreePeriodMinutes: { min: 45, max: 180 },
} as const;

export type SchoolDayMinuteField = keyof typeof SCHOOL_DAY_MINUTE_BOUNDS;

/**
 * A minute value forced into range. A non-finite input (an emptied number
 * input reads back as NaN) falls back to the lower bound rather than
 * poisoning the row.
 */
export function clampSchoolDayMinutes(
  field: SchoolDayMinuteField,
  value: number,
) {
  const { min, max } = SCHOOL_DAY_MINUTE_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
