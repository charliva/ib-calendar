export type LearningSourceType =
  | "calendar_item"
  | "subject"
  | "assignment"
  | "assessment"
  | "intention"
  | "topic"
  | "question"
  | "note";

export type ChallengeLevel =
  | "too_easy"
  | "good_challenge"
  | "difficult"
  | "not_understood";

export type LearningSource = {
  type: LearningSourceType;
  id: string | null;
  title: string;
  subjectId: string | null;
  subjectName?: string | null;
  context?: string;
};

export type LearningSignal = {
  id: string;
  sourceType: LearningSourceType;
  sourceId: string | null;
  sourceTitle: string;
  subjectId: string | null;
  challengeLevel: ChallengeLevel;
  note: string;
  createdAt: string;
};

export type ExplorationDirectionKind =
  | "why"
  | "connection"
  | "harder_problem"
  | "application"
  | "edge_case"
  | "teacher_question"
  | "understanding_check"
  | "further_reading";

export type ExplorationDirection = {
  kind: ExplorationDirectionKind;
  title: string;
  prompt: string;
  whyUseful: string;
};

export type Exploration = {
  id: string;
  sourceType: LearningSourceType;
  sourceId: string | null;
  sourceTitle: string;
  sourceContext: string;
  subjectId: string | null;
  challengeLevel: ChallengeLevel | null;
  framing: string;
  directions: ExplorationDirection[];
  status: "generated" | "saved" | "completed" | "dismissed";
  promptVersion: number;
  createdAt: string;
};

export const challengeLabels: Record<ChallengeLevel, string> = {
  too_easy: "Too easy",
  good_challenge: "Good challenge",
  difficult: "Difficult",
  not_understood: "Not understood yet",
};

export function makeLearningSignal(
  source: LearningSource,
  challengeLevel: ChallengeLevel,
  now = new Date(),
): LearningSignal {
  return {
    id: crypto.randomUUID(),
    sourceType: source.type,
    sourceId: source.id,
    sourceTitle: source.title,
    subjectId: source.subjectId,
    challengeLevel,
    note: "",
    createdAt: now.toISOString(),
  };
}

export function learningSignalToRow(signal: LearningSignal) {
  return {
    id: signal.id,
    source_type: signal.sourceType,
    source_id: signal.sourceId,
    source_title: signal.sourceTitle,
    subject_id: signal.subjectId,
    challenge_level: signal.challengeLevel,
    note: signal.note || null,
    created_at: signal.createdAt,
  };
}

export function rowToLearningSignal(row: Record<string, unknown>): LearningSignal {
  return {
    id: String(row.id),
    sourceType: row.source_type as LearningSourceType,
    sourceId: typeof row.source_id === "string" ? row.source_id : null,
    sourceTitle: String(row.source_title),
    subjectId: typeof row.subject_id === "string" ? row.subject_id : null,
    challengeLevel: row.challenge_level as ChallengeLevel,
    note: typeof row.note === "string" ? row.note : "",
    createdAt: String(row.created_at),
  };
}

export function explorationToRow(exploration: Exploration) {
  return {
    id: exploration.id,
    source_type: exploration.sourceType,
    source_id: exploration.sourceId,
    source_title: exploration.sourceTitle,
    source_context: exploration.sourceContext || null,
    subject_id: exploration.subjectId,
    challenge_level: exploration.challengeLevel,
    framing: exploration.framing,
    directions: exploration.directions,
    status: exploration.status,
    prompt_version: exploration.promptVersion,
    created_at: exploration.createdAt,
  };
}

export function rowToExploration(row: Record<string, unknown>): Exploration {
  return {
    id: String(row.id),
    sourceType: row.source_type as LearningSourceType,
    sourceId: typeof row.source_id === "string" ? row.source_id : null,
    sourceTitle: String(row.source_title),
    sourceContext: typeof row.source_context === "string" ? row.source_context : "",
    subjectId: typeof row.subject_id === "string" ? row.subject_id : null,
    challengeLevel: (row.challenge_level as ChallengeLevel | null) ?? null,
    framing: String(row.framing),
    directions: Array.isArray(row.directions) ? row.directions as ExplorationDirection[] : [],
    status: row.status as Exploration["status"],
    promptVersion: Number(row.prompt_version ?? 1),
    createdAt: String(row.created_at),
  };
}

export function latestSignalFor(source: LearningSource, signals: LearningSignal[]) {
  return signals
    .filter((signal) => signal.sourceType === source.type && signal.sourceId === source.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function subjectChallengeSummary(
  subjectId: string | null,
  signals: LearningSignal[],
  now = new Date(),
) {
  const since = now.getTime() - 30 * 86_400_000;
  const recent = signals.filter(
    (signal) =>
      signal.subjectId === subjectId && new Date(signal.createdAt).getTime() >= since,
  );
  const counts = {
    too_easy: 0,
    good_challenge: 0,
    difficult: 0,
    not_understood: 0,
  } satisfies Record<ChallengeLevel, number>;
  for (const signal of recent) counts[signal.challengeLevel] += 1;
  return { recent, counts };
}
