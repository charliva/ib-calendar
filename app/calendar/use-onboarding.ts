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

  /**
   * An explicit sequence for a replay.
   *
   * Ordinary setup asks "what is still outstanding", which is right the first
   * time and useless afterwards: once every step is behind the student that
   * question answers "nothing", so a replay showed one card and closed. A
   * replay therefore carries its own list and ignores completion entirely.
   */
  const [replayQueue, setReplayQueue] = useState<OnboardingStepId[] | null>(
    null,
  );
  /** How long the running replay was when it started, for "step 2 of 3". */
  const [stepCountForReplay, setStepCountForReplay] = useState<number | null>(
    null,
  );

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
    if (replayQueue) {
      const [current] = replayQueue;
      return ONBOARDING_STEPS.find((entry) => entry.id === current) ?? null;
    }
    if (activeStepId) {
      return ONBOARDING_STEPS.find((entry) => entry.id === activeStepId) ?? null;
    }
    return nextStep(effectiveCompleted);
  }, [activeStepId, effectiveCompleted, flowOpen, replayQueue]);

  /** Move a replay along, ending the flow when its list runs out. */
  const advanceReplay = useCallback(() => {
    setReplayQueue((queue) => {
      if (!queue) return queue;
      const remaining = queue.slice(1);
      if (remaining.length) return remaining;
      setForcedMode(null);
      setDismissedThisSession(true);
      return null;
    });
  }, []);

  const completeStep = useCallback(
    (id: OnboardingStepId) => {
      const now = new Date().toISOString();
      const next = withStepCompleted(state, id, REQUIRED_STEP_IDS, now);
      persist(next, deviceLastSeenAt);
      if (replayQueue) {
        advanceReplay();
        return;
      }
      const following = nextStep([...new Set([...effectiveCompleted, id])]);
      setActiveStepId(following?.id ?? null);
    },
    [
      advanceReplay,
      deviceLastSeenAt,
      effectiveCompleted,
      persist,
      replayQueue,
      state,
    ],
  );

  const skipStep = useCallback(
    (id: OnboardingStepId) => {
      if (replayQueue) {
        advanceReplay();
        return;
      }
      const index = ONBOARDING_STEPS.findIndex((entry) => entry.id === id);
      const following = ONBOARDING_STEPS.slice(index + 1).find(
        (entry) => !effectiveCompleted.includes(entry.id),
      );
      if (following) setActiveStepId(following.id);
      else setDismissedThisSession(true);
    },
    [advanceReplay, effectiveCompleted, replayQueue],
  );

  const dismiss = useCallback(() => {
    setDismissedThisSession(true);
    setReplayQueue(null);
    setForcedMode(null);
    persist(
      { ...state, dismissedAt: new Date().toISOString() },
      deviceLastSeenAt,
    );
  }, [deviceLastSeenAt, persist, state]);

  /** Replay what the app *is*, skipping the setup a returning student has done. */
  const replayTour = useCallback(() => {
    setDismissedThisSession(false);
    setActiveStepId(null);
    setForcedMode("resuming");
    const queue = ONBOARDING_STEPS.filter(
      (entry) => entry.kind === "concept",
    ).map((entry) => entry.id);
    setStepCountForReplay(queue.length);
    setReplayQueue(queue);
  }, []);

  /**
   * Wipe the record and walk the whole thing again.
   *
   * Distinct from replaying the tour: this forgets that setup ever happened, so
   * the flow behaves exactly as it does for a new student.
   */
  const restartEverything = useCallback(() => {
    setDismissedThisSession(false);
    setActiveStepId(null);
    setForcedMode("resuming");
    const queue = ONBOARDING_STEPS.map((entry) => entry.id);
    setStepCountForReplay(queue.length);
    setReplayQueue(queue);
    persist(EMPTY_ONBOARDING_STATE, deviceLastSeenAt);
  }, [deviceLastSeenAt, persist]);

  /** Walk the timetable back through import and the questions that follow it. */
  const restartSetup = useCallback(() => {
    setDismissedThisSession(false);
    setActiveStepId(null);
    setForcedMode("resuming");
    setStepCountForReplay(2);
    setReplayQueue(["timetable", "school-day"]);
  }, []);

  return {
    mode,
    awayDays: entry.awayDays,
    state,
    step,
    completedSteps: effectiveCompleted,
    replaying: replayQueue !== null,
    // Position within whatever sequence is actually running, so a three-step
    // replay does not announce itself as "step 5 of 6".
    stepNumber: replayQueue
      ? replayQueue.length === 0
        ? 0
        : (stepCountForReplay ?? 0) - replayQueue.length + 1
      : step
        ? ONBOARDING_STEPS.indexOf(step) + 1
        : 0,
    stepCount: replayQueue ? (stepCountForReplay ?? 0) : ONBOARDING_STEPS.length,
    lastSeenAt,
    completeStep,
    skipStep,
    dismiss,
    replayTour,
    restartSetup,
    restartEverything,
    setForcedMode,
  };
}
