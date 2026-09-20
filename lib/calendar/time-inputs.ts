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
