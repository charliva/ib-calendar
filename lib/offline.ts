import { openDB } from "idb";

export type LocalAssignment = {
  id: number;
  time: string;
  duration: string;
  subject: string;
  title: string;
  color: string;
  badge: string;
  done: boolean;
  syncStatus: "pending" | "synced";
};

const dbPromise =
  typeof window === "undefined"
    ? null
    : openDB("syllabi-offline", 1, {
        upgrade(database) {
          if (!database.objectStoreNames.contains("assignments")) {
            database.createObjectStore("assignments", { keyPath: "id" });
          }
        },
      });

export async function putLocalAssignment(assignment: LocalAssignment) {
  const database = await dbPromise;
  if (!database) return;
  await database.put("assignments", assignment);
}

export async function getLocalAssignments(): Promise<LocalAssignment[]> {
  const database = await dbPromise;
  if (!database) return [];
  return database.getAll("assignments");
}
