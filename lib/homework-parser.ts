import type { HomeworkTaskType, Subject } from "@/lib/school";
import { parseTemporalText } from "./temporal-parser.ts";

export type ParsedHomework = {
  rawText: string;
  title: string;
  subjectId: string | null;
  deadline: string | null;
  taskType: HomeworkTaskType;
  estimatedMinutes: number;
  confidence: {
    subject: boolean;
    deadline: boolean;
    taskType: boolean;
  };
  matched: {
    subject: string | null;
    date: string | null;
    time: string | null;
  };
};

export type ParsedReviewSession = {
  title: string;
  subjectId: string | null;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  deadline: string | null;
};

const weekdayIndexes: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 0,
  sun: 0,
};

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCaseStart(value: string) {
  const clean = value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : "Homework";
}

function detectSubject(text: string, subjects: Subject[]) {
  const candidates = subjects
    .flatMap((subject) => [
      { subject, label: subject.name },
      { subject, label: subject.shortName },
    ])
    .filter(({ label }) => label.trim().length > 0)
    .sort((a, b) => b.label.length - a.label.length);

  for (const candidate of candidates) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])(${escapePattern(candidate.label)})(?=$|[^a-z0-9])`,
      "i",
    );
    const match = text.match(pattern);
    if (match) {
      return {
        subject: candidate.subject,
        matchedText: match[2],
      };
    }
  }
  return { subject: null, matchedText: null };
}

function detectTime(text: string) {
  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (clock) {
    return {
      hour: Number(clock[1]),
      minute: Number(clock[2]),
      matchedText: clock[0],
    };
  }
  const meridiem = text.match(/\bat\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (meridiem) {
    const rawHour = Number(meridiem[1]);
    if (rawHour >= 1 && rawHour <= 12) {
      return {
        hour:
          rawHour % 12 + (meridiem[3].toLowerCase() === "pm" ? 12 : 0),
        minute: Number(meridiem[2] ?? 0),
        matchedText: meridiem[0],
      };
    }
  }
  return null;
}

function detectDate(text: string) {
  const relative = text.match(/\b(today|tomorrow|tonight)\b/i);
  if (relative) {
    return {
      kind: relative[1].toLowerCase(),
      weekday: null,
      matchedText: relative[0],
    };
  }
  const weekday = text.match(
    /\b(next\s+)?(monday|mon|tuesday|tues?|wednesday|wed|thursday|thurs?|friday|fri|saturday|sat|sunday|sun)\b/i,
  );
  if (weekday) {
    return {
      kind: weekday[1] ? "next_weekday" : "weekday",
      weekday: weekdayIndexes[weekday[2].toLowerCase()],
      matchedText: weekday[0],
    };
  }
  return null;
}

function deadlineFromText(text: string, now: Date) {
  const dateMatch = detectDate(text);
  const timeMatch = detectTime(text);
  if (!dateMatch) {
    return {
      deadline: null,
      dateText: null,
      timeText: timeMatch?.matchedText ?? null,
    };
  }

  const deadline = new Date(now);
  deadline.setSeconds(0, 0);
  const defaultHour = dateMatch.kind === "tonight" ? 20 : 18;
  deadline.setHours(
    timeMatch?.hour ?? defaultHour,
    timeMatch?.minute ?? 0,
    0,
    0,
  );

  if (dateMatch.kind === "tomorrow") {
    deadline.setDate(deadline.getDate() + 1);
  } else if (
    dateMatch.kind === "weekday" ||
    dateMatch.kind === "next_weekday"
  ) {
    const target = dateMatch.weekday ?? deadline.getDay();
    let days = (target - now.getDay() + 7) % 7;
    if (
      dateMatch.kind === "next_weekday" ||
      (days === 0 && deadline.getTime() <= now.getTime())
    ) {
      days += 7;
    }
    deadline.setDate(deadline.getDate() + days);
  } else if (
    (dateMatch.kind === "today" || dateMatch.kind === "tonight") &&
    deadline.getTime() <= now.getTime()
  ) {
    deadline.setTime(now.getTime() + 60 * 60_000);
    deadline.setMinutes(Math.ceil(deadline.getMinutes() / 15) * 15, 0, 0);
  }

  return {
    deadline: deadline.toISOString(),
    dateText: dateMatch.matchedText,
    timeText: timeMatch?.matchedText ?? null,
  };
}

function detectTaskType(text: string): {
  taskType: HomeworkTaskType;
  estimatedMinutes: number;
  confident: boolean;
} {
  const lower = text.toLowerCase();
  if (/\b(vocab|vocabulary|flashcards?|anki)\b/.test(lower)) {
    return { taskType: "vocabulary", estimatedMinutes: 25, confident: true };
  }
  if (/\b(essay|report|write|draft|paragraph|reflection)\b/.test(lower)) {
    return { taskType: "writing", estimatedMinutes: 90, confident: true };
  }
  if (/\b(read|reading|pages?|chapter|article|book)\b/.test(lower)) {
    return { taskType: "reading", estimatedMinutes: 35, confident: true };
  }
  if (/\b(revise|revision|study|review|test prep|exam prep)\b/.test(lower)) {
    return { taskType: "revision", estimatedMinutes: 60, confident: true };
  }
  if (
    /\b(questions?|problems?|worksheet|exercises?|practice|quiz|calculations?)\b/.test(
      lower,
    )
  ) {
    return { taskType: "practice", estimatedMinutes: 45, confident: true };
  }
  if (/\b(project|presentation|poster|portfolio|lab)\b/.test(lower)) {
    return { taskType: "project", estimatedMinutes: 75, confident: true };
  }
  return { taskType: "other", estimatedMinutes: 30, confident: false };
}

function sessionDuration(text: string) {
  const minutes = text.match(
    /\b(?:for\s+)?(?:about\s+|around\s+|~)?(\d{1,3})\s*(?:m|min|mins|minutes?)\b/i,
  );
  if (minutes) return Math.max(5, Math.min(240, Number(minutes[1])));
  const hours = text.match(
    /\b(?:for\s+)?(?:about\s+|around\s+|~)?(\d{1,2})(?:\s*\.\s*5)?\s*(?:h|hr|hrs|hours?)\b/i,
  );
  if (!hours) return 45;
  return Math.max(
    5,
    Math.min(240, Number(hours[1]) * 60 + (hours[0].includes(".5") ? 30 : 0)),
  );
}

function hasDate(text: string) {
  return /\b(?:today|tomorrow|day after tomorrow|(?:next\s+)?(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\b/i.test(
    text,
  );
}

function hasTime(text: string) {
  return /\b(?:at\s+)?(?:[01]?\d|2[0-3])[:.]\d{2}\b/i.test(text) ||
    /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text);
}

export function parseReviewSession(
  input: string,
  subjects: Subject[],
  now = new Date(),
): ParsedReviewSession | null {
  const rawText = input.trim();
  const prefix = rawText.match(
    /^(?:(?:add|create|new|schedule)\s+)?(?:a\s+)?(?:\/review|review(?:\s+session)?|revise|revision|study(?:\s+session)?|practice|prep(?:are)?(?:\s+for)?)\b\s*/i,
  );
  if (!prefix) return null;

  const homework = parseHomework(rawText, subjects, now);
  const subject = subjects.find((candidate) => candidate.id === homework.subjectId);
  const durationMinutes = sessionDuration(rawText);
  const parsedDateTime = parseTemporalText(rawText, "datetime", now);
  const includesDate = hasDate(rawText);
  const includesTime = hasTime(rawText);
  const startsAt =
    includesDate && includesTime && parsedDateTime
      ? new Date(parsedDateTime).toISOString()
      : null;
  const endsAt = startsAt
    ? new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString()
    : null;
  const deadline =
    includesDate && !includesTime && parsedDateTime
      ? (() => {
          const date = new Date(parsedDateTime);
          date.setHours(18, 0, 0, 0);
          return date.toISOString();
        })()
      : null;

  return {
    title: subject ? `${subject.name} review` : "Review session",
    subjectId: subject?.id ?? null,
    durationMinutes,
    startsAt,
    endsAt,
    deadline,
  };
}

export function parseHomework(
  input: string,
  subjects: Subject[],
  now = new Date(),
  subjectOverride?: string | null,
): ParsedHomework {
  const rawText = input.trim();
  const withoutPrefix = rawText.replace(
    /^(?:\/hw|hw|homework|assignment|capture)\s*[:\-]?\s*/i,
    "",
  );
  const detected = detectSubject(withoutPrefix, subjects);
  const override = subjects.find((subject) => subject.id === subjectOverride);
  const subject = override ?? detected.subject;
  const deadline = deadlineFromText(withoutPrefix, now);
  const task = detectTaskType(withoutPrefix);

  let title = withoutPrefix;
  if (detected.matchedText) {
    title = title.replace(
      new RegExp(`\\b${escapePattern(detected.matchedText)}\\b`, "i"),
      "",
    );
  }
  if (deadline.dateText) {
    title = title.replace(
      new RegExp(`\\b${escapePattern(deadline.dateText)}\\b`, "i"),
      "",
    );
  }
  if (deadline.timeText) {
    title = title.replace(
      new RegExp(`\\b${escapePattern(deadline.timeText)}\\b`, "i"),
      "",
    );
  }
  title = title
    .replace(/\b(?:due|by|for|on)\s*$/i, "")
    .replace(/\b(?:due|by)\s+(?=[,;:–—-]*$)/i, "");

  return {
    rawText,
    title: titleCaseStart(title),
    subjectId: subject?.id ?? null,
    deadline: deadline.deadline,
    taskType: task.taskType,
    estimatedMinutes: task.estimatedMinutes,
    confidence: {
      subject: Boolean(subject),
      deadline: Boolean(deadline.deadline),
      taskType: task.confident,
    },
    matched: {
      subject: subject?.name ?? null,
      date: deadline.dateText,
      time: deadline.timeText,
    },
  };
}

export function looksLikeHomeworkCommand(
  input: string,
  parsed: ParsedHomework,
) {
  const clean = input.trim();
  if (/^(?:\/hw|hw|homework|assignment|capture)\b/i.test(clean)) return true;
  if (/^(?:move|shift|delete|remove|filter|block)\b/i.test(clean)) return false;
  return (
    (parsed.confidence.subject && parsed.confidence.taskType) ||
    (parsed.confidence.deadline &&
      (parsed.confidence.subject || parsed.confidence.taskType))
  );
}
