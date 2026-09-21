// A deploy that bumps the IndexedDB schema hits anybody who left the calendar
// open in a background tab. The new tab asks to upgrade, idb calls blocking()
// on the old one, and the only correct answer is to close.
//
// Closing used to leave the module-scope promise resolved to a dead handle.
// Every later write threw "InvalidStateError: The database connection is
// closing" — forever, in a tab that looked completely healthy, with nothing
// shown to the student. Reproduced in Chrome against a faithful model of the
// old code: both writes after the upgrade threw, and the value surviving a
// refresh was the one written *before* it.
//
// These pin the two ways the handle can die, which have to be told apart: a
// browser-terminated connection is re-openable, a schema that has moved on is
// not, because openDB at the old version would fail with a VersionError.

import assert from "node:assert/strict";
import test from "node:test";

import {
  OfflineSchemaMovedError,
  createConnection,
} from "../lib/offline/connection.ts";

/** A stand-in for the browser, so the state machine can be driven directly. */
function fakeDatabase() {
  let opens = 0;
  let hooks = null;
  const closed = [];
  const handles = [];
  const connection = createConnection((received) => {
    opens += 1;
    hooks = received;
    const handle = {
      id: opens,
      close() {
        closed.push(this.id);
      },
    };
    handles.push(handle);
    return Promise.resolve(handle);
  }, () => true);
  return {
    connection,
    opens: () => opens,
    closed: () => closed,
    /** What the browser calls when another tab wants to upgrade. */
    anotherTabUpgrades: () => hooks.blocking(handles.at(-1)),
    /** What the browser calls when it drops the connection by itself. */
    browserDropsConnection: () => hooks.terminated(),
  };
}

test("the handle is opened once and reused", async () => {
  const db = fakeDatabase();
  const first = await db.connection.get();
  const second = await db.connection.get();
  assert.equal(db.opens(), 1);
  assert.equal(first, second);
});

test("a connection the browser dropped is re-opened on the next call", async () => {
  const db = fakeDatabase();
  await db.connection.get();
  db.browserDropsConnection();
  const reopened = await db.connection.get();
  assert.equal(db.opens(), 2, "a dropped connection must be replaced");
  assert.notEqual(reopened, null);
  assert.equal(db.connection.hasSchemaMoved(), false);
});

test("another tab's upgrade closes this handle so that tab is not blocked", async () => {
  const db = fakeDatabase();
  await db.connection.get();
  db.anotherTabUpgrades();
  assert.deepEqual(db.closed(), [1], "the upgrading tab is waiting on this close");
});

test("writes after another tab's upgrade fail loudly instead of vanishing", async () => {
  const db = fakeDatabase();
  await db.connection.get();
  db.anotherTabUpgrades();
  await assert.rejects(
    () => db.connection.get(),
    (error) => error instanceof OfflineSchemaMovedError,
  );
  // And it must not quietly re-open at the old version either — that is the
  // VersionError the browser would raise anyway.
  assert.equal(db.opens(), 1);
  assert.equal(db.connection.hasSchemaMoved(), true);
});

test("the calendar is told once, so it can ask for a reload", async () => {
  const db = fakeDatabase();
  let told = 0;
  db.connection.onSchemaMoved(() => {
    told += 1;
  });
  await db.connection.get();
  db.anotherTabUpgrades();
  db.anotherTabUpgrades();
  assert.equal(told, 1, "a second upgrade must not re-notify");
});

test("subscribing after the schema moved still tells the subscriber", async () => {
  const db = fakeDatabase();
  await db.connection.get();
  db.anotherTabUpgrades();
  let told = 0;
  db.connection.onSchemaMoved(() => {
    told += 1;
  });
  assert.equal(told, 1);
});

test("unsubscribing stops the notification", async () => {
  const db = fakeDatabase();
  let told = 0;
  const stop = db.connection.onSchemaMoved(() => {
    told += 1;
  });
  stop();
  await db.connection.get();
  db.anotherTabUpgrades();
  assert.equal(told, 0);
});

test("a failed open is not cached, so one flaky moment does not poison the tab", async () => {
  let attempts = 0;
  const connection = createConnection(() => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new Error("quota"));
    return Promise.resolve({ id: attempts, close() {} });
  }, () => true);

  await assert.rejects(() => connection.get());
  const second = await connection.get();
  assert.equal(second.id, 2);
  assert.equal(attempts, 2);
});

test("there is no handle at all where IndexedDB does not exist", async () => {
  const connection = createConnection(
    () => Promise.reject(new Error("should never be called on the server")),
    () => false,
  );
  assert.equal(await connection.get(), null);
});

test("the error carries a message a student can act on", () => {
  const error = new OfflineSchemaMovedError();
  assert.equal(error.name, "OfflineSchemaMovedError");
  assert.match(error.message, /reload/i);
  assert.equal(error instanceof Error, true);
});
