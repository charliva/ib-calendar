import {
  addDays,
  dateFromKey,
  makeItem,
  TIMETABLE_IMPORT_MARKER,
  type CalendarItem,
} from "./calendar-engine.ts";
import type { Subject } from "./school.ts";

export type TimetableExtractionCandidate = Partial<CalendarItem> & {
  title: string;
  kind: CalendarItem["kind"];
  evidence: string;
  rawLabel?: string | null;
  itemType?: "academic_subject" | "assembly" | "other" | null;
  subjectConfidence?: "high" | "medium" | "low" | null;
  subjectName?: string | null;
  subjectShortName?: string | null;
  teacher?: string | null;
  room?: string | null;
};

export type NormalizedTimetableLesson = {
  item: CalendarItem;
  evidence: string;
};

export type ReconciledTimetableImport = {
  lessons: NormalizedTimetableLesson[];
  newSubjects: Subject[];
};

const SUBJECT_COLORS = [
  "#7f70e8",
  "#318f87",
  "#d16c46",
  "#527fca",
  "#b85f8b",
  "#7d8d3d",
  "#b17635",
  "#526f91",
];

function subjectKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bmathematics?\s+(?:analysis\s+(?:and|&)\s+approaches)\b/g, "math aa")
    .replace(/\bmathematics?\s+(?:applications\s+(?:and|&)\s+interpretation)\b/g, "math ai")
    .replace(/\bcomputer\s+science\b|\bcomp(?:uter)?\s+sci(?:ence)?\b|\bcs\b/g, "computer science")
    .replace(/\bmathematics?\b|\bmaths?\b/g, "math")
    .replace(/\bbio\b/g, "biology")
    .replace(/\bchem\b/g, "chemistry")
    .replace(/\bphys\b/g, "physics")
    .replace(/\becon\b/g, "economics")
    .replace(/\b(?:higher|standard)\s+level\b|\bhl\b|\bsl\b|\bib\b/g, " ")
    .replace(/\b(?:class|course|lesson|period)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanRawSubjectLabel(value: string) {
  return value
    .replace(/\b\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?\b/g, " ")
    .replace(/\b(?:SL|HL)(?:\s*\/\s*(?:SL|HL))?\b/gi, " ")
    .replace(/\b(?:group|hold|class)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\d+$/, "")
    .trim();
}

function knownSchoolSubject(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\bcohort\b|\bassembly\b|\bmentor(?:ing)?\b|\bform time\b/.test(normalized)) {
    return null;
  }
  if (/\b(?:gp|global politics)\b/.test(normalized)) return "Global Politics";
  if (/\b(?:tok|theory of knowledge)\b/.test(normalized)) {
    return "Theory of Knowledge";
  }
  if (/\bdan(?:ish)?\s+ab\b/.test(normalized)) return "Danish ab initio";
  if (/\beng(?:lish)?\s+a\s+(?:ll|lang(?:uage)?\s+lit(?:erature)?)\b/.test(normalized)) {
    return "English A Language and Literature";
  }
  if (/\bchem(?:istry)?\b/.test(normalized)) return "Chemistry";
  if (/\bbio(?:logy)?\b/.test(normalized)) return "Biology";
  if (/\bphys(?:ics)?\b/.test(normalized)) return "Physics";
  return undefined;
}

function isAssemblyCandidate(candidate: TimetableExtractionCandidate) {
  const sourceText = [candidate.rawLabel, candidate.title, candidate.evidence]
    .filter(Boolean)
    .join(" ");
  return (
    candidate.itemType === "assembly" ||
    /\bcohort\b|\bassembly\b|\bmentor(?:ing)?\b|\bform time\b/i.test(sourceText)
  );
}

