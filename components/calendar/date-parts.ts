import { toLocalInput } from "../../lib/calendar/time-inputs.ts";

// Splitting an ISO instant into the date and time halves the compact editor's
// two fields bind to, and the calendar grid the date field drops down.

export function localDatePart(value: string | null) {
  return value ? toLocalInput(value).slice(0, 10) : "";
}

export function localTimePart(value: string | null) {
  return value ? toLocalInput(value).slice(11, 16) : "";
}

export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSameDay(left: Date, right: Date) {
  return dateInputValue(left) === dateInputValue(right);
}
