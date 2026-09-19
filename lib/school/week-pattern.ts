import type { WeekPattern } from "../school.ts";

/**
 * The fortnightly A/B cycle.
 *
 * Which real-world week counts as "A" belongs to the school, not to this
 * software, so it is anchored to a Monday the student identifies during setup.
 * The historical constant is kept as the default so that calendars planned
 * before the anchor existed keep the pattern they were built against.
 */
export const DEFAULT_WEEK_PATTERN_ANCHOR = "2020-01-06";

const DAY = 86_400_000;

/** Monday of the week containing `date`, at local midnight. */
export function startOfWeekMonday(date: Date) {
  const monday = new Date(date);
  const weekday = monday.getDay() === 0 ? 7 : monday.getDay();
  monday.setDate(monday.getDate() - weekday + 1);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Days since the Unix epoch for a local calendar date, ignoring the clock.
 *
 * Subtracting two local timestamps loses or gains an hour across a daylight
 * saving boundary, and that is enough for a floored division by seven days to
 * drop a whole week: the cycle then reports the same pattern twice in a row and
 * stays out of phase until the next transition. Comparing calendar days through
 * `Date.UTC` removes the offset entirely.
 */
function calendarDayIndex(date: Date) {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY,
  );
}

function parseAnchor(anchor: string | undefined) {
  const [year, month, day] = (anchor?.trim() || DEFAULT_WEEK_PATTERN_ANCHOR)
    .split("-")
    .map(Number);
  if (!year || !month || !day) {
    const [fallbackYear, fallbackMonth, fallbackDay] =
      DEFAULT_WEEK_PATTERN_ANCHOR.split("-").map(Number);
    return startOfWeekMonday(
      new Date(fallbackYear, fallbackMonth - 1, fallbackDay),
    );
  }
  return startOfWeekMonday(new Date(year, month - 1, day));
}

/** Whether the week containing `day` runs the A or the B timetable. */
export function weekPatternFor(day: Date, anchor?: string): "a" | "b" {
  const weeks = Math.round(
    (calendarDayIndex(startOfWeekMonday(day)) -
      calendarDayIndex(parseAnchor(anchor))) /
      7,
  );
  return Math.abs(weeks) % 2 === 0 ? "a" : "b";
}

/** Format a date as the `YYYY-MM-DD` key the rest of the app stores. */
function anchorKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The anchor to store once a student tells us which pattern the week in front
 * of them follows. The stored value is always the Monday of an A week, so it
 * stays meaningful when read on its own.
 */
export function anchorForWeekOf(day: Date, pattern: "a" | "b") {
  const monday = startOfWeekMonday(day);
  if (pattern === "b") monday.setDate(monday.getDate() - 7);
  return anchorKey(monday);
}

/** Whether a class repeating on `pattern` runs during the week of `day`. */
export function classRunsInWeek(
  pattern: WeekPattern,
  day: Date,
  anchor?: string,
) {
  return pattern === "every" || pattern === weekPatternFor(day, anchor);
}
