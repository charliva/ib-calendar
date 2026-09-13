import { dateFromKey, dateKey } from "../calendar-engine.ts";

export function calendarViewFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const rawView = params.get("view");
  const view = rawView === "home" ? "upcoming" : rawView;
  const date = params.get("date");
  return {
    view:
      view &&
      ["upcoming", "school", "day", "week", "month", "semester"].includes(view)
        ? view
        : null,
    date:
      date &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(dateFromKey(date).getTime()) &&
      dateKey(dateFromKey(date)) === date
        ? date
        : null,
  };
}
