/**
 * What a student has finished of the guided setup.
 *
 * This record is written in two places with deliberately different reliability:
 * the device writes it immediately so a refresh mid-setup does not lose the
 * thread, and the account mirrors it so that finishing setup on a laptop does
 * not re-run the tour on a phone. The merge rule below is what keeps those two
 * honest.
 */

export type OnboardingStepId =
  | "welcome"
  | "subjects"
  | "timetable"
  | "school-day"
  | "capture"
  | "flexible-blocks";

export type OnboardingState = {
  /** Bumped when the step list changes enough that old progress is meaningless. */
  version: number;
  completedSteps: OnboardingStepId[];
  /** Set once every required step is behind the student. */
  completedAt: string | null;
  /** Set when the student left early. They can still resume from settings. */
  dismissedAt: string | null;
};

export const ONBOARDING_VERSION = 1;

export const EMPTY_ONBOARDING_STATE: OnboardingState = {
  version: ONBOARDING_VERSION,
  completedSteps: [],
  completedAt: null,
  dismissedAt: null,
};

function earliest(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

/** Discard progress recorded against a step list this build no longer has. */
export function readOnboardingState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object") return EMPTY_ONBOARDING_STATE;
  const record = value as Partial<OnboardingState>;
  if (record.version !== ONBOARDING_VERSION) return EMPTY_ONBOARDING_STATE;
  return {
    version: ONBOARDING_VERSION,
    completedSteps: Array.isArray(record.completedSteps)
      ? (record.completedSteps.filter(
          (step) => typeof step === "string",
        ) as OnboardingStepId[])
      : [],
    completedAt:
      typeof record.completedAt === "string" ? record.completedAt : null,
    dismissedAt:
      typeof record.dismissedAt === "string" ? record.dismissedAt : null,
  };
}

/**
 * Combine the device's record with the account's.
 *
 * Completion is a union and never a subtraction: a step finished on any device
 * counts as finished everywhere. The failure we are willing to accept is not
 * showing the tour to someone who wanted it — they can replay it from settings.
 * The failure we are not willing to accept is tutorialising a student who
 * already did this, on their phone, at eight in the morning.
 */
export function mergeOnboardingState(
  left: OnboardingState,
  right: OnboardingState,
): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    completedSteps: [
      ...new Set([...left.completedSteps, ...right.completedSteps]),
    ],
    completedAt: earliest(left.completedAt, right.completedAt),
    // A dismissal only survives if it was never followed by progress elsewhere.
    dismissedAt: earliest(left.dismissedAt, right.dismissedAt),
  };
}

export function withStepCompleted(
  state: OnboardingState,
  step: OnboardingStepId,
  requiredSteps: OnboardingStepId[],
  now: string,
): OnboardingState {
  const completedSteps = [...new Set([...state.completedSteps, step])];
  const finished = requiredSteps.every((id) => completedSteps.includes(id));
  return {
    version: ONBOARDING_VERSION,
    completedSteps,
    completedAt: state.completedAt ?? (finished ? now : null),
    dismissedAt: null,
  };
}

export function isOnboardingFinished(state: OnboardingState) {
  return Boolean(state.completedAt);
}
