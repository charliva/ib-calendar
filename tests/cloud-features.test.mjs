import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudAvailability,
  isAuthenticationFailure,
} from "../lib/cloud-features.ts";
import {
  hasBlockingOverlay,
  ownsEscape,
  popOverlay,
  pushOverlay,
  resetOverlayStack,
} from "../lib/overlay/escape-stack.ts";

test("model-backed features need an account", () => {
  assert.deepEqual(cloudAvailability({ hasAccount: true, isOnline: true }), {
    available: true,
    reason: null,
  });
  assert.deepEqual(cloudAvailability({ hasAccount: false, isOnline: true }), {
    available: false,
    reason: "no-account",
  });
});

test("being signed in is not enough while offline", () => {
  assert.deepEqual(cloudAvailability({ hasAccount: true, isOnline: false }), {
    available: false,
    reason: "offline",
  });
});

test("a missing account outranks being offline in the explanation", () => {
  assert.equal(
    cloudAvailability({ hasAccount: false, isOnline: false }).reason,
    "no-account",
  );
});

test("an expired session is recognised however the failure arrives", () => {
  assert.equal(isAuthenticationFailure({ status: 401 }), true);
  assert.equal(isAuthenticationFailure({ status: 403 }), true);
  assert.equal(
    isAuthenticationFailure(new Error("Authentication required")),
    true,
  );
  assert.equal(isAuthenticationFailure("Unauthorized"), true);
  assert.equal(isAuthenticationFailure(new Error("Network request failed")), false);
  assert.equal(isAuthenticationFailure(null), false);
});

test("an open overlay takes the escape key from the global handler", () => {
  resetOverlayStack();
  assert.equal(hasBlockingOverlay(), false);
  pushOverlay("settings");
  assert.equal(hasBlockingOverlay(), true);
  assert.equal(ownsEscape("settings"), true);
  popOverlay("settings");
  assert.equal(hasBlockingOverlay(), false);
});

test("the topmost overlay owns escape when several are stacked", () => {
  resetOverlayStack();
  pushOverlay("settings");
  pushOverlay("onboarding");
  assert.equal(ownsEscape("onboarding"), true);
  assert.equal(ownsEscape("settings"), false);
  popOverlay("onboarding");
  assert.equal(ownsEscape("settings"), true);
  resetOverlayStack();
});

test("closing an overlay that was never open is harmless", () => {
  resetOverlayStack();
  popOverlay("never-opened");
  assert.equal(hasBlockingOverlay(), false);
});
