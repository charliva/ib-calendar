import { isCalendarSpanItem, isMultiDayItem, isLongSpanItem, isAllDayItem, durationMinutes, dateFromKey, addDays, dateKey } from "./lib/calendar-engine.ts";

function span(startDay, endDay) {
  const first = dateFromKey(startDay);
  const last = dateFromKey(endDay);
  const rangeStart = first <= last ? first : last;
  const rangeLast = first <= last ? last : first;
  rangeStart.setHours(0,0,0,0);
  rangeLast.setHours(0,0,0,0);
  const rangeEnd = addDays(rangeLast, 1);
  rangeEnd.setHours(0,0,0,0);
  const duration = Math.max(24*60, Math.round((rangeEnd.getTime()-rangeStart.getTime())/60000));
  return { startsAt: rangeStart.toISOString(), endsAt: rangeEnd.toISOString(), durationMin: duration, durationMax: duration };
}

for (const day of ["2026-03-28","2026-03-29","2026-03-30","2026-10-25"]) {
  const it = span(day, day);
  console.log(day, "TZ offsetdiff", (new Date(it.endsAt)-new Date(it.startsAt))/60000,
    "durationMinutes", durationMinutes(it),
    "multiDay", isMultiDayItem(it), "longSpan", isLongSpanItem(it),
    "span", isCalendarSpanItem(it), "allDay", isAllDayItem(it));
}
