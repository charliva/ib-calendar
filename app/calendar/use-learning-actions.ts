import type { SupabaseClient } from "@supabase/supabase-js";
import {
  makeItem,
  validatePlacement,
  type CalendarItem,
} from "@/lib/calendar-engine";
import { isDeeperResponse } from "@/lib/ai/study-planner";
import {
  intentionToRow,
  makeIntention,
  type Intention,
} from "@/lib/intentions";
import {
  explorationToRow,
  latestSignalFor,
  learningSignalToRow,
  makeLearningSignal,
  subjectChallengeSummary,
  type ChallengeLevel,
  type Exploration,
  type ExplorationDirection,
  type LearningSignal,
  type LearningSource,
} from "@/lib/study-intelligence";
import type { Subject } from "@/lib/school";
import type { PendingMutation } from "@/lib/offline";

type LearningActionsParams = {
  supabase: SupabaseClient;
  items: CalendarItem[];
  subjects: Subject[];
  explorations: Exploration[];
  learningSignals: LearningSignal[];
  /** The Go Deeper panel's current subject, if it is open. */
  deeperSource: LearningSource | null;
  setIntentions: React.Dispatch<React.SetStateAction<Intention[]>>;
  setLearningSignals: React.Dispatch<React.SetStateAction<LearningSignal[]>>;
  setExplorations: React.Dispatch<React.SetStateAction<Exploration[]>>;
  setIntentionSeed: (intention: Intention | null) => void;
  setIntentionsOpen: (open: boolean) => void;
  setDeeperSource: (source: LearningSource | null) => void;
  setDeeperExploration: (exploration: Exploration | null) => void;
  setDeeperBusy: (busy: boolean) => void;
  setDeeperError: (message: string) => void;
  setNotice: (notice: string) => void;
  createItem: (item: CalendarItem) => void;
  persistMutation: (mutation: PendingMutation) => Promise<boolean>;
};

/**
 * Intentions, challenge signals, and Go Deeper explorations — the part of the
 * app concerned with what the student is learning rather than when.
 *
 * Challenge feedback is recorded locally and syncs like any other record, so
 * it keeps working signed out. Go Deeper needs a session because it calls the
 * model, and reuses a cached exploration for a source unless asked for a fresh
 * one.
 */
