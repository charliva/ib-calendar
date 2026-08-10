import { openDB } from "idb";
import type { CalendarItem, HistoryEntry } from "@/lib/calendar-engine";
import type { Intention } from "@/lib/intentions";
import type { Exploration, LearningSignal } from "@/lib/study-intelligence";
import type { BlockChoice } from "@/lib/block-choices";
import type { SchoolState } from "@/lib/school";

export type OfflineState = SchoolState & {
  items: CalendarItem[];
  history: HistoryEntry[];
  intentions: Intention[];
  learningSignals: LearningSignal[];
  explorations: Exploration[];
  blockChoices: BlockChoice[];
  ownerKey?: string;
};

export type PendingMutation = {
  id?: number;
  table:
    | "calendar_items"
    | "calendar_history"
    | "subjects"
    | "classes"
    | "class_exceptions"
    | "assignments"
    | "assessments"
    | "homework_captures"
    | "intentions"
    | "learning_signals"
    | "explorations"
    | "time_block_choices"
    | "profiles";
  action: "upsert" | "update" | "delete" | "insert";
  recordId: string;
  payload?: Record<string, unknown>;
  ownerKey?: string;
  failureCount?: number;
  lastError?: string;
};

const dbPromise =
  typeof window === "undefined"
    ? null
    : openDB("syllabi-offline", 7, {
        upgrade(database) {
          if (!database.objectStoreNames.contains("calendar-state")) {
            database.createObjectStore("calendar-state");
          }
          if (!database.objectStoreNames.contains("calendar-mutations")) {
            database.createObjectStore("calendar-mutations", {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        },
      });

export async function saveOfflineState(state: OfflineState) {
  const database = await dbPromise;
  if (!database) return;
  await database.put("calendar-state", state, "current");
}

export async function getOfflineState(): Promise<OfflineState | null> {
  const database = await dbPromise;
  if (!database) return null;
  return (await database.get("calendar-state", "current")) ?? null;
}

export async function queueMutation(mutation: PendingMutation) {
  const database = await dbPromise;
  if (!database) return;
  await database.add("calendar-mutations", mutation);
}

export async function getPendingMutations(
  ownerKey?: string,
): Promise<PendingMutation[]> {
  const database = await dbPromise;
  if (!database) return [];
  const mutations = await database.getAll("calendar-mutations");
  if (!ownerKey) return mutations;
  return mutations.filter(
    (mutation) =>
      mutation.ownerKey === ownerKey ||
      (ownerKey !== "local" &&
        (mutation.ownerKey === "local" || mutation.ownerKey === undefined)),
  );
}

export async function removePendingMutation(id: number) {
  const database = await dbPromise;
  if (!database) return;
  await database.delete("calendar-mutations", id);
}

export async function updatePendingMutation(mutation: PendingMutation) {
  const database = await dbPromise;
  if (!database || mutation.id === undefined) return;
  await database.put("calendar-mutations", mutation);
}
