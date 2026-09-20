import { Laptop } from "lucide-react";
import type { FormEvent } from "react";
import type {
  EnergyRequirement,
  Priority,
  SchoolWorkType,
} from "@/lib/calendar-engine";
import {
  estimateMinutesFromHistory,
  WORK_TYPE_LABELS,
  type Assignment,
  type AssignmentStatus,
  type SchoolDaySettings,
  type Subject,
  type TaskContext,
} from "@/lib/school";
import {
  assignmentStatuses,
  contexts,
  energyRequirements,
  priorities,
  workTypes,
} from "@/components/school/constants";
import { formatStatus, isoInput, localInput } from "@/components/school/format";
import {
  EditorFooter,
  FormField,
  SubjectSelect,
} from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";

type Props = {
  draft: Assignment;
  setDraft: (assignment: Assignment) => void;
  subjects: Subject[];
  /** Past assignments, used to estimate how long this one will really take. */
  assignments: Assignment[];
  schoolDaySettings: SchoolDaySettings;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/**
 * An assignment and the rules the planner has to respect when it places work
 * sessions for it: session length, working window, context, and energy.
 */
export function AssignmentEditor({
  draft,
  setDraft,
  subjects,
  assignments,
  schoolDaySettings,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <form onSubmit={onSubmit}>
      <FormField label="Title">
        <input
          required
          autoFocus
          value={draft.title}
          onChange={(event) =>
            setDraft({
              ...draft,
              title: event.target.value,
            })
          }
          placeholder="Biology lab report"
        />
      </FormField>
      <SubjectSelect
        subjects={subjects}
        allowEmpty
        value={draft.subjectId ?? ""}
        onChange={(subjectId) =>
          setDraft({
            ...draft,
            subjectId: subjectId || null,
          })
        }
      />
      <FormField label="Due date and time">
        <TemporalField
          required
          mode="datetime"
          value={localInput(draft.dueAt)}
          onChange={(value) =>
            setDraft({
              ...draft,
              dueAt: isoInput(value),
            })
          }
          ariaLabel="Choose assignment deadline"
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
            value={draft.estimatedMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
                estimatedMinutes: Number(event.target.value),
              })
            }
          />
        </FormField>
        <FormField label="Priority">
          <select
            value={draft.priority}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.workType ?? ""}
            onChange={(event) => {
              const workType =
                (event.target.value as SchoolWorkType) || null;
              const template = workType
                ? schoolDaySettings.focusTemplates[workType]
                : null;
              const suggested =
                estimateMinutesFromHistory(
                  workType,
                  assignments,
                ) ?? draft.estimatedMinutes;
              setDraft({
                ...draft,
                workType,
                estimatedMinutes: suggested,
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
            value={draft.requiredEnergy}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.status}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.taskContext}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.submissionMethod}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.gradeWeight ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
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
          checked={draft.computerRequired}
          onChange={(event) =>
            setDraft({
              ...draft,
              computerRequired: event.target.checked,
            })
          }
        />
        <Laptop size={13} /> Computer required
      </label>
      <div className="form-pair">
        <FormField label="Daily window starts">
          <TemporalField
            mode="time"
            value={draft.allowedWindowStart}
            onChange={(value) =>
              setDraft({
                ...draft,
                allowedWindowStart: value,
              })
            }
            ariaLabel="Choose daily study window start"
          />
        </FormField>
        <FormField label="Daily window ends">
          <TemporalField
            mode="time"
            value={draft.allowedWindowEnd}
            onChange={(value) =>
              setDraft({
                ...draft,
                allowedWindowEnd: value,
              })
            }
            ariaLabel="Choose daily study window end"
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
            value={draft.minSessionMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
                minSessionMinutes: Number(event.target.value),
              })
            }
          />
        </FormField>
        <FormField label="Longest session">
          <input
            type="number"
            min={draft.minSessionMinutes}
            max={360}
            step={5}
            value={draft.maxSessionMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
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
                    checked={draft.allowedWeekdays.includes(
                      day,
                    )}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        allowedWeekdays: event.target.checked
                          ? [
                              ...draft.allowedWeekdays,
                              day,
                            ].sort()
                          : draft.allowedWeekdays.filter(
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
          checked={draft.splittable}
          onChange={(event) =>
            setDraft({
              ...draft,
              splittable: event.target.checked,
            })
          }
        />
        Split work across multiple sessions
      </label>
      <FormField label="Notes">
        <textarea
          value={draft.notes}
          onChange={(event) =>
            setDraft({
              ...draft,
              notes: event.target.value,
            })
          }
          placeholder="Requirements, rubric, links…"
        />
      </FormField>
      <EditorFooter onCancel={onCancel} />
    </form>
  );
}
