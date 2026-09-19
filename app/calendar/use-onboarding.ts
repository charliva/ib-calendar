"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { latestSeenAt } from "@/lib/onboarding/activity";
import {
  resolveOnboardingEntry,
  type OnboardingMode,
} from "@/lib/onboarding/entry";
import {
  EMPTY_ONBOARDING_STATE,
  mergeOnboardingState,
  readOnboardingState,
  withStepCompleted,
  type OnboardingState,
  type OnboardingStepId,
} from "@/lib/onboarding/state";
import {
  ONBOARDING_STEPS,
  REQUIRED_STEP_IDS,
  nextStep,
  satisfiedSteps,
} from "@/lib/onboarding/steps";
import {
  getDeviceOnboarding,
  saveDeviceOnboarding,
  type PendingMutation,
} from "@/lib/offline";

type Params = {
  user: User | null;
  isOnline: boolean;
  /**
   * Whether the account's snapshot has resolved. Local state hydrates long
   * before auth and the cloud read finish, so without this an existing student
   * on a new device is indistinguishable from a brand-new one.
   */
  cloudLoaded: boolean;
  cloudOnboardingState: unknown;
  cloudLastSeenAt: string | null;
  subjectCount: number;
  lessonCount: number;
  hasSchoolDaySettings: boolean;
  persistMutation: (mutation: PendingMutation) => unknown;
};

/**
 * Decides what a session opens with, and remembers what the student did about it.
 *
 * Progress is written to the device immediately so a refresh mid-setup does not
 * lose the thread, and mirrored to the account so that finishing on a laptop
 * does not re-run the tour on a phone. The merge is a union in the completed
 * direction only.
 */
