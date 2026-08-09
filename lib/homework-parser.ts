import type {
  Assignment,
  HomeworkCapture,
  HomeworkTaskType,
  Subject,
} from "@/lib/school";

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
    parsed.confidence.deadline &&
    (parsed.confidence.subject || parsed.confidence.taskType)
  );
}

export function recentSubjects(
  subjects: Subject[],
  captures: HomeworkCapture[],
  assignments: Assignment[],
) {
  const recency = new Map<string, number>();
  [...captures, ...assignments].forEach((entry) => {
    if (!entry.subjectId) return;
    recency.set(
      entry.subjectId,
      Math.max(
        recency.get(entry.subjectId) ?? 0,
        new Date(entry.createdAt).getTime(),
      ),
    );
  });
  return [...subjects].sort(
    (a, b) =>
      (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name),
  );
}
