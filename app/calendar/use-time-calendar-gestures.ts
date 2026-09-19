import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { timeAtOffset } from "@/app/calendar-geometry";
import {
  dateFromKey,
  dateKey,
  durationMinutes,
  type CalendarItem,
} from "@/lib/calendar-engine";
import { isClassEvent, snapEventMinutes } from "@/lib/calendar/interactions";

type GestureParams = {
  days: Date[];
  rowHeight: number;
  /** Width of the hour axis, subtracted when mapping a pointer to a column. */
  axisWidth: number;
  compact: boolean;
  touchMode: boolean;
  calendarRef: RefObject<HTMLElement | null>;
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
  onDesktopMoveStateChange?: (isMoving: boolean) => void;
};

/**
 * Every direct-manipulation gesture on the time grid: dragging out a new
 * event, moving an existing one, and dragging a multi-day span.
 *
 * Touch and mouse are handled separately rather than through pointer events
 * alone. A touch gesture has to wait on a long-press before it commits, and
 * must block page scrolling for its duration, so the two need different state
 * machines. Each family exposes begin/move/finish/cancel, and every commit
 * goes through the `on*` callbacks — this hook previews, it never writes.
 *
 * The `suppress*Until` refs exist because finishing a gesture also synthesises
 * a click; the view checks them to ignore that click.
 */
