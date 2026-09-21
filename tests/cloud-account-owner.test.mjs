// Signing out and back in as somebody else never remounts the calendar page,
// and onAuthStateChange can null the user from another tab or an expired
// session without any sign-out code running at all. The cloud snapshot
// therefore outlived the account that produced it: the first student's
// completed setup steps were read as the second student's, stamped into their
// device record and upserted into their profiles row. mergeOnboardingState is
// a union that never subtracts, so the pollution was permanent — the new
// student landed on an empty calendar with the guided setup already finished.
//
// These pin the rule that replaced the bare "loaded" flag: a snapshot is read
// only by the account it was fetched for.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveCloudAccount } from "../lib/calendar/cloud-account-owner.ts";

const snapshotForA = {
  ownerKey: "user-a",
  onboardingState: { completed: ["add-subjects", "import-timetable"] },
  lastSeenAt: "2026-09-01T08:00:00.000Z",
};

test("an account reads its own snapshot", () => {
  const resolved = resolveCloudAccount(snapshotForA, "user-a", true, true);
  assert.equal(resolved.cloudLoaded, true);
  assert.deepEqual(resolved.cloudOnboardingState, snapshotForA.onboardingState);
  assert.equal(resolved.cloudLastSeenAt, snapshotForA.lastSeenAt);
});

test("the next account never inherits the previous one's progress", () => {
  const resolved = resolveCloudAccount(snapshotForA, "user-b", true, true);
  assert.equal(resolved.cloudOnboardingState, null);
  assert.equal(resolved.cloudLastSeenAt, null);
  // And it must not claim to be loaded either: reporting "loaded, nothing
  // here" is what let the stamping effect run before user-b's own read
  // landed, which is how the pollution was written.
  assert.equal(resolved.cloudLoaded, false);
});

test("signing out does not leave the account's progress readable", () => {
  const resolved = resolveCloudAccount(snapshotForA, "local", true, false);
  assert.equal(resolved.cloudOnboardingState, null);
  assert.equal(resolved.cloudLastSeenAt, null);
});

test("a signed-out session is loaded as soon as local state is in memory", () => {
  assert.equal(resolveCloudAccount(null, "local", true, false).cloudLoaded, true);
  assert.equal(resolveCloudAccount(null, "local", false, false).cloudLoaded, false);
});

test("a signed-in session waits for its own snapshot", () => {
  assert.equal(resolveCloudAccount(null, "user-a", true, true).cloudLoaded, false);
});

test("a snapshot arriving late for an account that already left is ignored", () => {
  // loadCloud(A) resolving after the user switched to B retags nothing: the
  // snapshot still says user-a, and B's read of it is empty.
  const resolved = resolveCloudAccount(snapshotForA, "user-b", true, true);
  assert.equal(resolved.cloudOnboardingState, null);
});
