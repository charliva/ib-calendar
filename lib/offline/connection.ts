import { openDB, type IDBPDatabase } from "idb";

/**
 * The device's IndexedDB handle, and what to do when it goes away underneath us.
 *
 * A single module-scope `openDB(...)` promise is the obvious shape and it is
 * wrong in one specific, losing way. `idb` calls `blocking()` when another tab
 * asks to upgrade the schema, and the only correct answer is to close so that
 * tab can proceed. But closing leaves the cached promise resolved to a dead
 * handle: every later `database.transaction(...)` throws
 * `InvalidStateError: The database connection is closing`, forever, in a tab
 * that looks completely healthy. Nothing the student does from that moment on
 * reaches the device — not an edit, not a queued mutation — and nothing tells
 * them. On the next refresh the work is simply gone.
 *
 * It takes two tabs and a schema bump, which is exactly what a deploy does to
 * somebody who left the calendar open in a background tab.
 *
 * So the handle is cached but re-openable, and the two ways it can die are
 * told apart:
 *
 *   - The browser dropped the connection (`terminated`). Nothing is wrong with
 *     the data; forget the handle and the next call opens a fresh one.
 *   - Another tab moved the schema on (`blocking`). This tab is running code
 *     that predates the store it would be writing into, so re-opening is not
 *     safe — `openDB` at the old version would fail with a `VersionError`
 *     anyway. The handle is retired and every later call rejects with
 *     {@link OfflineSchemaMovedError}, which the calendar surfaces as a
 *     prompt to reload.
 *
 * The opener is a parameter rather than a hard-wired `openDB` call so the
 * state machine can be tested without a browser: IndexedDB does not exist
 * under bare node, and this is the part that has to be right.
 */

/** Thrown once another tab has upgraded the schema this tab was built for. */
export class OfflineSchemaMovedError extends Error {
  constructor() {
    super(
      "This tab is running an older version of Syllabi than the one that just opened. Reload to keep saving changes.",
    );
    this.name = "OfflineSchemaMovedError";
  }
}

/** What the connection needs to hear back from whatever holds the handle. */
export type ConnectionHooks<Handle> = {
  /** Another connection wants to upgrade; close `handle` and stand down. */
  blocking: (handle: Handle | null) => void;
  /** The browser dropped the connection; it can simply be re-opened. */
  terminated: () => void;
};

export type Connection<Handle> = {
  /**
   * The live handle, or `null` where there is no IndexedDB at all (the server).
   * Rejects with {@link OfflineSchemaMovedError} once the schema has moved on.
   */
  get: () => Promise<Handle | null>;
  /** Whether another tab has upgraded past this tab's schema version. */
  hasSchemaMoved: () => boolean;
  /** Runs when the schema moves on, so the UI can ask for a reload. */
  onSchemaMoved: (listener: () => void) => () => void;
};

export function createConnection<Handle extends { close: () => void }>(
  opener: (hooks: ConnectionHooks<Handle>) => Promise<Handle>,
  isAvailable: () => boolean = () => typeof window !== "undefined",
): Connection<Handle> {
  let cached: Promise<Handle> | null = null;
  let schemaMoved = false;
  const listeners = new Set<() => void>();

  const open = (): Promise<Handle> => {
    const promise = opener({
      blocking(handle) {
        // Get out of the upgrading tab's way first — it is waiting on this
        // close — and only then retire the handle.
        handle?.close();
        if (schemaMoved) return;
        schemaMoved = true;
        cached = null;
        for (const listener of listeners) listener();
      },
      terminated() {
        // Not the data's problem: drop the handle so the next call re-opens.
        if (cached === promise) cached = null;
      },
    });
    // A failed open must not stay cached, or one flaky moment poisons the tab.
    promise.catch(() => {
      if (cached === promise) cached = null;
    });
    return promise;
  };

  return {
    async get() {
      if (!isAvailable()) return null;
      if (schemaMoved) throw new OfflineSchemaMovedError();
      if (!cached) cached = open();
      return cached;
    },
    hasSchemaMoved: () => schemaMoved,
    onSchemaMoved(listener) {
      if (schemaMoved) listener();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createOfflineConnection(
  name: string,
  version: number,
  upgrade: (database: IDBPDatabase) => void,
): Connection<IDBPDatabase> {
  return createConnection<IDBPDatabase>((hooks) =>
    openDB(name, version, {
      upgrade,
      blocking(_currentVersion, _blockedVersion, event) {
        hooks.blocking(event.target as IDBPDatabase | null);
      },
      terminated: hooks.terminated,
    }),
  );
}
