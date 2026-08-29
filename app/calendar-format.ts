import { dateKey, type CalendarItem } from "@/lib/calendar-engine";

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

export function formatTime(value: string | null) {
  if (!value) return "Unscheduled";
  return formatDate(new Date(value), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRange(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) {
    if (item.windowStart && item.windowEnd) {
      return `${formatTime(item.windowStart)}–${formatTime(item.windowEnd)} window`;
    }
    return `${item.durationMin}–${item.durationMax} min`;
  }
  return `${formatTime(item.startsAt)}–${formatTime(item.endsAt)}`;
}

export function formatSpan(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) return "";
  const start = new Date(item.startsAt);
  const end = new Date(new Date(item.endsAt).getTime() - 1);
  if (dateKey(start) === dateKey(end)) {
    return formatDate(start, { month: "short", day: "numeric" });
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatDate(start, { month: "short", day: "numeric" })} – ${formatDate(
    end,
    {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    },
  )}`;
}

export function formatProposalTiming(item: CalendarItem) {
  if (!item.startsAt) return formatRange(item);
  return `${formatDate(new Date(item.startsAt), {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} · ${formatRange(item)}`;
}

export function urgencyClass(item: CalendarItem) {
  if (!item.deadline || item.status === "completed") return "";
  const remaining = new Date(item.deadline).getTime() - Date.now();
  if (remaining <= 24 * 60 * 60_000) return "deadline-imminent";
  if (remaining <= 72 * 60 * 60_000) return "deadline-near";
  return "";
}
