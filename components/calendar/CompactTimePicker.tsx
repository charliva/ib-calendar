"use client";

import { useState } from "react";

/**
 * A "HH:MM" field that opens two columns of buttons — every hour, and minutes
 * in five-minute steps.
 *
 * Buttons rather than a native time input because this popover is also the
 * touch target on a phone, where stepping a native time control is fiddly.
 */
export function CompactTimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedHour, selectedMinute] = value.split(":").map(Number);
  const selectTime = (hour: number, minute: number) => {
    onChange(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
    setOpen(false);
  };
  return (
    <div className="compact-time-picker">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <b>{value}</b>
      </button>
      {open && (
        <div
          className="compact-time-popover"
          role="dialog"
          aria-label={`${label} time`}
        >
          <div className="compact-time-columns">
            <div>
              <span>Hour</span>
              <div>
                {Array.from({ length: 24 }, (_, hour) => (
                  <button
                    type="button"
                    key={hour}
                    data-selected={hour === selectedHour}
                    onClick={() => selectTime(hour, selectedMinute)}
                  >
                    {String(hour).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>Minute</span>
              <div>
                {Array.from({ length: 12 }, (_, minute) => minute * 5).map(
                  (minute) => (
                    <button
                      type="button"
                      key={minute}
                      data-selected={minute === selectedMinute}
                      onClick={() => selectTime(selectedHour, minute)}
                    >
                      {String(minute).padStart(2, "0")}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
