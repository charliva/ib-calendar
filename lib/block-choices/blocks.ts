import { dateKey, isCalendarSpanItem, type CalendarItem } from "../calendar-engine.ts";
import { schoolLessonRanges } from "../school-day-engine.ts";
import type { CurrentStudyLocation } from "../now-recommender.ts";
import {
  DAY,
  MINUTE,
  type BlockChoiceInput,
  type TimeBlock,
  type TimeBlockType,
} from "./types.ts";

// Deciding which block of the day the student is currently in: a lesson, the
// commute, the evening, and so on. This is inferred from the timetable and the
// calendar rather than asked for, so the picker can open with the right
// context already chosen.

const blockLabels: Record<TimeBlockType, string> = {
  morning: "Morning",
  travel_to_school: "Travel to school",
  school: "School",
  travel_home: "Travel home",
  after_school: "After school",
  evening: "Evening",
  night: "Night",
};

export function atTime(day: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

export function blockKey(type: TimeBlockType, start: Date, end: Date) {
  const clock = (value: Date) =>
    `${String(value.getHours()).padStart(2, "0")}${String(value.getMinutes()).padStart(2, "0")}`;
  return `${dateKey(start)}:v2:${type}:${clock(start)}-${clock(end)}`;
}

function makeBlock(
  type: TimeBlockType,
  start: Date,
  end: Date,
  location: CurrentStudyLocation,
  now: Date,
  flexible = true,
  fixedTitle: string | null = null,
  label = blockLabels[type],
): TimeBlock {
  return {
    key: blockKey(type, start, end),
    type,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    context: {
      label,
      location,
      availableMinutes: Math.max(
        0,
        Math.floor((end.getTime() - Math.max(now.getTime(), start.getTime())) / MINUTE),
      ),
      flexible,
      fixedTitle,
    },
  };
}

function activeBlockingItem(items: CalendarItem[], now: Date) {
  return items.find(
    (item) =>
      item.status === "scheduled" &&
      item.flexibility === "fixed" &&
      item.startsAt &&
      item.endsAt &&
      !isCalendarSpanItem(item) &&
      new Date(item.startsAt) <= now &&
      new Date(item.endsAt) > now,
  );
}

function activeAmbientItems(items: CalendarItem[], now: Date) {
  return items.filter(
    (item) =>
      item.status === "scheduled" &&
      item.startsAt &&
      item.endsAt &&
      (isCalendarSpanItem(item) || item.flexibility === "flexible") &&
      new Date(item.startsAt) <= now &&
      new Date(item.endsAt) > now,
  );
}

export function inferCurrentTimeBlock(
  input: Pick<
    BlockChoiceInput,
    "now" | "items" | "classes" | "classExceptions" | "settings"
  >,
): TimeBlock {
  const { now, items, classes, classExceptions, settings } = input;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const lessons = schoolLessonRanges(
    classes,
    classExceptions,
    dayStart,
    new Date(dayEnd.getTime() - 1),
    items,
  ).filter((range) => dateKey(range.start) === dateKey(now));
  const ambientTitles = activeAmbientItems(items, now).map((item) => item.title);
  const firstLesson = lessons[0];
  const lastLesson = lessons.at(-1);
  const contextBlock = (...args: Parameters<typeof makeBlock>) => {
    const block = makeBlock(...args);
    return {
      ...block,
      context: {
        ...block.context,
        activeEventTitles: ambientTitles,
        schoolStartsAt: firstLesson?.start.toISOString() ?? null,
        schoolEndsAt: lastLesson?.start.toISOString() ?? null,
      },
    };
  };

  const currentLesson = lessons.find(
    (lesson) => lesson.start <= now && lesson.end > now,
  );
  if (currentLesson) {
    return contextBlock(
      "school",
      currentLesson.start,
      currentLesson.end,
      "school",
      now,
      false,
      "Class",
      "Class time",
    );
  }

  const blockingItem = activeBlockingItem(items, now);
  if (blockingItem?.startsAt && blockingItem.endsAt) {
    return contextBlock(
      now.getHours() >= 21 ? "night" : now.getHours() >= 18 ? "evening" : "after_school",
      new Date(blockingItem.startsAt),
      new Date(blockingItem.endsAt),
      "home",
      now,
      false,
      blockingItem.title,
      "Current activity",
    );
  }

  const nextFixedStart = items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.flexibility === "fixed" &&
        item.startsAt &&
        item.endsAt &&
        !isCalendarSpanItem(item) &&
        new Date(item.startsAt) > now &&
        dateKey(new Date(item.startsAt)) === dateKey(now),
    )
    .map((item) => new Date(item.startsAt!))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const finish = (candidate: Date) =>
    nextFixedStart && nextFixedStart < candidate ? nextFixedStart : candidate;

  if (lessons.length) {
    const first = lessons[0];
    const last = lessons.at(-1)!;
    const commuteStart = new Date(
      first.start.getTime() - settings.travelBeforeSchoolMinutes * MINUTE,
    );
    const arriveHome = new Date(
      last.end.getTime() + settings.travelHomeMinutes * MINUTE,
    );
    if (now < commuteStart) {
      return contextBlock(
        "morning",
        atTime(now, "05:30"),
        finish(commuteStart),
        "home",
        now,
      );
    }
    if (now < first.start) {
      return contextBlock(
        "travel_to_school",
        commuteStart,
        finish(first.start),
        "commute",
        now,
      );
    }
    if (now < last.start) {
      const previous = [...lessons].reverse().find((lesson) => lesson.end <= now);
      const next = lessons.find((lesson) => lesson.start > now);
      return contextBlock(
        "school",
        previous?.end ?? first.start,
        finish(next?.start ?? last.end),
        "school",
        now,
        true,
        null,
        "School gap",
      );
    }
    if (now < arriveHome) {
      return contextBlock(
        "travel_home",
        last.end,
        finish(arriveHome),
        "commute",
        now,
      );
    }
    const eveningStart = atTime(now, "18:00");
    if (now < eveningStart) {
      return contextBlock(
        "after_school",
        arriveHome,
        finish(eveningStart),
        "home",
        now,
      );
    }
  }

  const noon = atTime(now, "12:00");
  const evening = atTime(now, "18:00");
  const night = atTime(now, settings.schoolworkCutoff || "21:00");
  if (!lessons.length && now < noon) {
    return contextBlock("morning", atTime(now, "05:30"), finish(noon), "home", now);
  }
  if (now < evening) {
    return contextBlock(
      "after_school",
      lessons.length ? new Date(lessons.at(-1)!.end) : noon,
      finish(evening),
      "home",
      now,
      true,
      null,
      lessons.length ? "After school" : "Afternoon",
    );
  }
  if (now < night) {
    return contextBlock("evening", evening, finish(night), "home", now);
  }
  return contextBlock("night", night, finish(dayEnd), "home", now);
}
