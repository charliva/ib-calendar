import {
  TIMETABLE_IMPORT_MARKER,
  type CalendarItem,
} from "../calendar-engine.ts";

/**
 * What three weeks away actually did to a student's calendar.
 *
 * The damage here is quiet rather than loud. A work item whose block has passed
 * keeps the status "scheduled", and every automated surface — the dock, the Now
 * recommender, free-period suggestions — only looks at "inbox", so the work
 * disappears from all three at once. Worse, placement validation still enforces
 * the item's original deadline and window, so the obvious recovery of dragging
 * it into this week is rejected on every drop. Reporting the mess is therefore
 * not enough; `releaseStaleItem` is what makes it recoverable.
 */

const WEEK_OF_PREFIX = "Week of ";

export type StalenessReport = {
  /** Work the student planned but never did, now invisible to every surface. */
  strandedItems: CalendarItem[];
  strandedMinutes: number;
  /** Monday of the most recent week an imported timetable covers. */
  latestImportedWeek: string | null;
  /** Whether the week the student is returning to has any lessons at all. */
  timetableCoversCurrentWeek: boolean;
  /** Edits made before they left that have still not reached the server. */
  pendingMutationCount: number;
  awayDays: number | null;
};

function isStranded(item: CalendarItem, now: Date) {
  // Lessons are fixed and belong where they are; only movable work strands.
  if (item.flexibility === "fixed") return false;
  if (item.status !== "scheduled") return false;
  if (item.constraints.includes(TIMETABLE_IMPORT_MARKER)) return false;
  if (!item.endsAt) return false;
  return new Date(item.endsAt).getTime() < now.getTime();
}

function importedWeekKeys(items: CalendarItem[]) {
  const weeks: string[] = [];
  for (const item of items) {
    if (!item.constraints.includes(TIMETABLE_IMPORT_MARKER)) continue;
    for (const constraint of item.constraints) {
      if (constraint.startsWith(WEEK_OF_PREFIX)) {
        weeks.push(constraint.slice(WEEK_OF_PREFIX.length).trim());
      }
    }
  }
  return weeks.sort();
}

export function buildStalenessReport(input: {
  items: CalendarItem[];
  now: Date;
  currentWeekStart: Date;
  pendingMutationCount: number;
  awayDays: number | null;
}): StalenessReport {
  const strandedItems = input.items
    .filter((item) => isStranded(item, input.now))
    .sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? ""));

  const weeks = importedWeekKeys(input.items);
  const weekStartKey = dateKeyOf(input.currentWeekStart);

  const coversCurrentWeek = input.items.some((item) => {
    if (!item.startsAt) return false;
    if (
      item.flexibility !== "fixed" &&
      !item.constraints.includes(TIMETABLE_IMPORT_MARKER)
    ) {
      return false;
    }
    const start = new Date(item.startsAt);
    const weekEnd = new Date(input.currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return start >= input.currentWeekStart && start < weekEnd;
  });

  return {
    strandedItems,
    strandedMinutes: strandedItems.reduce(
      (total, item) => total + Math.max(0, item.durationMin),
      0,
    ),
    latestImportedWeek: weeks.at(-1) ?? null,
    timetableCoversCurrentWeek: coversCurrentWeek || weeks.includes(weekStartKey),
    pendingMutationCount: input.pendingMutationCount,
    awayDays: input.awayDays,
  };
}

function dateKeyOf(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Return a stranded item to the dock so it can be planned again.
 *
 * The status change alone is not enough. Placement validation rejects any drop
 * that ends after the item's deadline or outside its window, and a revision
 * session's window is pinned to the day it was originally planned — so an item
 * recovered without clearing those is one the student can see but never move.
 * Windows and deadlines are only cleared when they have already passed; a real
 * future due date is information worth keeping.
 */
export function releaseStaleItem(item: CalendarItem, now: Date): CalendarItem {
  const inThePast = (value: string | null) =>
    Boolean(value) && new Date(value!).getTime() < now.getTime();

  return {
    ...item,
    status: "inbox",
    startsAt: null,
    endsAt: null,
    windowStart: inThePast(item.windowStart) ? null : item.windowStart,
    windowEnd: inThePast(item.windowEnd) ? null : item.windowEnd,
    deadline: inThePast(item.deadline) ? null : item.deadline,
  };
}

export function releaseStaleItems(items: CalendarItem[], now: Date) {
  return items.map((item) => releaseStaleItem(item, now));
}
