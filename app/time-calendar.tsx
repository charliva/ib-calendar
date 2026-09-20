"use client";

import {
  CalendarClock,
  GripVertical,
  Layers3,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import {
  DAY_HOURS,
  hourHeight,
  isInactiveHour,
  itemGeometry,
  overlapLayout,
  timeAtOffset,
  timeOffset,
} from "@/app/calendar-geometry";
import {
  classGlassStyle,
  InlineItemTitle,
  NowLine,
} from "@/app/calendar-ui";
import {
  formatDate,
  formatSpan,
  formatTime,
  urgencyClass,
} from "@/app/calendar-format";
import {
  addDays,
  capacityForDay,
  dateFromKey,
  dateKey,
  durationMinutes,
  isCalendarSpanItem,
  itemOverlapsDay,
  validatePlacement,
  type CalendarItem,
  type CalendarProposal,
} from "@/lib/calendar-engine";
import type { Subject } from "@/lib/school";
import { useTimeCalendarGestures } from "@/app/calendar/use-time-calendar-gestures";
import {
  ENERGY_USAGE_LABELS,
  isClassEvent,
} from "@/lib/calendar/interactions";
import {
  isImportedTimetableItem,
  timetableRoomForItem,
} from "@/lib/timetable-import";

export function TimeCalendar({
  days,
  items,
  subjects,
  proposal,
  rowHeight,
  selectedDay,
  resizing,
  dragSnap,
  draggingItem,
  onSelectDay,
  onDrop,
  onDragOver,
  onOpenItem,
  onRenameItem,
  onResize,
  onCreateAt,
  onCreateSpan,
  onMoveAt,
  compact = false,
  touchMode = compact,
  selectedIds = [],
  onSelectItem,
  onClearSelection,
  onCompleteItem,
  onDesktopMoveStateChange,
}: {
  selectedIds?: string[];
  onSelectItem?: (item: CalendarItem, shift: boolean) => void;
  onClearSelection?: () => void;
  onCompleteItem?: (item: CalendarItem) => void;
  onDesktopMoveStateChange?: (isMoving: boolean) => void;
  days: Date[];
  items: CalendarItem[];
  subjects: Subject[];
  proposal: CalendarProposal | null;
  rowHeight: number;
  selectedDay: string;
  resizing: {
    id: string;
    minutes: number;
    startsAt: string;
    endsAt: string;
  } | null;
  dragSnap: { day: string; hour: number; minute: number } | null;
  draggingItem: CalendarItem | null;
  onSelectDay: (day: string) => void;
  onDrop: (event: DragEvent, day: string, hour: number, minute: number) => void;
  onDragOver: (
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) => void;
  onOpenItem: (item: CalendarItem) => void;
  onRenameItem: (item: CalendarItem, title: string) => void;
  onResize: (
    event: ReactPointerEvent,
    item: CalendarItem,
    rowHeight: number,
    edge: "start" | "end",
  ) => void;
  onCreateAt: (
    day: string,
    hour: number,
    minute: number,
    duration?: number,
  ) => void;
  onCreateSpan: (startDay: string, endDay: string) => void;
  onMoveAt: (
    item: CalendarItem,
    day: string,
    hour: number,
    minute: number,
    duration?: number,
  ) => void;
  compact?: boolean;
  touchMode?: boolean;
}) {
  const hours = DAY_HOURS;
  const calendarRef = useRef<HTMLElement>(null);
  const dayHeadRef = useRef<HTMLDivElement>(null);
  const autoScrolledDayRef = useRef<string | null>(null);
  const axisWidth = compact ? 44 : 52;
  const bodyHeight = hours.reduce(
    (total, hour) => total + hourHeight(hour, rowHeight),
    0,
  );

  const {
    creationRange,
    mobileMovePreview,
    desktopMovePreview,
    spanCreation,
    suppressCreateClick,
    suppressDesktopMoveClickUntil,
    suppressMobileMoveClickUntil,
    minuteFromClientY,
    clearMobileCreation,
    clearMobileMove,
    beginDesktopMove,
    moveDesktopEvent,
    finishDesktopMove,
    cancelDesktopMove,
    beginMobileCreation,
    moveMobileCreation,
    finishMobileCreation,
    beginMobileMove,
    moveMobileEvent,
    finishMobileMove,
    beginCreation,
    moveCreation,
    finishCreation,
    cancelCreation,
    beginSpanCreation,
    moveSpanCreation,
    finishSpanCreation,
    cancelSpanCreation,
  } = useTimeCalendarGestures({
    days,
    rowHeight,
    axisWidth,
    compact,
    touchMode,
    calendarRef,
    onCreateAt,
    onCreateSpan,
    onMoveAt,
    onDesktopMoveStateChange,
  });
  const proposalOrigins = new Set(
    proposal?.changes
      .filter((change) => change.before)
      .map((change) => change.before!.id) ?? [],
  );
  const proposalItems =
    proposal?.changes.flatMap((change) =>
      change.after ? [change.after] : [],
    ) ?? [];
  const spanningItems = items.filter(
    (item) =>
      item.status === "scheduled" &&
      isCalendarSpanItem(item) &&
      days.some((day) => itemOverlapsDay(item, dateKey(day))),
  );
  const proposedSpanningItems = proposalItems.filter(
    (item) =>
      item.status === "scheduled" &&
      isCalendarSpanItem(item) &&
      days.some((day) => itemOverlapsDay(item, dateKey(day))),
  );

  useEffect(() => {
    if (!compact || days.length !== 1) return;
    const day = dateKey(days[0]);
    if (autoScrolledDayRef.current === day) return;
    autoScrolledDayRef.current = day;
    const frame = window.requestAnimationFrame(() => {
      const calendar = calendarRef.current;
      const viewport = calendar?.closest<HTMLElement>(".calendar-stage");
      if (!calendar || !viewport) return;
      const now = new Date();
      const focusHour =
        day === dateKey(now) ? Math.max(6, now.getHours() - 2) : 7;
      viewport.scrollTo({
        top: Math.max(
          0,
          calendar.offsetTop +
            timeOffset(focusHour, 0, rowHeight) -
            Math.min(window.innerHeight * 0.2, 150),
        ),
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compact, days, rowHeight]);


  return (
    <section
      ref={calendarRef}
      className={`time-calendar ${compact ? "mobile-day-calendar" : ""}`}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          !event.target.closest("[data-event-id], .multi-day-item")
        )
          onClearSelection?.();
      }}
      style={{ "--row-height": `${rowHeight}px` } as CSSProperties}
    >
      <div
        className="day-head"
        ref={dayHeadRef}
        style={{
          gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(${compact ? 0 : 110}px, 1fr))`,
        }}
      >
        <span />
        {days.map((day) => {
          const key = dateKey(day);
          const capacity = capacityForDay(items, key);
          return (
            <button
              className={`${key === selectedDay ? "selected" : ""} ${
                key === dateKey(new Date()) ? "today" : ""
              }`}
              type="button"
              key={key}
              aria-pressed={selectedDay === key}
              onClick={() => {
                onSelectDay(key);
              }}
              aria-label={`${formatDate(day, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}`}
            >
              <span>{formatDate(day, { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
              <i>
                <b style={{ width: `${capacity.load}%` }} />
              </i>
            </button>
          );
        })}
      </div>
      <div
        className="multi-day-strip"
        style={{
          gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(${compact ? 0 : 110}px, 1fr))`,
        }}
      >
        <span className="multi-day-label">
          {compact ? "all day" : "add span"}
        </span>
        <button
          type="button"
          className="multi-day-create-surface"
          aria-label={
            compact
              ? "Add an all-day event"
              : "Drag across days to create a multi-day event"
          }
          onPointerDown={beginSpanCreation}
          onPointerMove={moveSpanCreation}
          onPointerUp={finishSpanCreation}
          onPointerCancel={cancelSpanCreation}
          onLostPointerCapture={cancelSpanCreation}
        >
          {compact
            ? "Tap to add an all-day event"
            : "Drag across days to add an event"}
        </button>
        {spanCreation && (
          <span
            className="multi-day-create-selection"
            aria-hidden="true"
            style={{
              gridColumn: `${spanCreation.startIndex + 2} / ${spanCreation.endIndex + 3}`,
            }}
          />
        )}
        {[...spanningItems, ...proposedSpanningItems].map((item, row) => {
          const covered = days
            .map((day, index) =>
              itemOverlapsDay(item, dateKey(day)) ? index : -1,
            )
            .filter((index) => index >= 0);
          const first = covered[0];
          const last = covered.at(-1);
          if (first === undefined || last === undefined) return null;
          const proposed = proposedSpanningItems.includes(item);
          const visibleStart = new Date(days[0]);
          visibleStart.setHours(0, 0, 0, 0);
          const visibleEnd = addDays(days.at(-1) ?? days[0], 1);
          visibleEnd.setHours(0, 0, 0, 0);
          const continuesBefore = new Date(item.startsAt!) < visibleStart;
          const continuesAfter = new Date(item.endsAt!) > visibleEnd;
          return (
            <button
              className={`multi-day-item ${isClassEvent(item) ? "is-class-event" : ""} kind-${item.kind} energy-${item.energyType} flex-${item.flexibility} ${
                proposed ? "proposal-target" : ""
              } ${continuesBefore ? "continues-before" : ""} ${
                continuesAfter ? "continues-after" : ""
              }`}
              type="button"
              key={`${proposed ? "proposal-" : ""}${item.id}`}
              data-event-id={proposed ? undefined : item.id}
              data-selected={selectedIds.includes(item.id)}
              onClick={(event) => {
                if (!proposed) {
                  if (onSelectItem) onSelectItem(item, event.shiftKey);
                  else onOpenItem(item);
                }
              }}
              aria-label={`${item.title}, ${formatSpan(item)}${
                continuesBefore || continuesAfter
                  ? ", continues beyond this week"
                  : ""
              }`}
              style={{
                gridColumn: `${first + 2} / ${last + 3}`,
                gridRow: row + 2,
                ...classGlassStyle(item, subjects),
              }}
            >
              {item.flexibility === "fixed" ? (
                <Lock size={10} />
              ) : (
                <Sparkles size={10} />
              )}
              <InlineItemTitle
                key={item.title}
                item={item}
                onRename={onRenameItem}
              />
              <small>{formatSpan(item)}</small>
            </button>
          );
        })}
      </div>
      <div
        className="time-body"
        style={{
          gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(${compact ? 0 : 110}px, 1fr))`,
          height: `${bodyHeight}px`,
        }}
      >
        <div className="time-axis">
          {hours
            .filter((hour) => hour % 3 === 0)
            .map((hour) => (
              <time
                className={isInactiveHour(hour) ? "inactive" : ""}
                key={hour}
                style={{
                  top: `${Math.max(4, timeOffset(hour, 0, rowHeight) - 6)}px`,
                }}
              >
                {String(hour).padStart(2, "0")}:00
              </time>
            ))}
        </div>
        {days.map((day) => {
          const key = dateKey(day);
          const dayItems = items.filter(
            (item) =>
              item.startsAt &&
              item.endsAt &&
              (item.status === "scheduled" || item.status === "completed") &&
              !isCalendarSpanItem(item) &&
              dateKey(new Date(item.startsAt)) === key,
          );
          const ranges = items.filter(
            (item) =>
              item.status === "inbox" &&
              item.windowStart &&
              item.windowEnd &&
              dateKey(new Date(item.windowStart)) === key,
          );
          const deadlines = items.filter(
            (item) => item.deadline && dateKey(new Date(item.deadline)) === key,
          );
          const proposedDayItems = proposalItems.filter(
            (item) =>
              item.startsAt &&
              item.endsAt &&
              item.status === "scheduled" &&
              !isCalendarSpanItem(item) &&
              dateKey(new Date(item.startsAt)) === key,
          );
          const proposedRanges = proposalItems.filter(
            (item) =>
              item.status === "inbox" &&
              item.windowStart &&
              item.windowEnd &&
              dateKey(new Date(item.windowStart)) === key,
          );
          const layout = overlapLayout(dayItems);
          const columnTime = (event: DragEvent<HTMLDivElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            return timeAtOffset(event.clientY - rect.top, rowHeight);
          };
          let desktopDropPreview: {
            item: CalendarItem;
            top: number;
            height: number;
            startsAt: string;
            endsAt: string;
            valid: boolean;
            reason: string;
          } | null = null;
          const previewSource =
            desktopMovePreview?.day === key
              ? desktopMovePreview
              : !compact && draggingItem && dragSnap?.day === key
                ? (() => {
                    const start = dateFromKey(key);
                    start.setHours(dragSnap.hour, dragSnap.minute, 0, 0);
                    const duration = Math.max(
                      draggingItem.durationMin,
                      durationMinutes(draggingItem),
                    );
                    return {
                      item: draggingItem,
                      day: key,
                      startsAt: start.toISOString(),
                      endsAt: new Date(
                        start.getTime() + duration * 60_000,
                      ).toISOString(),
                    };
                  })()
                : null;
          if (previewSource) {
            const { item: previewItem } = previewSource;
            const candidate = {
              ...previewItem,
              startsAt: previewSource.startsAt,
              endsAt: previewSource.endsAt,
            };
            const validation = validatePlacement(
              { ...previewItem, durationMin: 5, durationMax: 525600 },
              candidate.startsAt,
              candidate.endsAt,
              [],
              { allowFixedChange: true },
            );
            const geometry = itemGeometry(candidate, rowHeight);
            desktopDropPreview = {
              item: candidate,
              ...geometry,
              startsAt: candidate.startsAt,
              endsAt: candidate.endsAt,
              valid: validation.valid,
              reason: validation.errors[0] ?? "Ready to move",
            };
          }
          return (
            <div
              className="day-column"
              key={key}
              onDragOver={(event) => {
                const time = columnTime(event);
                onDragOver(event, key, time.hour, time.minute);
              }}
              onDrop={(event) => {
                const time = columnTime(event);
                onDrop(event, key, time.hour, time.minute);
              }}
            >
              {hours.map((hour) => {
                return (
                  <button
                    className={`time-slot ${hour % 3 === 0 ? "major-hour" : ""} ${
                      isInactiveHour(hour) ? "inactive" : ""
                    }`}
                    type="button"
                    key={hour}
                    aria-label={`Schedule at ${formatDate(day, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })} ${hour}:00`}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      if (touchMode) {
                        event.preventDefault();
                        return;
                      }
                      if (suppressCreateClick.current) {
                        event.preventDefault();
                        return;
                      }
                      if (event.detail !== 0) {
                        onClearSelection?.();
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minute = Math.min(
                        45,
                        Math.round(
                          ((event.clientY - rect.top) / rect.height) * 4,
                        ) * 15,
                      );
                      onCreateAt(key, hour, minute);
                    }}
                    onDoubleClick={(event) => {
                      if (!compact) {
                        const minute = minuteFromClientY(
                          event.currentTarget,
                          event.clientY,
                        );
                        onCreateAt(key, Math.floor(minute / 60), minute % 60);
                      }
                    }}
                    onPointerDown={(event) => beginCreation(event, key)}
                    onPointerMove={moveCreation}
                    onPointerUp={finishCreation}
                    onPointerCancel={cancelCreation}
                    onTouchStart={(event) => beginMobileCreation(event, key)}
                    onTouchMove={moveMobileCreation}
                    onTouchEnd={finishMobileCreation}
                    onTouchCancel={() => clearMobileCreation()}
                    style={{ height: `${hourHeight(hour, rowHeight)}px` }}
                  ></button>
                );
              })}
              {creationRange?.day === key && (
                <div
                  className="creation-selection"
                  style={{
                    top: timeOffset(
                      Math.floor(creationRange.startMinute / 60),
                      creationRange.startMinute % 60,
                      rowHeight,
                    ),
                    height: Math.max(
                      12,
                      timeOffset(
                        Math.floor(creationRange.endMinute / 60),
                        creationRange.endMinute % 60,
                        rowHeight,
                      ) -
                        timeOffset(
                          Math.floor(creationRange.startMinute / 60),
                          creationRange.startMinute % 60,
                          rowHeight,
                        ),
                    ),
                  }}
                >
                  <span>
                    {String(
                      Math.floor(creationRange.startMinute / 60),
                    ).padStart(2, "0")}
                    :{String(creationRange.startMinute % 60).padStart(2, "0")}–
                    {String(Math.floor(creationRange.endMinute / 60)).padStart(
                      2,
                      "0",
                    )}
                    :{String(creationRange.endMinute % 60).padStart(2, "0")}
                  </span>
                </div>
              )}
              {desktopDropPreview && (
                <div
                  className={`calendar-drop-preview ${
                    isClassEvent(desktopDropPreview.item)
                      ? "is-class-event"
                      : ""
                  } ${
                    desktopDropPreview.valid ? "is-valid" : "is-invalid"
                  }`}
                  style={{
                    top: desktopDropPreview.top,
                    height: desktopDropPreview.height,
                    ...classGlassStyle(desktopDropPreview.item, subjects),
                  }}
                  aria-live="polite"
                >
                  <span>
                    {formatTime(desktopDropPreview.startsAt)}–
                    {formatTime(desktopDropPreview.endsAt)}
                  </span>
                  <strong>{desktopDropPreview.item.title}</strong>
                  <small>
                    {desktopDropPreview.valid
                      ? "Release to move"
                      : desktopDropPreview.reason}
                  </small>
                </div>
              )}
              {mobileMovePreview &&
                dayItems.some((item) => item.id === mobileMovePreview.id) &&
                (() => {
                  const original = dayItems.find(
                    (item) => item.id === mobileMovePreview.id,
                  );
                  if (!original) return null;
                  const geometry = itemGeometry(original, rowHeight);
                  return (
                    <div
                      className="mobile-move-origin"
                      style={{ top: geometry.top, height: geometry.height }}
                      aria-hidden="true"
                    >
                      <span>Original</span>
                    </div>
                  );
                })()}
              {ranges.map((item) => {
                const start = new Date(item.windowStart!);
                const end = new Date(item.windowEnd!);
                const top = timeOffset(
                  start.getHours(),
                  start.getMinutes(),
                  rowHeight,
                );
                const endTop =
                  dateKey(start) === dateKey(end)
                    ? timeOffset(end.getHours(), end.getMinutes(), rowHeight)
                    : timeOffset(24, 0, rowHeight);
                const height = Math.max(24, endTop - top);
                return (
                  <button
                    className={`possibility-band energy-${item.energyType} kind-${item.kind}`}
                    type="button"
                    key={item.id}
                    onClick={() => onOpenItem(item)}
                    style={{ top, height }}
                  >
                    <Sparkles size={11} />
                    <span>{item.title}</span>
                  </button>
                );
              })}
              {proposedRanges.map((item) => {
                const start = new Date(item.windowStart!);
                const end = new Date(item.windowEnd!);
                const top = timeOffset(
                  start.getHours(),
                  start.getMinutes(),
                  rowHeight,
                );
                const endTop =
                  dateKey(start) === dateKey(end)
                    ? timeOffset(end.getHours(), end.getMinutes(), rowHeight)
                    : timeOffset(24, 0, rowHeight);
                const height = Math.max(24, endTop - top);
                return (
                  <div
                    className={`possibility-band proposal-target energy-${item.energyType} kind-${item.kind}`}
                    key={`proposal-range-${item.id}`}
                    style={{ top, height }}
                  >
                    <Layers3 size={11} />
                    <span>{item.title}</span>
                  </div>
                );
              })}
              {deadlines.map((item) => {
                const deadline = new Date(item.deadline!);
                const top = timeOffset(
                  deadline.getHours(),
                  deadline.getMinutes(),
                  rowHeight,
                );
                return (
                  <button
                    className="deadline-line"
                    type="button"
                    key={`${item.id}-deadline`}
                    onClick={() => onOpenItem(item)}
                    style={{ top }}
                  >
                    <span>Deadline · {item.title}</span>
                  </button>
                );
              })}
              {dayItems.map((item) => {
                const previewItem =
                  resizing?.id === item.id
                    ? {
                        ...item,
                        startsAt: resizing.startsAt,
                        endsAt: resizing.endsAt,
                      }
                    : mobileMovePreview?.id === item.id
                      ? {
                          ...item,
                          startsAt: mobileMovePreview.startsAt,
                          endsAt: mobileMovePreview.endsAt,
                        }
                      : item;
                const { top, height } = itemGeometry(previewItem, rowHeight);
                const displayHeight = Math.max(24, height - 4);
                const placement = layout.get(item.id) ?? { lane: 0, lanes: 1 };
                const width = 100 / placement.lanes;
                return (
                  <article
                    data-event-id={item.id}
                    aria-pressed={selectedIds.includes(item.id)}
                    data-selected={selectedIds.includes(item.id)}
                    data-completed={item.status === "completed"}
                    data-conflict={placement.lanes > 1}
                    className={`calendar-block ${
                      isClassEvent(item) ? "is-class-event" : ""
                    } ${
                      resizing?.id === item.id ? "is-resizing" : ""
                    } ${
                      mobileMovePreview?.id === item.id
                        ? "is-mobile-moving"
                        : ""
                    } ${
                      desktopMovePreview?.item.id === item.id
                        ? "is-drag-origin"
                        : ""
                    } kind-${item.kind} energy-${item.energyType} flex-${item.flexibility} priority-${item.priority} ${urgencyClass(
                      item,
                    )} ${
                      proposalOrigins.has(item.id) ? "proposal-origin" : ""
                    }`}
                    key={item.id}
                    data-density={
                      displayHeight < 40
                        ? "micro"
                        : displayHeight < 68
                          ? "compact"
                          : displayHeight < 118
                            ? "roomy"
                            : displayHeight < 180
                              ? "tall"
                              : "spacious"
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.title}, ${formatTime(item.startsAt)} to ${formatTime(item.endsAt)}${item.room ? `, Room ${item.room}` : ""}`}
                    onKeyDown={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        if (onSelectItem) onSelectItem(item, event.shiftKey);
                        else onOpenItem(item);
                      }
                    }}
                    data-lanes={Math.min(3, placement.lanes)}
                    onPointerDown={(event) => beginDesktopMove(event, item)}
                    onPointerMove={moveDesktopEvent}
                    onPointerUp={finishDesktopMove}
                    onPointerCancel={cancelDesktopMove}
                    onClick={(event) => {
                      if (
                        event.timeStamp <
                          suppressMobileMoveClickUntil.current ||
                        event.timeStamp < suppressDesktopMoveClickUntil.current
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      event.stopPropagation();
                      if (onSelectItem) onSelectItem(item, event.shiftKey);
                      else onOpenItem(item);
                    }}
                    onTouchStart={(event) => beginMobileMove(event, item, key)}
                    onTouchMove={moveMobileEvent}
                    onTouchEnd={finishMobileMove}
                    onTouchCancel={() => clearMobileMove()}
                    style={
                      {
                        top: top + 2,
                        height: displayHeight,
                        left: `calc(${placement.lane * width}% + 3px)`,
                        right: "auto",
                        width: `calc(${width}% - 6px)`,
                        viewTransitionName: `calendar-item-${item.id}`,
                        ...classGlassStyle(item, subjects),
                      } as CSSProperties
                    }
                  >
                    {!compact &&
                      !isClassEvent(item) &&
                      selectedIds.includes(item.id) && (
                      <button
                        className="resize-handle resize-handle-start"
                        type="button"
                        draggable={false}
                        aria-label={`Extend or shorten the start of ${item.title}`}
                        onDragStart={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) =>
                          onResize(event, item, rowHeight, "start")
                        }
                      />
                    )}
                    <div>
                      {item.flexibility === "fixed" ? (
                        <Lock size={10} />
                      ) : compact ? (
                        <CalendarClock size={10} />
                      ) : (
                        <GripVertical size={10} />
                      )}
                      <time>{formatTime(item.startsAt)}</time>
                    </div>
                    <strong className="event-block-title">
                      {item.status === "completed" ? "✓ " : ""}
                      {item.title}
                    </strong>
                    {item.kind === "task" && (
                      <button
                        type="button"
                        className="event-hover-complete"
                        aria-label={`${item.status === "completed" ? "Reopen" : "Complete"} ${item.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCompleteItem?.(item);
                        }}
                      >
                        ✓
                      </button>
                    )}
                    {item.kind === "task" && item.subjectId && (
                      <span className="homework-subject-label">
                        {
                          subjects.find(
                            (subject) => subject.id === item.subjectId,
                          )?.shortName
                        }
                        {item.linkedOccurrenceDate
                          ? ` · ${item.linkedOccurrenceDate.slice(5)}`
                          : ""}
                      </span>
                    )}
                    {timetableRoomForItem(item) && displayHeight >= 32 && (
                      <span className="calendar-class-room">
                        Room {timetableRoomForItem(item)}
                      </span>
                    )}
                    {mobileMovePreview?.id === item.id && (
                      <span className="mobile-move-time-badge">
                        {formatTime(previewItem.startsAt)}–
                        {formatTime(previewItem.endsAt)}
                      </span>
                    )}
                    <small>
                      {isImportedTimetableItem(item)
                        ? item.description || "Click to edit this period"
                        : `${ENERGY_USAGE_LABELS[(item.energyUsage ?? 3) - 1]}${
                            item.constraints.length
                              ? ` · ${item.constraints.length} constraint${
                                  item.constraints.length === 1 ? "" : "s"
                                }`
                              : ""
                          }`}
                    </small>
                    {!compact &&
                      !isClassEvent(item) &&
                      selectedIds.includes(item.id) && (
                      <button
                        className="resize-handle resize-handle-end"
                        type="button"
                        draggable={false}
                        aria-label={`Extend or shorten the end of ${item.title}`}
                        onDragStart={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) =>
                          onResize(event, item, rowHeight, "end")
                        }
                      />
                    )}
                  </article>
                );
              })}
              {proposedDayItems.map((item) => {
                const { top, height } = itemGeometry(item, rowHeight);
                return (
                  <article
                    className={`calendar-block proposal-target kind-${item.kind} energy-${item.energyType} flex-${item.flexibility}`}
                    key={`proposal-${item.id}`}
                    style={{ top: top + 2, height: Math.max(24, height - 4) }}
                  >
                    <div>
                      <Layers3 size={10} />
                      <time>{formatTime(item.startsAt)}</time>
                    </div>
                    <strong>{item.title}</strong>
                    <small>Proposed position</small>
                  </article>
                );
              })}
            </div>
          );
        })}
        <NowLine days={days} rowHeight={rowHeight} axisWidth={axisWidth} />
      </div>
    </section>
  );
}
