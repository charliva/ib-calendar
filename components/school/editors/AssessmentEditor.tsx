import type { FormEvent } from "react";
import type { Priority } from "@/lib/calendar-engine";
import type {
  Assessment,
  AssessmentStatus,
  Subject,
} from "@/lib/school";
import {
  assessmentStatuses,
  priorities,
} from "@/components/school/constants";
import { isoInput, localInput } from "@/components/school/format";
import {
  EditorFooter,
  FormField,
  SubjectSelect,
} from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";
import { DayIntervalsField } from "@/components/school/fields/DayIntervalsField";

type Props = {
  draft: Assessment;
  setDraft: (assessment: Assessment) => void;
  subjects: Subject[];
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/**
 * An exam and its revision requirement, including whether spaced repetition
 * should propose review sessions once material is marked learned.
 */
export function AssessmentEditor({
  draft,
  setDraft,
  subjects,
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
          placeholder="Chemistry mock"
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
      <div className="form-pair">
        <FormField label="Type">
          <input
            required
            value={draft.assessmentType}
            onChange={(event) =>
              setDraft({
                ...draft,
                assessmentType: event.target.value,
              })
            }
            placeholder="Exam"
          />
        </FormField>
        <FormField label="Importance">
          <select
            value={draft.importance}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.estimatedRevisionMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
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
              value={draft.minRevisionSessionMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
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
              min={draft.minRevisionSessionMinutes}
              max={240}
              step={5}
              value={draft.maxRevisionSessionMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
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
          <TemporalField
            mode="time"
            value={draft.revisionWindowStart}
            onChange={(value) =>
              setDraft({
                ...draft,
                revisionWindowStart: value,
              })
            }
            ariaLabel="Choose revision window start"
          />
        </FormField>
        <FormField label="Revision ends">
          <TemporalField
            mode="time"
            value={draft.revisionWindowEnd}
            onChange={(value) =>
              setDraft({
                ...draft,
                revisionWindowEnd: value,
              })
            }
            ariaLabel="Choose revision window end"
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
          checked={draft.spacedRepetitionEnabled}
          onChange={(event) =>
            setDraft({
              ...draft,
              spacedRepetitionEnabled: event.target.checked,
            })
          }
        />
        Enable spaced repetition
      </label>
      {draft.spacedRepetitionEnabled && (
        <FormField label="Review after (days)">
          <DayIntervalsField
            value={draft.reviewIntervalsDays}
            onChange={(reviewIntervalsDays) =>
              setDraft({ ...draft, reviewIntervalsDays })
            }
            placeholder="1, 3, 7, 14"
          />
        </FormField>
      )}
      <FormField label="Date and time">
        <TemporalField
          required
          mode="datetime"
          value={localInput(draft.scheduledAt)}
          onChange={(value) =>
            setDraft({
              ...draft,
              scheduledAt: isoInput(value) ?? "",
            })
          }
          ariaLabel="Choose assessment date and time"
        />
      </FormField>
      <div className="form-pair">
        <FormField label="Ends (optional)">
          <TemporalField
            mode="datetime"
            value={localInput(draft.endsAt)}
            onChange={(value) =>
              setDraft({
                ...draft,
                endsAt: isoInput(value),
              })
            }
            placeholder="No end time"
            ariaLabel="Choose assessment end"
          />
        </FormField>
        <FormField label="Weight %">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={draft.weight ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
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
          value={draft.status}
          onChange={(event) =>
            setDraft({
              ...draft,
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
          value={draft.notes}
          onChange={(event) =>
            setDraft({
              ...draft,
              notes: event.target.value,
            })
          }
          placeholder="Topics, allowed materials, room…"
        />
      </FormField>
      <EditorFooter onCancel={onCancel} />
    </form>
  );
}
