import { CalendarClock, Check, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  durationMinutes,
  energyLabels,
  isAllDayItem,
  isCalendarSpanItem,
  kindLabels,
  type CalendarItem,
  type EnergyRequirement,
  type EnergyType,
  type Flexibility,
  type ItemKind,
  type Priority,
  type SchoolWorkType,
  type TaskContext,
} from "../../lib/calendar-engine.ts";
import {
  itemWithDuration,
  toggleAllDayItem,
} from "../../lib/calendar/scheduling.ts";
import {
  fromLocalInput,
  toLocalInput,
} from "../../lib/calendar/time-inputs.ts";
import { formatProposalTiming, formatSpan } from "../../app/calendar-format.ts";
import { TemporalField } from "../../app/ui/temporal-field.tsx";
import { LearningControls } from "../../app/learning-controls.tsx";
import {
  isImportedTimetableItem,
  subjectsAreSimilar,
} from "../../lib/timetable-import.ts";
import { WORK_TYPE_LABELS } from "../../lib/school.ts";
import { energyTypeForWorkType } from "../../lib/school-day-engine.ts";
import type { SchoolDaySettings } from "../../lib/school.ts";
import {
  type ChallengeLevel,
  type LearningSource,
} from "../../lib/study-intelligence.ts";
import type { Assessment } from "../../lib/school.ts";
import type { Subject } from "../../lib/school.ts";

const energyTypes = Object.keys(energyLabels) as EnergyType[];
const priorities: Priority[] = ["low", "medium", "high"];
const flexibilities: Flexibility[] = ["fixed", "flexible", "elastic"];
const kinds: ItemKind[] = ["event", "task", "intention"];
const schoolWorkTypes = Object.keys(WORK_TYPE_LABELS) as SchoolWorkType[];
const energyRequirements: EnergyRequirement[] = ["low", "medium", "high"];

