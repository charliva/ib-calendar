import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImageUp,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { CSSProperties, DragEvent, RefObject } from "react";
import {
  addDays,
  dateFromKey,
  dateKey,
  type CalendarItem,
} from "@/lib/calendar-engine";
import type {
  FreePeriod,
  FreePeriodRecommendation,
} from "@/lib/school-day-engine";
import { importedLessonMatchesClass } from "@/lib/timetable-import";
import { classRunsInWeek } from "@/lib/school/week-pattern";
import type { ClassException, SchoolClass, Subject } from "@/lib/school";
import { weekdays } from "@/components/school/constants";
import { displayDate, subjectColor } from "@/components/school/format";
import { LessonCard } from "@/components/school/LessonCard";
import { ImportedLessonCard } from "@/components/school/ImportedLessonCard";
import { SchoolEmpty } from "@/components/school/SchoolEmpty";
import type {
  Editor,
  SchoolTab,
  SchoolWorkspaceProps,
} from "@/components/school/types";

type Props = SchoolWorkspaceProps & {
  subjectFor: (id: string | null) => Subject | undefined;
  openEditor: (next: Editor) => void;
  setEditor: (editor: Editor | null) => void;
  setTab: (tab: SchoolTab) => void;
  weekAnchor: string;
  weekDays: Date[];
  freePeriods: FreePeriod[];
  freePeriodRecommendations: Map<string, FreePeriodRecommendation[]>;
  importedWeekLessons: CalendarItem[];
  timetableDragActive: boolean;
  timetableInputRef: RefObject<HTMLInputElement | null>;
  setWeekAnchor: React.Dispatch<React.SetStateAction<string>>;
  setClassDraft: (schoolClass: SchoolClass | null) => void;
  setExceptionDraft: (exception: ClassException | null) => void;
  openException: (schoolClass: SchoolClass, date?: string) => void;
  enterTimetableDrop: (event: DragEvent<HTMLDivElement>) => void;
  leaveTimetableDrop: (event: DragEvent<HTMLDivElement>) => void;
  dropTimetable: (event: DragEvent<HTMLDivElement>) => void;
};

/**
 * The school week: recurring lessons, one-off changes to them, lessons
 * imported from a screenshot, and the free periods between them.
 *
 * Free periods are detected from the timetable rather than entered, so the
 * recommendations attached to them only ever fill gaps the schedule really has.
 */