function extractedSubjectFor(candidate: TimetableExtractionCandidate) {
  if (isAssemblyCandidate(candidate)) return null;

  const rawLabel = cleanRawSubjectLabel(candidate.rawLabel?.trim() || "");
  const known = rawLabel ? knownSchoolSubject(rawLabel) : undefined;
  if (known !== undefined) return known;

  const proposed = candidate.subjectName?.trim() || "";
  if (rawLabel) {
    if (
      proposed &&
      subjectsAreSimilar(
        rawLabel,
        proposed,
        candidate.subjectShortName ?? "",
        candidate.subjectShortName ?? "",
      )
    ) {
      return proposed;
    }
    // An unfamiliar label is safer as a new editable subject than as a guessed
    // existing one. The review screen lets the user rename or remove it.
    return rawLabel;
  }

  return proposed || candidate.title.trim();
}

function acronym(value: string) {
  const tokens = subjectKey(value).split(" ").filter(Boolean);
  return tokens.length > 1 ? tokens.map((token) => token[0]).join("") : "";
}

export function subjectsAreSimilar(
  firstName: string,
  secondName: string,
  firstShortName = "",
  secondShortName = "",
) {
  const first = subjectKey(firstName);
  const second = subjectKey(secondName);
  if (!first || !second) return false;
  if (first === second) return true;

  // Keep similarly named but distinct IB courses, notably Math AA and Math AI, apart.
  const mathTrack = (value: string) => value.match(/\bmath (aa|ai)\b/)?.[1];
  if (mathTrack(first) && mathTrack(second) && mathTrack(first) !== mathTrack(second)) {
    return false;
  }

  const firstShort = subjectKey(firstShortName);
  const secondShort = subjectKey(secondShortName);
  const firstAliases = new Set(
    [first, firstShort, acronym(firstName), acronym(firstShortName)].filter(Boolean),
  );
  const secondAliases = new Set(
    [second, secondShort, acronym(secondName), acronym(secondShortName)].filter(Boolean),
  );
  if ([...firstAliases].some((alias) => secondAliases.has(alias))) return true;

  if (
    Math.min(first.length, second.length) >= 4 &&
    (first.includes(second) || second.includes(first))
  ) {
    return true;
  }

  const firstTokens = new Set(first.split(" "));
  const secondTokens = new Set(second.split(" "));
  const overlap = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  return overlap / Math.min(firstTokens.size, secondTokens.size) >= 0.67;
}

function subjectColor(name: string) {
  const hash = [...name].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function inferredShortName(name: string) {
  const key = subjectKey(name);
  if (key === "math aa") return "MATH AA";
  if (key === "math ai") return "MATH AI";
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length > 1) return words.map((word) => word[0]).join("").slice(0, 8).toUpperCase();
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
}

function mergeLessonDescription(
  description: string | undefined,
  teacher: string | null | undefined,
  room: string | null | undefined,
) {
  const details = [description?.trim(), teacher?.trim(), room?.trim()].filter(
    (detail): detail is string => Boolean(detail),
  );
  return details.filter(
    (detail, index) =>
      details.findIndex((candidate) => candidate.toLowerCase() === detail.toLowerCase()) === index,
  ).join(" · ");
}

export function isImportedTimetableItem(item: CalendarItem) {
  return (
    item.kind === "event" &&
    item.source === "document" &&
    item.constraints.includes(TIMETABLE_IMPORT_MARKER)
  );
}

