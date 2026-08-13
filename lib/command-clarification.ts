export type ClarificationField = "subject" | "date" | "time" | "location";

type SubjectHint = { name: string; shortName: string };

export function isSchoolAssessmentCapture(text: string) {
  return /\b(test|quiz|exam|assessment|mock|oral|presentation)\b/i.test(text);
}

export function missingAssessmentDetails(
  text: string,
  subjects: SubjectHint[],
): ClarificationField[] {
  if (!isSchoolAssessmentCapture(text)) return [];
  const normalized = text.toLowerCase();
  const subjectKnown = subjects.some((subject) => {
    const names = [subject.name, subject.shortName]
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length >= 2);
    return names.some((value) =>
      new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
        normalized,
      ),
    );
  });
  const hasDate =
    /\b(today|tomorrow|day after tomorrow|(?:next\s+)?(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})\b/i.test(
      text,
    );
  const hasTime =
    /\b(?:at\s+)?(?:[01]?\d|2[0-3])[:.]\d{2}\b/i.test(text) ||
    /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text);
  const withoutTimes = text
    .replace(/\b(?:at\s+)?(?:[01]?\d|2[0-3])[:.]\d{2}\b/gi, " ")
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, " ");
  const hasLocation =
    /\b(room|classroom|hall|lab|library|gym|campus|online|home)\b/i.test(
      withoutTimes,
    ) || /\b(?:in|where)\s+[a-z][a-z0-9 -]{1,30}\b/i.test(withoutTimes);

  return [
    ...(!subjectKnown ? (["subject"] as const) : []),
    ...(!hasDate ? (["date"] as const) : []),
    ...(!hasTime ? (["time"] as const) : []),
    ...(!hasLocation ? (["location"] as const) : []),
  ];
}

const FIELD_LABELS: Record<ClarificationField, string> = {
  subject: "Which subject?",
  date: "What day?",
  time: "What time?",
  location: "Where is it?",
};

export function clarificationFor(fields: ClarificationField[]) {
  const labels = fields.map((field) => FIELD_LABELS[field]);
  return {
    kind: "clarification" as const,
    message:
      labels.length === 1
        ? `One detail before I add it: ${labels[0]}`
        : `Got it. Before I add anything: ${labels.join(" ")}`,
    questions: fields.map((field) => ({ field, label: FIELD_LABELS[field] })),
  };
}
