"use client";

import { CalendarPlus, ChevronRight, List, Play, Plus, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import { energyLabels, kindLabels, type CalendarItem } from "../../lib/calendar-engine.ts";
import { formatDate, formatRange } from "../../app/calendar-format.ts";

export function UpcomingView({
  items,
  onOpenItem,
  onCreate,
  commandText,
  commandBusy,
  onCommandChange,
  onCommandSubmit,
  onOpenCommand,
  onOpenNow,
}: {
  items: CalendarItem[];
  onOpenItem: (item: CalendarItem) => void;
  onCreate: () => void;
  commandText: string;
  commandBusy: boolean;
  onCommandChange: (value: string) => void;
  onCommandSubmit: (event: FormEvent) => void;
  onOpenCommand: () => void;
  onOpenNow: () => void;
}) {
  return (
    <section className="upcoming-view" aria-label="Five soonest events">
      <form className="upcoming-command" onSubmit={onCommandSubmit}>
        <Sparkles size={17} />
        <input
          value={commandText}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder="Add homework or change your schedule…"
          aria-label="Quick calendar command"
        />
        <button
          className="upcoming-command-expand"
          type="button"
          onClick={onOpenCommand}
          aria-label="Open full command palette"
        >
          ⌘K
        </button>
        <button
          className="upcoming-command-submit"
          type="submit"
          disabled={!commandText.trim() || commandBusy}
        >
          {commandBusy ? "Planning…" : "Preview"}
        </button>
      </form>
      <button className="now-launcher" type="button" onClick={onOpenNow}>
        <span className="now-launcher-icon">
          <Play size={16} fill="currentColor" />
        </span>
        <span>
          <strong>What should I do now?</strong>
          <small>Find the best task for the time and energy you have.</small>
        </span>
        <span className="now-launcher-action">
          Decide now <ChevronRight size={14} />
        </span>
      </button>
      <header>
        <div>
          <span className="micro-label">Upcoming</span>
          <h2>Your next five</h2>
          <p>A focused list of what is scheduled next.</p>
        </div>
        <button type="button" onClick={onCreate}>
          <CalendarPlus size={15} />
          New event
        </button>
      </header>
      {items.length ? (
        <div className="upcoming-list">
          {items.map((item, index) => (
            <button
              className={`upcoming-item energy-${item.energyType} kind-${item.kind} flex-${item.flexibility}`}
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <span className="upcoming-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <time>
                <strong>
                  {formatDate(new Date(item.startsAt!), {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </strong>
                <small>{formatRange(item)}</small>
              </time>
              <i aria-hidden="true" />
              <span className="upcoming-copy">
                <strong>{item.title}</strong>
                <small>
                  {kindLabels[item.kind]} · {energyLabels[item.energyType]}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="upcoming-empty">
          <List size={21} />
          <h3>Nothing scheduled yet</h3>
          <p>Create an event here, or click any time in the calendar.</p>
          <button type="button" onClick={onCreate}>
            <Plus size={14} /> Add the first event
          </button>
        </div>
      )}
    </section>
  );
}