export function useTimeCalendarGestures({
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
}: GestureParams) {
  const [creationRange, setCreationRange] = useState<{
    day: string;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const creationGesture = useRef<{
    day: string;
    anchorMinute: number;
    moved: boolean;
  } | null>(null);
  const mobileCreationGesture = useRef<{
    day: string;
    anchorMinute: number;
    currentMinute: number;
    startX: number;
    startY: number;
    activated: boolean;
    timer: number;
  } | null>(null);
  const mobileCreationScrollBlocker = useRef<
    ((event: globalThis.TouchEvent) => void) | null
  >(null);
  const [mobileMovePreview, setMobileMovePreview] = useState<{
    id: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const [desktopMovePreview, setDesktopMovePreview] = useState<{
    item: CalendarItem;
    day: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const desktopMoveGesture = useRef<{
    item: CalendarItem;
    pointerId: number;
    startX: number;
    startY: number;
    grabOffsetMinutes: number;
    active: boolean;
    preview: {
      day: string;
      startsAt: string;
      endsAt: string;
    } | null;
  } | null>(null);
  const suppressDesktopMoveClickUntil = useRef(0);
  const mobileMoveGesture = useRef<{
    item: CalendarItem;
    day: string;
    grabOffsetMinutes: number;
    currentStartMinute: number;
    startX: number;
    startY: number;
    activated: boolean;
    timer: number;
  } | null>(null);
  const suppressMobileMoveClickUntil = useRef(0);
  const suppressCreateClick = useRef(false);
  const [spanCreation, setSpanCreation] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const spanCreationGesture = useRef<{
    anchorIndex: number;
  } | null>(null);

  useEffect(
    () => () => {
      const gesture = mobileCreationGesture.current;
      if (gesture) window.clearTimeout(gesture.timer);
      const moveGesture = mobileMoveGesture.current;
      if (moveGesture) window.clearTimeout(moveGesture.timer);
      const blocker = mobileCreationScrollBlocker.current;
      if (blocker) document.removeEventListener("touchmove", blocker);
    },
    [],
  );

  function minuteFromClientY(element: HTMLElement, clientY: number) {
    const column = element.closest<HTMLElement>(".day-column");
    if (!column) return 0;
    const rect = column.getBoundingClientRect();
    const time = timeAtOffset(clientY - rect.top, rowHeight);
    return time.hour * 60 + time.minute;
  }

  function minuteFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    return minuteFromClientY(event.currentTarget, event.clientY);
  }

  function clearMobileCreation(clearSelection = true) {
    const gesture = mobileCreationGesture.current;
    if (gesture) window.clearTimeout(gesture.timer);
    mobileCreationGesture.current = null;
    unlockMobileCreationScroll();
    if (clearSelection) setCreationRange(null);
  }

  function clearMobileMove(clearPreview = true) {
    const gesture = mobileMoveGesture.current;
    if (gesture) window.clearTimeout(gesture.timer);
    mobileMoveGesture.current = null;
    unlockMobileCreationScroll();
    if (clearPreview) setMobileMovePreview(null);
  }

  function clearDesktopMove(clearPreview = true) {
    const wasActive = desktopMoveGesture.current?.active;
    desktopMoveGesture.current = null;
    if (clearPreview) setDesktopMovePreview(null);
    if (wasActive) onDesktopMoveStateChange?.(false);
  }

  function desktopMovePosition(
    gesture: NonNullable<typeof desktopMoveGesture.current>,
    clientX: number,
    clientY: number,
    precise = false,
  ) {
    const body = calendarRef.current?.querySelector<HTMLElement>(".time-body");
    if (!body || days.length === 0) return null;
    const rect = body.getBoundingClientRect();
    const columnsWidth = Math.max(1, rect.width - axisWidth);
    const dayWidth = columnsWidth / days.length;
    const relativeX = Math.max(
      0,
      Math.min(columnsWidth - 1, clientX - rect.left - axisWidth),
    );
    const day = dateKey(days[Math.floor(relativeX / dayWidth)] ?? days[0]);
    const pointerTime = timeAtOffset(
      clientY - rect.top,
      rowHeight,
      precise ? 5 : 15,
    );
    const pointerMinute = pointerTime.hour * 60 + pointerTime.minute;
    const snap = snapEventMinutes(
      pointerMinute - gesture.grabOffsetMinutes,
      Math.max(5, durationMinutes(gesture.item)),
      isClassEvent(gesture.item),
      precise,
    );
    const duration = snap.duration;
    const startMinute = snap.start;
    const start = dateFromKey(day);
    start.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
    return {
      item: gesture.item,
      day,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
    };
  }

  function beginDesktopMove(
    event: ReactPointerEvent<HTMLElement>,
    item: CalendarItem,
  ) {
    if (
      compact ||
      event.pointerType === "touch" ||
      event.button !== 0 ||
      event.shiftKey ||
      (event.target instanceof Element &&
        event.target.closest("button, input, .resize-handle"))
    ) {
      return;
    }
    clearDesktopMove();
    const pointerMinute = minuteFromClientY(event.currentTarget, event.clientY);
    const start = new Date(item.startsAt!);
    desktopMoveGesture.current = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetMinutes:
        pointerMinute - (start.getHours() * 60 + start.getMinutes()),
      active: false,
      preview: null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDesktopEvent(event: ReactPointerEvent<HTMLElement>) {
    const gesture = desktopMoveGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.active) {
      const distance = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      if (distance < 5) return;
      gesture.active = true;
      onDesktopMoveStateChange?.(true);
    }
    event.preventDefault();
    event.stopPropagation();
    const preview = desktopMovePosition(
      gesture,
      event.clientX,
      event.clientY,
      event.altKey,
    );
    if (preview) {
      gesture.preview = {
        day: preview.day,
        startsAt: preview.startsAt,
        endsAt: preview.endsAt,
      };
      setDesktopMovePreview(preview);
    }
  }

  function finishDesktopMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = desktopMoveGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const preview = gesture.preview;
    clearDesktopMove();
    if (!gesture.active || !preview) return;
    event.preventDefault();
    event.stopPropagation();
    suppressDesktopMoveClickUntil.current = event.timeStamp + 500;
    const start = new Date(preview.startsAt);
    onMoveAt(
      gesture.item,
      preview.day,
      start.getHours(),
      start.getMinutes(),
      (new Date(preview.endsAt).getTime() - start.getTime()) / 60000,
    );
  }

  function cancelDesktopMove() {
    clearDesktopMove();
  }

  function lockMobileCreationScroll() {
    if (mobileCreationScrollBlocker.current) return;
    const blocker = (event: globalThis.TouchEvent) => {
      if (
        mobileCreationGesture.current?.activated ||
        mobileMoveGesture.current?.activated
      ) {
        event.preventDefault();
      }
    };
    mobileCreationScrollBlocker.current = blocker;
    document.addEventListener("touchmove", blocker, { passive: false });
  }

  function unlockMobileCreationScroll() {
    const blocker = mobileCreationScrollBlocker.current;
    if (!blocker) return;
    document.removeEventListener("touchmove", blocker);
    mobileCreationScrollBlocker.current = null;
  }

  function beginMobileCreation(
    event: ReactTouchEvent<HTMLButtonElement>,
    day: string,
  ) {
    if (!touchMode || event.touches.length !== 1) return;
    clearMobileMove();
    clearMobileCreation();
    const touch = event.touches[0];
    const button = event.currentTarget;
    const anchorMinute = minuteFromClientY(button, touch.clientY);
    const gesture = {
      day,
      anchorMinute,
      currentMinute: Math.min(24 * 60, anchorMinute + 60),
      startX: touch.clientX,
      startY: touch.clientY,
      activated: false,
      timer: 0,
    };
    gesture.timer = window.setTimeout(() => {
      if (mobileCreationGesture.current !== gesture) return;
      gesture.activated = true;
      lockMobileCreationScroll();
      setCreationRange({
        day,
        startMinute: anchorMinute,
        endMinute: gesture.currentMinute,
      });
      navigator.vibrate?.(10);
    }, 420);
    mobileCreationGesture.current = gesture;
  }

  function moveMobileCreation(event: ReactTouchEvent<HTMLButtonElement>) {
    const gesture = mobileCreationGesture.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    if (!gesture.activated) {
      const distance = Math.hypot(
        touch.clientX - gesture.startX,
        touch.clientY - gesture.startY,
      );
      if (distance > 10) clearMobileCreation();
      return;
    }

    event.preventDefault();
    gesture.currentMinute = minuteFromClientY(
      event.currentTarget,
      touch.clientY,
    );
    const startMinute = Math.min(gesture.anchorMinute, gesture.currentMinute);
    const endMinute = Math.max(
      Math.max(gesture.anchorMinute, gesture.currentMinute),
      Math.min(24 * 60, startMinute + 15),
    );
    setCreationRange({ day: gesture.day, startMinute, endMinute });
  }

  function finishMobileCreation(event: ReactTouchEvent<HTMLButtonElement>) {
    const gesture = mobileCreationGesture.current;
    if (!gesture) return;
    window.clearTimeout(gesture.timer);
    mobileCreationGesture.current = null;
    unlockMobileCreationScroll();
    setCreationRange(null);
    if (!gesture.activated) {
      onCreateAt(
        gesture.day,
        Math.floor(gesture.anchorMinute / 60),
        gesture.anchorMinute % 60,
        60,
      );
      return;
    }

    event.preventDefault();
    const startMinute = Math.min(gesture.anchorMinute, gesture.currentMinute);
    const endMinute = Math.max(
      Math.max(gesture.anchorMinute, gesture.currentMinute),
      Math.min(24 * 60, startMinute + 15),
    );
    onCreateAt(
      gesture.day,
      Math.floor(startMinute / 60),
      startMinute % 60,
      Math.max(15, endMinute - startMinute),
    );
  }

  function setMobileMovePosition(
    gesture: NonNullable<typeof mobileMoveGesture.current>,
    startMinute: number,
  ) {
    const snapped = snapEventMinutes(
      startMinute,
      Math.max(5, durationMinutes(gesture.item)),
      isClassEvent(gesture.item),
    );
    const duration = snapped.duration;
    const boundedStart = snapped.start;
    gesture.currentStartMinute = boundedStart;
    const start = dateFromKey(gesture.day);
    start.setHours(Math.floor(boundedStart / 60), boundedStart % 60, 0, 0);
    setMobileMovePreview({
      id: gesture.item.id,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
    });
  }

  function beginMobileMove(
    event: ReactTouchEvent<HTMLElement>,
    item: CalendarItem,
    day: string,
  ) {
    if (!touchMode || event.touches.length !== 1) {
      return;
    }
    clearMobileCreation();
    clearMobileMove();
    const touch = event.touches[0];
    const touchMinute = minuteFromClientY(event.currentTarget, touch.clientY);
    const start = new Date(item.startsAt!);
    const startMinute = start.getHours() * 60 + start.getMinutes();
    const gesture = {
      item,
      day,
      grabOffsetMinutes: touchMinute - startMinute,
      currentStartMinute: startMinute,
      startX: touch.clientX,
      startY: touch.clientY,
      activated: false,
      timer: 0,
    };
    gesture.timer = window.setTimeout(() => {
      if (mobileMoveGesture.current !== gesture) return;
      gesture.activated = true;
      lockMobileCreationScroll();
      setMobileMovePosition(gesture, startMinute);
      navigator.vibrate?.(10);
    }, 420);
    mobileMoveGesture.current = gesture;
  }

  function moveMobileEvent(event: ReactTouchEvent<HTMLElement>) {
    const gesture = mobileMoveGesture.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    if (!gesture.activated) {
      const distance = Math.hypot(
        touch.clientX - gesture.startX,
        touch.clientY - gesture.startY,
      );
      if (distance > 10) clearMobileMove();
      return;
    }
    event.preventDefault();
    const touchMinute = minuteFromClientY(event.currentTarget, touch.clientY);
    const body = calendarRef.current?.querySelector<HTMLElement>(".time-body");
    if (body && days.length > 1) {
      const rect = body.getBoundingClientRect();
      const index = Math.max(
        0,
        Math.min(
          days.length - 1,
          Math.floor(
            (touch.clientX - rect.left - axisWidth) /
              ((rect.width - axisWidth) / days.length),
          ),
        ),
      );
      gesture.day = dateKey(days[index]);
    }
    const startMinute =
      Math.round((touchMinute - gesture.grabOffsetMinutes) / 15) * 15;
    setMobileMovePosition(gesture, startMinute);
  }

  function finishMobileMove(event: ReactTouchEvent<HTMLElement>) {
    const gesture = mobileMoveGesture.current;
    if (!gesture) return;
    window.clearTimeout(gesture.timer);
    mobileMoveGesture.current = null;
    unlockMobileCreationScroll();
    setMobileMovePreview(null);
    if (!gesture.activated) return;
    event.preventDefault();
    suppressMobileMoveClickUntil.current = event.timeStamp + 500;
    onMoveAt(
      gesture.item,
      gesture.day,
      Math.floor(gesture.currentStartMinute / 60),
      gesture.currentStartMinute % 60,
      mobileMovePreview
        ? (new Date(mobileMovePreview.endsAt).getTime() -
            new Date(mobileMovePreview.startsAt).getTime()) /
            60000
        : undefined,
    );
  }

  function beginCreation(
    event: ReactPointerEvent<HTMLButtonElement>,
    day: string,
  ) {
    if (event.button !== 0 || (touchMode && event.pointerType !== "mouse"))
      return;
    const anchorMinute = minuteFromPointer(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    creationGesture.current = { day, anchorMinute, moved: false };
    setCreationRange({
      day,
      startMinute: anchorMinute,
      endMinute: Math.min(24 * 60, anchorMinute + 15),
    });
  }

  function moveCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    if (touchMode && event.pointerType !== "mouse") return;
    const gesture = creationGesture.current;
    if (!gesture) return;
    const currentMinute = minuteFromPointer(event);
    if (Math.abs(currentMinute - gesture.anchorMinute) >= 15) {
      gesture.moved = true;
    }
    setCreationRange({
      day: gesture.day,
      startMinute: Math.min(gesture.anchorMinute, currentMinute),
      endMinute: Math.max(
        Math.max(gesture.anchorMinute, currentMinute),
        Math.min(24 * 60, Math.min(gesture.anchorMinute, currentMinute) + 15),
      ),
    });
  }

  function finishCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    if (touchMode && event.pointerType !== "mouse") return;
    const gesture = creationGesture.current;
    if (!gesture) return;
    const currentMinute = minuteFromPointer(event);
    creationGesture.current = null;
    setCreationRange(null);
    if (!gesture.moved) return;
    const startMinute = Math.min(gesture.anchorMinute, currentMinute);
    const endMinute = Math.max(gesture.anchorMinute, currentMinute);
    const duration = Math.max(15, endMinute - startMinute);
    suppressCreateClick.current = true;
    window.setTimeout(() => {
      suppressCreateClick.current = false;
    }, 0);
    onCreateAt(
      gesture.day,
      Math.floor(startMinute / 60),
      startMinute % 60,
      duration,
    );
  }

  function cancelCreation() {
    creationGesture.current = null;
    setCreationRange(null);
  }

  function spanIndexFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    return Math.max(
      0,
      Math.min(days.length - 1, Math.floor(ratio * days.length)),
    );
  }

  function beginSpanCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || days.length === 0) return;
    const anchorIndex = spanIndexFromPointer(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    spanCreationGesture.current = { anchorIndex };
    setSpanCreation({ startIndex: anchorIndex, endIndex: anchorIndex });
  }

  function moveSpanCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = spanCreationGesture.current;
    if (!gesture) return;
    const currentIndex = spanIndexFromPointer(event);
    setSpanCreation({
      startIndex: Math.min(gesture.anchorIndex, currentIndex),
      endIndex: Math.max(gesture.anchorIndex, currentIndex),
    });
  }

  function finishSpanCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = spanCreationGesture.current;
    if (!gesture || days.length === 0) return;
    const currentIndex = spanIndexFromPointer(event);
    const startIndex = Math.min(gesture.anchorIndex, currentIndex);
    const endIndex = Math.max(gesture.anchorIndex, currentIndex);
    spanCreationGesture.current = null;
    setSpanCreation(null);
    onCreateSpan(dateKey(days[startIndex]), dateKey(days[endIndex]));
  }

  function cancelSpanCreation() {
    spanCreationGesture.current = null;
    setSpanCreation(null);
  }

  return {
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
  };
}
