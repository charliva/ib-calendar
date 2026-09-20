"use client";

import { useState } from "react";
import type { SchoolDaySettings } from "@/lib/school";
import { anchorForWeekOf, weekPatternFor } from "@/lib/school/week-pattern";
import { FormField } from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";

type Props = {
  settings: SchoolDaySettings;
  onChange: (settings: SchoolDaySettings) => void;
};

/**
 * The only school-day rules worth asking for during setup.
 *
 * The full rules form has fifteen fields. Travel time, recovery and the six
 * focus templates are refinements nobody can answer meaningfully on their first
 * day, and asking costs completions. These three are different: the start and
 * end of the day decide where the app thinks every free period is, and the
 * fortnight answer is the one thing the software cannot work out for itself.
 */
export function SchoolDayQuestions({ settings, onChange }: Props) {
  const [today] = useState(() => new Date());
  const pattern = weekPatternFor(today, settings.weekPatternAnchor);

  return (
    <div className="onboarding-questions">
      <div className="form-pair">
        <FormField label="School day starts">
          <TemporalField
            mode="time"
            value={settings.schoolDayStart}
            onChange={(schoolDayStart) => onChange({ ...settings, schoolDayStart })}
          />
        </FormField>
        <FormField label="School day ends">
          <TemporalField
            mode="time"
            value={settings.schoolDayEnd}
            onChange={(schoolDayEnd) => onChange({ ...settings, schoolDayEnd })}
          />
        </FormField>
      </div>
      <fieldset className="onboarding-fortnight">
        <legend>Does your timetable alternate?</legend>
        <p>
          Plenty of schools run a two-week cycle. If yours does, tell us which
          week this one is &mdash; if it does not, leave this alone.
        </p>
        <div className="settings-choice-row">
          {(["a", "b"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`settings-choice${pattern === option ? " is-selected" : ""}`}
              aria-pressed={pattern === option}
              onClick={() =>
                onChange({
                  ...settings,
                  weekPatternAnchor: anchorForWeekOf(today, option),
                })
              }
            >
              <strong>This is Week {option.toUpperCase()}</strong>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