export function useOnboarding(params: Params) {
  const ownerKey = params.user?.id ?? "local";
  const [deviceState, setDeviceState] = useState<OnboardingState>(
    EMPTY_ONBOARDING_STATE,
  );
  const [deviceLastSeenAt, setDeviceLastSeenAt] = useState<string | null>(null);
  const [forcedMode, setForcedMode] = useState<OnboardingMode | null>(null);
  const [activeStepId, setActiveStepId] = useState<OnboardingStepId | null>(
    null,
  );
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  // Which owner's record this device has read, rather than a bare "loaded"
  // flag: signing in changes the owner, and the previous account's progress
  // must not be read as the new one's while the swap is in flight.
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const deviceLoaded = loadedOwner === ownerKey;

  // The absence that greets the student is the one measured *before* this
  // session stamps over it, so it is captured once when the visit is recorded.
  const [arrivalSeenAt, setArrivalSeenAt] = useState<string | null>(null);
  const [stampedOwner, setStampedOwner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeviceOnboarding(ownerKey)
      .then((record) => {
        if (cancelled) return;
        setDeviceState(readOnboardingState(record.state));
        setDeviceLastSeenAt(record.lastSeenAt);
        setLoadedOwner(ownerKey);
      })
      .catch(() => {
        if (!cancelled) setLoadedOwner(ownerKey);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  const state = useMemo(
    () =>
      mergeOnboardingState(
        deviceState,
        readOnboardingState(params.cloudOnboardingState),
      ),
    [deviceState, params.cloudOnboardingState],
  );

  const lastSeenAt = useMemo(
    () => latestSeenAt(deviceLastSeenAt, params.cloudLastSeenAt),
    [deviceLastSeenAt, params.cloudLastSeenAt],
  );

  const persist = useCallback(
    (nextState: OnboardingState, seenAt: string | null) => {
      setDeviceState(nextState);
      saveDeviceOnboarding(ownerKey, {
        state: nextState,
        lastSeenAt: seenAt,
      }).catch(() => undefined);
      if (!params.user) return;
      params.persistMutation({
        table: "profiles",
        action: "upsert",
        recordId: params.user.id,
        payload: {
          id: params.user.id,
          onboarding_state: nextState,
          last_seen_at: seenAt,
        },
      });
    },
    [ownerKey, params],
  );

  // Record the visit once per owner per session, keeping the arrival reading
  // that the welcome-back copy depends on before it is overwritten.
  useEffect(() => {
    if (!deviceLoaded || !params.cloudLoaded) return;
    if (stampedOwner === ownerKey) return;
    let cancelled = false;
    const arrival = latestSeenAt(deviceLastSeenAt, params.cloudLastSeenAt);
    const now = new Date().toISOString();
    const stampedState = state;
    const account = params.user;

    void (async () => {
      await saveDeviceOnboarding(ownerKey, {
        state: stampedState,
        lastSeenAt: now,
      }).catch(() => undefined);
      if (cancelled) return;
      setArrivalSeenAt(arrival ?? now);
      setDeviceLastSeenAt(now);
      setStampedOwner(ownerKey);
      if (!account) return;
      params.persistMutation({
        table: "profiles",
        action: "upsert",
        recordId: account.id,
        payload: {
          id: account.id,
          onboarding_state: stampedState,
          last_seen_at: now,
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    deviceLastSeenAt,
    deviceLoaded,
    ownerKey,
    params,
    stampedOwner,
    state,
  ]);

  const entry = useMemo(
    () =>
      resolveOnboardingEntry({
        cloudLoaded:
          params.cloudLoaded && deviceLoaded && stampedOwner === ownerKey,
        isOnline: params.isOnline,
        state,
        subjectCount: params.subjectCount,
        lessonCount: params.lessonCount,
        lastSeenAt: arrivalSeenAt,
        now: new Date(),
        forcedMode,
      }),
    [
      arrivalSeenAt,
      deviceLoaded,
      forcedMode,
      ownerKey,
      params.cloudLoaded,
      params.isOnline,
      params.lessonCount,
      params.subjectCount,
      stampedOwner,
      state,
    ],
  );

  // Steps whose data already exists are behind the student whether or not they
  // walked through them, so a replay never re-imports a timetable by accident.
  const effectiveCompleted = useMemo(() => {
    const satisfied = satisfiedSteps({
      subjectCount: params.subjectCount,
      lessonCount: params.lessonCount,
      hasSchoolDaySettings: params.hasSchoolDaySettings,
    });
    return [...new Set([...state.completedSteps, ...satisfied])];
  }, [
    params.hasSchoolDaySettings,
    params.lessonCount,
    params.subjectCount,
    state.completedSteps,
  ]);

  const mode: OnboardingMode = dismissedThisSession ? "none" : entry.mode;
  const flowOpen = mode === "new" || mode === "resuming";

  const step = useMemo(() => {
    if (!flowOpen) return null;
    if (activeStepId) {
      return ONBOARDING_STEPS.find((entry) => entry.id === activeStepId) ?? null;
    }
    return nextStep(effectiveCompleted);
  }, [activeStepId, effectiveCompleted, flowOpen]);

  const completeStep = useCallback(
    (id: OnboardingStepId) => {
      const now = new Date().toISOString();
      const next = withStepCompleted(state, id, REQUIRED_STEP_IDS, now);
      persist(next, deviceLastSeenAt);
      const following = nextStep([
        ...new Set([...effectiveCompleted, id]),
      ]);
      setActiveStepId(following?.id ?? null);
    },
    [deviceLastSeenAt, effectiveCompleted, persist, state],
  );

  const skipStep = useCallback(
    (id: OnboardingStepId) => {
      const index = ONBOARDING_STEPS.findIndex((entry) => entry.id === id);
      const following = ONBOARDING_STEPS.slice(index + 1).find(
        (entry) => !effectiveCompleted.includes(entry.id),
      );
      if (following) setActiveStepId(following.id);
      else setDismissedThisSession(true);
    },
    [effectiveCompleted],
  );

  const dismiss = useCallback(() => {
    setDismissedThisSession(true);
    persist(
      { ...state, dismissedAt: new Date().toISOString() },
      deviceLastSeenAt,
    );
  }, [deviceLastSeenAt, persist, state]);

  /** Replay the concept steps only — setup steps have data behind them already. */
  const replayTour = useCallback(() => {
    setDismissedThisSession(false);
    setForcedMode("resuming");
    const firstConcept = ONBOARDING_STEPS.find(
      (entry) => entry.kind === "concept" && entry.id !== "welcome",
    );
    setActiveStepId(firstConcept?.id ?? "capture");
  }, []);

  const restartSetup = useCallback(() => {
    setDismissedThisSession(false);
    setForcedMode("resuming");
    setActiveStepId("timetable");
  }, []);

  return {
    mode,
    awayDays: entry.awayDays,
    state,
    step,
    completedSteps: effectiveCompleted,
    lastSeenAt,
    completeStep,
    skipStep,
    dismiss,
    replayTour,
    restartSetup,
    setForcedMode,
  };
}
