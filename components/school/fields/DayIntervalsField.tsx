"use client";

import { useState } from "react";
import {
  formatReviewIntervals,
  parseReviewIntervals,
  reviewIntervalsMatch,
} from "@/lib/school/review-intervals";

type Props = {
  value: number[];
  onChange: (days: number[]) => void;
  placeholder?: string;
  id?: string;
};

/**
 * A comma-separated list of day offsets, typed the way people actually type.
 *
 * The text the student is typing and the numbers the assessment stores are
 * two different things, and conflating them is what broke this field: when
 * the input's value was re-derived from the parsed list on every keystroke,
 * the separator could never survive being typed. `"1, 3, 7, "` parses to the
 * same three numbers as `"1, 3, 7"`, so the trailing comma was erased the
 * instant it appeared and a fourth interval could not be added at all.
 *
 * So the raw text is held here and only re-adopted from the stored value when
 * the two genuinely disagree — which happens when a different assessment is
 * selected, not when the student is halfway through a number.
 */
export function DayIntervalsField({ value, onChange, placeholder, id }: Props) {
  const [text, setText] = useState(() => formatReviewIntervals(value));
  const [adopted, setAdopted] = useState(value);

  // The selected record changed underneath us; show what it holds.
  if (adopted !== value && !reviewIntervalsMatch(text, value)) {
    setAdopted(value);
    setText(formatReviewIntervals(value));
  } else if (adopted !== value) {
    setAdopted(value);
  }

  return (
    <input
      id={id}
      value={text}
      inputMode="numeric"
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const days = parseReviewIntervals(next);
        setAdopted(days);
        onChange(days);
      }}
      onBlur={() => setText(formatReviewIntervals(parseReviewIntervals(text)))}
      placeholder={placeholder}
    />
  );
}
