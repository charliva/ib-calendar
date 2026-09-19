import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";
import { addDays, dateFromKey, dateKey } from "@/lib/calendar-engine";
import { calendarSwipeDirection, type SwipePoint } from "@/lib/week-swipe";
import type { Zoom } from "@/app/calendar/view-types";

type WeekWheelGesture = {
  totalX: number;
  lastAt: number;
  lockedUntil: number;
};

type CalendarNavigationParams = {
  zoom: Zoom;
  /** The date the current view is built around, already parsed. */
  anchor: Date;
  selectedDay: string;
  isCompact: boolean;
  draggingItemId: string | null;
  calendarSwipeStartRef: RefObject<SwipePoint | null>;
  calendarSwipeLastRef: RefObject<SwipePoint | null>;
  /** Swallows the click a finished swipe would otherwise synthesise. */
  suppressSwipeClickUntilRef: RefObject<number>;
  weekWheelRef: RefObject<WeekWheelGesture>;
  setAnchorDate: (day: string) => void;
  setSelectedDay: (day: string) => void;
};

/**
 * Stepping the calendar forward and back, by button, touch swipe, or trackpad.
 *
 * A swipe is only offered on compact layouts and touch pointers, and never
 * starts on a control that scrolls or drags in its own right, so horizontal
 * scrolling inside the view keeps working. The trackpad path accumulates
 * horizontal delta and then locks briefly, which stops one flick of momentum
 * from skipping several weeks.
 */
export function useCalendarNavigation({
  zoom,
  anchor,
  selectedDay,
  isCompact,
  draggingItemId,
  calendarSwipeStartRef,
  calendarSwipeLastRef,
  suppressSwipeClickUntilRef,
  weekWheelRef,
  setAnchorDate,
  setSelectedDay,
}: CalendarNavigationParams) {
  function moveAnchor(amount: number) {
    const next =
      zoom === "month" || zoom === "semester"
        ? new Date(
            anchor.getFullYear(),
            anchor.getMonth() + amount * (zoom === "semester" ? 6 : 1),
            1,
            12,
          )
        : addDays(anchor, amount * (zoom === "day" ? 1 : 7));
    setAnchorDate(dateKey(next));
    if (zoom === "day") {
      setSelectedDay(dateKey(next));
    } else if (zoom === "week") {
      setSelectedDay(dateKey(addDays(dateFromKey(selectedDay), amount * 7)));
    }
  }

  function canStartCalendarSwipe(target: EventTarget | null) {
    return !(
      target instanceof Element &&
      target.closest(
        "input, textarea, select, [contenteditable='true'], [draggable='true'], .resize-handle, .mobile-date-ribbon, .block-choice-carousel, .overview-grid.months-6, .multi-day-strip, [data-horizontal-scroll]",
      )
    );
  }

  function onCalendarPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (
      !isCompact ||
      !(["day", "week", "month"] as Zoom[]).includes(zoom) ||
      event.pointerType === "mouse" ||
      draggingItemId ||
      event.button !== 0 ||
      !canStartCalendarSwipe(event.target)
    ) {
      calendarSwipeStartRef.current = null;
      return;
    }
    const point = { x: event.clientX, y: event.clientY, at: performance.now() };
    calendarSwipeStartRef.current = point;
    calendarSwipeLastRef.current = point;
  }

  function onCalendarPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const start = calendarSwipeStartRef.current;
    if (!start) return;
    const point = { x: event.clientX, y: event.clientY, at: performance.now() };
    calendarSwipeLastRef.current = point;
    if (
      Math.abs(point.x - start.x) > 12 &&
      Math.abs(point.x - start.x) > Math.abs(point.y - start.y)
    ) {
      event.preventDefault();
    }
  }

  function finishCalendarPointerSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = calendarSwipeStartRef.current;
    const end = calendarSwipeLastRef.current;
    calendarSwipeStartRef.current = null;
    calendarSwipeLastRef.current = null;
    if (!start || !end || draggingItemId) return;
    const direction = calendarSwipeDirection(start, end);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    suppressSwipeClickUntilRef.current = performance.now() + 450;
    moveAnchor(direction);
  }

  function onWeekWheel(event: ReactWheelEvent<HTMLElement>) {
    if (
      zoom !== "week" ||
      draggingItemId ||
      event.ctrlKey ||
      event.metaKey ||
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15
    ) {
      return;
    }
    const gesture = weekWheelRef.current;
    const current = performance.now();
    event.preventDefault();
    if (current < gesture.lockedUntil) return;
    if (current - gesture.lastAt > 180) gesture.totalX = 0;
    gesture.totalX += event.deltaX;
    gesture.lastAt = current;
    if (Math.abs(gesture.totalX) < 80) return;
    const direction = gesture.totalX > 0 ? 1 : -1;
    gesture.totalX = 0;
    gesture.lockedUntil = current + 650;
    moveAnchor(direction);
  }

  return {
    moveAnchor,
    canStartCalendarSwipe,
    onCalendarPointerDown,
    onCalendarPointerMove,
    finishCalendarPointerSwipe,
    onWeekWheel,
  };
}