export function EventModal({
  onNaturalEdit,
  selectedItem,
  draftItem,
  subjects,
  assessments,
  learningSource,
  challengeLevel,
  isCreatingItem,
  draftTimingError,
  durationOptions,
  focusTemplates,
  onDraftChange,
  onClose,
  onSubmit,
  onDelete,
  onUnschedule,
  onToggleAssignmentSession,
  onMarkRevisionLearned,
  onChallenge,
  onGoDeeper,
}: {
  onNaturalEdit: (instruction: string) => void;
  selectedItem: CalendarItem;
  draftItem: CalendarItem;
  subjects: Subject[];
  assessments: Assessment[];
  learningSource: LearningSource;
  challengeLevel: ChallengeLevel | null;
  isCreatingItem: boolean;
  draftTimingError: string | null;
  durationOptions: number[];
  focusTemplates: SchoolDaySettings["focusTemplates"];
  onDraftChange: (item: CalendarItem | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: (item: CalendarItem) => void;
  onUnschedule: (itemId: string) => void;
  onToggleAssignmentSession: (item: CalendarItem) => void;
  onMarkRevisionLearned: (item: CalendarItem, assessment: Assessment) => void;
  onChallenge: (source: LearningSource, value: ChallengeLevel) => void;
  onGoDeeper: (source: LearningSource) => void;
}) {
  const [editInstruction, setEditInstruction] = useState("");
  return (
    <div
      className="overlay item-overlay"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <form className="item-inspector" onSubmit={onSubmit}>
        <header>
          <div>
            <span className="micro-label">
              {isImportedTimetableItem(draftItem)
                ? "Edit school period"
                : isCreatingItem
                  ? "New calendar item"
                  : "Edit calendar item"}
            </span>
            {!isImportedTimetableItem(draftItem) && (
              <div className="quick-kind-switch" aria-label="Item type">
                {kinds.map((kind) => (
                  <button
                    className={draftItem.kind === kind ? "active" : ""}
                    type="button"
                    key={kind}
                    onClick={() =>
                      onDraftChange({
                        ...draftItem,
                        kind,
                        flexibility:
                          kind === "event"
                            ? "flexible"
                            : draftItem.flexibility === "fixed"
                              ? "flexible"
                              : draftItem.flexibility,
                      })
                    }
                  >
                    {kindLabels[kind]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="inspector-close"
            type="button"
            onClick={() => {
              onClose();
            }}
            aria-label="Close item editor"
          >
            <X size={16} />
          </button>
        </header>
        {!isCreatingItem && (
          <section className="natural-edit">
            <label htmlFor="event-natural-edit">Describe a change</label>
            <div>
              <input
                id="event-natural-edit"
                value={editInstruction}
                onChange={(event) => setEditInstruction(event.target.value)}
                placeholder="Move to Thursday at 4, make it 45 minutes…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (editInstruction.trim())
                      onNaturalEdit(editInstruction.trim());
                  }
                }}
              />
              <button
                type="button"
                disabled={!editInstruction.trim()}
                onClick={() => onNaturalEdit(editInstruction.trim())}
              >
                Apply →
              </button>
            </div>
            <small>Changes apply immediately. You can undo them.</small>
          </section>
        )}
        {isImportedTimetableItem(draftItem) && (
          <section className="school-period-subject">
            <label>
              <span>Subject</span>
              <select
                autoFocus
                value={
                  subjects.find((subject) =>
                    subjectsAreSimilar(
                      draftItem.title,
                      subject.name,
                      "",
                      subject.shortName,
                    ),
                  )?.id ??
                  (draftItem.title === "Assembly" ? "__assembly" : "__custom")
                }
                onChange={(event) => {
                  if (event.target.value === "__assembly") {
                    onDraftChange({
                      ...draftItem,
                      title: "Assembly",
                      energyType: "social",
                    });
                    return;
                  }
                  if (event.target.value === "__custom") return;
                  const subject = subjects.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (!subject) return;
                  onDraftChange({
                    ...draftItem,
                    title: subject.name,
                    subjectId: subject.id,
                    description: draftItem.description || subject.teacher,
                  });
                }}
              >
                <option value="__assembly">Assembly</option>
                {subjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>
                    {subject.name} ({subject.shortName})
                  </option>
                ))}
                <option value="__custom">Custom label</option>
              </select>
            </label>
            <small>This changes only this period, not the whole subject.</small>
          </section>
        )}
        <input
          className="item-title-input"
          autoFocus={!isImportedTimetableItem(draftItem)}
          value={draftItem.title}
          onChange={(event) =>
            onDraftChange({ ...draftItem, title: event.target.value })
          }
          aria-label="Item title"
          placeholder={
            draftItem.kind === "event"
              ? "What’s happening?"
              : "What needs doing?"
          }
        />
        <section className="item-schedule-card">
          <header className="item-section-heading">
            <CalendarClock size={16} />
            <div>
              <strong>Schedule</strong>
              <small>
                {draftItem.startsAt
                  ? formatProposalTiming(draftItem)
                  : "Leave unscheduled to keep it in your inbox"}
              </small>
            </div>
          </header>
          <div className="item-schedule-row">
            <label className="item-start-field">
              <span>Starts</span>
              <TemporalField
                mode="datetime"
                value={toLocalInput(draftItem.startsAt)}
                onChange={(value) => {
                  const startsAt = fromLocalInput(value);
                  const minutes = durationMinutes(draftItem);
                  onDraftChange({
                    ...draftItem,
                    startsAt,
                    endsAt: startsAt
                      ? new Date(
                          new Date(startsAt).getTime() + minutes * 60_000,
                        ).toISOString()
                      : null,
                    status: startsAt ? "scheduled" : "inbox",
                  });
                }}
                ariaLabel="Choose start date and time"
              />
            </label>
            <label className="item-duration-field">
              <span>Duration</span>
              <select
                value={durationMinutes(draftItem)}
                disabled={!draftItem.startsAt || isAllDayItem(draftItem)}
                onChange={(event) =>
                  onDraftChange(
                    itemWithDuration(draftItem, Number(event.target.value)),
                  )
                }
              >
                {durationOptions.map((minutes) => (
                  <option value={minutes} key={minutes}>
                    {minutes < 60
                      ? `${minutes} min`
                      : minutes % 60 === 0
                        ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
                        : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!isImportedTimetableItem(draftItem) && draftItem.startsAt && (
            <button
              className={`item-all-day-toggle ${
                isAllDayItem(draftItem) ? "active" : ""
              }`}
              type="button"
              aria-pressed={isAllDayItem(draftItem)}
              onClick={() => onDraftChange(toggleAllDayItem(draftItem))}
            >
              <span aria-hidden="true" /> All day
            </button>
          )}
        </section>
        {draftTimingError && (
          <p className="item-timing-error" role="alert">
            {draftTimingError}
          </p>
        )}
        {isCalendarSpanItem(draftItem) && (
          <p className="item-span-summary">
            <CalendarClock size={13} /> {formatSpan(draftItem)} · shown as a
            continuous span in every calendar view
          </p>
        )}
        {isImportedTimetableItem(draftItem) && (
          <div className="school-period-details">
            <label className="school-period-room">
              <span>Room</span>
              <input
                value={draftItem.room}
                onChange={(event) =>
                  onDraftChange({
                    ...draftItem,
                    room: event.target.value,
                  })
                }
                placeholder="e.g. KE114"
                maxLength={80}
              />
              <small>This changes only this class occurrence.</small>
            </label>
            <label className="school-period-notes">
              <span>Teacher & notes</span>
              <textarea
                value={draftItem.description}
                onChange={(event) =>
                  onDraftChange({
                    ...draftItem,
                    description: event.target.value,
                  })
                }
                placeholder="Teacher · class details"
              />
            </label>
          </div>
        )}
        <details className="item-more">
          <summary>
            <span>Details</span>
            <small>Notes, exact time & planning</small>
          </summary>
          {!isImportedTimetableItem(draftItem) && (
            <textarea
              className="item-detail-notes"
              value={draftItem.description}
              onChange={(event) =>
                onDraftChange({
                  ...draftItem,
                  description: event.target.value,
                })
              }
              placeholder="Add notes (optional)"
              aria-label="Item notes"
            />
          )}
          <div className="compact-options-grid">
            <label>
              <span>Exact end</span>
              <TemporalField
                mode="datetime"
                value={toLocalInput(draftItem.endsAt)}
                onChange={(value) => {
                  const endsAt = fromLocalInput(value);
                  const minutes =
                    draftItem.startsAt && endsAt
                      ? Math.max(
                          5,
                          Math.round(
                            (new Date(endsAt).getTime() -
                              new Date(draftItem.startsAt).getTime()) /
                              60_000,
                          ),
                        )
                      : draftItem.durationMin;
                  onDraftChange({
                    ...draftItem,
                    endsAt,
                    durationMin: minutes,
                    durationMax: minutes,
                  });
                }}
                ariaLabel="Choose exact end date and time"
              />
            </label>
            <label>
              <span>Energy</span>
              <select
                value={draftItem.energyType}
                onChange={(event) =>
                  onDraftChange({
                    ...draftItem,
                    energyType: event.target.value as EnergyType,
                  })
                }
              >
                {energyTypes.map((energy) => (
                  <option key={energy} value={energy}>
                    {energyLabels[energy]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select
                value={draftItem.priority}
                onChange={(event) =>
                  onDraftChange({
                    ...draftItem,
                    priority: event.target.value as Priority,
                  })
                }
              >
                {priorities.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            {!isImportedTimetableItem(draftItem) && (
              <>
                <label>
                  <span>Deadline</span>
                  <TemporalField
                    mode="datetime"
                    value={toLocalInput(draftItem.deadline)}
                    onChange={(value) =>
                      onDraftChange({
                        ...draftItem,
                        deadline: fromLocalInput(value),
                      })
                    }
                    placeholder="No deadline"
                    ariaLabel="Choose deadline"
                  />
                </label>
                <label>
                  <span>Flexibility</span>
                  <select
                    value={draftItem.flexibility}
                    disabled={isCreatingItem && draftItem.kind === "event"}
                    onChange={(event) =>
                      onDraftChange({
                        ...draftItem,
                        flexibility: event.target.value as Flexibility,
                      })
                    }
                  >
                    {(isCreatingItem && draftItem.kind === "event"
                      ? (["flexible"] as Flexibility[])
                      : flexibilities
                    ).map((flexibility) => (
                      <option key={flexibility}>{flexibility}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Window starts</span>
                  <TemporalField
                    mode="datetime"
                    value={toLocalInput(draftItem.windowStart)}
                    onChange={(value) =>
                      onDraftChange({
                        ...draftItem,
                        windowStart: fromLocalInput(value),
                      })
                    }
                    placeholder="No start"
                    ariaLabel="Choose window start"
                  />
                </label>
                <label>
                  <span>Window ends</span>
                  <TemporalField
                    mode="datetime"
                    value={toLocalInput(draftItem.windowEnd)}
                    onChange={(value) =>
                      onDraftChange({
                        ...draftItem,
                        windowEnd: fromLocalInput(value),
                      })
                    }
                    placeholder="No end"
                    ariaLabel="Choose window end"
                  />
                </label>
              </>
            )}
          </div>
          <label className="constraint-field">
            <span>Constraints</span>
            <input
              value={draftItem.constraints.join(", ")}
              onChange={(event) =>
                onDraftChange({
                  ...draftItem,
                  constraints: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="after school, before deadline"
            />
          </label>
          {draftItem.kind === "task" && (
            <>
              <label className="constraint-field">
                <span>Work type</span>
                <select
                  value={draftItem.workType ?? ""}
                  onChange={(event) => {
                    const workType =
                      (event.target.value as SchoolWorkType) || null;
                    const template = workType ? focusTemplates[workType] : null;
                    onDraftChange({
                      ...draftItem,
                      workType,
                      energyType: energyTypeForWorkType(workType),
                      ...(template
                        ? {
                            durationMin: template.durationMin,
                            durationMax: template.durationMax,
                            endsAt: draftItem.startsAt
                              ? new Date(
                                  new Date(draftItem.startsAt).getTime() +
                                    template.durationMin * 60_000,
                                ).toISOString()
                              : null,
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="">Unspecified</option>
                  {schoolWorkTypes.map((workType) => (
                    <option value={workType} key={workType}>
                      {WORK_TYPE_LABELS[workType]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="constraint-field">
                <span>Required energy</span>
                <select
                  value={draftItem.requiredEnergy}
                  onChange={(event) =>
                    onDraftChange({
                      ...draftItem,
                      requiredEnergy: event.target.value as EnergyRequirement,
                    })
                  }
                >
                  {energyRequirements.map((energy) => (
                    <option value={energy} key={energy}>
                      {energy}
                    </option>
                  ))}
                </select>
              </label>
              <label className="constraint-field">
                <span>Work context</span>
                <select
                  value={draftItem.taskContext}
                  onChange={(event) =>
                    onDraftChange({
                      ...draftItem,
                      taskContext: event.target.value as TaskContext,
                    })
                  }
                >
                  <option value="anywhere">Anywhere</option>
                  <option value="school">School</option>
                  <option value="home">Home</option>
                  <option value="library">Library</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={draftItem.computerRequired}
                  onChange={(event) =>
                    onDraftChange({
                      ...draftItem,
                      computerRequired: event.target.checked,
                    })
                  }
                />
                Computer required
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={draftItem.splittable}
                  onChange={(event) =>
                    onDraftChange({
                      ...draftItem,
                      splittable: event.target.checked,
                    })
                  }
                />
                May be split into sessions
              </label>
            </>
          )}
        </details>
        {!isCreatingItem &&
          (selectedItem.kind === "task" ||
            selectedItem.subjectId ||
            selectedItem.assignmentId ||
            selectedItem.assessmentId) && (
            <LearningControls
              source={learningSource}
              value={challengeLevel}
              onChallenge={(source, value) => onChallenge(source, value)}
              onGoDeeper={onGoDeeper}
            />
          )}
        <footer>
          {!isCreatingItem && (
            <button
              className="delete"
              type="button"
              onClick={() => onDelete(selectedItem)}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {!isCreatingItem &&
            selectedItem.flexibility !== "fixed" &&
            selectedItem.status === "scheduled" && (
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  onUnschedule(selectedItem.id);
                  onClose();
                  onDraftChange(null);
                }}
              >
                Unschedule
              </button>
            )}
          {!isCreatingItem &&
            selectedItem.kind === "task" &&
            (selectedItem.assignmentId || selectedItem.intentionId) && (
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  onToggleAssignmentSession(selectedItem);
                  onClose();
                  onDraftChange(null);
                }}
              >
                <Check size={14} />
                {selectedItem.status === "completed"
                  ? "Reopen session"
                  : "Mark complete"}
              </button>
            )}
          {!isCreatingItem &&
            selectedItem.kind === "task" &&
            selectedItem.assessmentId &&
            !selectedItem.learnedAt && (
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  const assessment = assessments.find(
                    (entry) => entry.id === selectedItem.assessmentId,
                  );
                  if (assessment) {
                    onMarkRevisionLearned(selectedItem, assessment);
                  }
                  onClose();
                  onDraftChange(null);
                }}
              >
                <Check size={14} /> Mark learned
              </button>
            )}
          <button
            className="save"
            type="submit"
            disabled={!draftItem.title.trim() || Boolean(draftTimingError)}
          >
            {isCreatingItem
              ? `Create ${kindLabels[draftItem.kind].toLowerCase()}`
              : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