export function timetableRoomForItem(item: CalendarItem) {
  const explicitRoom = item.room.trim();
  if (explicitRoom) return explicitRoom;
  if (!isImportedTimetableItem(item)) return "";

  const roomText = [item.description, ...item.constraints].join(" ");
  const labeledRoom = roomText.match(
    /\broom\s*(?:is\s+|[:#-]\s*)?([a-z]{1,8}\s?\d{1,4}[a-z]?)\b/i,
  );
  return labeledRoom?.[1]?.trim() ?? "";
}

export function isItemInWeek(item: CalendarItem, weekStart: string) {
  if (!item.startsAt) return false;
  const start = dateFromKey(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 7);
  const itemStart = new Date(item.startsAt);
  return itemStart >= start && itemStart < end;
}

export function normalizeTimetableLessons(
  candidates: TimetableExtractionCandidate[],
  weekStart: string,
): NormalizedTimetableLesson[] {
  return reconcileTimetableImport(candidates, weekStart, []).lessons;
}

export function reconcileTimetableImport(
  candidates: TimetableExtractionCandidate[],
  weekStart: string,
  existingSubjects: Subject[],
): ReconciledTimetableImport {
  const week = dateFromKey(weekStart);
  week.setHours(0, 0, 0, 0);
  const weekEnd = addDays(week, 7);
  const seen = new Set<string>();
  const lessons: NormalizedTimetableLesson[] = [];
  const newSubjects: Subject[] = [];
  const availableSubjects = [...existingSubjects];

  for (const candidate of candidates) {
    if (
      candidate.kind !== "event" ||
      !candidate.title.trim() ||
      !candidate.startsAt ||
      !candidate.endsAt
    ) {
      continue;
    }
    const start = new Date(candidate.startsAt);
    const end = new Date(candidate.endsAt);
    const duration = Math.round((end.getTime() - start.getTime()) / 60_000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start < week ||
      start >= weekEnd ||
      end <= start ||
      end > weekEnd ||
      duration < 5 ||
      duration > 720
    ) {
      continue;
    }
    const assembly = isAssemblyCandidate(candidate);
    const extractedSubject = extractedSubjectFor(candidate);
    const subjectLabel = assembly ? "Assembly" : extractedSubject;
    let matchedSubject: Subject | undefined;
    if (subjectLabel) {
      matchedSubject = availableSubjects.find((subject) =>
        subjectsAreSimilar(
          subjectLabel,
          subject.name,
          assembly ? "GEN" : candidate.subjectShortName ?? "",
          subject.shortName,
        ),
      );
      if (!matchedSubject) {
        matchedSubject = {
          id: crypto.randomUUID(),
          name: subjectLabel,
          shortName:
            (assembly ? "GEN" : candidate.subjectShortName?.trim()) ||
            inferredShortName(subjectLabel),
          teacher: candidate.teacher?.trim() || "",
          room: candidate.room?.trim() || "",
          color: subjectColor(subjectLabel),
          icon: "",
          createdAt: new Date().toISOString(),
        };
        availableSubjects.push(matchedSubject);
        newSubjects.push(matchedSubject);
      }
    }
    const title = assembly
      ? "Assembly"
      : matchedSubject?.name ?? candidate.rawLabel?.trim() ?? candidate.title.trim();
    const key = `${title.toLowerCase()}|${start.toISOString()}|${end.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lessons.push({
      evidence: candidate.evidence || "Visible lesson in the timetable screenshot.",
      item: makeItem({
        ...candidate,
        id: crypto.randomUUID(),
        kind: "event",
        title,
        subjectId: matchedSubject?.id ?? null,
        room: candidate.room?.trim() ?? "",
        description: mergeLessonDescription(
          [
            candidate.description,
            assembly && candidate.rawLabel && !/assembly/i.test(candidate.rawLabel)
              ? candidate.rawLabel
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          candidate.teacher,
          candidate.room,
        ),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        durationMin: duration,
        durationMax: duration,
        deadline: null,
        windowStart: null,
        windowEnd: null,
        splittable: false,
        flexibility: "fixed",
        constraints: [
          TIMETABLE_IMPORT_MARKER,
          `Week of ${weekStart}`,
          ...(candidate.constraints ?? []).filter(
            (constraint) => constraint !== TIMETABLE_IMPORT_MARKER,
          ),
        ],
        status: "scheduled",
        source: "document",
        syncStatus: "pending",
      }),
    });
  }

  return {
    lessons: lessons
      .sort(
      (a, b) =>
        new Date(a.item.startsAt!).getTime() -
        new Date(b.item.startsAt!).getTime(),
      )
      .slice(0, 70),
    newSubjects,
  };
}
