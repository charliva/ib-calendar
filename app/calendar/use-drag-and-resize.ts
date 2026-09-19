import type { DragEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  dateKey,
  durationMinutes,
  validatePlacement,
  withResizedDuration,
  type CalendarItem,
} from "@/lib/calendar-engine";
import { isClassEvent, snapEventMinutes } from "@/lib/calendar/interactions";

type DragSnap = { day: string; hour: number; minute: number };

type ResizingState = {
  id: string;
  /** The duration the item would take if the pointer were released now. */
  minutes: number;
  startsAt: string;
  endsAt: string;
} | null;

type DragAndResizeParams = {
  /**
   * Set while a resize is in flight. A resize starts on the same element that
   * owns the drag handle, so drags have to stand down for the duration.
   */
  resizeGestureActive: RefObject<boolean>;
  setDraggingItemId: (id: string | null) => void;
  setDragSnap: (snap: DragSnap | null) => void;
  setResizing: React.Dispatch<React.SetStateAction<ResizingState>>;
  setIsCalendarItemRepositioning: (repositioning: boolean) => void;
  setNotice: (notice: string) => void;
  scheduleAt: (
    itemId: string,
    day: string,
    hour: number,
    minute?: number,
  ) => void;
  unscheduleItem: (itemId: string) => void;
  updateItem: (item: CalendarItem, label: string) => void;
  persistClassOccurrence: (
    item: CalendarItem,
    cancelled?: boolean,
  ) => Promise<void>;
};

/**
 * Moving an item onto the calendar, back to the inbox, and resizing it by its
 * edges.
 *
 * Resizing is driven by raw pointer events rather than HTML drag-and-drop so
 * the new duration can be previewed continuously; the write only happens on
 * pointer-up. A class resized this way is stored as an exception to its
 * recurring lesson, not as an edit to the lesson itself.
 */
export function useDragAndResize({
  resizeGestureActive,
  setDraggingItemId,
  setDragSnap,
  setResizing,
  setIsCalendarItemRepositioning,
  setNotice,
  scheduleAt,
  unscheduleItem,
  updateItem,
  persistClassOccurrence,
}: DragAndResizeParams) {
  function onDragStart(event: DragEvent, item: CalendarItem) {
    if (resizeGestureActive.current || item.flexibility === "fixed") {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/calendar-item", item.id);
    event.dataTransfer.setData("text/plain", item.id);
    const transparentDragImage = document.createElement("span");
    transparentDragImage.style.cssText =
      "position:fixed;top:-10px;left:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(transparentDragImage);
    event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    window.setTimeout(() => transparentDragImage.remove(), 0);
    setDraggingItemId(item.id);
    if (item.startsAt) {
      const start = new Date(item.startsAt);
      setDragSnap({
        day: dateKey(start),
        hour: start.getHours(),
        minute: start.getMinutes(),
      });
    }
  }

  function onCalendarDragOver(
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragSnap({ day, hour, minute });
  }

  function onCalendarDrop(
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) {
    event.preventDefault();
    const itemId =
      event.dataTransfer.getData("text/calendar-item") ||
      event.dataTransfer.getData("text/plain");
    if (itemId) scheduleAt(itemId, day, hour, minute);
    setDraggingItemId(null);
    setDragSnap(null);
  }

  function onInboxDrop(event: DragEvent) {
    event.preventDefault();
    const itemId =
      event.dataTransfer.getData("text/calendar-item") ||
      event.dataTransfer.getData("text/plain");
    if (itemId) unscheduleItem(itemId);
    setDraggingItemId(null);
    setDragSnap(null);
  }

  function endDrag() {
    setDraggingItemId(null);
    setDragSnap(null);
  }

  function beginResize(
    event: ReactPointerEvent,
    item: CalendarItem,
    rowHeight: number,
    edge: "start" | "end",
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!item.startsAt || !item.endsAt) return;

    const calendarBlock =
      event.currentTarget.closest<HTMLElement>(".calendar-block");

    const wasDraggable = calendarBlock?.draggable ?? false;

    if (calendarBlock) {
      calendarBlock.draggable = false;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const originalStart = new Date(item.startsAt);
    const originalEnd = new Date(item.endsAt);
    const original = durationMinutes(item);

    let nextMinutes = original;
    let nextStart = originalStart;
    let nextEnd = originalEnd;

    // Manual resizing shouldn't be restricted by the
    // scheduler's preferred duration range.
    const minimum = 15;
    const maximum = 525_600;

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      const deltaMinutes = ((moveEvent.clientY - startY) / rowHeight) * 60;

      const step = moveEvent.altKey ? 5 : 15;
      nextMinutes =
        edge === "end"
          ? Math.round((original + deltaMinutes) / step) * step
          : Math.round((original - deltaMinutes) / step) * step;

      nextMinutes = Math.max(minimum, Math.min(maximum, nextMinutes));

      nextStart =
        edge === "start"
          ? new Date(originalEnd.getTime() - nextMinutes * 60_000)
          : originalStart;

      nextEnd =
        edge === "end"
          ? new Date(originalStart.getTime() + nextMinutes * 60_000)
          : originalEnd;

      if (isClassEvent(item) && !moveEvent.altKey) {
        const snap = snapEventMinutes(
          nextStart.getHours() * 60 + nextStart.getMinutes(),
          nextMinutes,
          true,
        );
        nextStart = new Date(nextStart);
        nextStart.setHours(Math.floor(snap.start / 60), snap.start % 60, 0, 0);
        nextEnd = new Date(nextStart.getTime() + snap.duration * 60000);
        nextMinutes = snap.duration;
      }

      setResizing({
        id: item.id,
        minutes: nextMinutes,
        startsAt: nextStart.toISOString(),
        endsAt: nextEnd.toISOString(),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (calendarBlock) {
        calendarBlock.draggable = wasDraggable;
      }

      setResizing(null);

      if (nextMinutes === original) return;

      const resizedItem = withResizedDuration(item, nextMinutes);
      const validation = validatePlacement(
        resizedItem,
        nextStart.toISOString(),
        nextEnd.toISOString(),
        [],
        { allowFixedChange: true },
      );

      if (!validation.valid) {
        setNotice(validation.errors[0]);
        return;
      }

      if (item.classId) {
        void persistClassOccurrence({
          ...item,
          startsAt: nextStart.toISOString(),
          endsAt: nextEnd.toISOString(),
        });
        return;
      }
      updateItem(
        {
          ...resizedItem,
          startsAt: nextStart.toISOString(),
          endsAt: nextEnd.toISOString(),
        },
        `Resize “${item.title}”`,
      );
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return {
    onDragStart,
    onCalendarDragOver,
    onCalendarDrop,
    onInboxDrop,
    endDrag,
    beginResize,
  };
}
