// The "is this assessment vague?" gate, asked as typed questions.
//
// /api/command refuses to put a school assessment on the calendar until it
// knows the subject, day, start time and place. That decision used to be made
// by the regular expressions in lib/command-clarification.ts, which are cheap
// and instant but read words rather than meaning:
//
//   - "chem test next week" fails the subject check, because the subject is
//     matched by literal string against the stored name "Chemistry". Jev reads
//     it as Chemistry at P=0.97 when Chemistry is in knownSubjects.
//   - "in the morning" satisfies the location check, because `in <word>` looks
//     like a place. Jev scores it 0.04 as a place, because it is a time.
//
// It is not uniformly better. "presentation about my holiday for grandma"
// comes back at P=0.54 for being an assessment — genuinely undecided rather
// than confidently right, so the gate still asks about it, as the regex did.
//
// Judging whether a detail is present is a classification, which is what an
// evaluation model is for: one request asks all five questions against the
// same state and answers with probabilities rather than prose. The regexes
// stay as the fallback for when the model is unreachable — see
// `missingAssessmentDetails`, which this does not replace.
//
// This module is deliberately free of any `ai` import: it builds the state and
// the questions and reads the answers back, so the whole decision is testable
// under bare node without a gateway key.

import type { ClarificationDetail } from "../command-clarification.ts";
import { probabilityOf, type EvaluationAnswers } from "./evaluation-answers.ts";

export type SubjectHint = { name: string; shortName: string };

/**
 * How sure the model must be that this is an assessment before the gate
 * engages at all. An even balance: over-asking wastes a turn, under-asking
 * lets a graded event onto the calendar unchallenged, and neither is clearly
 * worse at the margin.
 */
export const ASSESSMENT_THRESHOLD = 0.5;

/**
 * How sure the model must be that a detail was actually supplied before the
 * gate accepts it and stops asking.
 *
 * Higher than the assessment bar on purpose. A needless question costs the
 * student one reply; a missing question puts a test on the calendar with an
 * invented time, which they will only discover when it is wrong. So a detail
 * counts as given only when the model is more than marginally sure of it.
 */
export const DETAIL_PRESENT_THRESHOLD = 0.6;

/** The four details, in the order the clarification presents them. */
const DETAIL_QUESTIONS = {
  subject: "hasSubject",
  date: "hasDate",
  time: "hasTime",
  location: "hasLocation",
} as const satisfies Record<ClarificationDetail, string>;

export const COMMAND_GATE_QUESTIONS = {
  isAssessment: {
    type: "boolean",
    instructions:
      "Is the student asking to put a graded school assessment on the calendar — a test, quiz, exam, mock, oral, or a presentation that is marked? Homework, revision, coursework deadlines, club meetings and personal plans are not assessments. A presentation given outside school is not an assessment.",
  },
  hasSubject: {
    type: "boolean",
    instructions:
      "Do the student's messages say which school subject the assessment belongs to? An abbreviation, code or nickname counts when it clearly matches one of knownSubjects — treat 'chem' as Chemistry when Chemistry is listed. Answer false when several listed subjects fit equally well.",
  },
  hasDate: {
    type: "boolean",
    instructions:
      "Do the student's messages say which day the assessment is on? A calendar date counts, and so does a relative day that resolves to exactly one day, such as tomorrow or next Tuesday. A range or an approximation such as next week, soon, or before the holidays does not.",
  },
  hasTime: {
    type: "boolean",
    instructions:
      "Do the student's messages say what time of day the assessment starts? A clock time counts, and so does a named school period or lesson slot. A part of the day such as morning, after lunch, or later does not.",
  },
  hasLocation: {
    type: "boolean",
    instructions:
      "Do the student's messages say where the assessment happens? A room number, hall, lab, gym, library, building or campus counts. A time expression is not a place: 'in the morning' and 'in an hour' answer when, not where.",
  },
} as const;

/** Everything the questions above are asked about, as one shared state. */
export function commandGateState(text: string, subjects: SubjectHint[]) {
  return {
    studentMessages: text,
    knownSubjects: subjects.map((subject) => ({
      name: subject.name,
      shortName: subject.shortName,
    })),
  };
}

/**
 * The details still missing, or `null` when the answers cannot be used and the
 * caller should fall back to the regular expressions.
 *
 * An empty array is a real answer — it means this is an assessment and nothing
 * is missing — so it is distinct from `null`.
 */
export function missingDetailsFromEvaluation(
  answers: EvaluationAnswers | null,
): ClarificationDetail[] | null {
  const isAssessment = probabilityOf(answers, "isAssessment");
  if (isAssessment === null) return null;
  if (isAssessment < ASSESSMENT_THRESHOLD) return [];

  const missing: ClarificationDetail[] = [];
  for (const [field, id] of Object.entries(DETAIL_QUESTIONS)) {
    const present = probabilityOf(answers, id);
    // One unusable answer is not a reason to discard the other four, but it is
    // a reason to ask: the gate has no evidence the detail was ever given.
    if (present === null || present < DETAIL_PRESENT_THRESHOLD) {
      missing.push(field as ClarificationDetail);
    }
  }
  return missing;
}
