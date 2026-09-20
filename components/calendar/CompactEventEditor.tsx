"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  dateKey,
  durationMinutes,
  type CalendarItem,
  type TaskContext,
} from "../../lib/calendar-engine.ts";
import {
  ENERGY_USAGE_LABELS,
  isClassEvent,
  localTime,
  snapEventMinutes,
  SCHOOL_PERIODS,
  type EditorOptions,
} from "../../lib/calendar/interactions.ts";
import { fromLocalInput } from "../../lib/calendar/time-inputs.ts";
import type { SchoolClass, Subject } from "../../lib/school.ts";

import {
  dateInputValue,
  isSameDay,
  localDatePart,
  localTimePart,
  monthGrid,
} from "./date-parts.ts";
import { CompactTimePicker } from "./CompactTimePicker.tsx";

export function CompactEventEditor({
  item,
  creating,
  anchor,
  subjects,
  classes,
  occurrences,
  onSave,
  onClose,
  onDelete,
  onNaturalEdit,
}: {
  item: CalendarItem;
  creating: boolean;
  anchor: DOMRect | null;
  subjects: Subject[];
  classes: SchoolClass[];
  occurrences: CalendarItem[];
  onSave: (item: CalendarItem, options: EditorOptions) => Promise<CalendarItem>;
  onClose: () => void;
  onDelete: (item: CalendarItem) => void;
  onNaturalEdit: (
    text: string,
    item: CalendarItem,
    options: EditorOptions,
  ) => Promise<{ item: CalendarItem; options: EditorOptions }>;
}) {
  const [draft, setDraft] = useState(item);
  const [options, setOptions] = useState<EditorOptions>(() => {
    const lesson = classes.find((entry) => entry.id === item.classId);
    return {
      isClass: isClassEvent(item),
      repeat: lesson
        ? lesson.validUntil === lesson.validFrom
          ? "once"
          : lesson.weekPattern
        : "once",
      scope: "occurrence",
    };
  });
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [armed, setArmed] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [isNew, setIsNew] = useState(creating);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(item.startsAt ?? new Date()),
  );
  const panel = useRef<HTMLFormElement>(null);
  const saved = useRef(item);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    const place = () => {
      const width = Math.min(376, window.innerWidth - 24);
      const height = panel.current?.offsetHeight ?? 440;
      const left = anchor
        ? anchor.right + 12 + width < window.innerWidth
          ? anchor.right + 12
          : anchor.left - width - 12
        : (window.innerWidth - width) / 2;
      setPosition({
        left: Math.max(12, Math.min(window.innerWidth - width - 12, left)),
        top: Math.max(
          12,
          Math.min(window.innerHeight - height - 12, anchor?.top ?? 100),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLInputElement>(".compact-natural input")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      previous?.focus?.();
    };
  }, [onClose]);

  async function commit(next = draft, nextOptions = options) {
    if (!next.title.trim()) {
      setError("Give this a title first.");
      return false;
    }
    if (
      next.startsAt &&
      next.endsAt &&
      new Date(next.endsAt) <= new Date(next.startsAt)
    ) {
      setError("End time must be after start time.");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const result = await onSave(next, nextOptions);
      saved.current = result;
      if (alive.current) {
        setDraft(result);
        setIsNew(false);
        setPulse((value) => value + 1);
      }
      return true;
    } catch (error) {
      if (alive.current)
        setError(
          error instanceof Error ? error.message : "Could not save. Try again.",
        );
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function change(patch: Partial<CalendarItem>, immediate = true) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setArmed(false);
    if (!isNew && immediate) void commit(next);
  }
  function changeOptions(
    patch: Partial<EditorOptions>,
    patchItem: Partial<CalendarItem> = {},
  ) {
    setArmed(false);
    const nextOptions = { ...options, ...patch };
    let next = { ...draft, ...patchItem };
    if (patch.isClass && !options.isClass && next.startsAt) {
      const start = new Date(next.startsAt);
      const snap = snapEventMinutes(
        start.getHours() * 60 + start.getMinutes(),
        Math.max(5, durationMinutes(next)),
        true,
      );
      start.setHours(Math.floor(snap.start / 60), snap.start % 60, 0, 0);
      next = {
        ...next,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + snap.duration * 60000).toISOString(),
      };
    }
    setOptions(nextOptions);
    setDraft(next);
    if (!isNew) void commit(next, nextOptions);
  }
  async function applyNatural() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onNaturalEdit(instruction.trim(), draft, options);
      setDraft(result.item);
      setOptions(result.options);
      if (await commit(result.item, result.options)) setInstruction("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Try a more specific change.",
      );
    } finally {
      setBusy(false);
    }
  }
  const linked = occurrences.filter(
    (entry) => entry.subjectId === draft.subjectId,
  );
  const today = new Date().toISOString();
  const updateStart = (date: string, time: string) => {
    // An unscheduled item has no date yet, so `date` arrives empty and
    // `${date}T${time}` is an unparseable "T14:30". Picking a time is the
    // gesture that schedules such an item, and the day it lands on is the one
    // the editor is already showing.
    const startsAt = fromLocalInput(`${date || localDatePart(today)}T${time}`);
    if (!startsAt) return;
    change({
      startsAt,
      endsAt: new Date(
        new Date(startsAt).getTime() +
          Math.max(5, durationMinutes(draft)) * 60000,
      ).toISOString(),
      status: "scheduled",
    });
  };
  const selectedDate = draft.startsAt ? new Date(draft.startsAt) : new Date();
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(selectedDate);
  return (
    <form
      ref={panel}
      className="compact-event-editor"
      role="dialog"
      aria-label={isNew ? "Create event" : "Edit event"}
      aria-busy={busy}
      style={position}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          !event.target.closest(".compact-natural")
        ) {
          event.preventDefault();
          event.target.blur();
        }
      }}
    >
      <header className="compact-editor-header">
        <div className="compact-kind-toggle" aria-label="Event type">
          <button
            type="button"
            aria-pressed={!options.isClass}
            onClick={() =>
              changeOptions({ isClass: false }, { flexibility: "flexible" })
            }
          >
            Event
          </button>
          <button
            type="button"
            aria-pressed={options.isClass}
            onClick={() =>
              changeOptions(
                { isClass: true, repeat: isNew ? "every" : "once" },
                { kind: "event", taskContext: "school", flexibility: "fixed" },
              )
            }
          >
            Class
          </button>
        </div>
        <button
          className="compact-close"
          type="button"
          aria-label="Close editor"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="compact-natural">
        <input
          aria-label="Describe an event change"
          placeholder="Move to Friday at 3pm…"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void applyNatural();
            }
          }}
        />
        <button
          type="button"
          aria-label="Apply instruction"
          disabled={busy || !instruction.trim()}
          onClick={() => void applyNatural()}
        >
          <ArrowUp size={16} />
        </button>
      </div>
      <input
        className="compact-event-title"
        aria-label={options.isClass ? "Class subject" : "Event title"}
        list={options.isClass ? "compact-subjects" : undefined}
        placeholder={
          options.isClass ? "Choose or create subject" : "Event title"
        }
        value={draft.title}
        onChange={(event) => change({ title: event.target.value }, false)}
        onBlur={() => {
          const subject = subjects.find(
            (entry) =>
              entry.name.toLowerCase() === draft.title.trim().toLowerCase() ||
              entry.shortName.toLowerCase() ===
                draft.title.trim().toLowerCase(),
          );
          const next = options.isClass
            ? {
                ...draft,
                subjectId: subject?.id ?? null,
                room: draft.room || subject?.room || "",
              }
            : draft;
          setDraft(next);
          if (!isNew && JSON.stringify(next) !== JSON.stringify(saved.current))
            void commit(next);
        }}
      />
      <datalist id="compact-subjects">
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.name} />
        ))}
      </datalist>
      <fieldset
        disabled={busy}
        data-save-pulse={pulse % 2}
        className={`compact-field-grid ${pulse ? "did-save" : ""}`}
      >
        <div className="compact-field compact-when-field">
          <span>When</span>
          <div className="compact-when-controls">
            <div className="compact-date-picker">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={datePickerOpen}
                onClick={() => {
                  setVisibleMonth(selectedDate);
                  setDatePickerOpen((open) => !open);
                }}
              >
                <CalendarDays size={13} />
                {dateLabel}
              </button>
              {datePickerOpen && (
                <div
                  className="compact-date-popover"
                  role="dialog"
                  aria-label="Choose event date"
                >
                  <header>
                    <button
                      type="button"
                      aria-label="Previous month"
                      onClick={() =>
                        setVisibleMonth(
                          (month) =>
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                            ),
                        )
                      }
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <strong>
                      {new Intl.DateTimeFormat("en-GB", {
                        month: "long",
                        year: "numeric",
                      }).format(visibleMonth)}
                    </strong>
                    <button
                      type="button"
                      aria-label="Next month"
                      onClick={() =>
                        setVisibleMonth(
                          (month) =>
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                            ),
                        )
                      }
                    >
                      <ChevronRight size={15} />
                    </button>
                  </header>
                  <div className="compact-date-weekdays" aria-hidden="true">
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                      <span key={`${day}-${index}`}>{day}</span>
                    ))}
                  </div>
                  <div className="compact-date-days">
                    {monthGrid(visibleMonth).map((day) => {
                      const selected = isSameDay(day, selectedDate);
                      const today = isSameDay(day, new Date());
                      return (
                        <button
                          type="button"
                          key={dateInputValue(day)}
                          data-selected={selected}
                          data-outside={
                            day.getMonth() !== visibleMonth.getMonth()
                          }
                          aria-pressed={selected}
                          aria-label={new Intl.DateTimeFormat("en-GB", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }).format(day)}
                          onClick={() => {
                            updateStart(
                              dateInputValue(day),
                              localTimePart(draft.startsAt),
                            );
                            setDatePickerOpen(false);
                          }}
                        >
                          {today ? <i /> : null}
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <CompactTimePicker
              label="Starts"
              value={localTimePart(draft.startsAt)}
              onChange={(time) =>
                updateStart(localDatePart(draft.startsAt), time)
              }
            />
            <CompactTimePicker
              label="Ends"
              value={localTimePart(draft.endsAt)}
              onChange={(time) => {
                const endsAt = fromLocalInput(
                  `${localDatePart(draft.endsAt) || localDatePart(draft.startsAt) || localDatePart(today)}T${time}`,
                );
                if (endsAt) change({ endsAt });
              }}
            />
          </div>
        </div>
        <div className="compact-field">
          <label htmlFor="event-context">Location</label>
          <select
            id="event-context"
            value={draft.taskContext}
            onChange={(event) =>
              change({ taskContext: event.target.value as TaskContext })
            }
          >
            {["school", "home", "city", "library", "anywhere"].map(
              (context) => (
                <option key={context} value={context}>
                  {context[0].toUpperCase() + context.slice(1)}
                </option>
              ),
            )}
          </select>
          <input
            aria-label="Location details"
            maxLength={80}
            placeholder={
              draft.taskContext === "school" ? "Room, e.g. G4" : "Add a place"
            }
            value={draft.room}
            onChange={(event) => change({ room: event.target.value }, false)}
            onBlur={() => {
              if (!isNew && draft.room !== saved.current.room) void commit();
            }}
          />
        </div>
        <div className="compact-field">
          <label htmlFor="event-energy">
            Energy · {ENERGY_USAGE_LABELS[(draft.energyUsage ?? 3) - 1]}
          </label>
          <div
            className="energy-five"
            style={
              {
                "--energy-fill": `${(draft.energyUsage ?? 3) * 20}%`,
              } as React.CSSProperties
            }
          >
            <div className="energy-segments" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((level) => (
                <i
                  key={level}
                  data-filled={level <= (draft.energyUsage ?? 3)}
                />
              ))}
            </div>
            <input
              id="event-energy"
              type="range"
              min="1"
              max="5"
              step="1"
              value={draft.energyUsage ?? 3}
              aria-valuetext={ENERGY_USAGE_LABELS[(draft.energyUsage ?? 3) - 1]}
              onChange={(event) =>
                change(
                  {
                    energyUsage: Number(event.target.value),
                    requiredEnergy:
                      Number(event.target.value) <= 2
                        ? "low"
                        : Number(event.target.value) >= 4
                          ? "high"
                          : "medium",
                  },
                  false,
                )
              }
              onPointerUp={() => {
                if (!isNew) void commit();
              }}
              onBlur={() => {
                if (
                  !isNew &&
                  !busy &&
                  draft.energyUsage !== saved.current.energyUsage
                )
                  void commit();
              }}
            />
          </div>
          <small>Drag or tap to set level</small>
        </div>
        {options.isClass && (
          <div className="compact-field">
            <span>Repeats</span>
            <select
              aria-label="Class recurrence"
              value={options.repeat}
              onChange={(event) =>
                changeOptions({
                  repeat: event.target.value as EditorOptions["repeat"],
                  scope: "future",
                })
              }
            >
              <option value="once">Once</option>
              <option value="every">Weekly</option>
              <option value="a">Week A</option>
              <option value="b">Week B</option>
            </select>
            {draft.classId && options.repeat !== "once" && (
              <select
                aria-label="Apply class edits to"
                value={options.scope}
                onChange={(event) =>
                  setOptions({
                    ...options,
                    scope: event.target.value as EditorOptions["scope"],
                  })
                }
              >
                <option value="occurrence">This class only</option>
                <option value="future">This & future classes</option>
              </select>
            )}
          </div>
        )}
      </fieldset>
      {options.isClass && (
        <details className="compact-extra">
          <summary>School periods</summary>
          <div className="class-period-shortcuts">
            {SCHOOL_PERIODS.map(([start, end]) => (
              <button
                type="button"
                key={start}
                onClick={() => {
                  const date = new Date(draft.startsAt ?? new Date());
                  date.setHours(Math.floor(start / 60), start % 60, 0, 0);
                  const finish = new Date(date);
                  finish.setHours(Math.floor(end / 60), end % 60, 0, 0);
                  change({
                    startsAt: date.toISOString(),
                    endsAt: finish.toISOString(),
                    durationMin: end - start,
                    durationMax: end - start,
                    status: "scheduled",
                  });
                }}
              >{`${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")}–${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`}</button>
            ))}
          </div>
        </details>
      )}
      {!options.isClass && draft.kind === "task" && (
        <section className="compact-homework-link">
          <div>
            <span>Homework</span>
            <button
              className="compact-complete"
              type="button"
              onClick={() =>
                change({
                  status:
                    draft.status === "completed"
                      ? draft.startsAt
                        ? "scheduled"
                        : "inbox"
                      : "completed",
                })
              }
            >
              <Check size={13} />
              {draft.status === "completed" ? "Completed" : "Mark complete"}
            </button>
          </div>
          <label>
            <span className="sr-only">Subject</span>
            <select
              aria-label="Homework subject"
              value={draft.subjectId ?? ""}
              onChange={(event) =>
                change({
                  subjectId: event.target.value || null,
                  linkedClassId: null,
                  linkedOccurrenceDate: null,
                })
              }
            >
              <option value="">Connect to a subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          {draft.subjectId && (
            <select
              aria-label="Homework class occurrence"
              value={
                draft.linkedClassId
                  ? `${draft.linkedClassId}|${draft.linkedOccurrenceDate}`
                  : ""
              }
              onChange={(event) => {
                const [classId, day] = event.target.value.split("|");
                change({
                  linkedClassId: classId || null,
                  linkedOccurrenceDate: day || null,
                });
              }}
            >
              <option value="">Subject only</option>
              {linked.map((entry) => (
                <option
                  key={entry.id}
                  value={`${entry.classId}|${entry.occurrenceDate}`}
                >
                  {dateKey(new Date(entry.startsAt!))} ·{" "}
                  {localTime(new Date(entry.startsAt!))}
                </option>
              ))}
            </select>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="compact-editor-error">
          {error}
        </p>
      )}
      <footer>
        <span role="status">{busy ? "Saving…" : ""}</span>
        {isNew ? (
          <button
            className="compact-create"
            type="submit"
            disabled={busy || !draft.title.trim()}
          >
            Create {options.isClass ? "class" : "event"}
          </button>
        ) : (
          <button
            className="compact-delete"
            type="button"
            disabled={busy}
            onClick={() => {
              if (armed) onDelete(draft);
              else setArmed(true);
            }}
          >
            {armed ? "Confirm delete" : "Delete"}
          </button>
        )}
      </footer>
    </form>
  );
}
