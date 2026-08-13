"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parts(value: string, mode: TemporalMode) {
  if (mode === "date") return { date: value.slice(0, 10), time: "" };
  if (mode === "time") return { date: "", time: value.slice(0, 5) };
  const [date = "", time = ""] = value.split("T");
  return { date: date.slice(0, 10), time: time.slice(0, 5) };
}

function joinValue(mode: TemporalMode, date: string, time: string) {
  if (mode === "date") return date;
  if (mode === "time") return time;
  if (!date) return "";
  return `${date}T${time || "09:00"}`;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const [viewMonth, setViewMonth] = useState("");
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => formatTemporalText(value, mode));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const parsedText = parseTemporalText(text, mode, new Date(), value);
  const previewValue = parsedText ?? value;
  const current = parts(previewValue, mode);
  const selectedTime = current.time || "09:00";
  const [selectedHour, selectedMinute] = selectedTime.split(":").map(Number);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function closeOnViewportChange() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!editing) setText(formatTemporalText(value, mode));
  }, [editing, mode, value]);

  const monthSource =
    viewMonth || current.date.slice(0, 7) || todayKey().slice(0, 7);
  const [monthYear, monthNumber] = monthSource.split("-").map(Number);
  const month = new Date(monthYear, monthNumber - 1, 1, 12);
  const firstWeekday = (month.getDay() + 6) % 7;
  const calendarStart = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - firstWeekday,
    12,
  );
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return {
      key,
      day: day.getDate(),
      outside: day.getMonth() !== month.getMonth(),
    };
  });

  const minuteOptions = [
    ...new Set([
      ...Array.from(
        { length: Math.max(1, Math.floor(60 / minuteStep)) },
        (_, index) => index * minuteStep,
      ),
      selectedMinute,
    ]),
  ].sort((a, b) => a - b);

  function showPicker() {
    if (disabled) return;
    setViewMonth((current.date || todayKey()).slice(0, 7));
    setOpen((currentOpen) => {
      if (!currentOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const inInspector = Boolean(rootRef.current?.closest(".item-inspector"));
        const width = Math.min(inInspector ? 278 : 318, window.innerWidth - 20);
        const estimatedHeight =
          mode === "datetime" ? 420 : mode === "date" ? 335 : 175;
        const below = rect.bottom + 6;
        const top =
          below + estimatedHeight <= window.innerHeight - 10
            ? below
            : Math.max(10, rect.top - estimatedHeight - 6);
        const left = Math.min(
          Math.max(10, rect.left),
          window.innerWidth - width - 10,
        );
        setPopoverStyle({
          position: "fixed",
          top,
          right: "auto",
          bottom: "auto",
          left,
          width,
        });
      }
      return true;
    });
  }

  function commitText() {
    const parsed = parseTemporalText(text, mode, new Date(), value);
    if (parsed === null) return false;
    onChange(parsed);
    setText(formatTemporalText(parsed, mode));
    return true;
  }

  function moveMonth(amount: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1, 12);
    setViewMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  function chooseDate(date: string) {
    const next = joinValue(mode, date, selectedTime);
    onChange(next);
    setText(formatTemporalText(next, mode));
    if (mode === "date") setOpen(false);
  }

  function chooseTime(hour: number, minute: number) {
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const next = joinValue(mode, current.date || todayKey(), time);
    onChange(next);
    setText(formatTemporalText(next, mode));
  }

  const inputPlaceholder =
    placeholder ||
    (mode === "time"
      ? "e.g. 2 pm"
      : mode === "date"
        ? "e.g. next Saturday"
        : "e.g. next Saturday at 2 pm");

  return (
    <div
      className={`temporal-field ${open ? "is-open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <div
        className="temporal-trigger"
        ref={triggerRef}
        data-required={required || undefined}
      >
        {mode === "time" ? <Clock3 size={13} /> : <CalendarDays size={13} />}
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          placeholder={inputPlaceholder}
          aria-expanded={open}
          aria-invalid={text.trim() !== "" && parsedText === null}
          onFocus={(event) => {
            setEditing(true);
            showPicker();
            event.currentTarget.select();
          }}
          onClick={showPicker}
          onBlur={() => {
            commitText();
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (commitText()) setOpen(false);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setText(formatTemporalText(value, mode));
              setOpen(false);
              event.currentTarget.blur();
            }
          }}
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
          <X size={11} />
        </button>
      )}

      {open && (
        <div
          className="temporal-popover"
          role="dialog"
          aria-label={ariaLabel || "Choose date and time"}
          style={popoverStyle}
        >
          <div
            className={`temporal-language-preview ${
              text.trim() && parsedText === null ? "is-invalid" : ""
            }`}
          >
            <span>{parsedText === null ? "Couldn’t understand" : "Interpreted as"}</span>
            <strong>
              {parsedText === null
                ? "Try ‘next Saturday at 2 pm’"
                : formatTemporalText(parsedText, mode) || "No date selected"}
            </strong>
          </div>
          {mode !== "time" && (
            <section className="temporal-calendar">
              <header>
                <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
                  <ChevronLeft size={14} />
                </button>
                <strong>
                  {MONTHS[month.getMonth()]} {month.getFullYear()}
                </strong>
                <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
                  <ChevronRight size={14} />
                </button>
              </header>
              <div className="temporal-weekdays">
                {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="temporal-days">
                {calendarDays.map((day) => (
                  <button
                    className={`${day.outside ? "outside" : ""} ${day.key === current.date ? "selected" : ""} ${day.key === todayKey() ? "today" : ""}`}
                    type="button"
                    key={day.key}
                    onClick={() => chooseDate(day.key)}
                  >
                    {day.day}
                  </button>
                ))}
              </div>
            </section>
          )}

          {mode !== "date" && (
            <section className="temporal-time">
              <div className="temporal-time-controls">
                <label>
                  <span>Hour</span>
                  <select
                    aria-label="Hour"
                    value={selectedHour}
                    onChange={(event) =>
                      chooseTime(Number(event.target.value), selectedMinute || 0)
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option value={hour} key={hour}>
                        {String(hour).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
                <strong>:</strong>
                <label>
                  <span>Minute</span>
                  <select
                    aria-label="Minute"
                    value={selectedMinute}
                    onChange={(event) =>
                      chooseTime(selectedHour || 0, Number(event.target.value))
                    }
                  >
                    {minuteOptions.map((minute) => (
                      <option value={minute} key={minute}>
                        {String(minute).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          {mode !== "date" && (
            <footer>
              <button type="button" onClick={() => setOpen(false)}>Done</button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
