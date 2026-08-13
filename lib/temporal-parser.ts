const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

type TemporalMode = "date" | "time" | "datetime";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function parseTime(text: string) {
  const twelveHour = text.match(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    if (hour < 1 || hour > 12) return null;
    const minute = Number(twelveHour[2] ?? 0);
    const meridiem = twelveHour[3].toLowerCase().startsWith("p") ? "pm" : "am";
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
    return { value: `${pad(hour)}:${pad(minute)}`, match: twelveHour[0] };
  }

  const twentyFourHour = text.match(/\b(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/i);
  if (twentyFourHour) {
    return {
      value: `${pad(Number(twentyFourHour[1]))}:${pad(Number(twentyFourHour[2]))}`,
      match: twentyFourHour[0],
    };
  }

  if (/^\s*\d{1,2}\s*$/.test(text)) {
    const hour = Number(text.trim());
    if (hour >= 0 && hour <= 23) return { value: `${pad(hour)}:00`, match: text };
  }
  return null;
}

function parseDate(text: string, reference: Date) {
  const normalized = text
    .toLowerCase()
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = new Date(reference);
  base.setHours(12, 0, 0, 0);

  if (/\bday after tomorrow\b/.test(normalized)) {
    base.setDate(base.getDate() + 2);
    return base;
  }
  if (/\btomorrow\b/.test(normalized)) {
    base.setDate(base.getDate() + 1);
    return base;
  }
  if (/\btoday\b/.test(normalized)) return base;

  const weekday = normalized.match(
    /\b(next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/,
  );
  if (weekday) {
    const target = WEEKDAYS.findIndex((day) => day.startsWith(weekday[2].slice(0, 3)));
    const ordinaryDelta = (target - base.getDay() + 7) % 7;
    const daysAhead = weekday[1]
      ? ordinaryDelta + 7
      : ordinaryDelta || 7;
    base.setDate(base.getDate() + daysAhead);
    return base;
  }

  const iso = normalized.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numeric) {
    let year = numeric[3] ? Number(numeric[3]) : base.getFullYear();
    if (year < 100) year += 2000;
    return validDate(year, Number(numeric[2]), Number(numeric[1]));
  }

  const monthPattern = MONTHS.map(
    (month) => `${month.slice(0, 3)}(?:${month.slice(3)})?`,
  ).join("|");
  const named = normalized.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`, "i"),
  );
  if (named) {
    const month = MONTHS.findIndex((entry) => entry.startsWith(named[2].slice(0, 3))) + 1;
    return validDate(Number(named[3] ?? base.getFullYear()), month, Number(named[1]));
  }

  return null;
}

export function parseTemporalText(
  text: string,
  mode: TemporalMode,
  reference = new Date(),
  fallbackValue = "",
) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const time = parseTime(trimmed);
  if (mode === "time") return time?.value ?? null;

  const dateText = time ? trimmed.replace(time.match, " ") : trimmed;
  const date = parseDate(dateText, reference);
  if (mode === "date") return date ? dateKey(date) : null;

  const fallbackDate = fallbackValue.slice(0, 10) || dateKey(reference);
  const fallbackTime = fallbackValue.split("T")[1]?.slice(0, 5) || "09:00";
  if (!date && !time) return null;
  return `${date ? dateKey(date) : fallbackDate}T${time?.value ?? fallbackTime}`;
}

export function formatTemporalText(value: string, mode: TemporalMode) {
  if (!value) return "";
  if (mode === "time") return value.slice(0, 5);
  const dateValue = value.slice(0, 10);
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = `${pad(day)}/${pad(month)}/${year}`;
  if (mode === "date") return date;
  const time = value.split("T")[1]?.slice(0, 5) || "09:00";
  const [hour, minute] = time.split(":").map(Number);
  const meridiem = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${date} · ${twelveHour}:${pad(minute)} ${meridiem}`;
}
