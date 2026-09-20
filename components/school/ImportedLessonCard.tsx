import type { CSSProperties } from "react";
import type { CalendarItem } from "@/lib/calendar-engine";
import type { Subject } from "@/lib/school";
import { subjectColor } from "./format";

/**
 * A lesson that came from a timetable screenshot rather than a recurring
 * class. It is matched to a subject by title so it can borrow that subject's
 * colour, but it stays a plain calendar item.
 */
export function ImportedLessonCard({
  item,
  subjects,
  onOpen,
}: {
  item: CalendarItem;
  subjects: Subject[];
  onOpen: () => void;
}) {
  const normalizedTitle = item.title.toLowerCase();
  const subject = subjects.find(
    (candidate) =>
      normalizedTitle.includes(candidate.name.toLowerCase()) ||
      (candidate.shortName &&
        normalizedTitle.includes(candidate.shortName.toLowerCase())),
  );
  const time = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "";
  return (
    <article
      className="lesson-card is-imported"
      style={{ "--subject": subjectColor(subject) } as CSSProperties}
    >
      <button type="button" onClick={onOpen}>
        <span>
          {time(item.startsAt)}–{time(item.endsAt)}
        </span>
        <strong>
          {subject?.icon && <i>{subject.icon}</i>}
          {subject?.shortName || item.title}
        </strong>
        <small>{item.description || "Screenshot import"}</small>
      </button>
      <span className="lesson-imported-badge">Imported</span>
    </article>
  );
}
