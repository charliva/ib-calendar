// Reading an evaluation model's answers without trusting them.
//
// `experimental_evaluate` returns one answer per question, but the shape that
// comes back is the provider's, not ours: a question can come back missing, a
// boolean answer can arrive as a choice, and a choice can name an option that
// was never offered. None of that should throw inside a request handler whose
// real job is something else, so every reader here answers `null` for anything
// it cannot use and the caller decides what to do without the model.
//
// Kept free of any `ai` import so the modules that build questions stay
// testable under bare node, where the SDK's ESM entry and the `@/` alias are
// both unavailable.

/** One answer, in the shape the evaluation model contract defines. */
export type EvaluationAnswer =
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "score"; score: number; probabilities?: Record<string, number> }
  | { type: "boolean"; probability: number };

export type EvaluationAnswers = Record<string, EvaluationAnswer | undefined>;

/**
 * The model's P(true) for a boolean question, or `null` when it did not answer
 * one.
 *
 * This is a probability, not a confidence: 0.5 means genuinely undecided, and
 * both 0.02 and 0.98 are confident answers. Callers therefore compare against
 * a threshold chosen for what a wrong answer costs them, rather than reading
 * it as certainty.
 */
export function probabilityOf(
  answers: EvaluationAnswers | null,
  id: string,
): number | null {
  const answer = answers?.[id];
  if (!answer || answer.type !== "boolean") return null;
  const { probability } = answer;
  if (!Number.isFinite(probability)) return null;
  if (probability < 0 || probability > 1) return null;
  return probability;
}

/**
 * The option a choice question settled on, or `null` when the answer is
 * missing, the wrong type, or names something that was never on the list.
 */
export function choiceOf<Option extends string>(
  answers: EvaluationAnswers | null,
  id: string,
  allowed: readonly Option[],
): Option | null {
  const answer = answers?.[id];
  if (!answer || answer.type !== "choice") return null;
  return allowed.includes(answer.choice as Option)
    ? (answer.choice as Option)
    : null;
}
