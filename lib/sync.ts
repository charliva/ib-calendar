import type { PendingMutation } from "./offline.ts";

export const SYNC_TABLES: PendingMutation["table"][] = [
  "calendar_items",
  "calendar_history",
  "subjects",
  "classes",
  "class_exceptions",
  "assignments",
  "assessments",
  "intentions",
  "learning_signals",
  "explorations",
  "time_block_choices",
  "profiles",
];

export function mutationIdentity(mutation: PendingMutation) {
  const blockKey = mutation.payload?.block_key;
  if (
    mutation.table === "time_block_choices" &&
    typeof blockKey === "string" &&
    blockKey
  ) {
    return `${mutation.table}:block:${blockKey}`;
  }
  return `${mutation.table}:record:${mutation.recordId}`;
}

export function mergePendingMutations(
  previous: PendingMutation,
  next: PendingMutation,
): PendingMutation {
  if (next.action === "delete") return next;
  if (previous.action === "delete") return next;
  return {
    ...next,
    action:
      previous.action === "insert" && next.action === "update"
        ? "insert"
        : previous.action === "upsert" || next.action === "upsert"
          ? "upsert"
          : next.action,
    payload: { ...(previous.payload ?? {}), ...(next.payload ?? {}) },
  };
}

export function compactPendingMutations(mutations: PendingMutation[]) {
  const compacted = new Map<string, PendingMutation>();
  const supersededIds: number[] = [];

  for (const mutation of mutations) {
    const key = mutationIdentity(mutation);
    const previous = compacted.get(key);
    if (previous?.id !== undefined) supersededIds.push(previous.id);
    compacted.set(
      key,
      previous ? mergePendingMutations(previous, mutation) : mutation,
    );
  }

  return { mutations: [...compacted.values()], supersededIds };
}

export function prepareMutation(
  mutation: PendingMutation,
  ownerKey: string,
) {
  const payload = mutation.payload ? { ...mutation.payload } : undefined;
  if (payload && mutation.table !== "profiles") payload.user_id = ownerKey;

  return {
    ...mutation,
    payload,
    onConflict:
      mutation.table === "time_block_choices" ? "user_id,block_key" : "id",
  };
}
