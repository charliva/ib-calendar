import type { CSSProperties } from "react";
import {
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { formatWorkMinutes } from "@/lib/assignment-planner";
import { examCountdown, revisionProgress } from "@/lib/revision-planner";
import {
  latestSignalFor,
  type LearningSource,
} from "@/lib/study-intelligence";
import type { Assessment, Subject } from "@/lib/school";
import { displayDate, subjectColor } from "@/components/school/format";
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
  /** Exams in date order, computed once by the workspace. */
  sortedAssessments: Assessment[];
  setAssessmentDraft: (assessment: Assessment | null) => void;
};

/**
 * Exams, their countdown, and the revision sessions planned against them.
 * Marking a session learned is what lets spaced repetition propose reviews.
 */
export function AssessmentsTab(props: Props) {
  const {
    
    sortedAssessments,
    subjectFor,
    openEditor,
    setAssessmentDraft,
    setEditor,
  } = props;
  return (
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
              const source: LearningSource = { type: "assessment", id: assessment.id, title: assessment.title, subjectId: assessment.subjectId, subjectName: subject?.name ?? null, context: [assessment.assessmentType, assessment.notes].filter(Boolean).join(" · ") };
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
                    <LearningControls compact source={source} value={latestSignalFor(source, props.learningSignals)?.challengeLevel ?? null} onChallenge={props.onChallenge} onGoDeeper={props.onGoDeeper} />
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
  );
}
