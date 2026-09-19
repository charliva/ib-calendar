import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvitationToken,
  invitationTokenHash,
  isInvitationToken,
  normalizeInvitationEmail,
} from "../lib/invitations.ts";

test("normalizes valid invitation emails and rejects malformed input", () => {
  assert.equal(normalizeInvitationEmail("  Friend@Example.COM "), "friend@example.com");
  assert.equal(normalizeInvitationEmail("not-an-email"), null);
  assert.equal(normalizeInvitationEmail(null), null);
});

test("creates random invite tokens and stores a one-way hash", async () => {
  const first = createInvitationToken();
  const second = createInvitationToken();
  assert.equal(isInvitationToken(first), true);
  assert.notEqual(first, second);

  const hash = await invitationTokenHash(first);
  assert.equal(isInvitationToken(hash), true);
  assert.notEqual(hash, first);
  assert.equal(await invitationTokenHash(first), hash);
});
