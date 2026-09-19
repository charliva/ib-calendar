import type { OnboardingState } from "../onboarding/state.ts";
import type { SchoolDaySettings } from "../school.ts";
import { weekPatternFor } from "../school/week-pattern.ts";
import type { AccountPreferences } from "./account-preferences.ts";

/**
 * One line per settings section, showing what it is currently set to.
 *
 * A settings panel that only lists section names makes you open all of them to
 * find anything. Showing the live value collapsed means a student can check
 * their school day without editing it, and the rows that look wrong invite the
 * click on their own.
 */

export function schoolDaySummary(settings: SchoolDaySettings) {
  return `${settings.schoolDayStart}–${settings.schoolDayEnd} · study ${settings.preferredStudyStart}–${settings.preferredStudyEnd}`;
}

export function weekCycleSummary(
  settings: SchoolDaySettings,
  hasAlternatingClasses: boolean,
  today: Date,
) {
  if (!hasAlternatingClasses) return "Same every week";
  const pattern = weekPatternFor(today, settings.weekPatternAnchor);
  return `Alternates · this is Week ${pattern.toUpperCase()}`;
}

export function profileSummary(preferences: AccountPreferences) {
  const name = preferences.displayName.trim();
  return name ? `${name} · ${preferences.timezone}` : preferences.timezone;
}

export function onboardingSummary(
  state: OnboardingState,
  requiredCount: number,
) {
  if (state.completedAt) return "Walkthrough finished";
  const done = state.completedSteps.length;
  if (done === 0) return "Not started";
  return `${done} of ${requiredCount} steps done`;
}

export function syncSummary(input: {
  hasAccount: boolean;
  pendingCount: number;
  failedCount: number;
}) {
  if (!input.hasAccount) return "This device only";
  if (input.failedCount > 0) {
    return `${input.failedCount} change${input.failedCount === 1 ? "" : "s"} need attention`;
  }
  if (input.pendingCount > 0) {
    return `${input.pendingCount} waiting to sync`;
  }
  return "Everything synced";
}
