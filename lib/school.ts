import type {
  EnergyRequirement,
  Priority,
  SchoolWorkType,
  TaskContext,
} from "@/lib/calendar-engine";

import { DEFAULT_WEEK_PATTERN_ANCHOR } from "./school/week-pattern.ts";
import { clampSchoolDayMinutes } from "./school/minute-bounds.ts";

export type { TaskContext } from "@/lib/calendar-engine";
export type WeekPattern = "every" | "a" | "b";
export type AssignmentStatus =
  "inbox" | "planned" | "in_progress" | "submitted" | "completed" | "archived";
export type AssessmentStatus = "upcoming" | "completed" | "cancelled";
export type LessonExceptionStatus = "cancelled" | "rescheduled";
export type HomeworkTaskType =
  | "reading"
  | "writing"
  | "practice"
  | "revision"
  | "vocabulary"
  | "project"
  | "other";

export type SchoolDaySettings = {
  schoolLocation: string;
  schoolDayStart: string;
  schoolDayEnd: string;
  travelBeforeSchoolMinutes: number;
  travelHomeMinutes: number;
  recoveryAfterHomeMinutes: number;
  schoolworkCutoff: string;
  preferredStudyStart: string;
  preferredStudyEnd: string;
  allowCommuteScheduling: boolean;
  schoolComputerAccess: boolean;
  minimumFreePeriodMinutes: number;
  lowEnergyStart: string;
  lowEnergyEnd: string;
  /**
   * Monday of a week the student has confirmed runs the A timetable. Schools
   * decide which week is which, so the fortnightly cycle is anchored to an
   * answer rather than to a constant.
   */
  weekPatternAnchor: string;
  focusTemplates: Record<SchoolWorkType, FocusTemplate>;
};

export type FocusTemplate = {
  durationMin: number;
  durationMax: number;
  reviewAfterDays?: number[];
};

export const WORK_TYPE_LABELS: Record<SchoolWorkType, string> = {
  deep_focus: "Deep study",
  light_work: "Light work",
  reading: "Reading",
  memorization: "Memorization",
  problem_solving: "Problem set",
  creative_project: "Creative / project",
};

export const DEFAULT_FOCUS_TEMPLATES: Record<SchoolWorkType, FocusTemplate> = {
  deep_focus: { durationMin: 45, durationMax: 60 },
  light_work: { durationMin: 25, durationMax: 25 },
  reading: { durationMin: 25, durationMax: 25 },
  memorization: {
    durationMin: 20,
    durationMax: 20,
    reviewAfterDays: [1, 3],
  },
  problem_solving: { durationMin: 45, durationMax: 45 },
  creative_project: { durationMin: 50, durationMax: 50 },
};

export const DEFAULT_SCHOOL_DAY_SETTINGS: SchoolDaySettings = {
  schoolLocation: "",
  schoolDayStart: "08:00",
  schoolDayEnd: "15:00",
  travelBeforeSchoolMinutes: 30,
  travelHomeMinutes: 30,
  recoveryAfterHomeMinutes: 30,
  schoolworkCutoff: "21:00",
  preferredStudyStart: "16:00",
  preferredStudyEnd: "19:00",
  allowCommuteScheduling: false,
  schoolComputerAccess: false,
  minimumFreePeriodMinutes: 45,
  lowEnergyStart: "19:00",
  lowEnergyEnd: "21:00",
  weekPatternAnchor: DEFAULT_WEEK_PATTERN_ANCHOR,
  focusTemplates: DEFAULT_FOCUS_TEMPLATES,
};

export type Subject = {
  id: string;
  name: string;
  shortName: string;
  teacher: string;
  room: string;
  color: string;
  icon: string;
  createdAt: string;
};

export type SchoolClass = {
  energyUsage?: number;
  locationContext?: "school" | "home" | "library" | "city" | "anywhere";
  id: string;
  subjectId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  weekPattern: WeekPattern;
  teacher: string;
  room: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
};

export type ClassException = {
  replacementTitle?: string;
  energyUsage?: number;
  locationContext?: string;
  id: string;
  classId: string;
  occurrenceDate: string;
  status: LessonExceptionStatus;
  replacementDate: string | null;
  replacementStartTime: string | null;
  replacementEndTime: string | null;
  replacementRoom: string;
  notes: string;
  createdAt: string;
};

