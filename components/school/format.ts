import type { Subject } from "@/lib/school";

// Date helpers for the school forms. `localInput` and `isoInput` are inverses:
// the form fields work in local time, the records store UTC.
export function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function isoInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function displayDate(value: string | null, includeTime = true) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function subjectColor(subject?: Subject) {
  return subject?.color?.startsWith("#") ? subject.color : "#7f70e8";
}

export function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}
