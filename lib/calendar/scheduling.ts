import {
  addDays,
  durationMinutes,
  isAllDayItem,
  type CalendarItem,
} from "../calendar-engine.ts";

export function relevantCommandItems(
  command: string,
  items: CalendarItem[],
): CalendarItem[] {
  const terms = command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
  const now = Date.now();
  const horizon = now + 45 * 24 * 60 * 60_000;
  return [...items]
    .map((item) => {
      const haystack =
        `${item.title} ${item.kind} ${item.energyType}`.toLowerCase();
      const matchScore = terms.reduce(
        (score, term) => score + (haystack.includes(term) ? 20 : 0),
        0,
      );
      const time = item.startsAt
        ? new Date(item.startsAt).getTime()
        : item.deadline
          ? new Date(item.deadline).getTime()
          : Number.POSITIVE_INFINITY;
      const nearScore =
        time >= now - 24 * 60 * 60_000 && time <= horizon ? 8 : 0;
      return { item, score: matchScore + nearScore, time };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.time - b.time)
    .slice(0, 60)
    .map(({ item }) => item);
}

export function itemWithDuration(
  item: CalendarItem,
  minutes: number,
): CalendarItem {
  if (!item.startsAt) return item;
  const safeMinutes = Math.max(5, minutes);
  return {
    ...item,
    endsAt: new Date(
      new Date(item.startsAt).getTime() + safeMinutes * 60_000,
    ).toISOString(),
    durationMin: safeMinutes,
    durationMax: safeMinutes,
  };
}

export function toggleAllDayItem(item: CalendarItem): CalendarItem {
  const start = item.startsAt ? new Date(item.startsAt) : new Date();
  if (isAllDayItem(item)) {
    start.setHours(9, 0, 0, 0);
    return {
      ...item,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
      durationMin: 60,
      durationMax: 60,
    };
  }
  const days = Math.max(1, Math.ceil(durationMinutes(item) / (24 * 60)));
  start.setHours(0, 0, 0, 0);
  return {
    ...item,
    startsAt: start.toISOString(),
    endsAt: addDays(start, days).toISOString(),
    durationMin: days * 24 * 60,
    durationMax: days * 24 * 60,
    status: "scheduled" as const,
  };
}

export function normalizeItemTiming(item: CalendarItem): CalendarItem {
  if (item.status !== "scheduled" || !item.startsAt) return item;
  const start = new Date(item.startsAt);
  if (!Number.isFinite(start.getTime())) return item;
  const end = item.endsAt ? new Date(item.endsAt) : null;
  if (end && Number.isFinite(end.getTime()) && end > start) return item;
  return {
    ...item,
    endsAt: new Date(
      start.getTime() + Math.max(5, item.durationMin) * 60_000,
    ).toISOString(),
  };
}
