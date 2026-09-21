import type { SchoolDaySettings } from "@/lib/school";

/**
 * Whether two school-day settings say the same thing.
 *
 * The settings form needs this because identity is not a usable answer here.
 * `rowToSchoolDaySettings` builds a fresh object literal on every read, and
 * the calendar re-reads the account's snapshot every fifteen seconds, so the
 * object the form is handed is a different one each poll even when nothing has
 * changed. A form that reset its draft on `prev !== next` therefore threw away
 * whatever the student was in the middle of typing, roughly four times a
 * minute — long enough to look like the field simply refused to hold a value.
 *
 * Kept out of the component so both the reset and the dirty check ask exactly
 * the same question; when they disagreed, the form either clobbered edits or
 * claimed to be dirty forever.
 */
export function sameSchoolDaySettings(
  a: SchoolDaySettings,
  b: SchoolDaySettings,
): boolean {
  if (a === b) return true;

  const keys = Object.keys(a) as (keyof SchoolDaySettings)[];
  if (keys.length !== Object.keys(b).length) return false;

  for (const key of keys) {
    if (key === "focusTemplates") continue;
    if (a[key] !== b[key]) return false;
  }

  return sameFocusTemplates(a.focusTemplates, b.focusTemplates);
}

function sameFocusTemplates(
  a: SchoolDaySettings["focusTemplates"],
  b: SchoolDaySettings["focusTemplates"],
): boolean {
  const types = Object.keys(a) as (keyof typeof a)[];
  if (types.length !== Object.keys(b).length) return false;

  for (const type of types) {
    const left = a[type];
    const right = b[type];
    if (!left || !right) {
      if (left !== right) return false;
      continue;
    }
    const fields = Object.keys(left) as (keyof typeof left)[];
    if (fields.length !== Object.keys(right).length) return false;
    for (const field of fields) {
      if (left[field] !== right[field]) return false;
    }
  }

  return true;
}
