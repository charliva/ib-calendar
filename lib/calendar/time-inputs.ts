// Moving between a stored ISO instant and the "YYYY-MM-DDTHH:MM" shape an
// <input type="datetime-local"> reads and writes.
//
// Both directions are total. `new Date(x).toISOString()` throws a RangeError
// on an unparseable `x` rather than producing a value, and these sit under
// click handlers and stored rows — so a half-typed field or one corrupt
// timestamp in IndexedDB used to take the whole editor down. Every caller
// already branches on an empty string or a null, so returning one is the
// contract they were written against.

export function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * A sensible "HH:MM" to schedule at when the student has not chosen one.
 *
 * Picking a date for an unscheduled task has to produce a whole instant, and
 * an unscheduled task carries no time to combine the date with. Rounding the
 * current time up to the next quarter hour puts the block just ahead of now
 * rather than at an arbitrary fixed hour, which is what the student is
 * usually reaching for; they can move it afterwards.
 */
export function nextQuarterHour(reference: Date) {
  const rounded = new Date(reference.getTime());
  if (Number.isNaN(rounded.getTime())) return "09:00";
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % 15;
  rounded.setMinutes(rounded.getMinutes() + (remainder === 0 ? 0 : 15 - remainder));
  const hours = String(rounded.getHours()).padStart(2, "0");
  const minutes = String(rounded.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
