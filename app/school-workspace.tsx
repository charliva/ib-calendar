"use client";

import { BookOpen, ClipboardList, CalendarDays, GraduationCap, X } from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { addDays, dateFromKey, dateKey, startOfWeek } from "@/lib/calendar-engine";
import {
  detectFreePeriods,
  recommendationsAcrossFreePeriods,
} from "@/lib/school-day-engine";
import {
  isImportedTimetableItem,
  isItemInWeek,
} from "@/lib/timetable-import";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
  Subject,
} from "@/lib/school";
import { weekdays } from "@/components/school/constants";
import {
  emptyAssessment,
  emptyAssignment,
  emptyClass,
  emptyException,
  emptySubject,
} from "@/components/school/drafts";
import { TimetableTab } from "@/components/school/tabs/TimetableTab";
import { SubjectsTab } from "@/components/school/tabs/SubjectsTab";
import { AssignmentsTab } from "@/components/school/tabs/AssignmentsTab";
import { AssessmentsTab } from "@/components/school/tabs/AssessmentsTab";
import { SubjectEditor } from "@/components/school/editors/SubjectEditor";
import { ClassEditor } from "@/components/school/editors/ClassEditor";
import { ExceptionEditor } from "@/components/school/editors/ExceptionEditor";
import { AssignmentEditor } from "@/components/school/editors/AssignmentEditor";
import { AssessmentEditor } from "@/components/school/editors/AssessmentEditor";
import { SchoolDayEditor } from "@/components/school/editors/SchoolDayEditor";
import type {
  Editor,
  SchoolTab,
  SchoolWorkspaceProps,
} from "@/components/school/types";

export function SchoolWorkspace(props: SchoolWorkspaceProps) {
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
  const timetableInputRef = useRef<HTMLInputElement>(null);
  const timetableDropDepth = useRef(0);
  const [timetableDragActive, setTimetableDragActive] = useState(false);

  useEffect(() => {
    if (weekAnchor) return;
    const frame = window.requestAnimationFrame(() => {
      const monday = startOfWeek(new Date());
      setWeekAnchor(dateKey(monday));
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
      props.assignmentSessions,
    );
  }, [
    classExceptions,
    classes,
    props.assignmentSessions,
    props.schoolDaySettings,
    weekDays,
  ]);
  const freePeriodRecommendations = useMemo(
    () =>
      recommendationsAcrossFreePeriods(
        freePeriods,
        assignments,
        props.assignmentSessions,
        props.schoolDaySettings,
      ),
    [
      assignments,
      freePeriods,
      props.assignmentSessions,
      props.schoolDaySettings,
    ],
  );
  const importedWeekLessons = useMemo(
    () =>
      weekAnchor
        ? props.assignmentSessions.filter(
            (item) =>
              item.status === "scheduled" &&
              isImportedTimetableItem(item) &&
              isItemInWeek(item, weekAnchor),
          )
        : [],
    [props.assignmentSessions, weekAnchor],
  );

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

  const sortedAssignments = [...assignments]
    .filter((assignment) => assignment.status !== "completed")
    .sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  const sortedAssessments = [...assessments].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  function importDroppedTimetable(file: File | undefined) {
    if (!file || !weekAnchor || props.timetableImportBusy) return;
    props.onImportTimetable(file, weekAnchor);
  }

  function enterTimetableDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    timetableDropDepth.current += 1;
    setTimetableDragActive(true);
  }

  function leaveTimetableDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    timetableDropDepth.current = Math.max(0, timetableDropDepth.current - 1);
    if (timetableDropDepth.current === 0) setTimetableDragActive(false);
  }

  function dropTimetable(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    timetableDropDepth.current = 0;
    setTimetableDragActive(false);
    importDroppedTimetable(event.dataTransfer.files?.[0]);
  }

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
            data-tour={value === "subjects" ? "subjects" : undefined}
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
            <TimetableTab
              {...props}
              weekAnchor={weekAnchor}
              weekDays={weekDays}
              freePeriods={freePeriods}
              freePeriodRecommendations={freePeriodRecommendations}
              importedWeekLessons={importedWeekLessons}
              timetableDragActive={timetableDragActive}
              timetableInputRef={timetableInputRef}
              subjectFor={subjectFor}
              openEditor={openEditor}
              openException={openException}
              setClassDraft={setClassDraft}
              setEditor={setEditor}
              setExceptionDraft={setExceptionDraft}
              setTab={setTab}
              setWeekAnchor={setWeekAnchor}
              enterTimetableDrop={enterTimetableDrop}
              leaveTimetableDrop={leaveTimetableDrop}
              dropTimetable={dropTimetable}
            />
          )}

          {tab === "subjects" && (
            <SubjectsTab
              {...props}
              subjectFor={subjectFor}
              openEditor={openEditor}
              setEditor={setEditor}
              setSubjectDraft={setSubjectDraft}
              setTab={setTab}
            />
          )}

          {tab === "assignments" && (
            <AssignmentsTab
              {...props}
              sortedAssignments={sortedAssignments}
              subjectFor={subjectFor}
              openEditor={openEditor}
              setAssignmentDraft={setAssignmentDraft}
              setEditor={setEditor}
              setTab={setTab}
            />
          )}

          {tab === "assessments" && (
            <AssessmentsTab
              {...props}
              sortedAssessments={sortedAssessments}
              subjectFor={subjectFor}
              openEditor={openEditor}
              setAssessmentDraft={setAssessmentDraft}
              setEditor={setEditor}
              setTab={setTab}
            />
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
              <SubjectEditor
                draft={subjectDraft}
                setDraft={setSubjectDraft}
                onSubmit={saveSubject}
                onCancel={closeEditor}
              />
            )}

            {editor === "class" && classDraft && (
              <ClassEditor
                draft={classDraft}
                setDraft={setClassDraft}
                subjects={subjects}
                subjectFor={subjectFor}
                onSubmit={saveClass}
                onCancel={closeEditor}
              />
            )}

            {editor === "exception" && exceptionDraft && (
              <ExceptionEditor
                draft={exceptionDraft}
                setDraft={setExceptionDraft}
                classes={classes}
                classExceptions={classExceptions}
                subjectFor={subjectFor}
                onDeleteException={props.onDeleteException}
                onSubmit={saveException}
                onCancel={closeEditor}
              />
            )}

            {editor === "assignment" && assignmentDraft && (
              <AssignmentEditor
                draft={assignmentDraft}
                setDraft={setAssignmentDraft}
                subjects={subjects}
                assignments={props.assignments}
                schoolDaySettings={props.schoolDaySettings}
                onSubmit={saveAssignment}
                onCancel={closeEditor}
              />
            )}

            {editor === "assessment" && assessmentDraft && (
              <AssessmentEditor
                draft={assessmentDraft}
                setDraft={setAssessmentDraft}
                subjects={subjects}
                onSubmit={saveAssessment}
                onCancel={closeEditor}
              />
            )}

            {editor === "school_day" && schoolDayDraft && (
              <SchoolDayEditor
                draft={schoolDayDraft}
                setDraft={setSchoolDayDraft}
                onSubmit={saveSchoolDay}
                onCancel={closeEditor}
              />
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
