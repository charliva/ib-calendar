import {
  INACTIVITY_THRESHOLD_DAYS,
  daysAway,
  isReturningUser,
} from "./activity.ts";
import { isOnboardingFinished, type OnboardingState } from "./state.ts";

/**
 * Which first-thing-you-see surface, if any, a session should open with.
 *
 * Kept as a pure function of already-loaded state so that the decision can be
 * unit-tested and so that the one genuinely dangerous case — deciding before we
 * know what the account holds — is impossible to get wrong by accident.
 */

export type OnboardingMode = "new" | "resuming" | "returning" | "none";

export type OnboardingEntry = {
  mode: OnboardingMode;
  /** Days since the student was last seen, for copy like "you've been away a month". */
  awayDays: number | null;
};

export type OnboardingEntryInput = {
  /**
   * Whether the account's snapshot has resolved, or definitively cannot.
   *
   * Local state hydrates from IndexedDB long before auth and the cloud read
   * finish, so an existing student opening the app on a new laptop looks
   * exactly like a brand-new one for as long as the network takes. Nothing may
   * be decided until this is true.
   */
  cloudLoaded: boolean;
  /** Offline sessions never trigger anything; we defer to the next online one. */
  isOnline: boolean;
  state: OnboardingState;
  subjectCount: number;
  lessonCount: number;
  lastSeenAt: string | null;
  now: Date;
  /** Set by the settings panel's developer override, which bypasses every rule. */
  forcedMode?: OnboardingMode | null;
  thresholdDays?: number;
};

const NONE: OnboardingEntry = { mode: "none", awayDays: null };

export function resolveOnboardingEntry(
  input: OnboardingEntryInput,
): OnboardingEntry {
  const away = daysAway(input.lastSeenAt, input.now);

  if (input.forcedMode) return { mode: input.forcedMode, awayDays: away };
  if (!input.cloudLoaded) return NONE;
  if (!input.isOnline && !isOnboardingFinished(input.state)) return NONE;

  const hasSchoolData = input.subjectCount > 0 || input.lessonCount > 0;

  // An empty calendar has nothing stale in it, however long the student was
  // gone, so there is no mess to reconcile — only setup to finish. The copy
  // still acknowledges the absence, which is what awayDays is for.
  if (!hasSchoolData && !isOnboardingFinished(input.state)) {
    return {
      mode: input.state.completedSteps.length > 0 ? "resuming" : "new",
      awayDays: away,
    };
  }

  if (
    isReturningUser(
      input.lastSeenAt,
      input.now,
      input.thresholdDays ?? INACTIVITY_THRESHOLD_DAYS,
    )
  ) {
    return { mode: "returning", awayDays: away };
  }

  // Setup was abandoned part-way with real data already in place. Offer to pick
  // it up, unless they explicitly waved it off.
  if (!isOnboardingFinished(input.state) && !input.state.dismissedAt) {
    return { mode: "resuming", awayDays: away };
  }

  return { mode: "none", awayDays: away };
}
