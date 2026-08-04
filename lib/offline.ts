import { openDB } from "idb";
import type { CalendarItem, HistoryEntry } from "@/lib/calendar-engine";
import type { SchoolState } from "@/lib/school";

export type OfflineState = SchoolState & {
  items: CalendarItem[];
  history: HistoryEntry[];
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
    | "profiles";
  action: "upsert" | "update" | "delete" | "insert";
  recordId: string;
  payload?: Record<string, unknown>;
};

const dbPromise =
  typeof window === "undefined"
    ? null
    : openDB("syllabi-offline", 5, {
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

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const database = await dbPromise;
  if (!database) return [];
  return database.getAll("calendar-mutations");
}

export async function removePendingMutation(id: number) {
  const database = await dbPromise;
  if (!database) return;
  await database.delete("calendar-mutations", id);
}
