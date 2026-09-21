import {
  experimental_evaluate as evaluate,
  gateway,
  type Experimental_EvaluationQuestion as EvaluationQuestion,
} from "ai";
import type { EvaluationAnswers } from "./evaluation-answers.ts";

// The one place that talks to the evaluation model.
//
// Jev is not a smaller language model and cannot stand in for one: the gateway
// catalogue reports it as `type: "evaluation"` with `max_tokens: 0`, so it
// emits no generated tokens at all. It answers typed questions about a shared
// state — choices, scores, and P(true) for booleans — which is why it sits
// beside the generative routes rather than behind them, judging their input
// and their output instead of producing either.
//
// Everything here fails open. These calls decorate a request whose real work
// is something else, so an unreachable gateway, a slow answer or a malformed
// one all resolve to `null` and leave the caller doing exactly what it did
// before the model existed. A judgment that cannot be obtained is not an
// error worth showing a student mid-sentence.

export const JEV_MODEL_ID = "typesafe-ai/jev";

/**
 * Whether a gateway credential exists at all.
 *
 * Mirrors the check the AI routes already make: `AI_GATEWAY_API_KEY` locally,
 * the OIDC token on Vercel.
 */
export function evaluationConfigured() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
  );
}

/**
 * Ask Jev every question at once, or answer `null`.
 *
 * All the questions share one state and one request — the model evaluates them
 * in parallel — so asking five costs roughly what asking one costs.
 *
 * `timeoutMs` is a hard ceiling rather than a target: past it the caller's own
 * answer is better than a late one. Retries are off for the same reason.
 */
export async function askJev(
  state: Record<string, unknown>,
  questions: Record<string, EvaluationQuestion>,
  timeoutMs: number,
): Promise<EvaluationAnswers | null> {
  if (!evaluationConfigured()) return null;
  try {
    const { answers } = await evaluate({
      model: gateway.evaluation(JEV_MODEL_ID),
      state: state as Parameters<typeof evaluate>[0]["state"],
      questions,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return answers as EvaluationAnswers;
  } catch {
    return null;
  }
}
