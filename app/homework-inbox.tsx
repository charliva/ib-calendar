"use client";

import {
  ArrowRight,
  CalendarPlus,
  Check,
  Clock3,
  Inbox,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseHomework } from "@/lib/homework-parser";
import type { HomeworkCapture, Subject } from "@/lib/school";

type Props = {
  open: boolean;
  captures: HomeworkCapture[];
  subjects: Subject[];
  recentSubjects: Subject[];
  onClose: () => void;
  onCapture: (text: string, subjectOverride?: string | null) => void;
  onConvert: (capture: HomeworkCapture) => void;
  onDelete: (capture: HomeworkCapture) => void;
  onDragState: (id: string | null) => void;
  onOpenWeek: () => void;
};

function formatDeadline(value: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function HomeworkInbox({
  open,
  captures,
  subjects,
  recentSubjects,
  onClose,
  onCapture,
  onConvert,
  onDelete,
  onDragState,
  onOpenWeek,
}: Props) {
  const [text, setText] = useState("");
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => parseHomework(text, subjects, new Date(), subjectOverride),
    [subjectOverride, subjects, text],
  );

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    onCapture(text, subjectOverride);
    setText("");
    setSubjectOverride(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function dragStart(event: DragEvent, capture: HomeworkCapture) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/homework-capture", capture.id);
    event.dataTransfer.setData("text/plain", capture.id);
    onDragState(capture.id);
  }

  return (
    <aside className={`homework-dock ${open ? "is-open" : ""}`}>
      <header>
        <div>
          <span className="micro-label">Fast student capture</span>
          <h1>Homework</h1>
        </div>
        <div className="homework-header-actions">
          <kbd>⇧⌘H</kbd>
          <button type="button" onClick={onClose} aria-label="Close homework">
            <X size={16} />
          </button>
        </div>
      </header>

      <form className="homework-capture-form" onSubmit={submit}>
        <div>
          <Plus size={15} />
          <input
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Chemistry pages 52–57 Thursday"
            aria-label="Quick-add homework"
          />
          <kbd>↵</kbd>
        </div>
        {text.trim() && (
          <div className="capture-parse-preview">
            <span className={preview.subjectId ? "detected" : ""}>
              {preview.matched.subject ?? "Subject?"}
            </span>
            <span className={preview.deadline ? "detected" : ""}>
              {preview.deadline
                ? formatDeadline(preview.deadline)
                : "Deadline?"}
            </span>
            <span>{preview.taskType}</span>
            <strong>{preview.estimatedMinutes} min</strong>
          </div>
        )}
      </form>

      {recentSubjects.length > 0 && (
        <section className="recent-subjects">
          <span>Recent</span>
          <div>
            {recentSubjects.slice(0, 6).map((subject) => (
              <button
                className={subjectOverride === subject.id ? "active" : ""}
                type="button"
                key={subject.id}
                onClick={() =>
                  setSubjectOverride((current) =>
                    current === subject.id ? null : subject.id,
                  )
                }
              >
                <i style={{ background: subject.color }} />
                {subject.shortName}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="homework-dock-heading">
        <span>
          <Inbox size={13} /> Inbox
        </span>
        <strong>{captures.length}</strong>
      </div>

      <div className="homework-capture-list">
        {captures.length === 0 ? (
          <div className="homework-empty">
            <Sparkles size={20} />
            <h3>Capture first, organize later</h3>
            <p>
              Type the subject, work, and deadline. The fast parser handles the
              rest locally.
            </p>
          </div>
        ) : (
          captures.map((capture) => {
            const subject = subjects.find(
              (entry) => entry.id === capture.subjectId,
            );
            return (
              <article
                className={`homework-capture status-${capture.status}`}
                key={capture.id}
                draggable
                onDragStart={(event) => dragStart(event, capture)}
                onDragEnd={() => onDragState(null)}
              >
                <i
                  style={{
                    background: subject?.color?.startsWith("#")
                      ? subject.color
                      : "#7f70e8",
                  }}
                />
                <div>
                  <span>
                    {subject?.shortName ?? "No subject"} · {capture.taskType}
                  </span>
                  <strong>{capture.title}</strong>
                  <small>
                    <Clock3 size={10} />
                    {formatDeadline(capture.deadline)} ·{" "}
                    {capture.estimatedMinutes} min
                  </small>
                  {capture.status === "scheduled" && (
                    <em>
                      <Check size={10} /> Scheduled
                    </em>
                  )}
                </div>
                <div className="capture-actions">
                  <button
                    type="button"
                    title="Convert to assignment"
                    onClick={() => onConvert(capture)}
                  >
                    <ArrowRight size={12} /> Assignment
                  </button>
                  <button
                    type="button"
                    title="Delete capture"
                    onClick={() => onDelete(capture)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <footer className="homework-dock-footer">
        <button type="button" onClick={onOpenWeek}>
          <CalendarPlus size={13} />
          Open week to schedule
        </button>
        <span>Drag a capture onto a time</span>
      </footer>
    </aside>
  );
}