export function TimetableTab(props: Props) {
  const {
    subjects,
    classes,
    classExceptions,
    schoolDaySettings,
    weekAnchor,
    weekDays,
    freePeriods,
    freePeriodRecommendations,
    importedWeekLessons,
    timetableDragActive,
    timetableInputRef,
    subjectFor,
    openEditor,
    openException,
    setClassDraft,
    setEditor,
    setExceptionDraft,
    setTab,
    setWeekAnchor,
    enterTimetableDrop,
    leaveTimetableDrop,
    dropTimetable,
  } = props;
  return (
      <>
        <div className="school-section-bar">
          <div className="week-stepper">
            <button
              type="button"
              aria-label="Previous school week"
              onClick={() =>
                setWeekAnchor((current) =>
                  dateKey(addDays(dateFromKey(current), -7)),
                )
              }
              disabled={!weekAnchor}
            >
              <ChevronLeft size={15} />
            </button>
            <strong>
              {weekDays.length
                ? `${displayDate(dateKey(weekDays[0]), false)} – ${displayDate(
                    dateKey(weekDays[4]),
                    false,
                  )}`
                : "This week"}
            </strong>
            <button
              type="button"
              aria-label="Next school week"
              onClick={() =>
                setWeekAnchor((current) =>
                  dateKey(addDays(dateFromKey(current), 7)),
                )
              }
              disabled={!weekAnchor}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => openEditor("school_day")}
          >
            <Clock3 size={14} /> Rules
          </button>
          <button
            className="timetable-import-button"
            data-tour="timetable-import"
            type="button"
            onClick={() => timetableInputRef.current?.click()}
            disabled={!weekAnchor || props.timetableImportBusy}
          >
            <ImageUp size={14} />
            {props.timetableImportBusy ? "Reading…" : "Import week"}
          </button>
          <input
            ref={timetableInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && weekAnchor) {
                props.onImportTimetable(file, weekAnchor);
              }
              event.currentTarget.value = "";
            }}
          />
          <button
            className="school-primary"
            type="button"
            onClick={() => openEditor("class")}
            disabled={subjects.length === 0}
          >
            <Plus size={14} /> Lesson
          </button>
        </div>

        <div
          className={`timetable-import-note timetable-drop-zone ${
            timetableDragActive ? "is-dragging" : ""
          }`}
          role="button"
          tabIndex={0}
          aria-label="Drop a timetable screenshot here or choose one"
          aria-disabled={!weekAnchor || props.timetableImportBusy}
          onClick={() =>
            !props.timetableImportBusy && timetableInputRef.current?.click()
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!props.timetableImportBusy) {
                timetableInputRef.current?.click();
              }
            }
          }}
          onDragEnter={enterTimetableDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={leaveTimetableDrop}
          onDrop={dropTimetable}
        >
          <ImageUp size={15} />
          <span>
            <strong>
              {timetableDragActive
                ? "Drop to read this timetable"
                : "Drop a screenshot here"}
            </strong>{" "}
            Open the week you want, then drop or choose its screenshot.
            You will review every detected lesson before applying it.
          </span>
          {importedWeekLessons.length > 0 && (
            <small>{importedWeekLessons.length} imported this week</small>
          )}
        </div>

        {subjects.length === 0 && importedWeekLessons.length === 0 ? (
          <SchoolEmpty
            icon={BookOpen}
            title="Add a subject first"
            copy="Lessons, assignments, and assessments all connect to a subject."
            action="Add subject"
            onAction={() => {
              setTab("subjects");
              openEditor("subject");
            }}
          />
        ) : classes.length === 0 && importedWeekLessons.length === 0 ? (
          <SchoolEmpty
            icon={CalendarDays}
            title="Your timetable is clear"
            copy="Import this week's screenshot, or add a recurring fallback lesson."
            action="Add lesson"
            onAction={() => openEditor("class")}
          />
        ) : (
          <div className="school-timetable">
            {weekDays.map((day, dayIndex) => {
              const key = dateKey(day);
              const regular = classes
                .filter(
                  (entry) =>
                    entry.weekday === dayIndex + 1 &&
                    key >= entry.validFrom &&
                    (!entry.validUntil || key <= entry.validUntil) &&
                    // A "Week A only" lesson must not be drawn in a B week.
                    // The free-period panel on this same screen already
                    // resolves the fortnight this way, so without it the two
                    // halves of the Timetable tab contradict each other.
                    classRunsInWeek(
                      entry.weekPattern,
                      day,
                      schoolDaySettings.weekPatternAnchor,
                    ) &&
                    !importedWeekLessons.some((item) =>
                      importedLessonMatchesClass(item, entry, key),
                    ),
                )
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              const movedHere = classExceptions.filter(
                (entry) =>
                  entry.status === "rescheduled" &&
                  entry.replacementDate === key &&
                  !regular.some((lesson) => lesson.id === entry.classId),
              );
              const importedHere = importedWeekLessons
                .filter(
                  (item) =>
                    item.startsAt &&
                    dateKey(new Date(item.startsAt)) === key,
                )
                .sort(
                  (a, b) =>
                    new Date(a.startsAt!).getTime() -
                    new Date(b.startsAt!).getTime(),
                );
              return (
                <section className="timetable-day" key={key}>
                  <header>
                    <span>{weekdays[dayIndex].slice(0, 3)}</span>
                    <strong>{day.getDate()}</strong>
                  </header>
                  <div>
                    {regular.map((lesson) => {
                      const subject = subjectFor(lesson.subjectId);
                      const exception = classExceptions.find(
                        (entry) =>
                          entry.classId === lesson.id &&
                          entry.occurrenceDate === key,
                      );
                      return (
                        <LessonCard
                          key={lesson.id}
                          lesson={lesson}
                          subject={subject}
                          exception={exception}
                          onEdit={() => {
                            setClassDraft(structuredClone(lesson));
                            setEditor("class");
                          }}
                          onException={() => openException(lesson, key)}
                        />
                      );
                    })}
                    {movedHere.map((exception) => {
                      const lesson = classes.find(
                        (entry) => entry.id === exception.classId,
                      );
                      if (!lesson) return null;
                      return (
                        <LessonCard
                          key={exception.id}
                          lesson={lesson}
                          subject={subjectFor(lesson.subjectId)}
                          exception={exception}
                          moved
                          onEdit={() => {
                            setExceptionDraft(structuredClone(exception));
                            setEditor("exception");
                          }}
                          onException={() => {
                            setExceptionDraft(structuredClone(exception));
                            setEditor("exception");
                          }}
                        />
                      );
                    })}
                    {importedHere.map((item) => (
                      <ImportedLessonCard
                        key={item.id}
                        item={item}
                        subjects={subjects}
                        onOpen={() => props.onOpenCalendarItem(item)}
                      />
                    ))}
                    {regular.length === 0 &&
                      movedHere.length === 0 &&
                      importedHere.length === 0 && (
                      <span className="timetable-empty">Open time</span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {classes.length > 0 && (
          <div className="school-record-list compact">
            <div className="record-list-heading">
              <span>Timetable rules</span>
              <strong>{classes.length}</strong>
            </div>
            {classes.map((lesson) => {
              const subject = subjectFor(lesson.subjectId);
              return (
                <article className="school-record" key={lesson.id}>
                  <i
                    style={
                      {
                        "--subject": subjectColor(subject),
                      } as CSSProperties
                    }
                  />
                  <div>
                    <strong>{subject?.name ?? "Unknown subject"}</strong>
                    <small>
                      {weekdays[lesson.weekday - 1]} · {lesson.startTime}–
                      {lesson.endTime} · recurring fallback
                    </small>
                  </div>
                  <div className="record-actions">
                    <button
                      type="button"
                      title="Cancel or reschedule"
                      onClick={() => openException(lesson)}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      type="button"
                      title="Edit lesson"
                      onClick={() => {
                        setClassDraft(structuredClone(lesson));
                        setEditor("class");
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      title="Delete lesson"
                      onClick={() => props.onDeleteClass(lesson)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {freePeriods.length > 0 && (
          <section className="free-period-panel">
            <header>
              <div>
                <span className="micro-label">Useful gaps</span>
                <h3>Free periods</h3>
              </div>
              <span>{freePeriods.length} detected</span>
            </header>
            <div>
              {freePeriods.map((period) => {
                const suggestions =
                  freePeriodRecommendations.get(
                    period.start.toISOString(),
                  ) ?? [];
                return (
                  <article key={period.start.toISOString()}>
                    <div>
                      <strong>
                        {period.start.toLocaleDateString("en-GB", {
                          weekday: "short",
                        })}{" "}
                        {period.start.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        –
                        {period.end.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </strong>
                      <small>
                        Free period · {period.durationMinutes} min
                      </small>
                    </div>
                    {suggestions.length ? (
                      <div className="free-period-suggestions">
                        {suggestions.map((suggestion, index) => (
                          <button
                            type="button"
                            key={`${suggestion.sourceType}:${suggestion.sourceId}`}
                            onClick={() =>
                              props.onUseFreePeriod(suggestion, period)
                            }
                          >
                            <span>
                              {index === 0
                                ? "Best fit · preview on calendar"
                                : "Preview on calendar"}
                            </span>
                            <strong>{suggestion.title}</strong>
                            <small>
                              {suggestion.durationMinutes} min ·{" "}
                              {suggestion.sourceType === "calendar_item"
                                ? "calendar"
                                : "assignment"}
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="free-period-no-fit">
                        No context-compatible task
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </>
  );
}
