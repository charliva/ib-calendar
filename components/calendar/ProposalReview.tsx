import { Check, Layers3, Lock, Move, Plus, Trash2, X } from "lucide-react";
import {
  kindLabels,
  validateProposal,
  type CalendarProposal,
} from "../../lib/calendar-engine.ts";
import { formatProposalTiming } from "../../app/calendar-format.ts";
import type { Subject } from "../../lib/school.ts";
import type { RejectedTimetableCandidate } from "../../lib/timetable-import.ts";

type TimetableSubjectProposal = {
  proposalId: string;
  subjects: Subject[];
  reviewed: boolean;
};

type ProposalValidation = ReturnType<typeof validateProposal>;

export function ProposalReview({
  proposal = null,
  timetableSubjectProposal,
  proposalValidation,
  onClose,
  onApprove,
  onUpdateSubject,
  onAddSubject,
  onRemoveSubject,
  onFinishSubjectReview,
  onSkipChange,
  onEditSubjects,
  timetableImportIssues,
}: {
  proposal: CalendarProposal | null;
  timetableSubjectProposal: TimetableSubjectProposal | null;
  proposalValidation: ProposalValidation | null;
  onClose: () => void;
  onApprove: () => void;
  onUpdateSubject: (
    subjectId: string,
    update: Partial<Subject>,
  ) => void;
  onAddSubject: () => void;
  onRemoveSubject: (subjectId: string) => void;
  onFinishSubjectReview: () => void;
  onSkipChange: (changeId: string) => void;
  onEditSubjects: () => void;
  timetableImportIssues: {
    proposalId: string;
    issues: RejectedTimetableCandidate[];
  } | null;
}) {
  if (!proposal) return null;

  return (
          <section
            className={`proposal-sheet${
              timetableSubjectProposal?.proposalId === proposal.id &&
              !timetableSubjectProposal.reviewed
                ? " subject-reviewing"
                : ""
            }`}
            aria-label="Calendar change preview"
          >
            <header>
              <div className="proposal-icon">
                <Layers3 size={19} />
              </div>
              <div>
                <span className="micro-label">Proposed changes</span>
                <h2>{proposal.title}</h2>
                <p>{proposal.summary}</p>
              </div>
              <button
                type="button"
          onClick={onClose}
                aria-label="Close proposal"
              >
                <X size={16} />
              </button>
            </header>
            {timetableSubjectProposal?.proposalId === proposal.id &&
            !timetableSubjectProposal.reviewed ? (
              <section className="subject-review-splash">
                <div className="subject-review-intro">
                  <span className="micro-label">Before the timetable</span>
                  <h3>Check the subjects I found</h3>
                  <p>
                    Unknown labels stay editable. Correct names, teachers, and
                    rooms now; nothing is saved until the final timetable
                    review.
                  </p>
                </div>
                <div className="subject-review-grid">
                  {timetableSubjectProposal.subjects.map((subject, index) => (
                    <article className="subject-review-card" key={subject.id}>
                      <header>
                        <span
                          className="proposal-subject-dot"
                          style={{ background: subject.color }}
                        />
                        <strong>Subject {index + 1}</strong>
                        <button
                          type="button"
                          onClick={() => onRemoveSubject(subject.id)}
                          aria-label={`Do not create ${subject.name || "this subject"}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </header>
                      <label className="subject-review-name">
                        <span>Name</span>
                        <input
                          autoFocus={index === 0}
                          value={subject.name}
                          onChange={(event) =>
                            onUpdateSubject(subject.id, {
                              name: event.target.value,
                            })
                          }
                          placeholder="New subject"
                        />
                      </label>
                      <div className="subject-review-fields">
                        <label>
                          <span>Short</span>
                          <input
                            value={subject.shortName}
                            onChange={(event) =>
                              onUpdateSubject(subject.id, {
                                shortName: event.target.value,
                              })
                            }
                            placeholder="BIO"
                          />
                        </label>
                        <label>
                          <span>Color</span>
                          <input
                            type="color"
                            value={subject.color}
                            onChange={(event) =>
                              onUpdateSubject(subject.id, {
                                color: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Teacher</span>
                          <input
                            value={subject.teacher}
                            onChange={(event) =>
                              onUpdateSubject(subject.id, {
                                teacher: event.target.value,
                              })
                            }
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          <span>Room</span>
                          <input
                            value={subject.room}
                            onChange={(event) =>
                              onUpdateSubject(subject.id, {
                                room: event.target.value,
                              })
                            }
                            placeholder="Optional"
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="subject-review-actions">
                  <button type="button" onClick={onAddSubject}>
                    <Plus size={14} /> Add missing subject
                  </button>
                  <button
                    className="approve"
                    type="button"
                    onClick={onFinishSubjectReview}
                    disabled={timetableSubjectProposal.subjects.some(
                      (subject) =>
                        !subject.name.trim() || !subject.shortName.trim(),
                    )}
                  >
                    Continue to{" "}
                    {
                      proposal.changes.filter(
                        (change) => change.type === "create",
                      ).length
                    }{" "}
                    periods
                  </button>
                </div>
              </section>
            ) : (
              <>
                {timetableSubjectProposal?.proposalId === proposal.id &&
                  timetableSubjectProposal.subjects.length > 0 && (
                    <section className="proposal-subject-preview">
                      <div>
                        <span className="micro-label">New subjects ready</span>
                        <button
                          type="button"
                          onClick={onEditSubjects}
                        >
                          Edit {timetableSubjectProposal.subjects.length}
                        </button>
                      </div>
                      <div className="proposal-subject-list">
                        {timetableSubjectProposal.subjects.map((subject) => (
                          <article key={subject.id}>
                            <span
                              className="proposal-subject-dot"
                              style={{ background: subject.color }}
                            />
                            <div>
                              <strong>{subject.name}</strong>
                              <small>
                                {[
                                  subject.shortName,
                                  subject.teacher,
                                  subject.room,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </small>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                <div className="proposal-list">
                  {timetableImportIssues?.proposalId === proposal.id &&
                    timetableImportIssues.issues.length > 0 && (
                      <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                        <h3 className="text-sm font-semibold text-amber-900">
                          Held for review — not included
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-amber-800">
                          These rows did not block the lessons below. Add them
                          manually if needed.
                        </p>
                        <ul className="mt-3 space-y-2">
                          {timetableImportIssues.issues.map((issue) => (
                            <li
                              className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2"
                              key={`${issue.title}-${issue.reason}`}
                            >
                              <strong className="text-sm text-amber-900">
                                {issue.title}
                              </strong>
                              <span className="ml-2 text-xs text-amber-800">
                                {issue.reason}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  {proposal.changes.map((change) => {
                    const result = proposalValidation?.results.find(
                      (candidate) => candidate.changeId === change.id,
                    );
                    return (
                      <article
                        className={result?.valid ? "valid" : "invalid"}
                        key={change.id}
                      >
                        <span className={`change-type ${change.type}`}>
                          {change.type}
                        </span>
                        <div>
                          <h3>
                            {change.after?.title ??
                              change.before?.title ??
                              "Calendar item"}
                          </h3>
                          <p>{change.reason}</p>
                          {change.before && change.after && (
                            <div className="diff-row">
                              <span>{formatProposalTiming(change.before)}</span>
                              <Move size={12} />
                              <strong>
                                {formatProposalTiming(change.after)}
                              </strong>
                            </div>
                          )}
                          {!change.before && change.after && (
                            <div className="diff-row">
                              <strong>
                                {kindLabels[change.after.kind]} ·{" "}
                                {formatProposalTiming(change.after)}
                              </strong>
                            </div>
                          )}
                          {change.before && !change.after && (
                            <div className="diff-row">
                              <span>{formatProposalTiming(change.before)}</span>
                            </div>
                          )}
                          {result && !result.valid && (
                            <small className="validation-error">
                              {result.errors.join(" ")}
                            </small>
                          )}
                          {result?.warnings.map((warning) => (
                            <small className="validation-warning" key={warning}>
                              {warning}
                            </small>
                          ))}
                          {!result?.valid && proposal.source === "document" && (
                            <button
                              className="mt-2 rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)] transition hover:border-[var(--lilac)] hover:text-[var(--lilac-dark)]"
                              type="button"
                              onClick={() => onSkipChange(change.id)}
                            >
                              Skip row
                            </button>
                          )}
                        </div>
                        <span className="validation-mark">
                          {result?.valid ? (
                            <Check size={14} />
                          ) : (
                            <X size={14} />
                          )}
                        </span>
                      </article>
                    );
                  })}
                </div>
                <footer>
                  <div>
                    <Lock size={13} />
                    <span>
                      {proposalValidation?.valid
                        ? "Validated against fixed events, windows, deadlines, and durations."
                        : "Resolve invalid changes before applying."}
                    </span>
                  </div>
                  <button
                    className="secondary"
                    type="button"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    className="approve"
                    type="button"
                    onClick={onApprove}
                    disabled={!proposalValidation?.valid}
                  >
                    Apply{" "}
                    {proposal.changes.length +
                      (timetableSubjectProposal?.proposalId === proposal.id
                        ? timetableSubjectProposal.subjects.length
                        : 0)}{" "}
                    changes
                  </button>
                </footer>
              </>
            )}
          </section>

  );
}
