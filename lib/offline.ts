import { openDB, type IDBPDatabase } from "idb";
import type { CalendarItem, HistoryEntry } from "@/lib/calendar-engine";
import type { Intention } from "@/lib/intentions";
import type { Exploration, LearningSignal } from "@/lib/study-intelligence";
import type { BlockChoice } from "@/lib/block-choices";
import type { SchoolState } from "@/lib/school";
import { mergePendingMutations, mutationIdentity } from "@/lib/sync";

export type OfflineState = SchoolState & {
  items: CalendarItem[];
  history: HistoryEntry[];
  intentions: Intention[];
  learningSignals: LearningSignal[];
  explorations: Exploration[];
  blockChoices: BlockChoice[];
  completedReviewWeeks: string[];
  ownerKey?: string;
};

export type PendingMutation = {
  dependsOn?: string;
  id?: number;
  table:
    | "calendar_items"
    | "calendar_history"
    | "subjects"
    | "classes"
    | "class_exceptions"
    | "assignments"
    | "assessments"
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

export type LastViewState = {
  zoom: string;
  anchorDate: string;
  selectedDay: string;
  nowOpen: boolean;
  inboxOpen: boolean;
  inboxDockPosition?: { x: number; y: number };
  intentionsOpen: boolean;
  hudOpen: boolean;
  historyOpen: boolean;
  weeklyReviewOpen: boolean;
  weeklyReviewPromptWeek: string | null;
  ownerKey?: string;
  scrollTop?: number;
  viewportHeight?: number;
  visibleDay?: string;
  visibleHour?: number;
  visibleMinute?: number;
};

const DEAD_LETTER_STORE = "calendar-mutations-dead-letter";

const dbPromise: Promise<IDBPDatabase> | null =
  typeof window === "undefined"
    ? null
    : openDB("syllabi-offline", 8, {
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
          if (!database.objectStoreNames.contains(DEAD_LETTER_STORE)) {
            database.createObjectStore(DEAD_LETTER_STORE, {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        },
        blocking() {
          void dbPromise?.then((database) => database.close());
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

export async function saveLastViewState(key: string, state: LastViewState) {
  const database = await dbPromise;
  if (!database) return;
  await database.put("calendar-state", state, key);
}

export async function getLastViewState(
  key: string,
): Promise<LastViewState | null> {
  const database = await dbPromise;
  if (!database) return null;
  return ((await database.get("calendar-state", key)) as LastViewState) ?? null;
}

/**
 * What this device knows about setup and when it last saw the student.
 *
 * Stored per owner so that signing in on a shared device does not inherit
 * somebody else's progress, and stored locally at all because a session with no
 * account still needs both answers.
 */
export type DeviceOnboardingRecord = {
  state: unknown;
  lastSeenAt: string | null;
};

const EMPTY_DEVICE_ONBOARDING: DeviceOnboardingRecord = {
  state: null,
  lastSeenAt: null,
};

function onboardingKey(ownerKey: string) {
  return `onboarding:${ownerKey}`;
}

export async function getDeviceOnboarding(
  ownerKey: string,
): Promise<DeviceOnboardingRecord> {
  const database = await dbPromise;
  if (!database) return EMPTY_DEVICE_ONBOARDING;
  const stored = (await database.get(
    "calendar-state",
    onboardingKey(ownerKey),
  )) as DeviceOnboardingRecord | undefined;
  return stored ?? EMPTY_DEVICE_ONBOARDING;
}

export async function saveDeviceOnboarding(
  ownerKey: string,
  record: DeviceOnboardingRecord,
) {
  const database = await dbPromise;
  if (!database) return;
  await database.put("calendar-state", record, onboardingKey(ownerKey));
}

export async function queueMutation(mutation: PendingMutation) {
  const database = await dbPromise;
  if (!database) return;
  const transaction = database.transaction("calendar-mutations", "readwrite");
  const store = transaction.objectStore("calendar-mutations");
  const existing = (await store.getAll()).filter(
    (candidate) =>
      candidate.ownerKey === mutation.ownerKey &&
      mutationIdentity(candidate) === mutationIdentity(mutation),
  );
  const previous = existing.at(-1);
  const compacted = previous
    ? mergePendingMutations(previous, mutation)
    : mutation;
  await Promise.all(
    existing
      .filter((candidate) => candidate.id !== undefined)
      .map((candidate) => store.delete(candidate.id!)),
  );
  const queued = { ...compacted };
  delete queued.id;
  await store.add(queued);
  await transaction.done;
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

export const MAX_PENDING_FAILURES = 5;

export type DeadLetterMutation = PendingMutation & {
  deadLetteredAt: string;
  attempts: number;
  lastError: string;
};

const dbWithDeadLetterPromise = dbPromise;

export function shouldDeadLetter(mutation: PendingMutation): boolean {
  return (mutation.failureCount ?? 0) >= MAX_PENDING_FAILURES;
}

export async function moveToDeadLetter(
  mutation: PendingMutation,
  lastError: string,
) {
  const database = await dbWithDeadLetterPromise;
  if (!database || mutation.id === undefined) return;
  const transaction = database.transaction(
    [DEAD_LETTER_STORE, "calendar-mutations"],
    "readwrite",
  );
  const deadLetterStore = transaction.objectStore(DEAD_LETTER_STORE);
  const liveStore = transaction.objectStore("calendar-mutations");
  const dead: DeadLetterMutation = {
    ...mutation,
    deadLetteredAt: new Date().toISOString(),
    attempts: mutation.failureCount ?? 0,
    lastError,
  };
  const queuedDead = { ...dead };
  delete queuedDead.id;
  await deadLetterStore.add(queuedDead);
  await liveStore.delete(mutation.id);
  await transaction.done;
}

export async function getDeadLetterMutations(): Promise<DeadLetterMutation[]> {
  const database = await dbWithDeadLetterPromise;
  if (!database) return [];
  return database.getAll(DEAD_LETTER_STORE);
}

export async function removeDeadLetterMutation(id: number) {
  const database = await dbWithDeadLetterPromise;
  if (!database) return;
  await database.delete(DEAD_LETTER_STORE, id);
}
