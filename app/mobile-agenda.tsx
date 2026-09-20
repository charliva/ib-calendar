"use client";

import { Plus, Sparkles } from "lucide-react";
import {
  classColorStyle,
} from "@/app/calendar-ui";
import {
  formatDate,
  formatRange,
  formatSpan,
  formatTime,
  urgencyClass,
} from "@/app/calendar-format";
import {
  capacityForDay,
  dateFromKey,
  dateKey,
  durationMinutes,
  energyLabels,
  isCalendarSpanItem,
  itemOverlapsDay,
  kindLabels,
  type CalendarItem,
} from "@/lib/calendar-engine";
import type { Subject } from "@/lib/school";
import { isImportedTimetableItem, timetableRoomForItem } from "@/lib/timetable-import";

export function MobileAgenda({
  mode,
  days,
  items,
  subjects,
  selectedDay,
  onSelectDay,
  onOpenItem,
  onQuickCapture,
}: {
  mode: "day" | "week";
  days: Date[];
  items: CalendarItem[];
  subjects: Subject[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onOpenItem: (item: CalendarItem) => void;
  onQuickCapture: () => void;
}) {
  const selectedDate = dateFromKey(selectedDay);
  const scheduled = items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.startsAt &&
        item.endsAt &&
        itemOverlapsDay(item, selectedDay),
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
    );
  const possible = items.filter(
    (item) =>
      item.status === "inbox" &&
      item.windowStart &&
      dateKey(new Date(item.windowStart)) === selectedDay,
  );
  const unscheduled = items
    .filter((item) => item.status === "inbox" && !possible.includes(item))
    .slice(0, 4);
  const capacity = capacityForDay(items, selectedDay);

  return (
    <section className="mobile-agenda">
      <div className="mobile-capture">
        <button type="button" onClick={onQuickCapture}>
          <Plus size={17} />
          <span>What needs time?</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <div className="mobile-date-ribbon">
        {days.map((day) => {
          const key = dateKey(day);
          const dayLoad = capacityForDay(items, key);
          return (
            <button
              className={`${key === selectedDay ? "selected" : ""} ${
                key === dateKey(new Date()) ? "today" : ""
              }`}
              type="button"
              key={key}
              aria-pressed={key === selectedDay}
              onClick={() => onSelectDay(key)}
            >
              <span>{formatDate(day, { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
              <i>
                <b style={{ width: `${dayLoad.load}%` }} />
              </i>
            </button>
          );
        })}
      </div>

      <header className="mobile-agenda-header">
        <div>
          <span className="micro-label">
            {mode === "day" ? "Day" : "Week"} agenda
          </span>
          <h2>
            {formatDate(selectedDate, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
        </div>
        <span>
          {capacity.total ? `${capacity.total} min planned` : "Open day"}
        </span>
      </header>

      <div className="agenda-list">
        {scheduled.length === 0 && (
          <div className="agenda-open-space">
            <span />
            <div>
              <strong>Open time</strong>
              <p>Nothing fixed here. Keep it open or give a task some room.</p>
            </div>
          </div>
        )}
        {scheduled.map((item) => (
          <button
            className={`agenda-item kind-${item.kind} flex-${item.flexibility} energy-${item.energyType} priority-${item.priority} ${urgencyClass(
              item,
            )}`}
            type="button"
            key={item.id}
            style={classColorStyle(item, subjects)}
            onClick={() => onOpenItem(item)}
          >
            <time>
              {isCalendarSpanItem(item) ? "Span" : formatTime(item.startsAt)}
              <small>
                {isCalendarSpanItem(item)
                  ? formatSpan(item)
                  : formatTime(item.endsAt)}
              </small>
            </time>
            <span className="agenda-shape" />
            <div>
              <strong>{item.title}</strong>
              {isImportedTimetableItem(item) && timetableRoomForItem(item) && (
                <span className="calendar-class-room">
                  Room {timetableRoomForItem(item)}
                </span>
              )}
              <small>
                {isCalendarSpanItem(item)
                  ? `${kindLabels[item.kind]} · continues across days`
                  : `${energyLabels[item.energyType]} · ${durationMinutes(item)} min`}
              </small>
            </div>
          </button>
        ))}
      </div>

      {possible.length > 0 && (
        <section className="agenda-possibilities">
          <header>
            <span>Could fit today</span>
            <small>Flexible window</small>
          </header>
          {possible.map((item) => (
            <button
              className={`agenda-possibility energy-${item.energyType}`}
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <span />
              <div>
                <strong>{item.title}</strong>
                <small>{formatRange(item)}</small>
              </div>
              <Sparkles size={14} />
            </button>
          ))}
        </section>
      )}

      {unscheduled.length > 0 && (
        <section className="agenda-unscheduled">
          <header>
            <span>Still unscheduled</span>
            <small>{unscheduled.length}</small>
          </header>
          {unscheduled.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <span className={`energy-${item.energyType}`} />
              <strong>{item.title}</strong>
              <small>{item.durationMin} min</small>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