export function useLearningActions({
  supabase,
  items,
  subjects,
  explorations,
  learningSignals,
  deeperSource,
  setIntentions,
  setLearningSignals,
  setExplorations,
  setIntentionSeed,
  setIntentionsOpen,
  setDeeperSource,
  setDeeperExploration,
  setDeeperBusy,
  setDeeperError,
  setNotice,
  createItem,
  persistMutation,
}: LearningActionsParams) {
  function saveIntention(intention: Intention) {
    const normalized = makeIntention(intention);
    setIntentions((current) => [
      normalized,
      ...current.filter((entry) => entry.id !== normalized.id),
    ]);
    persistMutation({
      table: "intentions",
      action: "upsert",
      recordId: normalized.id,
      payload: intentionToRow(normalized),
    }).catch(() => undefined);
    setIntentionSeed(null);
    setNotice(
      `Saved intention “${normalized.title}”. No calendar time was created.`,
    );
  }

  function deleteIntention(intention: Intention) {
    const archived = { ...intention, status: "archived" as const };
    setIntentions((current) =>
      current.map((entry) => (entry.id === archived.id ? archived : entry)),
    );
    persistMutation({
      table: "intentions",
      action: "update",
      recordId: archived.id,
      payload: { status: "archived" },
    }).catch(() => undefined);
    setNotice(`Archived “${intention.title}”.`);
  }

  function startIntention(
    intention: Intention,
    requestedMinutes = intention.preferredSessionMinutes,
  ) {
    const start = new Date();
    start.setSeconds(0, 0);
    const minutes = Math.max(5, Math.min(240, requestedMinutes));
    const end = new Date(start.getTime() + minutes * 60_000);
    const task = makeItem({
      kind: "task",
      title: intention.title,
      description: intention.notes || "A small step toward this intention.",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMin: minutes,
      durationMax: minutes,
      deadline: intention.horizonEnd
        ? `${intention.horizonEnd}T23:59:00`
        : null,
      energyType:
        intention.workType === "deep_focus" ||
        intention.workType === "problem_solving"
          ? "deep_focus"
          : "light_work",
      priority: intention.priority,
      flexibility: "elastic",
      intentionId: intention.id,
      subjectId: intention.subjectId,
      taskContext: intention.taskContext,
      workType: intention.workType,
      requiredEnergy: intention.requiredEnergy,
      status: "scheduled",
      source: "manual",
    });
    const validation = validatePlacement(
      task,
      start.toISOString(),
      end.toISOString(),
      items,
    );
    if (!validation.valid) {
      setNotice(
        validation.errors[0] ?? "That intention does not fit right now.",
      );
      return;
    }
    createItem(task);
    setIntentionsOpen(false);
    setNotice(`Started “${intention.title}” for ${minutes} minutes.`);
  }

  function subjectName(subjectId: string | null) {
    return subjects.find((subject) => subject.id === subjectId)?.name ?? null;
  }

  function recordChallenge(
    source: LearningSource,
    challengeLevel: ChallengeLevel,
  ) {
    const signal = makeLearningSignal(source, challengeLevel);
    setLearningSignals((current) => [signal, ...current]);
    persistMutation({
      table: "learning_signals",
      action: "insert",
      recordId: signal.id,
      payload: learningSignalToRow(signal),
    }).catch(() => undefined);
    setNotice(
      `Challenge noted: ${challengeLevel === "not_understood" ? "not understood yet" : challengeLevel.replace("_", " ")}.`,
    );
  }

  async function generateDeeper(source: LearningSource, fresh = false) {
    if (!fresh) {
      const cached = explorations.find(
        (entry) =>
          entry.sourceType === source.type &&
          entry.sourceId === source.id &&
          entry.sourceTitle === source.title &&
          entry.status !== "dismissed",
      );
      if (cached) {
        setDeeperExploration(cached);
        return;
      }
    }
    setDeeperBusy(true);
    setDeeperError("");
    setDeeperExploration(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token)
        throw new Error(
          "Sign in to use Go Deeper. Challenge feedback still works locally.",
        );
      const latest = latestSignalFor(source, learningSignals);
      const summary = subjectChallengeSummary(
        source.subjectId,
        learningSignals,
      );
      const response = await fetch("/api/go-deeper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          source: {
            type: source.type,
            title: source.title,
            subjectName: source.subjectName ?? null,
            context: source.context ?? "",
          },
          challengeLevel: latest?.challengeLevel ?? null,
          challengeSummary: {
            tooEasy: summary.counts.too_easy,
            goodChallenge: summary.counts.good_challenge,
            difficult: summary.counts.difficult,
            notUnderstood: summary.counts.not_understood,
          },
        }),
      });
      const raw: unknown = await response.json();
      if (!response.ok || !isDeeperResponse(raw))
        throw new Error(
          "No useful exploration was returned. Try again in a moment.",
        );
      const exploration: Exploration = {
        id: crypto.randomUUID(),
        sourceType: source.type,
        sourceId: source.id,
        sourceTitle: source.title,
        sourceContext: source.context ?? "",
        subjectId: source.subjectId,
        challengeLevel: latest?.challengeLevel ?? null,
        framing: raw.framing,
        directions: raw.directions,
        status: "generated",
        promptVersion: 1,
        createdAt: new Date().toISOString(),
      };
      setExplorations((current) => [exploration, ...current]);
      setDeeperExploration(exploration);
      persistMutation({
        table: "explorations",
        action: "insert",
        recordId: exploration.id,
        payload: explorationToRow(exploration),
      }).catch(() => undefined);
    } catch (error) {
      setDeeperError(
        error instanceof Error
          ? error.message
          : "Go Deeper is unavailable right now.",
      );
    } finally {
      setDeeperBusy(false);
    }
  }

  function openGoDeeper(source: LearningSource) {
    setDeeperSource(source);
    setDeeperExploration(null);
    setDeeperError("");
    generateDeeper(source).catch(() => undefined);
  }

  function saveExploration(exploration: Exploration) {
    const saved = { ...exploration, status: "saved" as const };
    setExplorations((current) =>
      current.map((entry) => (entry.id === saved.id ? saved : entry)),
    );
    setDeeperExploration(saved);
    persistMutation({
      table: "explorations",
      action: "update",
      recordId: saved.id,
      payload: { status: "saved" },
    }).catch(() => undefined);
    setNotice("Exploration saved for later.");
  }

  function startExplorationDirection(direction: ExplorationDirection) {
    if (!deeperSource) return;
    const start = new Date();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 15 * 60_000);
    const base = makeItem({
      kind: "task",
      title: `${direction.title} · explore`,
      description: `${direction.prompt}\n\nWhy it is useful: ${direction.whyUseful}`,
      durationMin: 15,
      durationMax: 15,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      energyType: "deep_focus",
      priority: "low",
      flexibility: "elastic",
      subjectId: deeperSource.subjectId,
      workType: "problem_solving",
      requiredEnergy: "high",
      status: "scheduled",
      source: "manual",
      constraints: ["Chosen from Go Deeper", `Source: ${deeperSource.title}`],
    });
    const validation = validatePlacement(
      base,
      base.startsAt!,
      base.endsAt!,
      items,
    );
    if (validation.valid) {
      createItem(base);
      setNotice(`Started a 15-minute exploration: “${direction.title}”.`);
    } else {
      createItem({ ...base, startsAt: null, endsAt: null, status: "inbox" });
      setNotice(
        `Saved “${direction.title}” as a 15-minute possibility; your current fixed event stays protected.`,
      );
    }
    setDeeperSource(null);
  }

  return {
    saveIntention,
    deleteIntention,
    startIntention,
    subjectName,
    recordChallenge,
    generateDeeper,
    openGoDeeper,
    saveExploration,
    startExplorationDirection,
  };
}
