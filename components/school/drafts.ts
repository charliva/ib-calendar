import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  Subject,
} from "@/lib/school";

// Blank records for the "new ..." path of each editor. Defaults live here so a
// new assignment and an imported one agree on what a sensible session length or
// working window is.
export function emptySubject(): Subject {
  return {
    id: crypto.randomUUID(),
    name: "",
    shortName: "",
    teacher: "",
    room: "",
    color: "#7f70e8",
    icon: "",
    createdAt: new Date().toISOString(),
  };
}

export function emptyClass(subjectId = "", day = 1, validFrom = ""): SchoolClass {
  return {
    id: crypto.randomUUID(),
    subjectId,
    weekday: day,
    startTime: "08:00",
    endTime: "09:00",
    weekPattern: "every",
    teacher: "",
    room: "",
    validFrom,
    validUntil: null,
    createdAt: new Date().toISOString(),
  };
}

export function emptyException(
  classId = "",
  occurrenceDate = "",
): ClassException {
  return {
    id: crypto.randomUUID(),
    classId,
    occurrenceDate,
    status: "cancelled",
    replacementDate: occurrenceDate || null,
    replacementStartTime: "08:00",
    replacementEndTime: "09:00",
    replacementRoom: "",
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

export function emptyAssignment(subjectId = ""): Assignment {
  return {
    id: crypto.randomUUID(),
    subjectId: subjectId || null,
    title: "",
    dueAt: null,
    estimatedMinutes: 45,
    priority: "medium",
    status: "inbox",
    submissionMethod: "",
    notes: "",
    gradeWeight: null,
    taskContext: "anywhere",
    computerRequired: false,
    workType: null,
    requiredEnergy: "medium",
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: "15:00",
    allowedWindowEnd: "21:00",
    minSessionMinutes: 30,
    maxSessionMinutes: 90,
    splittable: true,
    actualMinutes: null,
    createdAt: new Date().toISOString(),
  };
}

export function emptyAssessment(subjectId = ""): Assessment {
  return {
    id: crypto.randomUUID(),
    subjectId: subjectId || null,
    title: "",
    scheduledAt: "",
    endsAt: null,
    assessmentType: "Exam",
    importance: "medium",
    weight: null,
    notes: "",
    status: "upcoming",
    estimatedRevisionMinutes: 240,
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    revisionWindowStart: "15:00",
    revisionWindowEnd: "21:00",
    minRevisionSessionMinutes: 25,
    maxRevisionSessionMinutes: 60,
    spacedRepetitionEnabled: false,
    reviewIntervalsDays: [1, 3, 7, 14],
    createdAt: new Date().toISOString(),
  };
}
