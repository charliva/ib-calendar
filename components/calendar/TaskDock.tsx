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
import type { CSSProperties, DragEvent } from "react";
import {
  kindLabels,
  type CalendarItem,
} from "../../lib/calendar-engine.ts";
import {
  formatDate,
  formatTime,
  urgencyClass,
} from "../../app/calendar-format.ts";

export function TaskDock({
  open,
  items,
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
  onClose,
  onFilterChange,
}: {
  open: boolean;
  items: CalendarItem[];
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
  onClose: () => void;
  onFilterChange: (value: string) => void;
}) {
  const hasRanges = items.some(
    (item) => item.status === "inbox" && item.windowStart && item.windowEnd,
  );

  return (
    <aside
      className={`task-dock ${open ? "is-open" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header>
        <div>
          <span className="micro-label">Flexible work</span>
          <h1>Syllabi</h1>
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
                    {kindLabels[item.kind]} · {item.durationMin}
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
