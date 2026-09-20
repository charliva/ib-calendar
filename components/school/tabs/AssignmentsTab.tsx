import type { CSSProperties } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Laptop,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  assignmentProgress,
  formatWorkMinutes,
} from "@/lib/assignment-planner";
import {
  latestSignalFor,
  type LearningSource,
} from "@/lib/study-intelligence";
import { WORK_TYPE_LABELS, type Assignment, type Subject } from "@/lib/school";
import { displayDate, formatStatus, subjectColor } from "@/components/school/format";
import { SchoolEmpty } from "@/components/school/SchoolEmpty";
import { LearningControls } from "@/app/learning-controls";
import type {
  Editor,
  SchoolTab,
  SchoolWorkspaceProps,
} from "@/components/school/types";

type Props = SchoolWorkspaceProps & {
  subjectFor: (id: string | null) => Subject | undefined;
  openEditor: (next: Editor) => void;
  setEditor: (editor: Editor | null) => void;
  setTab: (tab: SchoolTab) => void;
  /** Assignments in deadline order, computed once by the workspace. */
  sortedAssignments: Assignment[];
  setAssignmentDraft: (assignment: Assignment | null) => void;
};

/**
 * Assignments with their planned work sessions.
 *
 * Progress is measured from the sessions on the calendar rather than stored on
 * the assignment, so ticking a session off is the only thing a student has to
 * do to keep the estimate honest.
 */
export function AssignmentsTab(props: Props) {
  const {
    
    sortedAssignments,
    subjectFor,
    openEditor,
    setAssignmentDraft,
    setEditor,
  } = props;
  return (
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
              const source: LearningSource = { type: "assignment", id: assignment.id, title: assignment.title, subjectId: assignment.subjectId, subjectName: subject?.name ?? null, context: [assignment.notes, assignment.workType, assignment.submissionMethod].filter(Boolean).join(" · ") };
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
                    <LearningControls compact source={source} value={latestSignalFor(source, props.learningSignals)?.challengeLevel ?? null} onChallenge={props.onChallenge} onGoDeeper={props.onGoDeeper} />
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
                    <button
                      type="button"
                      onClick={() =>
                        props.onCompleteAssignment(assignment)
                      }
                      title={
                        assignment.status === "completed"
                          ? "Already completed"
                          : "Mark assignment as complete"
                      }
                      disabled={assignment.status === "completed"}
                    >
                      <CheckCircle2 size={13} /> Complete
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
  );
}
