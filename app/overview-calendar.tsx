"use client";

import {
  capacityForDay,
  dateKey,
  isCalendarSpanItem,
  itemOverlapsDay,
  type CalendarItem,
} from "@/lib/calendar-engine";
import { classColorStyle } from "@/app/calendar-ui";
import { formatDate, formatTime } from "@/app/calendar-format";
import type { Subject } from "@/lib/school";
import { isImportedTimetableItem, timetableRoomForItem } from "@/lib/timetable-import";

export function OverviewCalendar({
  anchor,
  months,
  items,
  subjects,
  onSelectDay,
}: {
  anchor: Date;
  months: number;
  items: CalendarItem[];
  subjects: Subject[];
  onSelectDay: (day: string) => void;
}) {
  const firstMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  return (
    <section className={`overview-grid months-${months}`}>
      {Array.from({ length: months }, (_, monthIndex) => {
        const month = new Date(
          firstMonth.getFullYear(),
          firstMonth.getMonth() + monthIndex,
          1,
          12,
        );
        const daysInMonth = new Date(
          month.getFullYear(),
          month.getMonth() + 1,
          0,
        ).getDate();
        const leading = (month.getDay() + 6) % 7;
        const monthItems = items.filter((item) => {
          const inMonth = (value: string | null) => {
            if (!value) return false;
            const date = new Date(value);
            return (
              date.getFullYear() === month.getFullYear() &&
              date.getMonth() === month.getMonth()
            );
          };
          const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
          const monthEnd = new Date(
            month.getFullYear(),
            month.getMonth() + 1,
            1,
          );
          const overlapsMonth = Boolean(
            item.startsAt &&
            item.endsAt &&
            new Date(item.startsAt) < monthEnd &&
            new Date(item.endsAt) > monthStart,
          );
          return overlapsMonth || inMonth(item.deadline);
        });
        const monthDeadlines = monthItems.filter((item) => {
          if (!item.deadline) return false;
          const deadline = new Date(item.deadline);
          return (
            deadline.getFullYear() === month.getFullYear() &&
            deadline.getMonth() === month.getMonth()
          );
        }).length;
        return (
          <article className="month-card" key={dateKey(month)}>
            <header>
              <div>
                <h2>
                  {formatDate(month, {
                    month: "long",
                    year: months === 1 ? "numeric" : undefined,
                  })}
                </h2>
                <span>
                  {monthItems.length} planned
                  {monthDeadlines ? ` · ${monthDeadlines} due` : ""}
                </span>
              </div>
              <div className="month-load-key" aria-label="Daily load key">
                <i />
                <span>load</span>
              </div>
            </header>
            <div className="month-weekdays">
              {"MTWTFSS".split("").map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>
            <div className="month-days">
              {Array.from({ length: leading }, (_, index) => (
                <span key={`empty-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const date = new Date(
                  month.getFullYear(),
                  month.getMonth(),
                  index + 1,
                  12,
                );
                const key = dateKey(date);
                const dayItems = items.filter(
                  (item) =>
                    (item.startsAt &&
                      item.endsAt &&
                      itemOverlapsDay(item, key)) ||
                    (item.deadline && dateKey(new Date(item.deadline)) === key),
                );
                const capacity = capacityForDay(items, key);
                return (
                  <button
                    className={`${key === dateKey(new Date()) ? "today" : ""} ${
                      capacity.load >= 85 ? "overloaded" : ""
                    }`}
                    type="button"
                    key={key}
                    onClick={() => onSelectDay(key)}
                    aria-label={`${formatDate(date, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}, ${dayItems.length} calendar items, ${capacity.load}% load`}
                  >
                    <div className="month-day-heading">
                      <strong>{index + 1}</strong>
                      {capacity.load > 0 && <span>{capacity.load}%</span>}
                    </div>
                    {months === 1 ? (
                      <div className="month-event-list">
                        {dayItems.slice(0, 3).map((item) => (
                          <span
                            className={`month-event energy-${item.energyType} flex-${item.flexibility} ${item.deadline ? "has-deadline" : ""}`}
                            key={`${item.id}-${item.deadline ? "deadline" : "item"}`}
                            style={classColorStyle(item, subjects)}
                          >
                            <i />
                            <time>
                              {item.deadline && !itemOverlapsDay(item, key)
                                ? "Due"
                                : isCalendarSpanItem(item)
                                  ? "Span"
                                  : item.startsAt
                                    ? formatTime(item.startsAt)
                                    : "Due"}
                            </time>
                            <em>
                              {item.title}
                              {isImportedTimetableItem(item) &&
                                timetableRoomForItem(item) && (
                                  <small>
                                    Room {timetableRoomForItem(item)}
                                  </small>
                                )}
                            </em>
                          </span>
                        ))}
                        {dayItems.length > 3 && (
                          <small>+{dayItems.length - 3} more</small>
                        )}
                      </div>
                    ) : (
                      <div className="semester-density">
                        <span
                          style={{ width: `${Math.max(4, capacity.load)}%` }}
                        />
                        <div>
                          {dayItems.slice(0, 4).map((item) => (
                            <i
                              className={`energy-${item.energyType}`}
                              key={`${item.id}-${item.deadline ? "deadline" : "item"}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {dayItems.some((item) => item.deadline) && (
                      <span className="month-deadline-mark" />
                    )}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}
