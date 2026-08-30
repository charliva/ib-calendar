import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_TEMPLATES } from "../lib/personal-templates.ts";
import { BLOCKED_TERMS, containsBlockedTerm } from "../lib/block-suggestion-safety.ts";

test("personal templates: list is non-empty and well-formed", () => {
  assert.ok(PERSONAL_TEMPLATES.length > 0, "PERSONAL_TEMPLATES must have entries");
  for (const template of PERSONAL_TEMPLATES) {
    assert.equal(typeof template.id, "string", `${template.id}: id must be a string`);
    assert.ok(template.id.length > 0, "id must be non-empty");
    assert.equal(typeof template.minutes, "number", `${template.id}: minutes must be a number`);
    assert.equal(typeof template.low, "string", `${template.id}: low must be a string`);
    assert.equal(typeof template.high, "string", `${template.id}: high must be a string`);
    assert.equal(typeof template.score, "number", `${template.id}: score must be a number`);
  }
});

test("personal templates: ids are unique", () => {
  const ids = PERSONAL_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(", ")}`);
});

test("personal templates: every minutes value is <= 30", () => {
  for (const template of PERSONAL_TEMPLATES) {
    assert.ok(
      template.minutes <= 30,
      `${template.id}: minutes ${template.minutes} exceeds 30`,
    );
    assert.ok(
      template.minutes >= 1,
      `${template.id}: minutes ${template.minutes} is too small to be useful`,
    );
  }
});

test("personal templates: low and high fields are non-empty and end in a period or verb", () => {
  for (const template of PERSONAL_TEMPLATES) {
    assert.ok(template.low.length > 0, `${template.id}: low is empty`);
    assert.ok(template.high.length > 0, `${template.id}: high is empty`);
  }
});

test("personal templates: NO low or high string contains a blocked term", () => {
  for (const template of PERSONAL_TEMPLATES) {
    assert.equal(
      containsBlockedTerm(template.low),
      false,
      `${template.id}.low contains a blocked term: "${template.low}"`,
    );
    assert.equal(
      containsBlockedTerm(template.high),
      false,
      `${template.id}.high contains a blocked term: "${template.high}"`,
    );
  }
});

test("personal templates: NO low or high string is generic-bait like a media brand", () => {
  // Belt-and-suspenders: even if BLOCKED_TERMS is incomplete, the templates
  // themselves are reviewed in PRs. This test surfaces any new entry that
  // *names* a specific show, app, or platform.
  for (const template of PERSONAL_TEMPLATES) {
    const combined = `${template.low} ${template.high}`.toLowerCase();
    for (const term of BLOCKED_TERMS) {
      assert.ok(
        !combined.includes(term.toLowerCase()),
        `${template.id}: text references blocklisted brand "${term}"`,
      );
    }
  }
});

test("personal templates: count is at least 12 (lower bound for variety)", () => {
  assert.ok(
    PERSONAL_TEMPLATES.length >= 12,
    `expected at least 12 templates, found ${PERSONAL_TEMPLATES.length}`,
  );
});
