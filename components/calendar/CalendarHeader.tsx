"use client";

import { ChevronLeft, ChevronRight, GraduationCap, Undo2 } from "lucide-react";
import { TemporalField } from "../../app/ui/temporal-field.tsx";
import { formatDate } from "../../app/calendar-format.ts";
import type { CalendarZoom } from "./CalendarRail.tsx";

export function CalendarHeader({
  zoom,
  anchor,
  anchorDate,
  undoCount,
  onPrevious,
  onNext,
  onToday,
  onAnchorChange,
  onZoomChange,
  onUndo,
}: {
  zoom: CalendarZoom;
  anchor: Date;
  anchorDate: string;
  undoCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onAnchorChange: (value: string) => void;
  onZoomChange: (zoom: CalendarZoom) => void;
  onUndo: () => void;
}) {
  return (
    <header className="calendar-toolbar">
      {zoom === "school" ? (
        <div className="school-toolbar-title">
          <GraduationCap size={15} />
          <strong>School foundation</strong>
        </div>
      ) : (
        <>
          <div className="date-navigation">
            <button
              type="button"
              aria-label="Previous period"
              onClick={onPrevious}
            >
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={onToday}>
              Today
            </button>
            <button type="button" aria-label="Next period" onClick={onNext}>
              <ChevronRight size={16} />
            </button>
            <TemporalField
              className="toolbar-date-jump"
              mode="date"
              value={anchorDate}
              onChange={onAnchorChange}
              required
              ariaLabel="Jump to a date"
            />
            <h2>
              {zoom === "semester"
                ? `${formatDate(anchor, { month: "long" })} – ${formatDate(
                    new Date(
                      anchor.getFullYear(),
                      anchor.getMonth() + 5,
                      1,
                      12,
                    ),
                    { month: "long", year: "numeric" },
                  )}`
                : formatDate(anchor, {
                    month: "long",
                    year: "numeric",
                  })}
            </h2>
          </div>
          <div className="zoom-control" aria-label="Temporal zoom">
            {(
              ["upcoming", "day", "week", "month", "semester"] as const
            ).map((level) => (
              <button
                className={zoom === level ? "active" : ""}
                type="button"
                key={level}
                onClick={() => onZoomChange(level)}
              >
                {level === "upcoming" ? "home" : level}
              </button>
            ))}
          </div>
          <button
            className="undo-button"
            type="button"
            onClick={onUndo}
            disabled={undoCount === 0}
          >
            <Undo2 size={14} /> Undo
          </button>
        </>
      )}
    </header>
  );
}
