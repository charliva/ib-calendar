import type { FormEvent } from "react";
import { WORK_TYPE_LABELS, type SchoolDaySettings } from "@/lib/school";
import { workTypes } from "@/components/school/constants";
import { EditorFooter, FormField } from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";

type Props = {
  draft: SchoolDaySettings;
  setDraft: (settings: SchoolDaySettings) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/**
 * The rules that describe this student's school day: when it starts and ends,
 * travel and recovery time, and the default shape of each kind of focus block.
 */
export function SchoolDayEditor({ draft, setDraft, onSubmit, onCancel }: Props) {
  return (
    <form onSubmit={onSubmit}>
      <FormField label="School location">
        <input
          autoFocus
          value={draft.schoolLocation}
          onChange={(event) =>
            setDraft({
              ...draft,
              schoolLocation: event.target.value,
            })
          }
          placeholder="School name or address"
        />
      </FormField>
      <div className="form-pair">
        <FormField label="School day starts">
          <TemporalField
            mode="time"
            value={draft.schoolDayStart}
            onChange={(value) =>
              setDraft({
                ...draft,
                schoolDayStart: value,
              })
            }
            ariaLabel="Choose school day start"
          />
        </FormField>
        <FormField label="School day ends">
          <TemporalField
            mode="time"
            value={draft.schoolDayEnd}
            onChange={(value) =>
              setDraft({
                ...draft,
                schoolDayEnd: value,
              })
            }
            ariaLabel="Choose school day end"
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
            value={draft.travelBeforeSchoolMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.travelHomeMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
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
            value={draft.recoveryAfterHomeMinutes}
            onChange={(event) =>
              setDraft({
                ...draft,
                recoveryAfterHomeMinutes: Number(event.target.value),
              })
            }
          />
        </FormField>
        <FormField label="Work cutoff">
          <TemporalField
            mode="time"
            value={draft.schoolworkCutoff}
            onChange={(value) =>
              setDraft({
                ...draft,
                schoolworkCutoff: value,
              })
            }
            ariaLabel="Choose schoolwork cutoff"
          />
        </FormField>
      </div>
      <div className="form-pair">
        <FormField label="Preferred from">
          <TemporalField
            mode="time"
            value={draft.preferredStudyStart}
            onChange={(value) =>
              setDraft({
                ...draft,
                preferredStudyStart: value,
              })
            }
            ariaLabel="Choose preferred study start"
          />
        </FormField>
        <FormField label="Preferred until">
          <TemporalField
            mode="time"
            value={draft.preferredStudyEnd}
            onChange={(value) =>
              setDraft({
                ...draft,
                preferredStudyEnd: value,
              })
            }
            ariaLabel="Choose preferred study end"
          />
        </FormField>
      </div>
      <div className="form-pair">
        <FormField label="Low energy from">
          <TemporalField
            mode="time"
            value={draft.lowEnergyStart}
            onChange={(value) =>
              setDraft({
                ...draft,
                lowEnergyStart: value,
              })
            }
            ariaLabel="Choose low energy start"
          />
        </FormField>
        <FormField label="Low energy until">
          <TemporalField
            mode="time"
            value={draft.lowEnergyEnd}
            onChange={(value) =>
              setDraft({
                ...draft,
                lowEnergyEnd: value,
              })
            }
            ariaLabel="Choose low energy end"
          />
        </FormField>
      </div>
      <FormField label="Minimum actionable free period">
        <input
          type="number"
          min={45}
          max={180}
          step={5}
          value={draft.minimumFreePeriodMinutes}
          onChange={(event) =>
            setDraft({
              ...draft,
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
            draft.focusTemplates[workType];
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
                  setDraft({
                    ...draft,
                    focusTemplates: {
                      ...draft.focusTemplates,
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
                  setDraft({
                    ...draft,
                    focusTemplates: {
                      ...draft.focusTemplates,
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
          checked={draft.schoolComputerAccess}
          onChange={(event) =>
            setDraft({
              ...draft,
              schoolComputerAccess: event.target.checked,
            })
          }
        />
        Computer access during free periods
      </label>
      <label className="school-check">
        <input
          type="checkbox"
          checked={draft.allowCommuteScheduling}
          onChange={(event) =>
            setDraft({
              ...draft,
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
      <EditorFooter onCancel={onCancel} />
    </form>
  );
}