export type Assignment = {
  id: string;
  subjectId: string | null;
  title: string;
  dueAt: string | null;
  estimatedMinutes: number;
  priority: Priority;
  status: AssignmentStatus;
  submissionMethod: string;
  notes: string;
  gradeWeight: number | null;
  taskContext: TaskContext;
  computerRequired: boolean;
  workType: SchoolWorkType | null;
  requiredEnergy: EnergyRequirement;
  allowedWeekdays: number[];
  allowedWindowStart: string;
  allowedWindowEnd: string;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  splittable: boolean;
  actualMinutes: number | null;
  createdAt: string;
};

export type Assessment = {
  id: string;
  subjectId: string | null;
  title: string;
  scheduledAt: string;
  endsAt: string | null;
  assessmentType: string;
  importance: Priority;
  weight: number | null;
  notes: string;
  status: AssessmentStatus;
  estimatedRevisionMinutes: number;
  allowedWeekdays: number[];
  revisionWindowStart: string;
  revisionWindowEnd: string;
  minRevisionSessionMinutes: number;
  maxRevisionSessionMinutes: number;
  spacedRepetitionEnabled: boolean;
  reviewIntervalsDays: number[];
  createdAt: string;
};

export type SchoolState = {
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  assignments: Assignment[];
  assessments: Assessment[];
  schoolDaySettings: SchoolDaySettings;
};

export function normalizeAssignment(assignment: Assignment): Assignment {
  return {
    ...assignment,
    allowedWeekdays:
      assignment.allowedWeekdays?.length > 0
        ? assignment.allowedWeekdays
        : [1, 2, 3, 4, 5, 6, 7],
    allowedWindowStart: assignment.allowedWindowStart || "15:00",
    allowedWindowEnd: assignment.allowedWindowEnd || "21:00",
    minSessionMinutes: assignment.minSessionMinutes || 30,
    maxSessionMinutes: assignment.maxSessionMinutes || 90,
    splittable: assignment.splittable ?? true,
    workType: assignment.workType ?? null,
    requiredEnergy: assignment.requiredEnergy ?? "medium",
    actualMinutes: assignment.actualMinutes ?? null,
  };
}

export function estimateMinutesFromHistory(
  workType: SchoolWorkType | null,
  assignments: Assignment[],
): number | null {
  const observations = assignments
    .filter(
      (entry) =>
        entry.status === "completed" &&
        entry.actualMinutes !== null &&
        entry.actualMinutes > 0 &&
        entry.workType === workType,
    )
    .map((entry) => entry.actualMinutes!);
  if (observations.length === 0) return null;
  return Math.round(
    observations.reduce((total, value) => total + value, 0) /
      observations.length,
  );
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const nullableText = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;
const numeric = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};
const numericArray = (value: unknown, fallback: number[]) =>
  Array.isArray(value)
    ? value.map(Number).filter((entry) => Number.isInteger(entry))
    : fallback;
const focusTemplates = (
  value: unknown,
): Record<SchoolWorkType, FocusTemplate> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_FOCUS_TEMPLATES;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    (Object.keys(DEFAULT_FOCUS_TEMPLATES) as SchoolWorkType[]).map((key) => {
      const fallback = DEFAULT_FOCUS_TEMPLATES[key];
      const candidate =
        record[key] && typeof record[key] === "object"
          ? (record[key] as Record<string, unknown>)
          : {};
      return [
        key,
        {
          durationMin: numeric(candidate.durationMin, fallback.durationMin),
          durationMax: numeric(candidate.durationMax, fallback.durationMax),
          ...(key === "memorization"
            ? {
                reviewAfterDays: numericArray(
                  candidate.reviewAfterDays,
                  fallback.reviewAfterDays ?? [1, 3],
                ),
              }
            : {}),
        },
      ];
    }),
  ) as Record<SchoolWorkType, FocusTemplate>;
};

