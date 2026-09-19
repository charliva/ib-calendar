import assert from "node:assert/strict";
import test from "node:test";
import {
  ANCHOR_WAIT_MS,
  anchorSelector,
  watchForAnchor,
} from "../lib/overlay/anchor.ts";

/** A stand-in for the browser: a tree you mutate by hand, plus manual timers. */
function makeHost() {
  const present = new Map();
  const listeners = new Set();
  const timers = new Map();
  let nextTimer = 1;
  return {
    host: {
      find: (selector) => present.get(selector) ?? null,
      observe: (onMutate) => {
        listeners.add(onMutate);
        return () => listeners.delete(onMutate);
      },
      setTimer: (callback, ms) => {
        const id = nextTimer++;
        timers.set(id, { callback, ms });
        return id;
      },
      clearTimer: (id) => timers.delete(id),
    },
    mount(selector, element) {
      present.set(selector, element);
      for (const listener of [...listeners]) listener();
    },
    fireTimers() {
      for (const { callback } of [...timers.values()]) callback();
    },
    get watching() {
      return listeners.size;
    },
    get pendingTimers() {
      return timers.size;
    },
  };
}

function collect() {
  const calls = { found: [], missing: 0 };
  return {
    calls,
    handlers: {
      onFound: (element) => calls.found.push(element),
      onMissing: () => {
        calls.missing += 1;
      },
    },
  };
}

test("an anchor already on screen resolves immediately", () => {
  const control = makeHost();
  const host = control.host;
  control.mount(anchorSelector("task-dock"), "dock-element");
  const { calls, handlers } = collect();

  watchForAnchor(host, "task-dock", handlers);

  assert.deepEqual(calls.found, ["dock-element"]);
  assert.equal(calls.missing, 0);
  assert.equal(control.watching, 0, "should not observe when already found");
});

test("an anchor behind a lazily loaded view resolves once it mounts", () => {
  const control = makeHost();
  const host = control.host;
  const { calls, handlers } = collect();

  watchForAnchor(host, "subjects", handlers);
  assert.deepEqual(calls.found, [], "not present yet");
  assert.equal(control.watching, 1, "should be watching the tree");

  // The School workspace chunk finishes loading and mounts its tab bar.
  control.mount(anchorSelector("subjects"), "subjects-tab");

  assert.deepEqual(calls.found, ["subjects-tab"]);
  assert.equal(calls.missing, 0);
  assert.equal(control.watching, 0, "should stop watching once found");
  assert.equal(control.pendingTimers, 0, "should cancel its give-up timer");
});

test("unrelated tree changes do not resolve the wrong element", () => {
  const control = makeHost();
  const host = control.host;
  const { calls, handlers } = collect();

  watchForAnchor(host, "subjects", handlers);
  control.mount(anchorSelector("timetable-import"), "import-button");

  assert.deepEqual(calls.found, [], "a different anchor must not match");
  assert.equal(control.watching, 1, "should still be waiting");
});

test("an anchor that never appears falls back rather than hanging", () => {
  const control = makeHost();
  const host = control.host;
  const { calls, handlers } = collect();

  watchForAnchor(host, "nonexistent", handlers);
  control.fireTimers();

  assert.equal(calls.missing, 1);
  assert.deepEqual(calls.found, []);
  assert.equal(control.watching, 0, "should stop watching after giving up");
});

test("resolving after the deadline does not revive a given-up step", () => {
  const control = makeHost();
  const host = control.host;
  const { calls, handlers } = collect();

  watchForAnchor(host, "subjects", handlers);
  control.fireTimers();
  control.mount(anchorSelector("subjects"), "late-arrival");

  assert.equal(calls.missing, 1);
  assert.deepEqual(calls.found, [], "a late mount must not re-anchor");
});

test("cleanup stops watching and cancels the deadline", () => {
  const control = makeHost();
  const host = control.host;
  const { calls, handlers } = collect();

  const stop = watchForAnchor(host, "subjects", handlers);
  stop();
  control.mount(anchorSelector("subjects"), "after-unmount");
  control.fireTimers();

  assert.deepEqual(calls.found, []);
  assert.equal(calls.missing, 0);
  assert.equal(control.watching, 0);
});

test("the wait budget is long enough for a slow chunk fetch", () => {
  // The previous implementation gave up after roughly a second of frames, which
  // was routinely shorter than loading the School workspace.
  assert.ok(ANCHOR_WAIT_MS >= 5000);
});
