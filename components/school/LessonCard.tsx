import { RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import type { ClassException, SchoolClass, Subject } from "@/lib/school";
import { subjectColor } from "./format";

/**
 * One lesson in the timetable grid.
 *
 * A rescheduled lesson shows in two places: greyed in its original slot, and
 * again at its replacement time with `moved` set. Which times to display
 * therefore depends on both the exception and which of the two this is.
 */
export function LessonCard({
  lesson,
  subject,
  exception,
  moved = false,
  onEdit,
  onException,
}: {
  lesson: SchoolClass;
  subject?: Subject;
  exception?: ClassException;
  moved?: boolean;
  onEdit: () => void;
  onException: () => void;
}) {
  const cancelled = exception?.status === "cancelled";
  const rescheduled = exception?.status === "rescheduled";
  const start = moved
    ? exception?.replacementStartTime
    : rescheduled
      ? exception.replacementStartTime
      : lesson.startTime;
  const end = moved
    ? exception?.replacementEndTime
    : rescheduled
      ? exception.replacementEndTime
      : lesson.endTime;
  return (
    <article
      className={`lesson-card ${cancelled ? "is-cancelled" : ""} ${
        rescheduled ? "is-rescheduled" : ""
      }`}
      style={
        {
          "--subject": subjectColor(subject),
        } as CSSProperties
      }
    >
      <button type="button" onClick={onEdit}>
        <span>
          {start}–{end}
        </span>
        <strong>
          {subject?.icon && <i>{subject.icon}</i>}
          {subject?.shortName ?? "Class"}
        </strong>
        <small>
          {cancelled
            ? "Cancelled"
            : rescheduled
              ? `Rescheduled${moved ? "" : " · moved"}`
              : lesson.room || subject?.room || "Room TBD"}
        </small>
      </button>
      <button
        className="lesson-change"
        type="button"
        onClick={onException}
        aria-label="Cancel or reschedule lesson"
      >
        <RotateCcw size={11} />
      </button>
    </article>
  );
}
