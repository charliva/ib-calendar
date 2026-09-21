"use client";

import { useState, type FormEvent } from "react";
import { WORK_TYPE_LABELS, type SchoolDaySettings } from "@/lib/school";
import { SCHOOL_DAY_MINUTE_BOUNDS } from "@/lib/school/minute-bounds";
import { sameSchoolDaySettings } from "@/lib/school/settings-equality";
import {
  SCHOOL_DAY_TIME_FIELDS,
  isSchoolDayTime,
} from "@/lib/school/time-fields";
import { workTypes } from "@/components/school/constants";
import { FormField } from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";

type Props = {
  settings: SchoolDaySettings;
  onSave: (settings: SchoolDaySettings) => void;
};

/**
 * The school day, with the five answers that matter up front.
 *
 * The full rules form has fifteen fields and a six-row grid, which is more than
 * anyone wants to meet when they open Settings. Travel time, recovery, energy
 * windows and per-work-type block lengths are all real, but they are
 * refinements — so they sit behind disclosures and the panel opens on the
 * handful of times that actually decide where free periods land.
 */
export function SchoolDaySection({ settings, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  // Compared by value, not identity. rowToSchoolDaySettings builds a fresh
  // object on every read and the account's snapshot is re-read every fifteen
  // seconds, so an identity check fired on every poll and reset the draft out
  // from under whoever was typing into it.
  const [savedSettings, setSavedSettings] = useState(settings);
  if (!sameSchoolDaySettings(savedSettings, settings)) {
    setSavedSettings(settings);
    setDraft(settings);
  }

  const dirty = !sameSchoolDaySettings(draft, settings);

  function update(patch: Partial<SchoolDaySettings>) {
    setDraft({ ...draft, ...patch });
  }

  // An emptied time input reads back as "", and the ordering guards below only
  // catch it at the end of a pair — "15:00" <= "" is false, so an emptied
  // *start* used to reach a `time not null` column and be rejected forever.
  const incompleteTime = SCHOOL_DAY_TIME_FIELDS.some(
    (field) => !isSchoolDayTime(draft[field]),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (incompleteTime) return;
    if (draft.schoolDayEnd <= draft.schoolDayStart) return;
    if (draft.preferredStudyEnd <= draft.preferredStudyStart) return;
    if (draft.lowEnergyEnd <= draft.lowEnergyStart) return;
    onSave(draft);
  }

  return (
    <form className="settings-section-body settings-form" onSubmit={submit}>
      <div className="settings-field-pair">
        <FormField label="School starts">
          <TemporalField
            mode="time"
            value={draft.schoolDayStart}
            onChange={(schoolDayStart) => update({ schoolDayStart })}
          />
        </FormField>
        <FormField label="School ends">
          <TemporalField
            mode="time"
            value={draft.schoolDayEnd}
            onChange={(schoolDayEnd) => update({ schoolDayEnd })}
          />
        </FormField>
      </div>

      <div className="settings-field-pair">
        <FormField label="You work best from">
          <TemporalField
            mode="time"
            value={draft.preferredStudyStart}
            onChange={(preferredStudyStart) => update({ preferredStudyStart })}
          />
        </FormField>
        <FormField label="Until">
          <TemporalField
            mode="time"
            value={draft.preferredStudyEnd}
            onChange={(preferredStudyEnd) => update({ preferredStudyEnd })}
          />
        </FormField>
      </div>

      <FormField label="Stop scheduling schoolwork after">
        <TemporalField
          mode="time"
          value={draft.schoolworkCutoff}
          onChange={(schoolworkCutoff) => update({ schoolworkCutoff })}
        />
      </FormField>

      <details className="settings-disclosure">
        <summary>Travel and energy</summary>
        <div className="settings-field-pair">
          <FormField label="Travel to school (min)">
            <input
              type="number"
              min={SCHOOL_DAY_MINUTE_BOUNDS.travelBeforeSchoolMinutes.min}
              max={SCHOOL_DAY_MINUTE_BOUNDS.travelBeforeSchoolMinutes.max}
              value={draft.travelBeforeSchoolMinutes}
              onChange={(event) =>
                update({
                  travelBeforeSchoolMinutes: Number(event.target.value),
                })
              }
            />
          </FormField>
          <FormField label="Travel home (min)">
            <input
              type="number"
              min={SCHOOL_DAY_MINUTE_BOUNDS.travelHomeMinutes.min}
              max={SCHOOL_DAY_MINUTE_BOUNDS.travelHomeMinutes.max}
              value={draft.travelHomeMinutes}
              onChange={(event) =>
                update({ travelHomeMinutes: Number(event.target.value) })
              }
            />
          </FormField>
        </div>
        <div className="settings-field-pair">
          <FormField label="Wind down at home (min)">
            <input
              type="number"
              min={SCHOOL_DAY_MINUTE_BOUNDS.recoveryAfterHomeMinutes.min}
              max={SCHOOL_DAY_MINUTE_BOUNDS.recoveryAfterHomeMinutes.max}
              value={draft.recoveryAfterHomeMinutes}
              onChange={(event) =>
                update({ recoveryAfterHomeMinutes: Number(event.target.value) })
              }
            />
          </FormField>
          <FormField label="Shortest usable gap (min)">
            <input
              type="number"
              min={SCHOOL_DAY_MINUTE_BOUNDS.minimumFreePeriodMinutes.min}
              max={SCHOOL_DAY_MINUTE_BOUNDS.minimumFreePeriodMinutes.max}
              value={draft.minimumFreePeriodMinutes}
              onChange={(event) =>
                update({ minimumFreePeriodMinutes: Number(event.target.value) })
              }
            />
          </FormField>
        </div>
        <div className="settings-field-pair">
          <FormField label="Low energy from">
            <TemporalField
              mode="time"
              value={draft.lowEnergyStart}
              onChange={(lowEnergyStart) => update({ lowEnergyStart })}
            />
          </FormField>
          <FormField label="Until">
            <TemporalField
              mode="time"
              value={draft.lowEnergyEnd}
              onChange={(lowEnergyEnd) => update({ lowEnergyEnd })}
            />
          </FormField>
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.schoolComputerAccess}
            onChange={(event) =>
              update({ schoolComputerAccess: event.target.checked })
            }
          />
          <span>I can use a computer in free periods</span>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.allowCommuteScheduling}
            onChange={(event) =>
              update({ allowCommuteScheduling: event.target.checked })
            }
          />
          <span>Suggest work during my commute</span>
        </label>
      </details>

      <details className="settings-disclosure">
        <summary>How long study blocks run</summary>
        <div className="settings-template-grid">
          {workTypes.map((workType) => {
            const template = draft.focusTemplates[workType];
            return (
              <div key={workType} className="settings-template-row">
                <span>{WORK_TYPE_LABELS[workType]}</span>
                <input
                  type="number"
                  min={5}
                  aria-label={`${WORK_TYPE_LABELS[workType]} shortest`}
                  value={template.durationMin}
                  onChange={(event) =>
                    update({
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
                <input
                  type="number"
                  min={5}
                  aria-label={`${WORK_TYPE_LABELS[workType]} longest`}
                  value={template.durationMax}
                  onChange={(event) =>
                    update({
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
              </div>
            );
          })}
        </div>
      </details>

      <div className="settings-form-footer">
        {incompleteTime ? (
          <p className="settings-help" role="status">
            One of the times is empty. Fill it in to save.
          </p>
        ) : null}
        <button type="submit" disabled={!dirty || incompleteTime}>
          {dirty ? "Save" : "Saved"}
        </button>
      </div>
    </form>
  );
}
