import type { SupabaseClient } from "@supabase/supabase-js";
import { durationMinutes, type CalendarItem } from "@/lib/calendar-engine";
import type { EditorOptions } from "@/lib/calendar/interactions";
import { eventEditSchema } from "@/lib/calendar/event-edit-schema";
import { parseTemporalText } from "@/lib/temporal-parser";
import { fromLocalInput, toLocalInput } from "@/lib/calendar/time-inputs";

/**
 * Applies a natural-language instruction to one event, returning the edited
 * item for the editor to save rather than writing anything itself.
 *
 * Signed in, the instruction goes to the model and the reply is parsed through
 * `eventEditSchema`, so an unexpected shape is rejected instead of trusted.
 * Signed out, a deliberately small grammar covers the common edits — a new
 * time, a duration, a room, a context, an energy level, a repeat rule. An
 * instruction outside that grammar throws rather than silently doing nothing,
 * and deletions are refused here so removal always goes through its own
 * confirmation.
 */
export async function editEventNaturally(
  supabase: SupabaseClient,
  text: string,
  item: CalendarItem,
  options: EditorOptions,
) {
  if (/\b(delete|remove|cancel)\b/i.test(text))
    throw new Error("Use Delete below to confirm removal.");
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    const response = await fetch("/api/event-edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        instruction: text,
        item,
        options,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const patch: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        "AI editing is unavailable. Use the fields below or try again.",
      );
    const { isClass, repeat, scope, ...fields } =
      eventEditSchema.parse(patch);
    return {
      item: { ...item, ...fields },
      options: {
        ...options,
        ...(isClass !== undefined ? { isClass } : {}),
        ...(repeat ? { repeat } : {}),
        ...(scope ? { scope } : {}),
      },
    };
  }
  // Common edits work offline. Anything outside this grammar stays unchanged.
  let next = { ...item };
  const nextOptions = { ...options };
  let understood = false;
  const temporal = parseTemporalText(
    text,
    "datetime",
    new Date(),
    toLocalInput(item.startsAt),
  );
  if (
    temporal &&
    /\b(move|at|to|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      text,
    )
  ) {
    // parseTemporalText hands back its own local-input string; if it is not
    // something the platform can read, leave the item alone rather than
    // asserting past the null and scheduling the event at the epoch.
    const start = fromLocalInput(temporal);
    if (start) {
      next = {
        ...next,
        startsAt: start,
        endsAt: new Date(
          new Date(start).getTime() +
            Math.max(5, durationMinutes(item)) * 60000,
        ).toISOString(),
      };
      understood = true;
    }
  }
  const duration = text.match(/\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if (duration && next.startsAt) {
    const minutes = Number(duration[1]) * (/h/i.test(duration[2]) ? 60 : 1);
    next.endsAt = new Date(
      new Date(next.startsAt).getTime() + minutes * 60000,
    ).toISOString();
    understood = true;
  }
  const context = text.match(/\b(school|home|city|library)\b/i);
  if (context) {
    next.taskContext =
      context[1].toLowerCase() as CalendarItem["taskContext"];
    understood = true;
  }
  const room = text.match(/\broom\s+([\w-]+)/i);
  if (room) {
    next.room = room[1];
    understood = true;
  }
  const energy = text.match(
    /\b(?:energy(?: usage)?\s*(?:to|of|is)?\s*)([1-5])\b/i,
  );
  if (energy || /\b(low|high) energy\b/i.test(text)) {
    next.energyUsage = energy
      ? Number(energy[1])
      : /low energy/i.test(text)
        ? 2
        : 5;
    understood = true;
  }
  if (/\bclass\b/i.test(text)) {
    nextOptions.isClass = true;
    next.taskContext = "school";
    understood = true;
  }
  const repeat = text.match(
    /\b(week a|week b|weekly|every week|once|one.off)\b/i,
  );
  if (repeat) {
    nextOptions.repeat = /week a/i.test(repeat[1])
      ? "a"
      : /week b/i.test(repeat[1])
        ? "b"
        : /once|one.off/i.test(repeat[1])
          ? "once"
          : "every";
    nextOptions.scope = "future";
    understood = true;
  }
  if (!understood)
    throw new Error(
      "Sign in for AI editing, or try ‘Friday at 3pm’, ‘room G4’, or ‘energy 2’.",
    );
  return { item: next, options: nextOptions };
}

