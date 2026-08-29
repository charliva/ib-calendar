import {
  flexibilityForNewItem,
  kindLabels,
  makeItem,
  type CalendarItem,
  type CalendarProposal,
  type HistoryEntry,
  type ItemKind,
  type ProposalChange,
} from "../calendar-engine.ts";
import { normalizeItemTiming } from "./scheduling.ts";
import type { Intention } from "../intentions.ts";

function restoredStateDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export type ParsedCommand = {
  action: string;
  subject: string;
  timing: string | null;
  shift: string | null;
};

export function parsedCommand(command: string): ParsedCommand | null {
  const clean = command.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const action = lower.startsWith("move")
    ? "Move"
    : lower.startsWith("block")
      ? "Block"
      : lower.startsWith("filter")
        ? "Filter"
        : /delete|remove/.test(lower)
          ? "Remove"
          : "Create";
  const timing =
    clean.match(
      /\b(today|tomorrow|tonight|this (?:morning|afternoon|evening)|next \w+|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b[^,]*/i,
    )?.[0] ?? null;
  const shift =
    clean.match(
      /\b(?:one|\d+)\s+(?:hour|hours|minute|minutes)\s+later\b/i,
    )?.[0] ??
    clean.match(/\b\d+\s*(?:–|-|to)\s*\d+\s*min\b/i)?.[0] ??
    clean.match(/\b~?\d+\s*(?:min|minutes|hour|hours)\b/i)?.[0] ??
    null;
  const subject = clean
    .replace(/^(move|block|create|add|schedule|filter|delete|remove)\s+/i, "")
    .replace(timing ?? "", "")
    .replace(shift ?? "", "")
    .replace(/\b(?:at|for|sometime|after|before|on|by)\b\s*$/i, "")
    .trim()
    .replace(/[,.]+$/, "");
  return {
    action,
    subject: subject || "calendar item",
    timing,
    shift,
  };
}

export function simpleFallbackProposal(command: string): CalendarProposal {
  const lower = command.toLowerCase();
  const kind: ItemKind = lower.includes("event")
    ? "event"
    : lower.includes("intention") || lower.includes("want to")
      ? "intention"
      : "task";
  const durationMatch = lower.match(/(?:~|about\s*)?(\d+)\s*(?:min|minute)/);
  const duration = durationMatch ? Number(durationMatch[1]) : 30;
  const item = makeItem({
    kind,
    title: command.replace(/^(add|create|new)\s+/i, "").trim(),
    durationMin: Math.max(5, duration),
    durationMax: lower.includes("~") ? Math.max(10, duration + 15) : duration,
    flexibility: flexibilityForNewItem({ kind }),
    energyType: /study|essay|revision|exam|test/i.test(command)
      ? "deep_focus"
      : "light_work",
    source: "command",
  });
  return {
    id: crypto.randomUUID(),
    title: `Create ${kindLabels[kind].toLowerCase()}`,
    summary: "A local proposal was created because AI planning is unavailable.",
    source: "command",
    changes: [
      {
        id: crypto.randomUUID(),
        type: "create",
        itemId: null,
        reason: "Created from your command.",
        before: null,
        after: item,
      },
    ],
  };
}

export function isAttentionQuestion(command: string) {
  return /(?:what should i|what do i|give me something useful|work on tonight|do (?:right )?now)/i.test(
    command,
  );
}

export function intentionFromCommand(
  command: string,
): Partial<Intention> | null {
  const repeated =
    /(?:every day|daily|every week|weekly|consistently|roughly .+ per day|(?:^|\bi\s+)(?:want to\s+)?(?:understand|get better|improve|read|work on|start studying|study consistently))/i.test(
      command,
    );
  if (!repeated) return null;
  const duration = command.match(/(\d+)\s*(?:minutes?|mins?)/i);
  const hour = command.match(/(?:an?|one|1)\s*hours?/i);
  return {
    title: command.replace(/^i want to\s+/i, "").replace(/[.]$/, ""),
    cadence: /every day|daily|per day/i.test(command)
      ? "daily"
      : /every week|weekly/i.test(command)
        ? "weekly"
        : "flexible",
    targetSessions: /every day|daily|per day/i.test(command) ? 5 : 1,
    targetMinutes: duration ? Number(duration[1]) : hour ? 60 : 60,
    preferredSessionMinutes: duration ? Number(duration[1]) : hour ? 60 : 30,
  };
}

export function proposalFromCommandResponse(
  raw: {
    title: string;
    summary: string;
    changes: Array<{
      type: "create" | "update" | "delete";
      itemId: string | null;
      reason: string;
      after: Partial<CalendarItem> | null;
    }>;
  },
  current: CalendarItem[],
): CalendarProposal {
  const changes: ProposalChange[] = raw.changes.map((change) => {
    const before = change.itemId
      ? (current.find((item) => item.id === change.itemId) ?? null)
      : null;
    let after: CalendarItem | null = null;
    if (change.type !== "delete" && change.after) {
      const merged = { ...(before ?? {}), ...change.after };
      const inferredDuration =
        !before && merged.startsAt && merged.endsAt
          ? Math.max(
              5,
              Math.round(
                (new Date(merged.endsAt).getTime() -
                  new Date(merged.startsAt).getTime()) /
                  60_000,
              ),
            )
          : undefined;
      const durationMin =
        change.after.durationMin ??
        before?.durationMin ??
        inferredDuration ??
        30;
      const kind = change.after.kind ?? before?.kind ?? "task";
      after = normalizeItemTiming(
        makeItem({
          ...merged,
          id: before?.id ?? crypto.randomUUID(),
          title: change.after.title ?? before?.title ?? "Untitled",
          kind,
          flexibility: before
            ? merged.flexibility
            : flexibilityForNewItem({
                kind,
                flexibility: merged.flexibility,
                constraints: merged.constraints,
              }),
          durationMin,
          durationMax:
            change.after.durationMax ?? before?.durationMax ?? durationMin,
          source: "command",
          syncStatus: "pending",
        }),
      );
    }
    return {
      id: crypto.randomUUID(),
      type: change.type,
      itemId: before?.id ?? null,
      reason: change.reason,
      before,
      after,
    };
  });
  return {
    id: crypto.randomUUID(),
    title: raw.title,
    summary: raw.summary,
    changes,
    source: "command",
  };
}

export function restoreProposal(
  entry: HistoryEntry,
  current: CalendarItem[],
): CalendarProposal {
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const historicalMap = new Map(entry.items.map((item) => [item.id, item]));
  const ids = new Set([...currentMap.keys(), ...historicalMap.keys()]);
  const changes: ProposalChange[] = [];
  ids.forEach((id) => {
    const before = currentMap.get(id) ?? null;
    const after = historicalMap.get(id) ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    changes.push({
      id: crypto.randomUUID(),
      type:
        before && !after ? "delete" : !before && after ? "create" : "update",
      itemId: before?.id ?? null,
    reason: `Restore the state from ${restoredStateDate(
      new Date(entry.createdAt),
    )}.`,
      before,
      after: after ? { ...after, syncStatus: "pending" } : null,
    });
  });
  return {
    id: crypto.randomUUID(),
    title: `Restore “${entry.label}”`,
    summary: `${changes.length} calendar change${
      changes.length === 1 ? "" : "s"
    } will be previewed before restoring.`,
    source: "command",
    changes,
  };
}
