"use client";

import { format, isValid } from "date-fns";
import { CalendarDays, Clock3, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatTemporalText,
  parseTemporalText,
} from "@/lib/temporal-parser";

type TemporalMode = "date" | "time" | "datetime";

type Props = {
  value: string;
  onChange: (value: string) => void;
  mode: TemporalMode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minuteStep?: number;
  ariaLabel?: string;
  className?: string;
};

function dateFromValue(value: string, mode: TemporalMode) {
  if (!value || mode === "time") return undefined;
  const [datePart, timePart = "12:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const result = new Date(year, month - 1, day, hour || 0, minute || 0);
  return isValid(result) ? result : undefined;
}

function valueFromDate(date: Date, mode: "date" | "datetime") {
  return format(date, mode === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm");
}

function displayValue(value: string, mode: TemporalMode) {
  return formatTemporalText(value, mode);
}

function parsedInput(text: string, mode: TemporalMode, fallbackValue = "") {
  return parseTemporalText(text, mode, new Date(), fallbackValue);
}

export function TemporalField({
  value,
  onChange,
  mode,
  placeholder,
  disabled,
  required,
  minuteStep = 5,
  ariaLabel,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => displayValue(value, mode));
  const parsedText = parsedInput(text, mode, value);
  const previewValue = parsedText ?? value;
  const selected = dateFromValue(previewValue, mode);
  const invalid = text.trim() !== "" && parsedText === null;

  useEffect(() => {
    const sync = window.setTimeout(() => setText(displayValue(value, mode)), 0);
    return () => window.clearTimeout(sync);
  }, [mode, value]);

  function commitText() {
    const parsed = parsedInput(text, mode, value);
    if (parsed === null || (required && !parsed)) {
      setText(displayValue(value, mode));
      return;
    }
    onChange(parsed);
    setText(displayValue(parsed, mode));
  }

  function chooseDate(date: Date | undefined) {
    if (!date || mode === "time") return;
    if (mode === "datetime") {
      date.setHours(selected?.getHours() ?? 9, selected?.getMinutes() ?? 0, 0, 0);
    }
    const next = valueFromDate(date, mode);
    onChange(next);
    setText(displayValue(next, mode));
    if (mode === "date") setOpen(false);
  }

  if (mode === "time") {
    return (
      <div className={`temporal-field shadcn-date-field ${className}`.trim()}>
        <div className="temporal-trigger">
          <Clock3 size={14} aria-hidden="true" />
          <Input
            type="time"
            value={value.slice(0, 5)}
            onChange={(event) => onChange(event.target.value)}
            step={minuteStep * 60}
            disabled={disabled}
            required={required}
            aria-label={ariaLabel}
          />
        </div>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={`temporal-field shadcn-date-field ${open ? "is-open" : ""} ${className}`.trim()}>
          <div className="temporal-trigger">
            <PopoverTrigger asChild>
              <button
                className="shadcn-date-trigger"
                type="button"
                disabled={disabled}
                aria-label={ariaLabel || "Open calendar"}
              >
                <CalendarDays size={14} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <Input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={commitText}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitText();
                }
                if (event.key === "Escape") {
                  setText(displayValue(value, mode));
                  setOpen(false);
                }
              }}
              placeholder={
                placeholder ||
                (mode === "date"
                  ? "e.g. tomorrow or next Saturday"
                  : "e.g. tomorrow at 2 pm")
              }
              disabled={disabled}
              required={required}
              aria-label={ariaLabel}
              aria-invalid={invalid || undefined}
            />
          </div>

          {value && !required && (
            <button
              className="temporal-clear"
              type="button"
              aria-label="Clear"
              onClick={() => {
                setText("");
                onChange("");
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="shadcn-date-popover w-auto p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={(event) => {
          const target = event.target as Element;
          if (target.closest(".shadcn-date-field")) event.preventDefault();
        }}
      >
        <div className={`shadcn-nlp-preview ${invalid ? "is-invalid" : ""}`}>
          <span>{invalid ? "Couldn’t understand" : "Interpreted as"}</span>
          <strong>
            {invalid
              ? "Try ‘next Saturday at 2 pm’"
              : displayValue(previewValue, mode) || "No date selected"}
          </strong>
        </div>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={chooseDate}
          defaultMonth={selected}
          timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        />
        {mode === "datetime" && (
          <div className="shadcn-date-time">
            <label htmlFor={`${ariaLabel || "date"}-time`}>Time</label>
            <Input
              id={`${ariaLabel || "date"}-time`}
              type="time"
              value={value.split("T")[1]?.slice(0, 5) || "09:00"}
              step={minuteStep * 60}
              onChange={(event) => {
                // Clearing the field reads back "", which split/Number turns
                // into NaN — setHours(NaN) makes the date Invalid and
                // date-fns format() then throws RangeError straight out of
                // this handler, so neither onChange nor setText below ever
                // ran and the popover was wedged. A half-typed value is not
                // an edit; wait for a whole one.
                const [hour, minute] = event.target.value.split(":").map(Number);
                if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
                const base = selected ?? new Date();
                const nextDate = new Date(base);
                nextDate.setHours(hour, minute, 0, 0);
                if (Number.isNaN(nextDate.getTime())) return;
                const next = valueFromDate(nextDate, "datetime");
                onChange(next);
                setText(displayValue(next, mode));
              }}
              aria-label="Time"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
