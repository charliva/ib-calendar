import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  addDays,
  dateFromKey,
  dateKey,
  durationMinutes,
  itemToRow,
  makeItem,
  type CalendarItem,
} from "@/lib/calendar-engine";
import {
  localTime,
  type EditorOptions,
} from "@/lib/calendar/interactions";
import {
  classExceptionToRow,
  classToRow,
  subjectToRow,
  type ClassException,
  type SchoolClass,
  type Subject,
} from "@/lib/school";
import {
  isImportedTimetableItem,
  timetableRoomForItem,
} from "@/lib/timetable-import";
import type { PendingMutation } from "@/lib/offline";
import { editEventNaturally as editEventNaturallyWith } from "@/app/calendar/edit-event-naturally";

type EventEditorParams = {
  supabase: SupabaseClient;
  user: User | null;
  /** A queued class write is only an error when a live save was expected. */
  isOnline: boolean;
  items: CalendarItem[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  selectedDay: string;
  setItems: React.Dispatch<React.SetStateAction<CalendarItem[]>>;
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  setClasses: React.Dispatch<React.SetStateAction<SchoolClass[]>>;
  setClassExceptions: React.Dispatch<React.SetStateAction<ClassException[]>>;
  setSelectedDay: (day: string) => void;
  setSelectedItem: (item: CalendarItem | null) => void;
  setDraftItem: (item: CalendarItem | null) => void;
  setIsCreatingItem: (creating: boolean) => void;
  setEventAnchor: (anchor: DOMRect | null) => void;
  setEventSelection: (ids: string[]) => void;
  setNotice: (notice: string) => void;
  persistMutation: (mutation: PendingMutation) => Promise<boolean>;
  recordHistory: (label: string) => void;
  updateItem: (item: CalendarItem, label: string) => void;
};

/**
 * Opening the compact event editor and saving what it produces.
 *
 * Saving a class is the interesting case: editing a single occurrence writes a
 * class exception rather than touching the recurring lesson, while editing the
 * series updates the lesson itself. A class whose title names no existing
 * subject creates one, so the timetable stays coherent.
 */
export function useEventEditor({
  supabase,
  user,
  isOnline,
  items,
  subjects,
  classes,
  classExceptions,
  selectedDay,
  setItems,
  setSubjects,
  setClasses,
  setClassExceptions,
  setSelectedDay,
  setSelectedItem,
  setDraftItem,
  setIsCreatingItem,
  setEventAnchor,
  setEventSelection,
  setNotice,
  persistMutation,
  recordHistory,
  updateItem,
}: EventEditorParams) {
  async function persistClassOccurrence(item: CalendarItem, cancelled = false) {
    const existing = classExceptions.find(
      (entry) =>
        entry.classId === item.classId &&
        entry.occurrenceDate === item.occurrenceDate,
    );
    const exception: ClassException = {
      id: existing?.id ?? crypto.randomUUID(),
      classId: item.classId!,
      occurrenceDate: item.occurrenceDate!,
      status: cancelled ? "cancelled" : "rescheduled",
      replacementDate: item.startsAt ? dateKey(new Date(item.startsAt)) : null,
      replacementStartTime: item.startsAt
        ? localTime(new Date(item.startsAt))
        : null,
      replacementEndTime: item.endsAt ? localTime(new Date(item.endsAt)) : null,
      replacementRoom: item.room,
      replacementTitle: item.title,
      energyUsage: item.energyUsage,
      locationContext: item.taskContext,
      notes: existing?.notes ?? "",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await persistMutation({
      table: "class_exceptions",
      action: "upsert",
      recordId: exception.id,
      payload: classExceptionToRow(exception),
    });
    setClassExceptions((current) => [
      ...current.filter((entry) => entry.id !== exception.id),
      exception,
    ]);
  }

  async function saveCompactEvent(
    input: CalendarItem,
    options: EditorOptions,
  ): Promise<CalendarItem> {
    if (!input.title.trim()) throw new Error("Give this a title first.");
    if (input.room.length > 80)
      throw new Error("Keep location details under 80 characters.");
    if (
      input.startsAt &&
      input.endsAt &&
      new Date(input.endsAt) <= new Date(input.startsAt)
    )
      throw new Error("End time must be after start time.");
    const minutes =
      input.startsAt && input.endsAt
        ? durationMinutes(input)
        : input.durationMin;
    let next = {
      ...input,
      title: input.title.trim(),
      durationMin: minutes,
      durationMax: minutes,
      requiredEnergy:
        (input.energyUsage ?? 3) <= 2
          ? ("low" as const)
          : (input.energyUsage ?? 3) >= 4
            ? ("high" as const)
            : ("medium" as const),
    };
    if (options.isClass) {
      if (!next.startsAt || !next.endsAt)
        throw new Error("Choose a time for the class.");
      const start = new Date(next.startsAt);
      const end = new Date(next.endsAt);
      if (dateKey(start) !== dateKey(end))
        throw new Error("A class must start and end on the same day.");
      const original = classes.find((entry) => entry.id === next.classId);
      if (original && options.scope === "occurrence") {
        await persistClassOccurrence(next);
        return next;
      }
      let subject = subjects.find(
        (entry) =>
          entry.name.toLowerCase() === next.title.toLowerCase() ||
          entry.shortName.toLowerCase() === next.title.toLowerCase(),
      );
      if (!subject) {
        subject = {
          id: crypto.randomUUID(),
          name: next.title,
          shortName: next.title.slice(0, 12),
          teacher: "",
          room: next.room,
          color: "#8b7abb",
          icon: "book",
          createdAt: new Date().toISOString(),
        };
        await persistMutation({
          table: "subjects",
          action: "upsert",
          recordId: subject.id,
          payload: subjectToRow(subject),
        });
        setSubjects((current) => [...current, subject!]);
      }
      const day = dateKey(start);
      const reuse =
        original && original.validFrom >= (next.occurrenceDate ?? day);
      const lesson: SchoolClass = {
        id: reuse ? original.id : next.classId ? crypto.randomUUID() : next.id,
        subjectId: subject.id,
        weekday: start.getDay() || 7,
        startTime: localTime(start),
        endTime: localTime(end),
        weekPattern: options.repeat === "once" ? "every" : options.repeat,
        teacher: subject.teacher,
        room: next.room,
        validFrom: day,
        validUntil:
          options.repeat === "once"
            ? day
            : original?.validUntil === original?.validFrom
              ? null
              : (original?.validUntil ?? null),
        energyUsage: next.energyUsage,
        locationContext: next.taskContext,
        createdAt: original?.createdAt ?? new Date().toISOString(),
      };
      const classSynced = await persistMutation({
        table: "classes",
        action: "upsert",
        recordId: lesson.id,
        payload: classToRow(lesson),
      });
      if (user && isOnline && !classSynced)
        throw new Error(
          "Class queued for sync. The original event is preserved until the class can be saved.",
        );
      // Keep the old series intact until its replacement has been saved.
      if (original && original.validFrom < (next.occurrenceDate ?? day)) {
        const until = dateFromKey(next.occurrenceDate ?? day);
        until.setDate(until.getDate() - 1);
        const previous = { ...original, validUntil: dateKey(until) };
        await persistMutation({
          table: "classes",
          action: "upsert",
          recordId: previous.id,
          payload: classToRow(previous),
        });
        setClasses((current) =>
          current.map((entry) => (entry.id === previous.id ? previous : entry)),
        );
      }
      setClasses((current) => [
        ...current.filter((entry) => entry.id !== lesson.id),
        lesson,
      ]);
      if (!next.classId && items.some((entry) => entry.id === next.id)) {
        await persistMutation({
          table: "calendar_items",
          action: "delete",
          recordId: next.id,
          dependsOn: `classes:record:${lesson.id}`,
        });
        setItems((current) => current.filter((entry) => entry.id !== next.id));
      }
      next = {
        ...next,
        id: `class:${lesson.id}:${day}`,
        classId: lesson.id,
        occurrenceDate: day,
        subjectId: subject.id,
        flexibility: "fixed",
      };
    } else {
      next = {
        ...next,
        constraints: next.constraints.filter(
          (value) => value !== "Weekly timetable screenshot",
        ),
        source: isImportedTimetableItem(next) ? "manual" : next.source,
      };
      if (next.classId) {
        await persistClassOccurrence(next, true);
        next = {
          ...next,
          id: crypto.randomUUID(),
          classId: null,
          occurrenceDate: null,
          flexibility: "flexible",
        };
      }
      const existing = items.some((entry) => entry.id === next.id);
      await persistMutation({
        table: "calendar_items",
        action: "upsert",
        recordId: next.id,
        payload: itemToRow(next),
      });
      recordHistory(`${existing ? "Edit" : "Create"} “${next.title}”`);
      setItems((current) => [
        ...current.filter((entry) => entry.id !== next.id),
        next,
      ]);
    }
    setEventSelection([next.id]);
    return next;
  }


  function editEventNaturally(
    text: string,
    item: CalendarItem,
    options: EditorOptions,
  ) {
    return editEventNaturallyWith(supabase, text, item, options);
  }

  function openItem(item: CalendarItem) {
    const element = Array.from(
      document.querySelectorAll<HTMLElement>("[data-event-id]"),
    ).find((entry) => entry.dataset.eventId === item.id);
    setEventAnchor(element?.getBoundingClientRect() ?? null);
    setEventSelection([item.id]);
    const editableItem = structuredClone(item);
    if (isImportedTimetableItem(editableItem) && !editableItem.room) {
      editableItem.room = timetableRoomForItem(editableItem);
    }
    setIsCreatingItem(false);
    setSelectedItem(item);
    setDraftItem(editableItem);
  }

  function renameItem(item: CalendarItem, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === item.title) return;
    updateItem(
      { ...item, title: nextTitle },
      `Rename “${item.title}” to “${nextTitle}”`,
    );
    setNotice(`Renamed to “${nextTitle}”.`);
  }

  function openNewEvent(
    day = selectedDay,
    hour?: number,
    minute?: number,
    duration = 60,
  ) {
    setEventAnchor(null);
    setEventSelection([]);
    const start = dateFromKey(day);
    if (hour === undefined) {
      const now = new Date();
      if (day === dateKey(now)) {
        const roundedMinutes = Math.ceil(now.getMinutes() / 30) * 30;
        start.setHours(
          now.getHours() + (roundedMinutes === 60 ? 1 : 0),
          roundedMinutes % 60,
          0,
          0,
        );
      } else {
        start.setHours(9, 0, 0, 0);
      }
    } else {
      start.setHours(hour, minute ?? 0, 0, 0);
    }
    const minutes = Math.max(15, duration);
    const end = new Date(start.getTime() + minutes * 60_000);
    const item = makeItem({
      kind: "event",
      title: "",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMin: minutes,
      durationMax: minutes,
      status: "scheduled",
      flexibility: "flexible",
      source: "manual",
    });
    setSelectedDay(day);
    setIsCreatingItem(true);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
  }

  function openNewSpan(startDay: string, endDay: string) {
    const first = dateFromKey(startDay);
    const last = dateFromKey(endDay);
    const rangeStart = first <= last ? first : last;
    const rangeLast = first <= last ? last : first;
    rangeStart.setHours(0, 0, 0, 0);
    rangeLast.setHours(0, 0, 0, 0);
    const rangeEnd = addDays(rangeLast, 1);
    rangeEnd.setHours(0, 0, 0, 0);
    const duration = Math.max(
      24 * 60,
      Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 60_000),
    );
    const item = makeItem({
      kind: "event",
      title: "",
      startsAt: rangeStart.toISOString(),
      endsAt: rangeEnd.toISOString(),
      durationMin: duration,
      durationMax: duration,
      status: "scheduled",
      flexibility: "flexible",
      source: "manual",
    });
    setSelectedDay(dateKey(rangeStart));
    setIsCreatingItem(true);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
  }

  function openNewTask() {
    const item = makeItem({
      kind: "task",
      title: "",
      startsAt: null,
      endsAt: null,
      durationMin: 30,
      durationMax: 60,
      status: "inbox",
      flexibility: "flexible",
      source: "manual",
    });
    setIsCreatingItem(true);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
  }

  return {
    persistClassOccurrence,
    saveCompactEvent,
    editEventNaturally,
    openItem,
    renameItem,
    openNewEvent,
    openNewSpan,
    openNewTask,
  };
}
