import type { OnboardingStepId } from "./state.ts";

/**
 * The guided setup, described as data.
 *
 * Copy, ordering and anchoring live here rather than inside components so that
 * a step can be reworded, reordered or dropped without touching the machinery
 * that runs it — and so that the whole sequence can be asserted in a test.
 */

export type OnboardingStepKind = "setup" | "concept";

export type OnboardingStep = {
  id: OnboardingStepId;
  kind: OnboardingStepKind;
  title: string;
  body: string;
  /**
   * The `data-tour` marker this step points at, or null for a centred card.
   * Markers are used rather than class names because the presentational classes
   * in this app are rewritten by the redesign layer.
   */
  anchor: string | null;
  /**
   * The step's primary path calls a model, which this app only offers to
   * accounts. Local sessions see the step with its main action locked and the
   * manual alternative promoted.
   */
  requiresAccount: boolean;
  /** Setup is what makes the app work; concepts are freely skippable. */
  required: boolean;
  /**
   * The view this step's anchor only exists in. A coachmark cannot point at an
   * element that is not rendered, so the app is moved there before the step
   * shows rather than leaving the student to find it themselves.
   */
  requiresView?: "school" | "upcoming";
  /** The step points at the work dock, which has to be open to be visible. */
  requiresDock?: boolean;
  /** Label for the action that completes the step. */
  actionLabel: string;
  /** Shown instead of the primary action when the session has no account. */
  lockedLabel?: string;
  lockedBody?: string;
  manualLabel?: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    kind: "concept",
    title: "Your week, not a to-do list",
    body: "Syllabi keeps your classes where they are and lets your homework move. Two minutes now and your school week will just exist.",
    anchor: null,
    requiresAccount: false,
    required: false,
    actionLabel: "Set up my week",
  },
  {
    id: "subjects",
    kind: "setup",
    title: "What do you take?",
    body: "Add your subjects first — lessons, homework and assessments all hang off them, so nothing else can be added until these exist.",
    anchor: "subjects",
    requiresAccount: false,
    required: true,
    requiresView: "school",
    actionLabel: "Add a subject",
  },
  {
    id: "timetable",
    kind: "setup",
    title: "Your timetable, once",
    body: "Drop in a photo or PDF of your timetable and Syllabi reads the lessons out of it. You will review everything it finds before any of it is added.",
    anchor: "timetable-import",
    requiresAccount: true,
    required: true,
    requiresView: "school",
    actionLabel: "Import my timetable",
    lockedLabel: "Sign in to import a photo",
    lockedBody:
      "Reading a timetable out of a photo runs in the cloud, so it needs an account. You can still add lessons by hand and sign in whenever you like — this device keeps everything you have already done.",
    manualLabel: "Add lessons by hand",
  },
  {
    id: "school-day",
    kind: "setup",
    title: "When does your day run?",
    body: "Two questions, because they decide where Syllabi thinks your free time is — and which week of a fortnightly timetable you are currently in.",
    anchor: null,
    requiresAccount: false,
    required: true,
    actionLabel: "Save and continue",
  },
  {
    id: "capture",
    kind: "concept",
    title: "Type it the way you'd say it",
    body: "\"Physics test next Thursday\" or \"read 30 pages before Friday\". No forms, no dropdowns — it works out the subject, the date and roughly how long it will take.",
    anchor: "capture-input",
    requiresAccount: true,
    required: false,
    requiresView: "upcoming",
    actionLabel: "Got it",
    lockedLabel: "Sign in to use this",
    lockedBody:
      "Reading plain English into a calendar item runs in the cloud. Without an account you can still add work by hand from the same panel.",
    manualLabel: "Add work by hand",
  },
  {
    id: "flexible-blocks",
    kind: "concept",
    title: "Homework has a when",
    body: "Solid blocks are fixed — your lessons. Your work waits here until you drag it onto the week. Give it a slot now, and drag its edge if it needs longer.",
    anchor: "task-dock",
    requiresAccount: false,
    required: false,
    requiresDock: true,
    actionLabel: "Finish",
  },
];

export const REQUIRED_STEP_IDS: OnboardingStepId[] = ONBOARDING_STEPS.filter(
  (step) => step.required,
).map((step) => step.id);

export function stepById(id: OnboardingStepId) {
  return ONBOARDING_STEPS.find((step) => step.id === id);
}

/**
 * The step a session should open on: the first one still outstanding.
 * Returns null when there is nothing left to do.
 */
export function nextStep(completedSteps: OnboardingStepId[]) {
  return (
    ONBOARDING_STEPS.find((step) => !completedSteps.includes(step.id)) ?? null
  );
}

/**
 * Steps a replay should skip because the data they produce already exists.
 * Replaying setup over a calendar that already has a timetable is at best a
 * no-op and at worst a duplicate import.
 */
export function satisfiedSteps(data: {
  subjectCount: number;
  lessonCount: number;
  hasSchoolDaySettings: boolean;
}): OnboardingStepId[] {
  const satisfied: OnboardingStepId[] = [];
  if (data.subjectCount > 0) satisfied.push("subjects");
  if (data.lessonCount > 0) satisfied.push("timetable");
  if (data.hasSchoolDaySettings) satisfied.push("school-day");
  return satisfied;
}
