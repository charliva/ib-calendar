/**
 * Preferences that describe the student rather than their school day.
 *
 * These share the `profiles` row with the school-day rules, but they are kept
 * as a separate shape because they answer a different question and are edited
 * from a different place. Both writers upsert partial payloads, so neither
 * clobbers the other's columns.
 *
 * `timezone` mattered before this module existed and nothing read it: the
 * column has defaulted to Europe/Copenhagen for every account since the first
 * migration, which is a latent correctness bug in a calendar.
 */

export type AccountPreferences = {
  displayName: string;
  timezone: string;
};

export const FALLBACK_TIMEZONE = "Europe/Copenhagen";

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  displayName: "",
  timezone: FALLBACK_TIMEZONE,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** The timezone this device believes it is in, for a sensible first answer. */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Every zone this runtime knows, or a short list where that is unavailable. */
export function availableTimezones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      /* fall through to the short list */
    }
  }
  return [
    "Europe/Copenhagen",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Helsinki",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "UTC",
  ];
}

export function rowToAccountPreferences(
  row: Record<string, unknown> | null | undefined,
): AccountPreferences {
  if (!row) return { ...DEFAULT_ACCOUNT_PREFERENCES, timezone: detectTimezone() };
  return {
    displayName: text(row.display_name),
    timezone: text(row.timezone) || detectTimezone(),
  };
}

export function accountPreferencesToRow(preferences: AccountPreferences) {
  return {
    display_name: preferences.displayName.trim() || null,
    timezone: preferences.timezone || FALLBACK_TIMEZONE,
  };
}
