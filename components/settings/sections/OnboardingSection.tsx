"use client";

import type { OnboardingMode } from "@/lib/onboarding/entry";
import type { OnboardingState } from "@/lib/onboarding/state";

type Props = {
  state: OnboardingState;
  /** Exposed so the returning-user surface can be seen without waiting weeks. */
  showDeveloperOverride: boolean;
  onReplayTour: () => void;
  onReimportTimetable: () => void;
  onRestartEverything: () => void;
  onForceMode: (mode: OnboardingMode | null) => void;
};

/**
 * Two different intents live here, deliberately unbundled.
 *
 * "Remind me how this works" and "my timetable changed, set it up again" want
 * different things, and a single button whose behaviour you cannot predict
 * before pressing it is a bad settings row. The re-import entry point also has
 * to exist somewhere regardless: an import covers one week, so a new term means
 * importing again.
 */
export function OnboardingSection({
  state,
  showDeveloperOverride,
  onReplayTour,
  onReimportTimetable,
  onRestartEverything,
  onForceMode,
}: Props) {
  const finished = Boolean(state.completedAt);
  const partial = !finished && state.completedSteps.length > 0;

  return (
    <div className="settings-section-body">
      {partial ? (
        <p className="settings-help">
          You got {state.completedSteps.length} step
          {state.completedSteps.length === 1 ? "" : "s"} in last time.
        </p>
      ) : null}
      <div className="settings-action-list">
        <button type="button" className="settings-action" onClick={onReplayTour}>
          <strong>
            {partial ? "Pick up where you left off" : "Show me how it works"}
          </strong>
          <small>
            Walks through solid and flexible blocks on your own calendar.
          </small>
        </button>
        <button
          type="button"
          className="settings-action"
          onClick={onReimportTimetable}
        >
          <strong>Set my timetable up again</strong>
          <small>
            For a new term, or when your lessons have moved. Nothing is replaced
            until you have reviewed it.
          </small>
        </button>
        <button
          type="button"
          className="settings-action"
          onClick={onRestartEverything}
        >
          <strong>Start over from the beginning</strong>
          <small>
            Forgets that you have done this before and runs the whole thing
            again. Your calendar is not touched.
          </small>
        </button>
      </div>
      {showDeveloperOverride ? (
        <div className="settings-developer">
          <span>Preview a first-run state</span>
          <div className="settings-choice-row">
            {(["new", "resuming", "returning"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="settings-choice is-compact"
                onClick={() => onForceMode(mode)}
              >
                {mode}
              </button>
            ))}
            <button
              type="button"
              className="settings-choice is-compact"
              onClick={() => onForceMode(null)}
            >
              clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
