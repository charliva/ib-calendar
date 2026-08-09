import { openDB } from "idb";

export type Subject = {
  id: string;
  name: string;
  color: "violet" | "blue" | "orange" | "green";
};

export type Assignment = {
  id: string;
  subjectId: string | null;
  subjectName: string;
  color: Subject["color"];
  title: string;
  dueAt: string | null;
  startsAt: string | null;
  studyBlockId: string | null;
  estimatedMinutes: number;
  urgency: "low" | "medium" | "high";
  status: "planned" | "completed";
  reason: string;
  studySteps: string[];
  createdAt: string;
  syncStatus: "pending" | "synced";
};

export type Reminder = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  remindAt: string;
  status: "scheduled" | "queued" | "sent" | "failed" | "cancelled";
  syncStatus: "pending" | "synced";
};

export type OfflineState = {
  subjects: Subject[];
  assignments: Assignment[];
  reminders: Reminder[];
};

export type PendingMutation = {
  id?: number;
  table: "subjects" | "assignments" | "study_blocks" | "reminders";
  action: "upsert" | "update" | "delete";
  recordId: string;
  payload?: Record<string, unknown>;
};

const dbPromise =
  typeof window === "undefined"
    ? null
    : openDB("syllabi-offline", 2, {
        upgrade(database) {
          if (!database.objectStoreNames.contains("state")) {
            database.createObjectStore("state");
          }
          if (!database.objectStoreNames.contains("mutations")) {
            database.createObjectStore("mutations", {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        },
      });

export async function saveOfflineState(state: OfflineState) {
  const database = await dbPromise;
  if (!database) return;
  await database.put("state", state, "current");
}

export async function getOfflineState(): Promise<OfflineState | null> {
  const database = await dbPromise;
  if (!database) return null;
  return (await database.get("state", "current")) ?? null;
}

export async function queueMutation(mutation: PendingMutation) {
  const database = await dbPromise;
  if (!database) return;
  await database.add("mutations", mutation);
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const database = await dbPromise;
  if (!database) return [];
  return database.getAll("mutations");
}

export async function removePendingMutation(id: number) {
  const database = await dbPromise;
  if (!database) return;
  await database.delete("mutations", id);
}
