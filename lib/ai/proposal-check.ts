// Checking a generated proposal against what the student actually said.
//
// /api/command already validates the model's proposal against a zod schema,
// but a schema only checks shape. A proposal can be perfectly well-formed and
// still put Tuesday 14:00 in Room 4 on the calendar when the student never
// named a day, a time or a room — the one failure the route's own instructions
// spend four lines forbidding, because the student approves proposals from a
// summary and an invented detail reads exactly like a remembered one.
//
// Judging "is this detail supported by the state?" is a rubric assessment, so
// it goes to the evaluation model rather than to a second generative call: the
// answer needed is a verdict, not prose, and it has to come back fast enough
// to sit in front of a response the student is waiting on.
//
// A failed check does not error. It turns the proposal into the clarification
// the route would have asked for had the gate caught it on the way in, which
// is a screen the student already understands and the app already renders.
//
// No `ai` import here for the same reason as ./command-gate.ts: the questions
// and the reading of them are testable without a gateway key.

import type { ClarificationField } from "../command-clarification.ts";
import {
  choiceOf,
  probabilityOf,
  type EvaluationAnswers,
} from "./evaluation-answers.ts";

/**
 * How sure the model must be that the proposal answers the request before it
 * is passed through.
 *
 * Deliberately low. This question exists to catch a proposal that wandered off
 * and rewrote the week, not to second-guess a reasonable reading of an ambiguous
 * instruction, and the student can always reject what they are shown. Only a
 * confident "no" stops it.
 */
export const ANSWERS_REQUEST_THRESHOLD = 0.25;

const UNSUPPORTED_OPTIONS = [
  "none",
  "subject",
  "date",
  "time",
  "location",
] as const;

export const PROPOSAL_CHECK_QUESTIONS = {
  unsupportedDetail: {
    type: "choice",
    instructions:
      "Which detail in the proposal is not supported by anything in the state? A detail is supported when the student's messages give it, when it follows from exactly one entry in knownSubjects or timetableClasses, or when it is a direct consequence of one of those. Resolve relative days such as 'friday' or 'tomorrow' against now and timezone before judging a date: a date that is the day the student named is supported. Answer none when every detail traces back. When more than one is unsupported, answer with the first of subject, date, time, location that is.",
    criteria: {
      none: "Every subject, day, start time and place in the proposal traces back to the student's messages, the known subjects, or the timetable.",
      subject:
        "The proposal attaches the item to a school subject the student never identified and the timetable does not single out.",
      date: "The proposal fixes a day the student never gave, or narrows a vague period such as 'next week' to one specific day.",
      time: "The proposal fixes a start time the student never gave, or turns a part of the day such as 'the morning' into a clock time.",
      location:
        "The proposal names a room, hall or building the student never gave and the timetable does not supply.",
    },
  },
  answersRequest: {
    type: "boolean",
    instructions:
      "Does the proposal do what the student asked, and only that? Answer false when it changes or deletes items the student never mentioned, or when it ignores the request and does something else. Answer true when it is a reasonable reading of the request, even if not the only one.",
  },
} as const;

/**
 * The proposal, and everything it was allowed to draw on, as one state.
 *
 * `now` and `timezone` are not decoration. Without them the check cannot tell
 * that "friday" and `2026-09-25T09:00+02:00` are the same day, so it reads
 * every correctly resolved relative date as an invented one and turns sound
 * proposals into questions — which is exactly what it did before they were
 * passed.
 */
export function proposalCheckState(input: {
  now: string;
  timezone: string;
  studentMessages: string;
  knownSubjects: unknown;
  timetableClasses: unknown;
  proposal: unknown;
}) {
  return {
    now: input.now,
    timezone: input.timezone,
    studentMessages: input.studentMessages,
    knownSubjects: input.knownSubjects,
    timetableClasses: input.timetableClasses,
    proposal: input.proposal,
  };
}

export type ProposalVerdict =
  /** Show it to the student. Also the answer when the model could not be reached. */
  | { kind: "accept" }
  /**
   * Ask instead of proposing — for the invented detail, or `other` when the
   * proposal is not a reading of the request at all.
   */
  | { kind: "ask"; field: ClarificationField };

/**
 * What to do with a proposal, given the model's answers.
 *
 * Fails open in every direction: a missing answer, an unusable one, or no
 * answers at all (the model was unreachable) all accept the proposal. The
 * check can only ever turn a proposal into a question, never into an error,
 * because the student is mid-conversation and a broken reply is worse than an
 * unchecked one.
 */
export function verdictFromEvaluation(
  answers: EvaluationAnswers | null,
): ProposalVerdict {
  const unsupported = choiceOf(answers, "unsupportedDetail", UNSUPPORTED_OPTIONS);
  if (unsupported !== null && unsupported !== "none") {
    return { kind: "ask", field: unsupported };
  }

  const answersRequest = probabilityOf(answers, "answersRequest");
  if (answersRequest !== null && answersRequest < ANSWERS_REQUEST_THRESHOLD) {
    return { kind: "ask", field: "other" };
  }

  return { kind: "accept" };
}
