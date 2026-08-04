"use client";

import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  GraduationCap,
  Laptop,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addDays,
  dateFromKey,
  dateKey,
  startOfWeek,
  type CalendarItem,
  type EnergyRequirement,
  type Priority,
  type SchoolWorkType,
} from "@/lib/calendar-engine";
import {
  assignmentProgress,
  formatWorkMinutes,
} from "@/lib/assignment-planner";
import {
  examCountdown,
  revisionProgress,
} from "@/lib/revision-planner";
import {
  detectFreePeriods,
  suggestAssignmentForFreePeriod,
  type FreePeriod,
} from "@/lib/school-day-engine";
import { WORK_TYPE_LABELS } from "@/lib/school";
import type {
  Assessment,
  AssessmentStatus,
  Assignment,
  AssignmentStatus,
  ClassException,
  LessonExceptionStatus,
  SchoolClass,
  SchoolDaySettings,
  Subject,
  TaskContext,
  WeekPattern,
} from "@/lib/school";

type SchoolTab = "timetable" | "subjects" | "assignments" | "assessments";
type Editor =
  | "subject"
  | "class"
  | "exception"
  | "assignment"
  | "assessment"
  | "school_day";

type Props = {
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  assignments: Assignment[];
  assessments: Assessment[];
  assignmentSessions: CalendarItem[];
  schoolDaySettings: SchoolDaySettings;
  onSaveSubject: (subject: Subject) => void;
  onDeleteSubject: (subject: Subject) => void;
  onSaveClass: (schoolClass: SchoolClass) => void;
  onDeleteClass: (schoolClass: SchoolClass) => void;
  onSaveException: (exception: ClassException) => void;
  onDeleteException: (exception: ClassException) => void;
  onSaveSchoolDaySettings: (settings: SchoolDaySettings) => void;
  onSaveAssignment: (assignment: Assignment) => void;
  onDeleteAssignment: (assignment: Assignment) => void;
  onPlanAssignment: (assignment: Assignment) => void;
  onAddAssignmentSession: (assignment: Assignment) => void;
  onOpenAssignmentSession: (session: CalendarItem) => void;
  onToggleAssignmentSession: (session: CalendarItem) => void;
  onUseFreePeriod: (assignment: Assignment, period: FreePeriod) => void;
  onSaveAssessment: (assessment: Assessment) => void;
  onDeleteAssessment: (assessment: Assessment) => void;
  onPlanRevision: (assessment: Assessment) => void;
  onMarkRevisionLearned: (
    session: CalendarItem,
    assessment: Assessment,
  ) => void;
  onOpenRevisionSession: (session: CalendarItem) => void;
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const priorities: Priority[] = ["low", "medium", "high"];
const contexts: TaskContext[] = ["school", "home", "library", "anywhere"];
const workTypes = Object.keys(WORK_TYPE_LABELS) as SchoolWorkType[];
const energyRequirements: EnergyRequirement[] = ["low", "medium", "high"];
const assignmentStatuses: AssignmentStatus[] = [
  "inbox",
  "planned",
  "in_progress",
  "submitted",
  "completed",
  "archived",
];
const assessmentStatuses: AssessmentStatus[] = [
  "upcoming",
  "completed",
  "cancelled",
];

function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function displayDate(value: string | null, includeTime = true) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function emptySubject(): Subject {
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

function emptyClass(subjectId = "", day = 1, validFrom = ""): SchoolClass {
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

function emptyException(
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

function emptyAssignment(subjectId = ""): Assignment {
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
    createdAt: new Date().toISOString(),
  };
}

function emptyAssessment(subjectId = ""): Assessment {
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

function subjectColor(subject?: Subject) {
  return subject?.color?.startsWith("#") ? subject.color : "#7f70e8";
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function SchoolWorkspace(props: Props) {
  const {
    subjects,
    classes,
    classExceptions,
    assignments,
    assessments,
  } = props;
  const [tab, setTab] = useState<SchoolTab>("timetable");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [weekAnchor, setWeekAnchor] = useState("");
  const [activeWeek, setActiveWeek] = useState<"a" | "b">("a");
  const [subjectDraft, setSubjectDraft] = useState<Subject | null>(null);
  const [classDraft, setClassDraft] = useState<SchoolClass | null>(null);
  const [exceptionDraft, setExceptionDraft] =
    useState<ClassException | null>(null);
  const [assignmentDraft, setAssignmentDraft] =
    useState<Assignment | null>(null);
  const [assessmentDraft, setAssessmentDraft] =
    useState<Assessment | null>(null);
  const [schoolDayDraft, setSchoolDayDraft] =
    useState<SchoolDaySettings | null>(null);

  useEffect(() => {
    if (weekAnchor) return;
    const frame = window.requestAnimationFrame(() => {
      const monday = startOfWeek(new Date());
      setWeekAnchor(dateKey(monday));
      setActiveWeek(
        Math.ceil(
          ((monday.getTime() -
            new Date(monday.getFullYear(), 0, 1).getTime()) /
            86_400_000 +
            1) /
            7,
        ) %
          2 ===
          0
          ? "b"
          : "a",
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [weekAnchor]);

  const weekDays = useMemo(() => {
    if (!weekAnchor) return [];
    const monday = dateFromKey(weekAnchor);
    return weekdays.map((_, index) => addDays(monday, index));
  }, [weekAnchor]);
  const freePeriods = useMemo(() => {
    if (!weekDays.length) return [];
    return detectFreePeriods(
      classes,
      classExceptions,
      props.schoolDaySettings,
      weekDays[0],
      weekDays.at(-1)!,
    );
  }, [classExceptions, classes, props.schoolDaySettings, weekDays]);

  function subjectFor(id: string | null) {
    return subjects.find((subject) => subject.id === id);
  }

  function openEditor(next: Editor) {
    setEditor(next);
    if (next === "subject") setSubjectDraft(emptySubject());
    if (next === "class") {
      setClassDraft(
        emptyClass(subjects[0]?.id, 1, weekAnchor || dateKey(new Date())),
      );
    }
    if (next === "assignment") {
      setAssignmentDraft(emptyAssignment(subjects[0]?.id));
    }
    if (next === "assessment") {
      setAssessmentDraft(emptyAssessment(subjects[0]?.id));
    }
    if (next === "school_day") {
      setSchoolDayDraft(structuredClone(props.schoolDaySettings));
    }
  }

  function closeEditor() {
    setEditor(null);
    setSubjectDraft(null);
    setClassDraft(null);
    setExceptionDraft(null);
    setAssignmentDraft(null);
    setAssessmentDraft(null);
    setSchoolDayDraft(null);
  }

  function openException(schoolClass: SchoolClass, date?: string) {
    const occurrenceDate =
      date ??
      weekDays.find((day) => day.getDay() === schoolClass.weekday)
        ?.toISOString()
        .slice(0, 10) ??
      weekAnchor;
    setExceptionDraft(emptyException(schoolClass.id, occurrenceDate));
    setEditor("exception");
  }

  function saveSubject(event: FormEvent) {
    event.preventDefault();
    if (!subjectDraft?.name.trim() || !subjectDraft.shortName.trim()) return;
    props.onSaveSubject({
      ...subjectDraft,
      name: subjectDraft.name.trim(),
      shortName: subjectDraft.shortName.trim().toUpperCase().slice(0, 12),
    });
    closeEditor();
  }

  function saveClass(event: FormEvent) {
    event.preventDefault();
    if (!classDraft?.subjectId || classDraft.endTime <= classDraft.startTime) {
      return;
    }
    props.onSaveClass(classDraft);
    closeEditor();
  }

  function saveException(event: FormEvent) {
    event.preventDefault();
    if (!exceptionDraft?.classId || !exceptionDraft.occurrenceDate) return;
    if (
      exceptionDraft.status === "rescheduled" &&
      (!exceptionDraft.replacementDate ||
        !exceptionDraft.replacementStartTime ||
        !exceptionDraft.replacementEndTime ||
        exceptionDraft.replacementEndTime <=
          exceptionDraft.replacementStartTime)
    ) {
      return;
    }
    const existing = classExceptions.find(
      (entry) =>
        entry.classId === exceptionDraft.classId &&
        entry.occurrenceDate === exceptionDraft.occurrenceDate,
    );
    props.onSaveException({
      ...exceptionDraft,
      id: existing?.id ?? exceptionDraft.id,
    });
    closeEditor();
  }

  function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (
      !assignmentDraft?.title.trim() ||
      !assignmentDraft.dueAt ||
      assignmentDraft.allowedWeekdays.length === 0 ||
      assignmentDraft.allowedWindowEnd <= assignmentDraft.allowedWindowStart ||
      assignmentDraft.maxSessionMinutes < assignmentDraft.minSessionMinutes
    ) {
      return;
    }
    props.onSaveAssignment({
      ...assignmentDraft,
      title: assignmentDraft.title.trim(),
    });
    closeEditor();
  }

  function saveAssessment(event: FormEvent) {
    event.preventDefault();
    if (
      !assessmentDraft?.title.trim() ||
      !assessmentDraft.scheduledAt ||
      !assessmentDraft.assessmentType.trim() ||
      assessmentDraft.allowedWeekdays.length === 0 ||
      assessmentDraft.revisionWindowEnd <=
        assessmentDraft.revisionWindowStart ||
      assessmentDraft.maxRevisionSessionMinutes <
        assessmentDraft.minRevisionSessionMinutes ||
      (assessmentDraft.spacedRepetitionEnabled &&
        assessmentDraft.reviewIntervalsDays.length === 0)
    ) {
      return;
    }
    props.onSaveAssessment({
      ...assessmentDraft,
      title: assessmentDraft.title.trim(),
      assessmentType: assessmentDraft.assessmentType.trim(),
    });
    closeEditor();
  }

  function saveSchoolDay(event: FormEvent) {
    event.preventDefault();
    if (
      !schoolDayDraft ||
      schoolDayDraft.schoolDayEnd <= schoolDayDraft.schoolDayStart ||
      schoolDayDraft.preferredStudyEnd <=
        schoolDayDraft.preferredStudyStart ||
      schoolDayDraft.lowEnergyEnd <= schoolDayDraft.lowEnergyStart ||
      Object.values(schoolDayDraft.focusTemplates).some(
        (template) => template.durationMax < template.durationMin,
      )
    ) {
      return;
    }
    props.onSaveSchoolDaySettings(schoolDayDraft);
    closeEditor();
  }

  const sortedAssignments = [...assignments].sort((a, b) => {
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
  const sortedAssessments = [...assessments].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  return (
    <section className="school-workspace">
      <header className="school-hero">
        <div>
          <span className="micro-label">School data</span>
          <h1>School</h1>
          <p>
            Timetable, deadlines, and assessments—kept separate from movable
            work sessions.
          </p>
        </div>
        <div className="school-counts" aria-label="School overview">
          <span>
            <strong>{subjects.length}</strong> subjects
          </span>
          <span>
            <strong>{assignments.length}</strong> assignments
          </span>
          <span>
            <strong>{assessments.length}</strong> assessments
          </span>
        </div>
      </header>

      <nav className="school-tabs" aria-label="School sections">
        {(
          [
            ["timetable", CalendarDays, "Timetable"],
            ["subjects", BookOpen, "Subjects"],
            ["assignments", ClipboardList, "Assignments"],
            ["assessments", GraduationCap, "Assessments"],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            className={tab === value ? "active" : ""}
            type="button"
            key={value}
            onClick={() => {
              setTab(value);
              closeEditor();
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      <div className={`school-body ${editor ? "has-editor" : ""}`}>
        <div className="school-content">
          {tab === "timetable" && (
            <>
              <div className="school-section-bar">
                <div className="week-stepper">
                  <button
                    type="button"
                    aria-label="Previous school week"
                    onClick={() =>
                      setWeekAnchor((current) =>
                        dateKey(addDays(dateFromKey(current), -7)),
                      )
                    }
                    disabled={!weekAnchor}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <strong>
                    {weekDays.length
                      ? `${displayDate(dateKey(weekDays[0]), false)} – ${displayDate(
                          dateKey(weekDays[4]),
                          false,
                        )}`
                      : "This week"}
                  </strong>
                  <button
                    type="button"
                    aria-label="Next school week"
                    onClick={() =>
                      setWeekAnchor((current) =>
                        dateKey(addDays(dateFromKey(current), 7)),
                      )
                    }
                    disabled={!weekAnchor}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div className="week-pattern-switch" aria-label="A or B week">
                  {(["a", "b"] as const).map((pattern) => (
                    <button
                      className={activeWeek === pattern ? "active" : ""}
                      type="button"
                      key={pattern}
                      onClick={() => setActiveWeek(pattern)}
                    >
                      {pattern.toUpperCase()} week
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openEditor("school_day")}
                >
                  <Clock3 size={14} /> Rules
                </button>
                <button
                  className="school-primary"
                  type="button"
                  onClick={() => openEditor("class")}
                  disabled={subjects.length === 0}
                >
                  <Plus size={14} /> Lesson
                </button>
              </div>

              {subjects.length === 0 ? (
                <SchoolEmpty
                  icon={BookOpen}
                  title="Add a subject first"
                  copy="Lessons, assignments, and assessments all connect to a subject."
                  action="Add subject"
                  onAction={() => {
                    setTab("subjects");
                    openEditor("subject");
                  }}
                />
              ) : classes.length === 0 ? (
                <SchoolEmpty
                  icon={CalendarDays}
                  title="Your timetable is clear"
                  copy="Add recurring lessons, then mark the weeks that alternate."
                  action="Add lesson"
                  onAction={() => openEditor("class")}
                />
              ) : (
                <div className="school-timetable">
                  {weekDays.map((day, dayIndex) => {
                    const key = dateKey(day);
                    const regular = classes
                      .filter(
                        (entry) =>
                          entry.weekday === dayIndex + 1 &&
                          (entry.weekPattern === "every" ||
                            entry.weekPattern === activeWeek) &&
                          key >= entry.validFrom &&
                          (!entry.validUntil || key <= entry.validUntil),
                      )
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const movedHere = classExceptions.filter(
                      (entry) =>
                        entry.status === "rescheduled" &&
                        entry.replacementDate === key &&
                        !regular.some((lesson) => lesson.id === entry.classId),
                    );
                    return (
                      <section className="timetable-day" key={key}>
                        <header>
                          <span>{weekdays[dayIndex].slice(0, 3)}</span>
                          <strong>{day.getDate()}</strong>
                        </header>
                        <div>
                          {regular.map((lesson) => {
                            const subject = subjectFor(lesson.subjectId);
                            const exception = classExceptions.find(
                              (entry) =>
                                entry.classId === lesson.id &&
                                entry.occurrenceDate === key,
                            );
                            return (
                              <LessonCard
                                key={lesson.id}
                                lesson={lesson}
                                subject={subject}
                                exception={exception}
                                onEdit={() => {
                                  setClassDraft(structuredClone(lesson));
                                  setEditor("class");
                                }}
                                onException={() => openException(lesson, key)}
                              />
                            );
                          })}
                          {movedHere.map((exception) => {
                            const lesson = classes.find(
                              (entry) => entry.id === exception.classId,
                            );
                            if (!lesson) return null;
                            return (
                              <LessonCard
                                key={exception.id}
                                lesson={lesson}
                                subject={subjectFor(lesson.subjectId)}
                                exception={exception}
                                moved
                                onEdit={() => {
                                  setExceptionDraft(structuredClone(exception));
                                  setEditor("exception");
                                }}
                                onException={() => {
                                  setExceptionDraft(structuredClone(exception));
                                  setEditor("exception");
                                }}
                              />
                            );
                          })}
                          {regular.length === 0 && movedHere.length === 0 && (
                            <span className="timetable-empty">Open time</span>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {classes.length > 0 && (
                <div className="school-record-list compact">
                  <div className="record-list-heading">
                    <span>Timetable rules</span>
                    <strong>{classes.length}</strong>
                  </div>
                  {classes.map((lesson) => {
                    const subject = subjectFor(lesson.subjectId);
                    return (
                      <article className="school-record" key={lesson.id}>
                        <i
                          style={
                            {
                              "--subject": subjectColor(subject),
                            } as CSSProperties
                          }
                        />
                        <div>
                          <strong>{subject?.name ?? "Unknown subject"}</strong>
                          <small>
                            {weekdays[lesson.weekday - 1]} · {lesson.startTime}–
                            {lesson.endTime} ·{" "}
                            {lesson.weekPattern === "every"
                              ? "every week"
                              : `${lesson.weekPattern.toUpperCase()} weeks`}
                          </small>
                        </div>
                        <div className="record-actions">
                          <button
                            type="button"
                            title="Cancel or reschedule"
                            onClick={() => openException(lesson)}
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            type="button"
                            title="Edit lesson"
                            onClick={() => {
                              setClassDraft(structuredClone(lesson));
                              setEditor("class");
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete lesson"
                            onClick={() => props.onDeleteClass(lesson)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {freePeriods.length > 0 && (
                <section className="free-period-panel">
                  <header>
                    <div>
                      <span className="micro-label">Useful gaps</span>
                      <h3>Free periods</h3>
                    </div>
                    <span>{freePeriods.length} detected</span>
                  </header>
                  <div>
                    {freePeriods.map((period) => {
                      const suggestion = suggestAssignmentForFreePeriod(
                        period,
                        assignments,
                        props.schoolDaySettings,
                      );
                      const minutes = suggestion
                        ? Math.min(
                            period.durationMinutes,
                            suggestion.maxSessionMinutes,
                            Math.max(suggestion.minSessionMinutes, 25),
                          )
                        : 0;
                      return (
                        <article key={period.start.toISOString()}>
                          <div>
                            <strong>
                              {period.start.toLocaleDateString("en-GB", {
                                weekday: "short",
                              })}{" "}
                              {period.start.toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              –
                              {period.end.toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </strong>
                            <small>
                              Free period · {period.durationMinutes} min
                            </small>
                          </div>
                          {suggestion ? (
                            <button
                              type="button"
                              onClick={() =>
                                props.onUseFreePeriod(suggestion, period)
                              }
                            >
                              <span>Suggested</span>
                              <strong>{suggestion.title}</strong>
                              <small>{minutes} min</small>
                            </button>
                          ) : (
                            <span className="free-period-no-fit">
                              No context-compatible task
                            </span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {tab === "subjects" && (
            <>
              <div className="school-section-bar">
                <div>
                  <span className="micro-label">Defaults for lessons</span>
                  <h2>Subjects</h2>
                </div>
                <button
                  className="school-primary"
                  type="button"
                  onClick={() => openEditor("subject")}
                >
                  <Plus size={14} /> Subject
                </button>
              </div>
              {subjects.length === 0 ? (
                <SchoolEmpty
                  icon={BookOpen}
                  title="No subjects yet"
                  copy="Add the subjects you take, with optional teacher and room defaults."
                  action="Add subject"
                  onAction={() => openEditor("subject")}
                />
              ) : (
                <div className="subject-grid">
                  {subjects.map((subject) => (
                    <article
                      className="subject-card"
                      key={subject.id}
                      style={
                        {
                          "--subject": subjectColor(subject),
                        } as CSSProperties
                      }
                    >
                      <i />
                      <header>
                        <span>{subject.icon || subject.shortName.slice(0, 2)}</span>
                        <div className="record-actions">
                          <button
                            type="button"
                            title="Edit subject"
                            onClick={() => {
                              setSubjectDraft(structuredClone(subject));
                              setEditor("subject");
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete subject"
                            onClick={() => props.onDeleteSubject(subject)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </header>
                      <strong>{subject.name}</strong>
                      <small>{subject.shortName}</small>
                      <footer>
                        <span>
                          <GraduationCap size={12} />
                          {subject.teacher || "No teacher"}
                        </span>
                        <span>
                          <MapPin size={12} />
                          {subject.room || "No room"}
                        </span>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "assignments" && (
            <>
              <div className="school-section-bar">
                <div>
                  <span className="micro-label">Deadline ≠ work session</span>
                  <h2>Assignments</h2>
                </div>
                <button
                  className="school-primary"
                  type="button"
                  onClick={() => openEditor("assignment")}
                >
                  <Plus size={14} /> Assignment
                </button>
              </div>
              <div className="domain-note">
                <Clock3 size={15} />
                <span>
                  Due dates stay here. Scheduling work later creates separate,
                  movable task sessions.
                </span>
              </div>
              {sortedAssignments.length === 0 ? (
                <SchoolEmpty
                  icon={ClipboardList}
                  title="Nothing due yet"
                  copy="Capture an assignment with its real deadline and expected effort."
                  action="Add assignment"
                  onAction={() => openEditor("assignment")}
                />
              ) : (
                <div className="school-record-list">
                  {sortedAssignments.map((assignment) => {
                    const subject = subjectFor(assignment.subjectId);
                    const progress = assignmentProgress(
                      assignment,
                      props.assignmentSessions,
                    );
                    const ratio = Math.min(
                      100,
                      Math.round(
                        (progress.completedMinutes /
                          Math.max(1, assignment.estimatedMinutes)) *
                          100,
                      ),
                    );
                    return (
                      <article
                        className="school-record assignment-record"
                        key={assignment.id}
                      >
                        <i
                          style={
                            {
                              "--subject": subjectColor(subject),
                            } as CSSProperties
                          }
                        />
                        <div>
                          <span className="record-kicker">
                            {subject?.shortName ?? "No subject"} ·{" "}
                            {formatStatus(assignment.status)}
                          </span>
                          <strong>{assignment.title}</strong>
                          <small>
                            Due {displayDate(assignment.dueAt)} ·{" "}
                            {formatWorkMinutes(assignment.estimatedMinutes)} ·{" "}
                            {assignment.priority}
                          </small>
                          <div className="assignment-progress">
                            <div>
                              <span style={{ width: `${ratio}%` }} />
                            </div>
                            <small>
                              {formatWorkMinutes(progress.plannedMinutes)} /{" "}
                              {formatWorkMinutes(assignment.estimatedMinutes)} planned
                              {" · "}
                              {formatWorkMinutes(progress.completedMinutes)} completed
                            </small>
                          </div>
                          <div className="record-meta">
                            {assignment.workType && (
                              <span>{WORK_TYPE_LABELS[assignment.workType]}</span>
                            )}
                            <span>{assignment.requiredEnergy} energy</span>
                            <span>
                              <MapPin size={11} /> {assignment.taskContext}
                            </span>
                            {assignment.computerRequired && (
                              <span>
                                <Laptop size={11} /> computer
                              </span>
                            )}
                            {assignment.submissionMethod && (
                              <span>{assignment.submissionMethod}</span>
                            )}
                            {assignment.gradeWeight !== null && (
                              <span>{assignment.gradeWeight}% grade</span>
                            )}
                          </div>
                          {progress.sessions.length > 0 && (
                            <div className="assignment-sessions">
                              {progress.sessions.map((session) => (
                                <button
                                  type="button"
                                  key={session.id}
                                  className={
                                    session.status === "completed"
                                      ? "completed"
                                      : ""
                                  }
                                  onClick={() =>
                                    props.onOpenAssignmentSession(session)
                                  }
                                >
                                  <span
                                    role="checkbox"
                                    aria-checked={
                                      session.status === "completed"
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      props.onToggleAssignmentSession(session);
                                    }}
                                  >
                                    <CheckCircle2 size={13} />
                                  </span>
                                  <span>
                                    {session.startsAt
                                      ? displayDate(session.startsAt)
                                      : "Unscheduled"}
                                  </span>
                                  <small>{formatWorkMinutes(
                                    session.startsAt && session.endsAt
                                      ? Math.round(
                                          (new Date(session.endsAt).getTime() -
                                            new Date(session.startsAt).getTime()) /
                                            60_000,
                                        )
                                      : session.durationMin,
                                  )}</small>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="assignment-actions">
                          <button
                            className="school-primary"
                            type="button"
                            onClick={() => props.onPlanAssignment(assignment)}
                            disabled={
                              !assignment.dueAt ||
                              progress.remainingMinutes === 0
                            }
                          >
                            <CalendarDays size={13} /> Plan
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              props.onAddAssignmentSession(assignment)
                            }
                            title="Add an unscheduled work session"
                          >
                            <Plus size={13} /> Session
                          </button>
                          <div className="record-actions">
                          <button
                            type="button"
                            title="Edit assignment"
                            onClick={() => {
                              setAssignmentDraft(structuredClone(assignment));
                              setEditor("assignment");
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete assignment"
                            onClick={() => props.onDeleteAssignment(assignment)}
                          >
                            <Trash2 size={13} />
                          </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "assessments" && (
            <>
              <div className="school-section-bar">
                <div>
                  <span className="micro-label">Tests and exams</span>
                  <h2>Assessments</h2>
                </div>
                <button
                  className="school-primary"
                  type="button"
                  onClick={() => openEditor("assessment")}
                >
                  <Plus size={14} /> Assessment
                </button>
              </div>
              {sortedAssessments.length === 0 ? (
                <SchoolEmpty
                  icon={GraduationCap}
                  title="No assessments yet"
                  copy="Add tests, mocks, presentations, and exams with their weighting."
                  action="Add assessment"
                  onAction={() => openEditor("assessment")}
                />
              ) : (
                <div className="school-record-list">
                  {sortedAssessments.map((assessment) => {
                    const subject = subjectFor(assessment.subjectId);
                    const countdown = examCountdown(assessment);
                    const progress = revisionProgress(
                      assessment,
                      props.assignmentSessions,
                    );
                    const runwayProgress = Math.min(
                      100,
                      Math.max(
                        0,
                        Math.round(
                          (progress.learnedMinutes /
                            Math.max(1, assessment.estimatedRevisionMinutes)) *
                            100,
                        ),
                      ),
                    );
                    return (
                      <article
                        className="school-record assessment-record"
                        key={assessment.id}
                      >
                        <i
                          style={
                            {
                              "--subject": subjectColor(subject),
                            } as CSSProperties
                          }
                        />
                        <div>
                          <span className="record-kicker">
                            {subject?.shortName ?? "No subject"} ·{" "}
                            {assessment.assessmentType}
                          </span>
                          <strong>{assessment.title}</strong>
                          <small>
                            {countdown === 0
                              ? "Exam today"
                              : `${countdown} day${countdown === 1 ? "" : "s"} to go`}
                            {" · "}
                            {displayDate(assessment.scheduledAt)} ·{" "}
                            {assessment.importance} importance
                            {assessment.weight !== null
                              ? ` · ${assessment.weight}%`
                              : ""}
                          </small>
                          <div className="revision-runway">
                            <div>
                              <span style={{ width: `${runwayProgress}%` }} />
                            </div>
                            <small>
                              {formatWorkMinutes(progress.plannedMinutes)} /{" "}
                              {formatWorkMinutes(
                                assessment.estimatedRevisionMinutes,
                              )}{" "}
                              planned ·{" "}
                              {formatWorkMinutes(progress.learnedMinutes)} learned
                            </small>
                          </div>
                          {progress.sessions.length > 0 && (
                            <div className="revision-session-list">
                              {progress.sessions.map((session) => (
                                <div
                                  className={
                                    session.learnedAt ? "learned" : ""
                                  }
                                  key={session.id}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      props.onOpenRevisionSession(session)
                                    }
                                  >
                                    <span>
                                      {session.revisionStage ?? "Revision"}
                                    </span>
                                    <small>
                                      {session.startsAt
                                        ? displayDate(session.startsAt)
                                        : "Unscheduled"}
                                    </small>
                                  </button>
                                  {!session.learnedAt &&
                                    session.reviewOffsetDays === null && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          props.onMarkRevisionLearned(
                                            session,
                                            assessment,
                                          )
                                        }
                                      >
                                        <CheckCircle2 size={12} /> Learned
                                      </button>
                                    )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="assessment-actions">
                          <button
                            className="school-primary"
                            type="button"
                            onClick={() => props.onPlanRevision(assessment)}
                            disabled={
                              assessment.status !== "upcoming" ||
                              countdown === 0 ||
                              progress.remainingMinutes === 0
                            }
                          >
                            <CalendarDays size={13} /> Build runway
                          </button>
                          <div className="record-actions">
                          <button
                            type="button"
                            title="Edit assessment"
                            onClick={() => {
                              setAssessmentDraft(structuredClone(assessment));
                              setEditor("assessment");
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete assessment"
                            onClick={() => props.onDeleteAssessment(assessment)}
                          >
                            <Trash2 size={13} />
                          </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {editor && (
          <aside className="school-editor">
            <header>
              <div>
                <span className="micro-label">School record</span>
                <h2>
                  {editor === "class"
                    ? "Lesson"
                    : editor === "exception"
                      ? "Lesson change"
                      : editor === "school_day"
                        ? "School-day rules"
                        : editor[0].toUpperCase() + editor.slice(1)}
                </h2>
              </div>
              <button type="button" onClick={closeEditor} aria-label="Close">
                <X size={15} />
              </button>
            </header>

            {editor === "subject" && subjectDraft && (
              <form onSubmit={saveSubject}>
                <FormField label="Name">
                  <input
                    required
                    maxLength={80}
                    autoFocus
                    value={subjectDraft.name}
                    onChange={(event) =>
                      setSubjectDraft({
                        ...subjectDraft,
                        name: event.target.value,
                        shortName:
                          subjectDraft.shortName ||
                          event.target.value
                            .replace(/[^a-z0-9]/gi, "")
                            .slice(0, 8)
                            .toUpperCase(),
                      })
                    }
                    placeholder="Biology"
                  />
                </FormField>
                <div className="form-pair">
                  <FormField label="Short name">
                    <input
                      required
                      maxLength={12}
                      value={subjectDraft.shortName}
                      onChange={(event) =>
                        setSubjectDraft({
                          ...subjectDraft,
                          shortName: event.target.value,
                        })
                      }
                      placeholder="BIO"
                    />
                  </FormField>
                  <FormField label="Icon">
                    <input
                      maxLength={16}
                      value={subjectDraft.icon}
                      onChange={(event) =>
                        setSubjectDraft({
                          ...subjectDraft,
                          icon: event.target.value,
                        })
                      }
                      placeholder="🧬"
                    />
                  </FormField>
                </div>
                <FormField label="Teacher">
                  <input
                    maxLength={120}
                    value={subjectDraft.teacher}
                    onChange={(event) =>
                      setSubjectDraft({
                        ...subjectDraft,
                        teacher: event.target.value,
                      })
                    }
                    placeholder="Ms Jensen"
                  />
                </FormField>
                <div className="form-pair">
                  <FormField label="Room">
                    <input
                      maxLength={80}
                      value={subjectDraft.room}
                      onChange={(event) =>
                        setSubjectDraft({
                          ...subjectDraft,
                          room: event.target.value,
                        })
                      }
                      placeholder="B204"
                    />
                  </FormField>
                  <FormField label="Color">
                    <input
                      type="color"
                      value={subjectColor(subjectDraft)}
                      onChange={(event) =>
                        setSubjectDraft({
                          ...subjectDraft,
                          color: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <EditorFooter onCancel={closeEditor} />
              </form>
            )}

            {editor === "class" && classDraft && (
              <form onSubmit={saveClass}>
                <SubjectSelect
                  subjects={subjects}
                  value={classDraft.subjectId}
                  onChange={(subjectId) =>
                    setClassDraft({ ...classDraft, subjectId })
                  }
                />
                <div className="form-pair">
                  <FormField label="Day">
                    <select
                      value={classDraft.weekday}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          weekday: Number(event.target.value),
                        })
                      }
                    >
                      {weekdays.map((day, index) => (
                        <option value={index + 1} key={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Weeks">
                    <select
                      value={classDraft.weekPattern}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          weekPattern: event.target.value as WeekPattern,
                        })
                      }
                    >
                      <option value="every">Every week</option>
                      <option value="a">A weeks</option>
                      <option value="b">B weeks</option>
                    </select>
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Starts">
                    <input
                      required
                      type="time"
                      value={classDraft.startTime}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          startTime: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Ends">
                    <input
                      required
                      type="time"
                      min={classDraft.startTime}
                      value={classDraft.endTime}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          endTime: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Room override">
                    <input
                      value={classDraft.room}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          room: event.target.value,
                        })
                      }
                      placeholder={
                        subjectFor(classDraft.subjectId)?.room || "Use subject"
                      }
                    />
                  </FormField>
                  <FormField label="Teacher override">
                    <input
                      value={classDraft.teacher}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          teacher: event.target.value,
                        })
                      }
                      placeholder={
                        subjectFor(classDraft.subjectId)?.teacher ||
                        "Use subject"
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="From">
                    <input
                      required
                      type="date"
                      value={classDraft.validFrom}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          validFrom: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Until">
                    <input
                      type="date"
                      min={classDraft.validFrom}
                      value={classDraft.validUntil ?? ""}
                      onChange={(event) =>
                        setClassDraft({
                          ...classDraft,
                          validUntil: event.target.value || null,
                        })
                      }
                    />
                  </FormField>
                </div>
                <EditorFooter onCancel={closeEditor} />
              </form>
            )}

            {editor === "exception" && exceptionDraft && (
              <form onSubmit={saveException}>
                <FormField label="Lesson">
                  <select
                    required
                    value={exceptionDraft.classId}
                    onChange={(event) =>
                      setExceptionDraft({
                        ...exceptionDraft,
                        classId: event.target.value,
                      })
                    }
                  >
                    {classes.map((lesson) => (
                      <option value={lesson.id} key={lesson.id}>
                        {subjectFor(lesson.subjectId)?.name} ·{" "}
                        {weekdays[lesson.weekday - 1]} {lesson.startTime}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="form-pair">
                  <FormField label="Original date">
                    <input
                      required
                      type="date"
                      value={exceptionDraft.occurrenceDate}
                      onChange={(event) =>
                        setExceptionDraft({
                          ...exceptionDraft,
                          occurrenceDate: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Change">
                    <select
                      value={exceptionDraft.status}
                      onChange={(event) =>
                        setExceptionDraft({
                          ...exceptionDraft,
                          status: event.target
                            .value as LessonExceptionStatus,
                        })
                      }
                    >
                      <option value="cancelled">Cancelled</option>
                      <option value="rescheduled">Rescheduled</option>
                    </select>
                  </FormField>
                </div>
                {exceptionDraft.status === "rescheduled" && (
                  <>
                    <FormField label="New date">
                      <input
                        required
                        type="date"
                        value={exceptionDraft.replacementDate ?? ""}
                        onChange={(event) =>
                          setExceptionDraft({
                            ...exceptionDraft,
                            replacementDate: event.target.value || null,
                          })
                        }
                      />
                    </FormField>
                    <div className="form-pair">
                      <FormField label="New start">
                        <input
                          required
                          type="time"
                          value={exceptionDraft.replacementStartTime ?? ""}
                          onChange={(event) =>
                            setExceptionDraft({
                              ...exceptionDraft,
                              replacementStartTime:
                                event.target.value || null,
                            })
                          }
                        />
                      </FormField>
                      <FormField label="New end">
                        <input
                          required
                          type="time"
                          value={exceptionDraft.replacementEndTime ?? ""}
                          onChange={(event) =>
                            setExceptionDraft({
                              ...exceptionDraft,
                              replacementEndTime: event.target.value || null,
                            })
                          }
                        />
                      </FormField>
                    </div>
                    <FormField label="New room">
                      <input
                        value={exceptionDraft.replacementRoom}
                        onChange={(event) =>
                          setExceptionDraft({
                            ...exceptionDraft,
                            replacementRoom: event.target.value,
                          })
                        }
                        placeholder="Optional"
                      />
                    </FormField>
                  </>
                )}
                <FormField label="Note">
                  <textarea
                    value={exceptionDraft.notes}
                    onChange={(event) =>
                      setExceptionDraft({
                        ...exceptionDraft,
                        notes: event.target.value,
                      })
                    }
                    placeholder="Reason or changed details"
                  />
                </FormField>
                <EditorFooter onCancel={closeEditor} />
                {classExceptions.some(
                  (entry) =>
                    entry.classId === exceptionDraft.classId &&
                    entry.occurrenceDate === exceptionDraft.occurrenceDate,
                ) && (
                  <button
                    className="editor-delete"
                    type="button"
                    onClick={() => {
                      const existing = classExceptions.find(
                        (entry) =>
                          entry.classId === exceptionDraft.classId &&
                          entry.occurrenceDate ===
                            exceptionDraft.occurrenceDate,
                      );
                      if (existing) props.onDeleteException(existing);
                      closeEditor();
                    }}
                  >
                    <Trash2 size={13} /> Remove this change
                  </button>
                )}
              </form>
            )}

            {editor === "assignment" && assignmentDraft && (
              <form onSubmit={saveAssignment}>
                <FormField label="Title">
                  <input
                    required
                    autoFocus
                    value={assignmentDraft.title}
                    onChange={(event) =>
                      setAssignmentDraft({
                        ...assignmentDraft,
                        title: event.target.value,
                      })
                    }
                    placeholder="Biology lab report"
                  />
                </FormField>
                <SubjectSelect
                  subjects={subjects}
                  allowEmpty
                  value={assignmentDraft.subjectId ?? ""}
                  onChange={(subjectId) =>
                    setAssignmentDraft({
                      ...assignmentDraft,
                      subjectId: subjectId || null,
                    })
                  }
                />
                <FormField label="Due date and time">
                  <input
                    required
                    type="datetime-local"
                    value={localInput(assignmentDraft.dueAt)}
                    onChange={(event) =>
                      setAssignmentDraft({
                        ...assignmentDraft,
                        dueAt: isoInput(event.target.value),
                      })
                    }
                  />
                </FormField>
                <div className="form-pair">
                  <FormField label="Estimate (min)">
                    <input
                      required
                      type="number"
                      min={5}
                      max={720}
                      step={5}
                      value={assignmentDraft.estimatedMinutes}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          estimatedMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Priority">
                    <select
                      value={assignmentDraft.priority}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          priority: event.target.value as Priority,
                        })
                      }
                    >
                      {priorities.map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Work type">
                    <select
                      value={assignmentDraft.workType ?? ""}
                      onChange={(event) => {
                        const workType =
                          (event.target.value as SchoolWorkType) || null;
                        const template = workType
                          ? props.schoolDaySettings.focusTemplates[workType]
                          : null;
                        setAssignmentDraft({
                          ...assignmentDraft,
                          workType,
                          ...(template
                            ? {
                                minSessionMinutes: template.durationMin,
                                maxSessionMinutes: template.durationMax,
                              }
                            : {}),
                        });
                      }}
                    >
                      <option value="">Unspecified</option>
                      {workTypes.map((value) => (
                        <option value={value} key={value}>
                          {WORK_TYPE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Required energy">
                    <select
                      value={assignmentDraft.requiredEnergy}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          requiredEnergy: event.target
                            .value as EnergyRequirement,
                        })
                      }
                    >
                      {energyRequirements.map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Status">
                    <select
                      value={assignmentDraft.status}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          status: event.target.value as AssignmentStatus,
                        })
                      }
                    >
                      {assignmentStatuses.map((value) => (
                        <option value={value} key={value}>
                          {formatStatus(value)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Context">
                    <select
                      value={assignmentDraft.taskContext}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          taskContext: event.target.value as TaskContext,
                        })
                      }
                    >
                      {contexts.map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Submission">
                    <input
                      value={assignmentDraft.submissionMethod}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          submissionMethod: event.target.value,
                        })
                      }
                      placeholder="ManageBac, paper…"
                    />
                  </FormField>
                  <FormField label="Grade weight %">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={assignmentDraft.gradeWeight ?? ""}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          gradeWeight:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                </div>
                <label className="school-check">
                  <input
                    type="checkbox"
                    checked={assignmentDraft.computerRequired}
                    onChange={(event) =>
                      setAssignmentDraft({
                        ...assignmentDraft,
                        computerRequired: event.target.checked,
                      })
                    }
                  />
                  <Laptop size={13} /> Computer required
                </label>
                <div className="form-pair">
                  <FormField label="Daily window starts">
                    <input
                      type="time"
                      value={assignmentDraft.allowedWindowStart}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          allowedWindowStart: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Daily window ends">
                    <input
                      type="time"
                      value={assignmentDraft.allowedWindowEnd}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          allowedWindowEnd: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Shortest session">
                    <input
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={assignmentDraft.minSessionMinutes}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          minSessionMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Longest session">
                    <input
                      type="number"
                      min={assignmentDraft.minSessionMinutes}
                      max={360}
                      step={5}
                      value={assignmentDraft.maxSessionMinutes}
                      onChange={(event) =>
                        setAssignmentDraft({
                          ...assignmentDraft,
                          maxSessionMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                </div>
                <FormField label="Planning days">
                  <div className="weekday-checks">
                    {["M", "T", "W", "T", "F", "S", "S"].map(
                      (label, index) => {
                        const day = index + 1;
                        return (
                          <label key={day}>
                            <input
                              type="checkbox"
                              checked={assignmentDraft.allowedWeekdays.includes(
                                day,
                              )}
                              onChange={(event) =>
                                setAssignmentDraft({
                                  ...assignmentDraft,
                                  allowedWeekdays: event.target.checked
                                    ? [
                                        ...assignmentDraft.allowedWeekdays,
                                        day,
                                      ].sort()
                                    : assignmentDraft.allowedWeekdays.filter(
                                        (value) => value !== day,
                                      ),
                                })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        );
                      },
                    )}
                  </div>
                </FormField>
                <label className="school-check">
                  <input
                    type="checkbox"
                    checked={assignmentDraft.splittable}
                    onChange={(event) =>
                      setAssignmentDraft({
                        ...assignmentDraft,
                        splittable: event.target.checked,
                      })
                    }
                  />
                  Split work across multiple sessions
                </label>
                <FormField label="Notes">
                  <textarea
                    value={assignmentDraft.notes}
                    onChange={(event) =>
                      setAssignmentDraft({
                        ...assignmentDraft,
                        notes: event.target.value,
                      })
                    }
                    placeholder="Requirements, rubric, links…"
                  />
                </FormField>
                <EditorFooter onCancel={closeEditor} />
              </form>
            )}

            {editor === "assessment" && assessmentDraft && (
              <form onSubmit={saveAssessment}>
                <FormField label="Title">
                  <input
                    required
                    autoFocus
                    value={assessmentDraft.title}
                    onChange={(event) =>
                      setAssessmentDraft({
                        ...assessmentDraft,
                        title: event.target.value,
                      })
                    }
                    placeholder="Chemistry mock"
                  />
                </FormField>
                <SubjectSelect
                  subjects={subjects}
                  allowEmpty
                  value={assessmentDraft.subjectId ?? ""}
                  onChange={(subjectId) =>
                    setAssessmentDraft({
                      ...assessmentDraft,
                      subjectId: subjectId || null,
                    })
                  }
                />
                <div className="form-pair">
                  <FormField label="Type">
                    <input
                      required
                      value={assessmentDraft.assessmentType}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          assessmentType: event.target.value,
                        })
                      }
                      placeholder="Exam"
                    />
                  </FormField>
                  <FormField label="Importance">
                    <select
                      value={assessmentDraft.importance}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          importance: event.target.value as Priority,
                        })
                      }
                    >
                      {priorities.map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Revision estimate (min)">
                    <input
                      type="number"
                      min={0}
                      max={3000}
                      step={5}
                      value={assessmentDraft.estimatedRevisionMinutes}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          estimatedRevisionMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Revision session">
                    <div className="inline-number-pair">
                      <input
                        aria-label="Minimum revision session minutes"
                        type="number"
                        min={5}
                        max={180}
                        step={5}
                        value={assessmentDraft.minRevisionSessionMinutes}
                        onChange={(event) =>
                          setAssessmentDraft({
                            ...assessmentDraft,
                            minRevisionSessionMinutes: Number(
                              event.target.value,
                            ),
                          })
                        }
                      />
                      <span>–</span>
                      <input
                        aria-label="Maximum revision session minutes"
                        type="number"
                        min={assessmentDraft.minRevisionSessionMinutes}
                        max={240}
                        step={5}
                        value={assessmentDraft.maxRevisionSessionMinutes}
                        onChange={(event) =>
                          setAssessmentDraft({
                            ...assessmentDraft,
                            maxRevisionSessionMinutes: Number(
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </div>
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Revision starts">
                    <input
                      type="time"
                      value={assessmentDraft.revisionWindowStart}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          revisionWindowStart: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Revision ends">
                    <input
                      type="time"
                      value={assessmentDraft.revisionWindowEnd}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          revisionWindowEnd: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <FormField label="Revision days">
                  <div className="weekday-checks">
                    {["M", "T", "W", "T", "F", "S", "S"].map(
                      (label, index) => {
                        const day = index + 1;
                        return (
                          <label key={day}>
                            <input
                              type="checkbox"
                              checked={assessmentDraft.allowedWeekdays.includes(
                                day,
                              )}
                              onChange={(event) =>
                                setAssessmentDraft({
                                  ...assessmentDraft,
                                  allowedWeekdays: event.target.checked
                                    ? [
                                        ...assessmentDraft.allowedWeekdays,
                                        day,
                                      ].sort()
                                    : assessmentDraft.allowedWeekdays.filter(
                                        (value) => value !== day,
                                      ),
                                })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        );
                      },
                    )}
                  </div>
                </FormField>
                <label className="school-check">
                  <input
                    type="checkbox"
                    checked={assessmentDraft.spacedRepetitionEnabled}
                    onChange={(event) =>
                      setAssessmentDraft({
                        ...assessmentDraft,
                        spacedRepetitionEnabled: event.target.checked,
                      })
                    }
                  />
                  Enable spaced repetition
                </label>
                {assessmentDraft.spacedRepetitionEnabled && (
                  <FormField label="Review after (days)">
                    <input
                      value={assessmentDraft.reviewIntervalsDays.join(", ")}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          reviewIntervalsDays: event.target.value
                            .split(",")
                            .map((value) => Number(value.trim()))
                            .filter(
                              (value) =>
                                Number.isInteger(value) &&
                                value > 0 &&
                                value <= 90,
                            ),
                        })
                      }
                      placeholder="1, 3, 7, 14"
                    />
                  </FormField>
                )}
                <FormField label="Date and time">
                  <input
                    required
                    type="datetime-local"
                    value={localInput(assessmentDraft.scheduledAt)}
                    onChange={(event) =>
                      setAssessmentDraft({
                        ...assessmentDraft,
                        scheduledAt: isoInput(event.target.value) ?? "",
                      })
                    }
                  />
                </FormField>
                <div className="form-pair">
                  <FormField label="Ends (optional)">
                    <input
                      type="datetime-local"
                      min={localInput(assessmentDraft.scheduledAt)}
                      value={localInput(assessmentDraft.endsAt)}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          endsAt: isoInput(event.target.value),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Weight %">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={assessmentDraft.weight ?? ""}
                      onChange={(event) =>
                        setAssessmentDraft({
                          ...assessmentDraft,
                          weight:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                </div>
                <FormField label="Status">
                  <select
                    value={assessmentDraft.status}
                    onChange={(event) =>
                      setAssessmentDraft({
                        ...assessmentDraft,
                        status: event.target.value as AssessmentStatus,
                      })
                    }
                  >
                    {assessmentStatuses.map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Notes">
                  <textarea
                    value={assessmentDraft.notes}
                    onChange={(event) =>
                      setAssessmentDraft({
                        ...assessmentDraft,
                        notes: event.target.value,
                      })
                    }
                    placeholder="Topics, allowed materials, room…"
                  />
                </FormField>
                <EditorFooter onCancel={closeEditor} />
              </form>
            )}
            {editor === "school_day" && schoolDayDraft && (
              <form onSubmit={saveSchoolDay}>
                <FormField label="School location">
                  <input
                    autoFocus
                    value={schoolDayDraft.schoolLocation}
                    onChange={(event) =>
                      setSchoolDayDraft({
                        ...schoolDayDraft,
                        schoolLocation: event.target.value,
                      })
                    }
                    placeholder="School name or address"
                  />
                </FormField>
                <div className="form-pair">
                  <FormField label="School day starts">
                    <input
                      type="time"
                      value={schoolDayDraft.schoolDayStart}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          schoolDayStart: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="School day ends">
                    <input
                      type="time"
                      value={schoolDayDraft.schoolDayEnd}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          schoolDayEnd: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Travel before (min)">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      step={5}
                      value={schoolDayDraft.travelBeforeSchoolMinutes}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          travelBeforeSchoolMinutes: Number(
                            event.target.value,
                          ),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Travel home (min)">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      step={5}
                      value={schoolDayDraft.travelHomeMinutes}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          travelHomeMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Recovery at home">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      step={5}
                      value={schoolDayDraft.recoveryAfterHomeMinutes}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          recoveryAfterHomeMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Work cutoff">
                    <input
                      type="time"
                      value={schoolDayDraft.schoolworkCutoff}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          schoolworkCutoff: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Preferred from">
                    <input
                      type="time"
                      value={schoolDayDraft.preferredStudyStart}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          preferredStudyStart: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Preferred until">
                    <input
                      type="time"
                      value={schoolDayDraft.preferredStudyEnd}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          preferredStudyEnd: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <div className="form-pair">
                  <FormField label="Low energy from">
                    <input
                      type="time"
                      value={schoolDayDraft.lowEnergyStart}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          lowEnergyStart: event.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Low energy until">
                    <input
                      type="time"
                      value={schoolDayDraft.lowEnergyEnd}
                      onChange={(event) =>
                        setSchoolDayDraft({
                          ...schoolDayDraft,
                          lowEnergyEnd: event.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
                <FormField label="Minimum useful free period">
                  <input
                    type="number"
                    min={10}
                    max={180}
                    step={5}
                    value={schoolDayDraft.minimumFreePeriodMinutes}
                    onChange={(event) =>
                      setSchoolDayDraft({
                        ...schoolDayDraft,
                        minimumFreePeriodMinutes: Number(event.target.value),
                      })
                    }
                  />
                </FormField>
                <div className="focus-template-editor">
                  <header>
                    <span>Focus templates</span>
                    <small>min–max minutes</small>
                  </header>
                  {workTypes.map((workType) => {
                    const template =
                      schoolDayDraft.focusTemplates[workType];
                    return (
                      <label key={workType}>
                        <span>{WORK_TYPE_LABELS[workType]}</span>
                        <input
                          aria-label={`${WORK_TYPE_LABELS[workType]} minimum minutes`}
                          type="number"
                          min={5}
                          max={180}
                          step={5}
                          value={template.durationMin}
                          onChange={(event) =>
                            setSchoolDayDraft({
                              ...schoolDayDraft,
                              focusTemplates: {
                                ...schoolDayDraft.focusTemplates,
                                [workType]: {
                                  ...template,
                                  durationMin: Number(event.target.value),
                                },
                              },
                            })
                          }
                        />
                        <span>–</span>
                        <input
                          aria-label={`${WORK_TYPE_LABELS[workType]} maximum minutes`}
                          type="number"
                          min={template.durationMin}
                          max={240}
                          step={5}
                          value={template.durationMax}
                          onChange={(event) =>
                            setSchoolDayDraft({
                              ...schoolDayDraft,
                              focusTemplates: {
                                ...schoolDayDraft.focusTemplates,
                                [workType]: {
                                  ...template,
                                  durationMax: Number(event.target.value),
                                },
                              },
                            })
                          }
                        />
                      </label>
                    );
                  })}
                  <small>
                    Memorization keeps its later-review hint when durations are
                    customized.
                  </small>
                </div>
                <label className="school-check">
                  <input
                    type="checkbox"
                    checked={schoolDayDraft.schoolComputerAccess}
                    onChange={(event) =>
                      setSchoolDayDraft({
                        ...schoolDayDraft,
                        schoolComputerAccess: event.target.checked,
                      })
                    }
                  />
                  Computer access during free periods
                </label>
                <label className="school-check">
                  <input
                    type="checkbox"
                    checked={schoolDayDraft.allowCommuteScheduling}
                    onChange={(event) =>
                      setSchoolDayDraft({
                        ...schoolDayDraft,
                        allowCommuteScheduling: event.target.checked,
                      })
                    }
                  />
                  Explicitly allow commute-time suggestions
                </label>
                <div className="domain-note compact">
                  Commutes stay protected by default. Deep work waits until the
                  recovery period after arriving home has ended.
                </div>
                <EditorFooter onCancel={closeEditor} />
              </form>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function LessonCard({
  lesson,
  subject,
  exception,
  moved = false,
  onEdit,
  onException,
}: {
  lesson: SchoolClass;
  subject?: Subject;
  exception?: ClassException;
  moved?: boolean;
  onEdit: () => void;
  onException: () => void;
}) {
  const cancelled = exception?.status === "cancelled";
  const rescheduled = exception?.status === "rescheduled";
  const start = moved
    ? exception?.replacementStartTime
    : rescheduled
      ? exception.replacementStartTime
      : lesson.startTime;
  const end = moved
    ? exception?.replacementEndTime
    : rescheduled
      ? exception.replacementEndTime
      : lesson.endTime;
  return (
    <article
      className={`lesson-card ${cancelled ? "is-cancelled" : ""} ${
        rescheduled ? "is-rescheduled" : ""
      }`}
      style={
        {
          "--subject": subjectColor(subject),
        } as CSSProperties
      }
    >
      <button type="button" onClick={onEdit}>
        <span>
          {start}–{end}
        </span>
        <strong>
          {subject?.icon && <i>{subject.icon}</i>}
          {subject?.shortName ?? "Class"}
        </strong>
        <small>
          {cancelled
            ? "Cancelled"
            : rescheduled
              ? `Rescheduled${moved ? "" : " · moved"}`
              : lesson.room || subject?.room || "Room TBD"}
        </small>
      </button>
      <button
        className="lesson-change"
        type="button"
        onClick={onException}
        aria-label="Cancel or reschedule lesson"
      >
        <RotateCcw size={11} />
      </button>
    </article>
  );
}

function SchoolEmpty({
  icon: Icon,
  title,
  copy,
  action,
  onAction,
}: {
  icon: typeof BookOpen;
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="school-empty">
      <Icon size={24} />
      <h3>{title}</h3>
      <p>{copy}</p>
      <button type="button" onClick={onAction}>
        <Plus size={13} /> {action}
      </button>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="school-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SubjectSelect({
  subjects,
  value,
  allowEmpty = false,
  onChange,
}: {
  subjects: Subject[];
  value: string;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label="Subject">
      <select
        required={!allowEmpty}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty && <option value="">No subject</option>}
        {!allowEmpty && subjects.length === 0 && (
          <option value="">Add a subject first</option>
        )}
        {subjects.map((subject) => (
          <option value={subject.id} key={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

function EditorFooter({
  onCancel,
}: {
  onCancel: () => void;
}) {
  return (
    <footer className="school-editor-footer">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit">
        <CheckCircle2 size={14} /> Save
      </button>
    </footer>
  );
}
