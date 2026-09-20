"use client";

import { useMemo } from "react";
import { cloudAvailability } from "@/lib/cloud-features";
import type { OnboardingStepId } from "@/lib/onboarding/state";
import type { OnboardingStep } from "@/lib/onboarding/steps";
import type { SchoolDaySettings } from "@/lib/school";
import { Coachmark } from "@/components/overlay/Coachmark";
import { OverlayPanel } from "@/components/overlay/OverlayPanel";
import { CloudLockedNotice } from "@/components/onboarding/CloudLockedNotice";
import { SchoolDayQuestions } from "@/components/onboarding/SchoolDayQuestions";

type Props = {
  open: boolean;
  step: OnboardingStep | null;
  completedSteps: OnboardingStepId[];
  hasAccount: boolean;
  isOnline: boolean;
  /** Set when the student is returning rather than arriving for the first time. */
  awayDays: number | null;
  stepNumber: number;
  stepCount: number;
  schoolDaySettings: SchoolDaySettings;
  onChangeSchoolDaySettings: (settings: SchoolDaySettings) => void;
  onSkipStep: () => void;
  onDismiss: () => void;
  onRunStepAction: (step: OnboardingStep) => void;
  onSignIn: () => void;
  onManualAlternative: (step: OnboardingStep) => void;
};

/**
 * The guided setup.
 *
 * Steps that describe the app are centred cards; steps that teach a gesture are
 * anchored to the real element and leave the app usable, because the one thing
 * a student will not discover on their own is that work can be dragged onto the
 * week, and that cannot be taught from behind a scrim.
 */
export function OnboardingFlow({
  open,
  step,
  completedSteps,
  hasAccount,
  isOnline,
  awayDays,
  stepNumber,
  stepCount,
  schoolDaySettings,
  onChangeSchoolDaySettings,
  onSkipStep,
  onDismiss,
  onRunStepAction,
  onSignIn,
  onManualAlternative,
}: Props) {
  const cloud = useMemo(
    () => cloudAvailability({ hasAccount, isOnline }),
    [hasAccount, isOnline],
  );

  if (!open || !step) return null;

  const locked = step.requiresAccount && !cloud.available;
  const progress = `Step ${stepNumber} of ${stepCount}`;

  const body = (
    <>
      <p className="onboarding-body">{locked && step.lockedBody ? step.lockedBody : step.body}</p>
      {step.id === "school-day" ? (
        <SchoolDayQuestions
          settings={schoolDaySettings}
          onChange={onChangeSchoolDaySettings}
        />
      ) : null}
      {locked ? (
        <CloudLockedNotice
          reason={cloud.reason ?? "no-account"}
          body={step.lockedBody}
          lockedLabel={step.lockedLabel ?? "Sign in"}
          manualLabel={step.manualLabel}
          onSignIn={onSignIn}
          onManual={() => onManualAlternative(step)}
        />
      ) : null}
    </>
  );

  const actions = (
    <div className="onboarding-actions">
      <button type="button" className="is-quiet" onClick={onSkipStep}>
        {step.required ? "Later" : "Skip"}
      </button>
      {locked ? null : (
        <button
          type="button"
          className="onboarding-primary"
          onClick={() => onRunStepAction(step)}
        >
          {step.actionLabel}
        </button>
      )}
    </div>
  );

  // Gesture steps stay out of the way so the gesture is actually possible.
  if (step.anchor) {
    return (
      <Coachmark
        anchor={step.anchor}
        open={open}
        title={step.title}
        blocking={false}
        onDismiss={onDismiss}
        footer={
          <>
            <small className="onboarding-progress">{progress}</small>
            {actions}
          </>
        }
      >
        {body}
      </Coachmark>
    );
  }

  return (
    <OverlayPanel
      id="onboarding"
      open={open}
      onClose={onDismiss}
      title={step.title}
      className="onboarding-panel"
      dismissOnScrimClick={false}
    >
      {awayDays !== null && awayDays >= 21 && completedSteps.length === 0 ? (
        <p className="onboarding-away">
          It has been a while &mdash; let&rsquo;s finish setting this up.
        </p>
      ) : null}
      {body}
      <div className="onboarding-panel-footer">
        <small className="onboarding-progress">{progress}</small>
        {actions}
      </div>
      <button type="button" className="onboarding-dismiss" onClick={onDismiss}>
        Not now
      </button>
    </OverlayPanel>
  );
}