export function rowToSubject(row: Record<string, unknown>): Subject {
  return {
    id: text(row.id),
    name: text(row.name),
    shortName: text(row.short_name) || text(row.name).slice(0, 8).toUpperCase(),
    teacher: text(row.teacher),
    room: text(row.room),
    color: text(row.color) || "#7f70e8",
    icon: text(row.icon),
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

export function subjectToRow(subject: Subject) {
  return {
    id: subject.id,
    name: subject.name,
    short_name: subject.shortName,
    teacher: subject.teacher || null,
    room: subject.room || null,
    color: subject.color || "#7f70e8",
    icon: subject.icon || null,
  };
}

export function rowToSchoolDaySettings(
  row: Record<string, unknown> | null | undefined,
): SchoolDaySettings {
  if (!row) return DEFAULT_SCHOOL_DAY_SETTINGS;
  return {
    schoolLocation: text(row.school_location),
    schoolDayStart: text(row.school_day_start).slice(0, 5) || "08:00",
    schoolDayEnd: text(row.school_day_end).slice(0, 5) || "15:00",
    travelBeforeSchoolMinutes: numeric(row.travel_before_school_minutes, 30),
    travelHomeMinutes: numeric(row.travel_home_minutes, 30),
    recoveryAfterHomeMinutes: numeric(row.recovery_after_home_minutes, 30),
    schoolworkCutoff: text(row.schoolwork_cutoff).slice(0, 5) || "21:00",
    preferredStudyStart: text(row.preferred_study_start).slice(0, 5) || "16:00",
    preferredStudyEnd: text(row.preferred_study_end).slice(0, 5) || "19:00",
    allowCommuteScheduling: Boolean(row.allow_commute_scheduling),
    schoolComputerAccess: Boolean(row.school_computer_access),
    minimumFreePeriodMinutes: Math.max(
      45,
      numeric(row.minimum_free_period_minutes, 45),
    ),
    lowEnergyStart: text(row.low_energy_start).slice(0, 5) || "19:00",
    lowEnergyEnd: text(row.low_energy_end).slice(0, 5) || "21:00",
    weekPatternAnchor:
      text(row.week_pattern_anchor).slice(0, 10) || DEFAULT_WEEK_PATTERN_ANCHOR,
    focusTemplates: focusTemplates(row.focus_templates),
  };
}

export function normalizeSchoolDaySettings(
  settings: SchoolDaySettings,
): SchoolDaySettings {
  return {
    ...DEFAULT_SCHOOL_DAY_SETTINGS,
    ...settings,
    travelBeforeSchoolMinutes: clampSchoolDayMinutes(
      "travelBeforeSchoolMinutes",
      settings.travelBeforeSchoolMinutes,
    ),
    travelHomeMinutes: clampSchoolDayMinutes(
      "travelHomeMinutes",
      settings.travelHomeMinutes,
    ),
    recoveryAfterHomeMinutes: clampSchoolDayMinutes(
      "recoveryAfterHomeMinutes",
      settings.recoveryAfterHomeMinutes,
    ),
    minimumFreePeriodMinutes: clampSchoolDayMinutes(
      "minimumFreePeriodMinutes",
      settings.minimumFreePeriodMinutes,
    ),
    weekPatternAnchor:
      settings.weekPatternAnchor?.trim() || DEFAULT_WEEK_PATTERN_ANCHOR,
    focusTemplates: focusTemplates(settings.focusTemplates),
  };
}

export function schoolDaySettingsToRow(settings: SchoolDaySettings) {
  return {
    school_location: settings.schoolLocation,
    school_day_start: settings.schoolDayStart,
    school_day_end: settings.schoolDayEnd,
    travel_before_school_minutes: settings.travelBeforeSchoolMinutes,
    travel_home_minutes: settings.travelHomeMinutes,
    recovery_after_home_minutes: settings.recoveryAfterHomeMinutes,
    schoolwork_cutoff: settings.schoolworkCutoff,
    preferred_study_start: settings.preferredStudyStart,
    preferred_study_end: settings.preferredStudyEnd,
    allow_commute_scheduling: settings.allowCommuteScheduling,
    school_computer_access: settings.schoolComputerAccess,
    minimum_free_period_minutes: settings.minimumFreePeriodMinutes,
    low_energy_start: settings.lowEnergyStart,
    low_energy_end: settings.lowEnergyEnd,
    week_pattern_anchor: settings.weekPatternAnchor,
    focus_templates: settings.focusTemplates,
  };
}

export function rowToClass(row: Record<string, unknown>): SchoolClass {
  return {
    energyUsage: numeric(row.energy_usage, 3),
    locationContext:
      (row.location_context as SchoolClass["locationContext"]) ?? "school",
    id: text(row.id),
    subjectId: text(row.subject_id),
    weekday: numeric(row.weekday, 1),
    startTime: text(row.start_time).slice(0, 5),
    endTime: text(row.end_time).slice(0, 5),
    weekPattern: (text(row.week_pattern) || "every") as WeekPattern,
    teacher: text(row.teacher),
    room: text(row.room),
    validFrom: text(row.valid_from),
    validUntil: nullableText(row.valid_until),
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

export function classToRow(schoolClass: SchoolClass) {
  return {
    energy_usage: schoolClass.energyUsage ?? 3,
    location_context: schoolClass.locationContext ?? "school",
    id: schoolClass.id,
    subject_id: schoolClass.subjectId,
    weekday: schoolClass.weekday,
    start_time: schoolClass.startTime,
    end_time: schoolClass.endTime,
    week_pattern: schoolClass.weekPattern,
    teacher: schoolClass.teacher || null,
    room: schoolClass.room || null,
    valid_from: schoolClass.validFrom,
    valid_until: schoolClass.validUntil,
  };
}

export function rowToClassException(
  row: Record<string, unknown>,
): ClassException {
  return {
    replacementTitle: text(row.replacement_title),
    energyUsage:
      row.energy_usage == null ? undefined : numeric(row.energy_usage, 3),
    locationContext: text(row.location_context),
    id: text(row.id),
    classId: text(row.class_id),
    occurrenceDate: text(row.occurrence_date),
    status: (text(row.status) || "cancelled") as LessonExceptionStatus,
    replacementDate: nullableText(row.replacement_date),
    replacementStartTime:
      nullableText(row.replacement_start_time)?.slice(0, 5) ?? null,
    replacementEndTime:
      nullableText(row.replacement_end_time)?.slice(0, 5) ?? null,
    replacementRoom: text(row.replacement_room),
    notes: text(row.notes),
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

export function classExceptionToRow(exception: ClassException) {
  return {
    replacement_title: exception.replacementTitle || null,
    energy_usage: exception.energyUsage ?? null,
    location_context: exception.locationContext || null,
    id: exception.id,
    class_id: exception.classId,
    occurrence_date: exception.occurrenceDate,
    status: exception.status,
    replacement_date:
      exception.status === "rescheduled" ? exception.replacementDate : null,
    replacement_start_time:
      exception.status === "rescheduled"
        ? exception.replacementStartTime
        : null,
    replacement_end_time:
      exception.status === "rescheduled" ? exception.replacementEndTime : null,
    replacement_room:
      exception.status === "rescheduled"
        ? exception.replacementRoom || null
        : null,
    notes: exception.notes || null,
  };
}

export function rowToAssignment(row: Record<string, unknown>): Assignment {
  return {
    id: text(row.id),
    subjectId: nullableText(row.subject_id),
    title: text(row.title),
    dueAt: nullableText(row.due_at),
    estimatedMinutes: numeric(row.estimated_minutes, 30),
    priority: (text(row.priority) || text(row.urgency) || "medium") as Priority,
    status: (text(row.status) || "inbox") as AssignmentStatus,
    submissionMethod: text(row.submission_method),
    notes: text(row.notes),
    gradeWeight:
      row.grade_weight === null || row.grade_weight === undefined
        ? null
        : numeric(row.grade_weight),
    taskContext: (text(row.task_context) || "anywhere") as TaskContext,
    computerRequired: Boolean(row.computer_required),
    workType: nullableText(row.work_type) as SchoolWorkType | null,
    requiredEnergy: (text(row.required_energy) ||
      "medium") as EnergyRequirement,
    allowedWeekdays: numericArray(row.allowed_weekdays, [1, 2, 3, 4, 5, 6, 7]),
    allowedWindowStart: text(row.allowed_window_start).slice(0, 5) || "15:00",
    allowedWindowEnd: text(row.allowed_window_end).slice(0, 5) || "21:00",
    minSessionMinutes: numeric(row.min_session_minutes, 30),
    maxSessionMinutes: numeric(row.max_session_minutes, 90),
    splittable: row.splittable === undefined ? true : Boolean(row.splittable),
    actualMinutes:
      row.actual_minutes === null || row.actual_minutes === undefined
        ? null
        : numeric(row.actual_minutes),
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

export function assignmentToRow(assignment: Assignment) {
  return {
    id: assignment.id,
    subject_id: assignment.subjectId,
    title: assignment.title,
    due_at: assignment.dueAt,
    estimated_minutes: assignment.estimatedMinutes,
    priority: assignment.priority,
    urgency: assignment.priority,
    status: assignment.status,
    submission_method: assignment.submissionMethod || null,
    notes: assignment.notes || null,
    grade_weight: assignment.gradeWeight,
    task_context: assignment.taskContext,
    computer_required: assignment.computerRequired,
    work_type: assignment.workType,
    required_energy: assignment.requiredEnergy,
    allowed_weekdays: assignment.allowedWeekdays,
    allowed_window_start: assignment.allowedWindowStart,
    allowed_window_end: assignment.allowedWindowEnd,
    min_session_minutes: assignment.minSessionMinutes,
    max_session_minutes: assignment.maxSessionMinutes,
    splittable: assignment.splittable,
    actual_minutes: assignment.actualMinutes,
  };
}

export function rowToAssessment(row: Record<string, unknown>): Assessment {
  return {
    id: text(row.id),
    subjectId: nullableText(row.subject_id),
    title: text(row.title),
    scheduledAt: text(row.scheduled_at),
    endsAt: nullableText(row.ends_at),
    assessmentType: text(row.assessment_type),
    importance: (text(row.importance) || "medium") as Priority,
    weight:
      row.weight === null || row.weight === undefined
        ? null
        : numeric(row.weight),
    notes: text(row.notes),
    status: (text(row.status) || "upcoming") as AssessmentStatus,
    estimatedRevisionMinutes: numeric(row.estimated_revision_minutes, 240),
    allowedWeekdays: numericArray(row.allowed_weekdays, [1, 2, 3, 4, 5, 6, 7]),
    revisionWindowStart: text(row.revision_window_start).slice(0, 5) || "15:00",
    revisionWindowEnd: text(row.revision_window_end).slice(0, 5) || "21:00",
    minRevisionSessionMinutes: numeric(row.min_revision_session_minutes, 25),
    maxRevisionSessionMinutes: numeric(row.max_revision_session_minutes, 60),
    spacedRepetitionEnabled: Boolean(row.spaced_repetition_enabled),
    reviewIntervalsDays: numericArray(row.review_intervals_days, [1, 3, 7, 14]),
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

export function assessmentToRow(assessment: Assessment) {
  return {
    id: assessment.id,
    subject_id: assessment.subjectId,
    title: assessment.title,
    scheduled_at: assessment.scheduledAt,
    ends_at: assessment.endsAt,
    assessment_type: assessment.assessmentType,
    importance: assessment.importance,
    weight: assessment.weight,
    notes: assessment.notes || null,
    status: assessment.status,
    estimated_revision_minutes: assessment.estimatedRevisionMinutes,
    allowed_weekdays: assessment.allowedWeekdays,
    revision_window_start: assessment.revisionWindowStart,
    revision_window_end: assessment.revisionWindowEnd,
    min_revision_session_minutes: assessment.minRevisionSessionMinutes,
    max_revision_session_minutes: assessment.maxRevisionSessionMinutes,
    spaced_repetition_enabled: assessment.spacedRepetitionEnabled,
    review_intervals_days: assessment.reviewIntervalsDays,
  };
}

export function normalizeAssessment(assessment: Assessment): Assessment {
  return {
    ...assessment,
    estimatedRevisionMinutes: assessment.estimatedRevisionMinutes ?? 240,
    allowedWeekdays:
      assessment.allowedWeekdays?.length > 0
        ? assessment.allowedWeekdays
        : [1, 2, 3, 4, 5, 6, 7],
    revisionWindowStart: assessment.revisionWindowStart || "15:00",
    revisionWindowEnd: assessment.revisionWindowEnd || "21:00",
    minRevisionSessionMinutes: assessment.minRevisionSessionMinutes || 25,
    maxRevisionSessionMinutes: assessment.maxRevisionSessionMinutes || 60,
    spacedRepetitionEnabled: assessment.spacedRepetitionEnabled ?? false,
    reviewIntervalsDays:
      assessment.reviewIntervalsDays?.length > 0
        ? assessment.reviewIntervalsDays
        : [1, 3, 7, 14],
  };
}
