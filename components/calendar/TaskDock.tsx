"use client";

import {
  Cloud,
  CloudOff,
  GripVertical,
  Inbox,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  kindLabels,
  type CalendarItem,
} from "../../lib/calendar-engine.ts";
import {
  formatDate,
  formatTime,
  urgencyClass,
} from "../../app/calendar-format.ts";
import {
  looksLikeHomeworkCommand,
  parseHomework,
  parseReviewSession,
} from "../../lib/homework-parser.ts";
import type { Subject } from "../../lib/school.ts";

export function TaskDock({
  open,
  position,
  items,
  subjects,
  draggingItemId,
  filterText,
  syncing,
  isOnline,
  signedIn,
  userEmail,
  onDrop,
  onDragStart,
  onDragEnd,
  onOpenItem,
  onOpenCommand,
  onQuickCreate,
  onClose,
  onPositionChange,
  onRepositioningChange,
  onFilterChange,
}: {
  open: boolean;
  position: { x: number; y: number };
  items: CalendarItem[];
  subjects: Subject[];
  draggingItemId: string | null;
  filterText: string;
  syncing: boolean;
  isOnline: boolean;
  signedIn: boolean;
  userEmail?: string | null;
  onDrop: (event: DragEvent) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onOpenItem: (item: CalendarItem) => void;
  onOpenCommand: () => void;
  onQuickCreate: (text: string) => void;
  onClose: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRepositioningChange: (isRepositioning: boolean) => void;
  onFilterChange: (value: string) => void;
}) {
  const [captureText, setCaptureText] = useState("");
  const dockRef = useRef<HTMLElement>(null);
  const dockGesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    active: boolean;
  } | null>(null);
  const hasRanges = items.some(
    (item) => item.status === "inbox" && item.windowStart && item.windowEnd,
  );
  const capturePreview = useMemo(() => {
    const text = captureText.trim();
    if (!text) return null;
    const review = parseReviewSession(text, subjects, new Date());
    if (review) {
      return `${review.subjectId ? "Review session" : "Study session"} · ${review.durationMinutes} min`;
    }
    const homework = parseHomework(text, subjects, new Date());
    if (looksLikeHomeworkCommand(text, homework)) {
      return `Homework · ${homework.estimatedMinutes} min${homework.deadline ? " · due set" : ""}`;
    }
    return "Work item · add details later";
  }, [captureText, subjects]);

  function submitQuickCreate(event: FormEvent) {
    event.preventDefault();
    const text = captureText.trim();
    if (!text) return;
    onQuickCreate(text);
    setCaptureText("");
  }

  function positionFor(event: ReactPointerEvent<HTMLElement>) {
    const rect = dockRef.current?.getBoundingClientRect();
    const gesture = dockGesture.current;
    if (!rect || !gesture) return position;
    return {
      x: Math.max(
        64,
        Math.min(
          window.innerWidth - rect.width - 10,
          gesture.originX + event.clientX - gesture.startX,
        ),
      ),
      y: Math.max(
        10,
        Math.min(
          window.innerHeight - rect.height - 10,
          gesture.originY + event.clientY - gesture.startY,
        ),
      ),
    };
  }

  function beginDockMove(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest("button"))
    ) {
      return;
    }
    dockGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      active: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onRepositioningChange(true);
  }

  function moveDock(event: ReactPointerEvent<HTMLElement>) {
    const gesture = dockGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      ) < 12
    ) {
      return;
    }
    gesture.active = true;
    onPositionChange(positionFor(event));
    event.preventDefault();
  }

  function finishDockMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = dockGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.active) onPositionChange(positionFor(event));
    dockGesture.current = null;
    onRepositioningChange(false);
    if (!gesture.active) return;
    event.preventDefault();
  }

  function cancelDockMove() {
    if (!dockGesture.current) return;
    dockGesture.current = null;
    onRepositioningChange(false);
  }

  return (
    <aside
      ref={dockRef}
      className={`task-dock ${open ? "is-open" : ""}`}
      data-tour="task-dock"
      style={
        {
          "--dock-x": `${position.x}px`,
          "--dock-y": `${position.y}px`,
        } as CSSProperties
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header
        className="task-dock-drag-handle"
        aria-label="Drag flexible work panel"
        onPointerDown={beginDockMove}
        onPointerMove={moveDock}
        onPointerUp={finishDockMove}
        onPointerCancel={cancelDockMove}
      >
        <div>
          <span className="micro-label">Flexible work</span>
          <h1>Work queue</h1>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            aria-label="Create calendar item"
            onClick={onOpenCommand}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            aria-label="Close flexible work"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <form className="work-capture" onSubmit={submitQuickCreate}>
        <input
          value={captureText}
          onChange={(event) => setCaptureText(event.target.value)}
          placeholder="Add work…"
          aria-label="Add work"
        />
        <button type="submit" disabled={!captureText.trim()}>
          Add
        </button>
        {capturePreview && <small>{capturePreview}</small>}
      </form>

      <button
        className="command-trigger"
        type="button"
        onClick={onOpenCommand}
      >
        <Search size={15} />
        <span>Create or transform…</span>
        <kbd>⌘K</kbd>
      </button>

      {filterText && (
        <div className="active-filter">
          <Search size={12} />
          <span>{filterText}</span>
          <button
            type="button"
            onClick={() => onFilterChange("")}
            aria-label="Clear filter"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <section className="dock-section">
        <div className="dock-title">
          <span>
            <Inbox size={13} /> Unscheduled
          </span>
          <strong>{items.length}</strong>
        </div>
        <div className="inbox-list">
          {items.length === 0 ? (
            <div className="dock-empty">
              <GripVertical size={18} />
              <p>Tasks and intentions wait here until you give them time.</p>
            </div>
          ) : (
            items.map((item) => (
              <article
                className={`inbox-item energy-${item.energyType} kind-${item.kind} flex-${item.flexibility} priority-${item.priority} ${urgencyClass(item)} ${
                  draggingItemId === item.id ? "is-dragging" : ""
                }`}
                key={item.id}
                draggable={item.flexibility !== "fixed"}
                onDragStart={(event) => onDragStart(event, item)}
                onDragEnd={onDragEnd}
                onClick={() => onOpenItem(item)}
                style={
                  {
                    viewTransitionName: `calendar-item-${item.id}`,
                  } as CSSProperties
                }
              >
                <GripVertical size={14} />
                <div>
                  <span>
                    {item.workItemType === "homework"
                      ? "Homework"
                      : item.workItemType === "review"
                        ? "Review"
                        : kindLabels[item.kind]}{" "}
                    · {item.durationMin}
                    {item.durationMax !== item.durationMin
                      ? `–${item.durationMax}`
                      : ""}{" "}
                    min
                  </span>
                  <h3>{item.title}</h3>
                  {item.windowStart && (
                    <small>
                      Window {formatTime(item.windowStart)}–
                      {formatTime(item.windowEnd)}
                    </small>
                  )}
                </div>
                {item.deadline && (
                  <time>
                    {formatDate(new Date(item.deadline), {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="dock-section intentions">
        <div className="dock-title">
          <span>
            <Sparkles size={13} /> Possibility ranges
          </span>
        </div>
        {hasRanges ? (
          <p className="quiet-copy">
            Dashed ranges on the calendar show where flexible work can fit.
          </p>
        ) : (
          <p className="quiet-copy">
            Try “Study chemistry after school for ~45 min.”
          </p>
        )}
      </section>

      <footer className="dock-sync">
        {isOnline && signedIn ? <Cloud size={14} /> : <CloudOff size={14} />}
        <span>
          <strong>
            {syncing
              ? "Syncing…"
              : signedIn && isOnline
                ? "Synced"
                : "Local first"}
          </strong>
          <small>{signedIn ? userEmail : "Sign in for every device"}</small>
        </span>
      </footer>
    </aside>
  );
}
