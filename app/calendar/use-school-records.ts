import type { User } from "@supabase/supabase-js";
import {
  assignmentProgress,
  formatWorkMinutes,
  planAssignment,
} from "@/lib/assignment-planner";
import { planRevisionRunway, planSpacedReviews } from "@/lib/revision-planner";
import {
  energyTypeForWorkType,
  type FreePeriod,
  type FreePeriodRecommendation,
} from "@/lib/school-day-engine";
import {
  dateKey,
  makeItem,
  type CalendarItem,
  type CalendarProposal,
} from "@/lib/calendar-engine";
import {
  assessmentToRow,
  assignmentToRow,
  classExceptionToRow,
  classToRow,
  normalizeAssessment,
  normalizeAssignment,
  normalizeSchoolDaySettings,
  schoolDaySettingsToRow,
  subjectToRow,
  type Assessment,
  type Assignment,
  type ClassException,
  type SchoolClass,
  type SchoolDaySettings,
  type Subject,
} from "@/lib/school";
import type { PendingMutation } from "@/lib/offline";
import type { Zoom } from "@/app/calendar/view-types";

type SchoolRecordsParams = {
  /** Records the handlers read when planning or cascading a delete. */
  items: CalendarItem[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  schoolDaySettings: SchoolDaySettings;
  user: User | null;
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  setClasses: React.Dispatch<React.SetStateAction<SchoolClass[]>>;
  setClassExceptions: React.Dispatch<React.SetStateAction<ClassException[]>>;
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
  setAssessments: React.Dispatch<React.SetStateAction<Assessment[]>>;
  setSchoolDaySettings: (settings: SchoolDaySettings) => void;
  setNotice: (notice: string) => void;
  setAnchorDate: (day: string) => void;
  setSelectedDay: (day: string) => void;
  setZoom: (zoom: Zoom) => void;
  setProposal: (proposal: CalendarProposal | null) => void;
  /** Writes owned by the calendar store, passed in rather than duplicated. */
  persistMutation: (mutation: PendingMutation) => Promise<boolean>;
  createItem: (item: CalendarItem) => void;
  updateItem: (item: CalendarItem, label: string) => void;
};

/**
 * Subjects, timetable lessons, assignments, and assessments: the records the
 * school workspace edits, plus the planning previews they can raise.
 *
 * Every handler follows the same shape — update local state first so the UI
 * stays immediate, then hand the write to `persistMutation`, which decides
 * between a live Supabase call and the offline queue. Planning actions never
 * mutate the calendar directly; they raise a proposal for the user to approve.
 */
export function useSchoolRecords({
  items,
  classes,
  classExceptions,
  schoolDaySettings,
  user,
  setSubjects,
  setClasses,
  setClassExceptions,
  setAssignments,
  setAssessments,
  setSchoolDaySettings,
  setNotice,
  setAnchorDate,
  setSelectedDay,
  setZoom,
  setProposal,
  persistMutation,
  createItem,
  updateItem,
}: SchoolRecordsParams) {
  function saveSubject(subject: Subject) {
    setSubjects((current) => [
      ...current.filter((entry) => entry.id !== subject.id),
      subject,
    ]);
    persistMutation({
      table: "subjects",
      action: "upsert",
      recordId: subject.id,
      payload: subjectToRow(subject),
    }).catch(() => undefined);
    setNotice(`Saved ${subject.name}.`);
  }

  function deleteSubject(subject: Subject) {
    if (
      !window.confirm(
        `Delete ${subject.name}? Its timetable lessons will also be removed. Assignments and assessments will be kept without a subject.`,
      )
    ) {
      return;
    }
    const classIds = new Set(
      classes
        .filter((entry) => entry.subjectId === subject.id)
        .map((entry) => entry.id),
    );
    setSubjects((current) =>
      current.filter((entry) => entry.id !== subject.id),
    );
    setClasses((current) =>
      current.filter((entry) => entry.subjectId !== subject.id),
    );
    setClassExceptions((current) =>
      current.filter((entry) => !classIds.has(entry.classId)),
    );
    setAssignments((current) =>
      current.map((entry) =>
        entry.subjectId === subject.id ? { ...entry, subjectId: null } : entry,
      ),
    );
    setAssessments((current) =>
      current.map((entry) =>
        entry.subjectId === subject.id ? { ...entry, subjectId: null } : entry,
      ),
    );
    persistMutation({
      table: "subjects",
      action: "delete",
      recordId: subject.id,
    }).catch(() => undefined);
    setNotice(`Deleted ${subject.name}.`);
  }

  function saveClass(schoolClass: SchoolClass) {
    setClasses((current) => [
      ...current.filter((entry) => entry.id !== schoolClass.id),
      schoolClass,
    ]);
    persistMutation({
      table: "classes",
      action: "upsert",
      recordId: schoolClass.id,
      payload: classToRow(schoolClass),
    }).catch(() => undefined);
    setNotice("Timetable lesson saved.");
  }

  function saveSchoolDaySettings(input: SchoolDaySettings) {
    // Out-of-range minutes are not merely odd, they are unwritable: the
    // profiles CHECK constraints reject the upsert and it retries from the
    // outbox forever. Normalizing here covers every caller rather than
    // trusting each form to bound its own inputs.
    const settings = normalizeSchoolDaySettings(input);
    setSchoolDaySettings(settings);
    if (user) {
      persistMutation({
        table: "profiles",
        action: "upsert",
        recordId: user.id,
        payload: {
          id: user.id,
          ...schoolDaySettingsToRow(settings),
        },
      }).catch(() => undefined);
      setNotice("School-day rules saved and ready to sync.");
    } else {
      setNotice("School-day rules saved offline. Sign in to sync them.");
    }
  }

  function deleteClass(schoolClass: SchoolClass) {
    if (!window.confirm("Delete this recurring lesson?")) return;
    setClasses((current) =>
      current.filter((entry) => entry.id !== schoolClass.id),
    );
    setClassExceptions((current) =>
      current.filter((entry) => entry.classId !== schoolClass.id),
    );
    persistMutation({
      table: "classes",
      action: "delete",
      recordId: schoolClass.id,
    }).catch(() => undefined);
    setNotice("Lesson deleted.");
  }

  function saveClassException(exception: ClassException) {
    setClassExceptions((current) => [
      ...current.filter((entry) => entry.id !== exception.id),
      exception,
    ]);
    persistMutation({
      table: "class_exceptions",
      action: "upsert",
      recordId: exception.id,
      payload: classExceptionToRow(exception),
    }).catch(() => undefined);
    setNotice(
      exception.status === "cancelled"
        ? "Lesson marked cancelled."
        : "Lesson rescheduled.",
    );
  }

  function deleteClassException(exception: ClassException) {
    setClassExceptions((current) =>
      current.filter((entry) => entry.id !== exception.id),
    );
    persistMutation({
      table: "class_exceptions",
      action: "delete",
      recordId: exception.id,
    }).catch(() => undefined);
    setNotice("Lesson change removed.");
  }

  function saveAssignment(assignment: Assignment) {
    const normalized = normalizeAssignment(assignment);
    setAssignments((current) => [
      ...current.filter((entry) => entry.id !== normalized.id),
      normalized,
    ]);
    const persistence = persistMutation({
      table: "assignments",
      action: "upsert",
      recordId: normalized.id,
      payload: assignmentToRow(normalized),
    }).catch(() => undefined);
    setNotice(`Saved ${normalized.title}.`);
    return persistence;
  }

  function previewAssignmentPlan(assignment: Assignment) {
    const result = planAssignment(assignment, items, new Date(), {
      classes,
      classExceptions,
      settings: schoolDaySettings,
      calendarItems: items,
    });
    if (!result.proposal) {
      const progress = assignmentProgress(assignment, items);
      setNotice(
        progress.remainingMinutes === 0
          ? "This assignment is already fully planned."
          : "No free time fits the assignment’s planning rules before its deadline.",
      );
      return;
    }
    const first = result.proposal.changes[0]?.after?.startsAt;
    if (first) {
      const date = new Date(first);
      setAnchorDate(dateKey(date));
      setSelectedDay(dateKey(date));
    }
    setZoom("week");
    setProposal(result.proposal);
  }

  function addAssignmentSession(assignment: Assignment) {
    const progress = assignmentProgress(assignment, items);
    const minutes = Math.max(
      5,
      Math.min(
        assignment.maxSessionMinutes,
        progress.remainingMinutes || assignment.minSessionMinutes,
      ),
    );
    const session = makeItem({
      kind: "task",
      title: `${assignment.title} · work session`,
      description: `Manual work session for ${assignment.title}`,
      durationMin: Math.min(assignment.minSessionMinutes, minutes),
      durationMax: Math.max(assignment.maxSessionMinutes, minutes),
      deadline: assignment.dueAt,
      energyType: energyTypeForWorkType(assignment.workType),
      priority: assignment.priority,
      flexibility: "elastic",
      constraints: [
        `Linked to ${assignment.title}`,
        `${assignment.allowedWindowStart}–${assignment.allowedWindowEnd}`,
      ],
      assignmentId: assignment.id,
      taskContext: assignment.taskContext,
      computerRequired: assignment.computerRequired,
      workType: assignment.workType,
      requiredEnergy: assignment.requiredEnergy,
      status: "inbox",
      source: "manual",
    });
    createItem(session);
    setNotice(
      "Work session added to the flexible inbox. Drag it onto the calendar.",
    );
  }

  function completeAssignment(assignment: Assignment) {
    const progress = assignmentProgress(assignment, items);
    const actualMinutes =
      progress.completedMinutes > 0
        ? progress.completedMinutes
        : assignment.estimatedMinutes;
    saveAssignment({
      ...assignment,
      status: "completed",
      actualMinutes,
    });
    setNotice(
      `Marked "${assignment.title}" complete — actual time ${formatWorkMinutes(actualMinutes)} (estimated ${formatWorkMinutes(assignment.estimatedMinutes)}).`,
    );
  }

  function previewFreePeriodSession(
    recommendation: FreePeriodRecommendation,
    period: FreePeriod,
  ) {
    const minutes = recommendation.durationMinutes;
    if (recommendation.sourceType === "calendar_item") {
      const existing = recommendation.item;
      const scheduled = {
        ...existing,
        startsAt: period.start.toISOString(),
        endsAt: new Date(
          period.start.getTime() + minutes * 60_000,
        ).toISOString(),
        status: "scheduled" as const,
      };
      setAnchorDate(dateKey(period.start));
      setSelectedDay(dateKey(period.start));
      setZoom("week");
      setProposal({
        id: crypto.randomUUID(),
        title: `Use free period for ${existing.title}`,
        summary: `${minutes} minutes at school. Nothing changes until you apply this preview.`,
        source: "command",
        changes: [
          {
            id: crypto.randomUUID(),
            type: "update",
            itemId: existing.id,
            reason: "This flexible calendar item fits the verified school gap.",
            before: existing,
            after: scheduled,
          },
        ],
      });
      return;
    }

    const assignment = recommendation.assignment;
    const item = makeItem({
      kind: "task",
      title: `${assignment.title} · free period`,
      description: `School free-period work for ${assignment.title}`,
      startsAt: period.start.toISOString(),
      endsAt: new Date(period.start.getTime() + minutes * 60_000).toISOString(),
      durationMin: Math.min(assignment.minSessionMinutes, minutes),
      durationMax: Math.max(minutes, assignment.maxSessionMinutes),
      deadline: assignment.dueAt,
      windowStart: period.start.toISOString(),
      windowEnd: period.end.toISOString(),
      energyType: energyTypeForWorkType(assignment.workType),
      priority: assignment.priority,
      flexibility: "elastic",
      constraints: ["Verified school free period", "Context compatible"],
      assignmentId: assignment.id,
      taskContext: assignment.taskContext,
      computerRequired: assignment.computerRequired,
      workType: assignment.workType,
      requiredEnergy: assignment.requiredEnergy,
      status: "scheduled",
      source: "command",
    });
    setAnchorDate(dateKey(period.start));
    setSelectedDay(dateKey(period.start));
    setZoom("week");
    setProposal({
      id: crypto.randomUUID(),
      title: `Use free period for ${assignment.title}`,
      summary: `${minutes} minutes at school. Nothing changes until you apply this preview.`,
      source: "command",
      changes: [
        {
          id: crypto.randomUUID(),
          type: "create",
          itemId: null,
          reason: "Fits the verified gap and matches the task context.",
          before: null,
          after: item,
        },
      ],
    });
  }

  function toggleAssignmentSession(session: CalendarItem) {
    updateItem(
      {
        ...session,
        status:
          session.status === "completed"
            ? session.startsAt
              ? "scheduled"
              : "inbox"
            : "completed",
      },
      `${session.status === "completed" ? "Reopen" : "Complete"} “${session.title}”`,
    );
    setNotice(
      session.status === "completed"
        ? "Work session reopened."
        : session.intentionId
          ? "Work session completed. Intention progress updated."
          : "Work session completed. Assignment progress updated.",
    );
  }

  function deleteAssignment(assignment: Assignment) {
    if (!window.confirm(`Delete “${assignment.title}”?`)) return;
    setAssignments((current) =>
      current.filter((entry) => entry.id !== assignment.id),
    );
    persistMutation({
      table: "assignments",
      action: "delete",
      recordId: assignment.id,
    }).catch(() => undefined);
    setNotice(`Deleted ${assignment.title}.`);
  }

  function saveAssessment(assessment: Assessment) {
    const normalized = normalizeAssessment(assessment);
    setAssessments((current) => [
      ...current.filter((entry) => entry.id !== normalized.id),
      normalized,
    ]);
    persistMutation({
      table: "assessments",
      action: "upsert",
      recordId: normalized.id,
      payload: assessmentToRow(normalized),
    }).catch(() => undefined);
    setNotice(`Saved ${normalized.title}.`);
  }

  function previewRevisionRunway(assessment: Assessment) {
    const result = planRevisionRunway(assessment, items, new Date(), {
      classes,
      classExceptions,
      settings: schoolDaySettings,
      calendarItems: items,
    });
    if (!result.proposal) {
      setNotice(
        result.unscheduledMinutes === 0
          ? "This exam’s revision requirement is already fully planned."
          : "No free time fits the revision rules before this exam.",
      );
      return;
    }
    const first = result.proposal.changes[0]?.after?.startsAt;
    if (first) {
      const date = new Date(first);
      setAnchorDate(dateKey(date));
      setSelectedDay(dateKey(date));
    }
    setZoom("week");
    setProposal(result.proposal);
  }

  function markRevisionLearned(session: CalendarItem, assessment: Assessment) {
    const learnedAt = new Date();
    updateItem(
      {
        ...session,
        learnedAt: learnedAt.toISOString(),
        status: "completed",
      },
      `Learn “${session.revisionStage ?? session.title}”`,
    );
    const reviewProposal = planSpacedReviews(
      session,
      assessment,
      items.filter((item) => item.id !== session.id),
      learnedAt,
      {
        classes,
        classExceptions,
        settings: schoolDaySettings,
        calendarItems: items,
      },
    );
    if (reviewProposal) {
      setProposal(reviewProposal);
      setNotice("Material learned. Review sessions are ready to preview.");
    } else {
      setNotice(
        assessment.spacedRepetitionEnabled
          ? "Material learned. No review interval fits before the exam."
          : "Material learned. Enable spaced repetition on the exam to suggest reviews.",
      );
    }
  }

  function deleteAssessment(assessment: Assessment) {
    if (!window.confirm(`Delete “${assessment.title}”?`)) return;
    setAssessments((current) =>
      current.filter((entry) => entry.id !== assessment.id),
    );
    persistMutation({
      table: "assessments",
      action: "delete",
      recordId: assessment.id,
    }).catch(() => undefined);
    setNotice(`Deleted ${assessment.title}.`);
  }
  return {
    saveSubject,
    deleteSubject,
    saveClass,
    saveSchoolDaySettings,
    deleteClass,
    saveClassException,
    deleteClassException,
    saveAssignment,
    previewAssignmentPlan,
    addAssignmentSession,
    completeAssignment,
    previewFreePeriodSession,
    toggleAssignmentSession,
    deleteAssignment,
    saveAssessment,
    previewRevisionRunway,
    markRevisionLearned,
    deleteAssessment,
  };
}
