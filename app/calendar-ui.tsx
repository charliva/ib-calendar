"use client";

import { useState, type CSSProperties } from "react";
import { dateKey, type CalendarItem } from "@/lib/calendar-engine";
import {
  isImportedTimetableItem,
  subjectsAreSimilar,
} from "@/lib/timetable-import";
import type { Subject } from "@/lib/school";
import { timeOffset } from "@/app/calendar-geometry";

export function classColorStyle(
  item: CalendarItem,
  subjects: Subject[],
): CSSProperties | undefined {
  if (!item.classId && !isImportedTimetableItem(item)) return undefined;
  const subject = subjects.find(
    (candidate) =>
      candidate.id === item.subjectId ||
      subjectsAreSimilar(
        item.title,
        candidate.name,
        item.title,
        candidate.shortName,
      ),
  );
  const color = subject?.color;
  return color?.startsWith("#")
    ? ({ "--energy": color } as CSSProperties)
    : undefined;
}

export function CalendarFallback() {
  return (
    <div
      aria-hidden="true"
      className="calendar-fallback"
      data-calendar-fallback=""
    />
  );
}

export function InlineItemTitle({
  item,
  onRename,
}: {
  item: CalendarItem;
  onRename: (item: CalendarItem, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);

  function finish() {
    const nextTitle = title.trim();
    if (nextTitle) onRename(item, nextTitle);
    else setTitle(item.title);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        className="inline-item-title-input"
        value={title}
        autoFocus
        aria-label={`Rename ${item.title}`}
        onChange={(event) => setTitle(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setTitle(item.title);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span
      className="inline-item-title"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
    >
      {item.title}
    </span>
  );
}

export function NowLine({
  days,
  rowHeight,
  axisWidth = 52,
}: {
  days: Date[];
  rowHeight: number;
  axisWidth?: number;
}) {
  const now = new Date();
  const dayIndex = days.findIndex((day) => dateKey(day) === dateKey(now));
  if (dayIndex < 0) {
    return null;
  }
  const top = timeOffset(now.getHours(), now.getMinutes(), rowHeight);
  return (
    <div
      className="now-line"
      style={{
        top,
        left: `calc(${axisWidth}px + (100% - ${axisWidth}px) * ${dayIndex} / ${days.length})`,
        width: `calc((100% - ${axisWidth}px) / ${days.length})`,
      }}
    >
      <i />
      <span>now</span>
    </div>
  );
}
