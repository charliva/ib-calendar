"use client";

import { useState } from "react";
import {
  anchorForWeekOf,
  weekPatternFor,
} from "@/lib/school/week-pattern";

type Props = {
  anchor: string;
  onChange: (anchor: string) => void;
};

/**
 * Which real-world week runs the A timetable.
 *
 * This used to be derived from a fixed date in 2020, so a school whose
 * fortnight happened to be out of phase with it saw every A/B lesson land on
 * the wrong week with no way to say otherwise. The question is phrased about
 * this week because that is the only version a student can actually answer.
 */
export function WeekCycleSection({ anchor, onChange }: Props) {
  const [today] = useState(() => new Date());
  const current = weekPatternFor(today, anchor);

  return (
    <div className="settings-section-body">
      <p className="settings-help">
        If your timetable is the same every week, you can ignore this. If it
        alternates, tell Syllabi which week you are in now and the rest follows.
      </p>
      <div className="settings-choice-row" role="group" aria-label="This week">
        {(["a", "b"] as const).map((pattern) => (
          <button
            key={pattern}
            type="button"
            className={`settings-choice${current === pattern ? " is-selected" : ""}`}
            aria-pressed={current === pattern}
            onClick={() => onChange(anchorForWeekOf(today, pattern))}
          >
            <strong>Week {pattern.toUpperCase()}</strong>
            <small>
              {current === pattern ? "This is the current week" : "Set this week"}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
