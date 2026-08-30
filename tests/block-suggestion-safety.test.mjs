import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKED_TERMS,
  MAX_DURATION_MIN,
  containsBlockedTerm,
  filterSuggestionsForPicker,
} from "../lib/block-suggestion-safety.ts";

function makeSuggestion(overrides = {}) {
  return {
    id: "test-suggestion",
    category: "meaningful",
    sourceType: "generic",
    sourceId: "test-source",
    title: "Take a walk",
    description: "Step outside and walk for ten minutes.",
    estimatedDuration: 20,
    reason: "Outdoor break fits this block.",
    ...overrides,
  };
}

test("blocklist: BLOCKED_TERMS is non-empty and well-formed", () => {
  assert.ok(BLOCKED_TERMS.length > 0, "BLOCKED_TERMS must have at least one entry");
  for (const term of BLOCKED_TERMS) {
    assert.equal(typeof term, "string", `blocklist entry must be a string: ${term}`);
    assert.ok(term.length > 0, `blocklist entry must be non-empty: ${term}`);
  }
});

test("blocklist: containsBlockedTerm catches the prior problem (Gilmore Girls)", () => {
  assert.equal(containsBlockedTerm("Watch Gilmore Girls tonight"), true);
  assert.equal(containsBlockedTerm("Watch an episode of Gilmore Girls"), true);
  assert.equal(containsBlockedTerm("gilmore girls marathon"), true);
});

test("blocklist: containsBlockedTerm catches streaming apps", () => {
  assert.equal(containsBlockedTerm("Open Spotify and find a playlist"), true);
  assert.equal(containsBlockedTerm("A short YouTube break"), true);
  assert.equal(containsBlockedTerm("Scroll TikTok for ten minutes"), true);
  assert.equal(containsBlockedTerm("Catch up on Netflix"), true);
  assert.equal(containsBlockedTerm("Listen on Audible"), true);
});

test("blocklist: containsBlockedTerm does NOT false-positive on similar words", () => {
  assert.equal(containsBlockedTerm("Read a few pages of a book"), false);
  assert.equal(containsBlockedTerm("Write down the lyric you like"), false);
  assert.equal(containsBlockedTerm("Call a friend"), false);
  assert.equal(containsBlockedTerm("Make a playlist"), false);
  assert.equal(containsBlockedTerm("Step outside"), false);
});

test("blocklist: containsBlockedTerm handles empty and non-string input", () => {
  assert.equal(containsBlockedTerm(""), false);
  assert.equal(containsBlockedTerm(null), false);
  assert.equal(containsBlockedTerm(undefined), false);
  assert.equal(containsBlockedTerm(42), false);
});

test("blocklist: word-boundary match, not substring", () => {
  // "lyric" should not match "Spotify" (different word)
  assert.equal(containsBlockedTerm("Read a lyric sheet"), false);
  // "toon" should not match any blocklist entry
  assert.equal(containsBlockedTerm("Watch a cartoon"), false);
});

test("duration caps: MAX_DURATION_MIN is exported with the agreed values", () => {
  assert.equal(MAX_DURATION_MIN.recovery, 30);
  assert.equal(MAX_DURATION_MIN.responsibility, 90);
  assert.equal(MAX_DURATION_MIN.meaningful, 45);
});

test("filterSuggestionsForPicker: keeps a clean suggestion unchanged", () => {
  const result = filterSuggestionsForPicker([makeSuggestion()]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Take a walk");
  assert.equal(result[0].estimatedDuration, 20);
});

test("filterSuggestionsForPicker: clamps duration to the per-category cap", () => {
  const oversized = makeSuggestion({ estimatedDuration: 200 });
  const result = filterSuggestionsForPicker([oversized]);
  assert.equal(result.length, 1);
  assert.equal(result[0].estimatedDuration, MAX_DURATION_MIN.meaningful);
});

test("filterSuggestionsForPicker: rejects out-of-bounds duration (< 5 or > 360)", () => {
  const tooShort = makeSuggestion({ estimatedDuration: 4 });
  const tooLong = makeSuggestion({ estimatedDuration: 500 });
  assert.equal(filterSuggestionsForPicker([tooShort]).length, 0);
  assert.equal(filterSuggestionsForPicker([tooLong]).length, 0);
});

test("filterSuggestionsForPicker: drops suggestion with blocked term in title", () => {
  const bad = makeSuggestion({ title: "Watch Gilmore Girls and rest" });
  assert.equal(filterSuggestionsForPicker([bad]).length, 0);
});

test("filterSuggestionsForPicker: drops suggestion with blocked term in description", () => {
  const bad = makeSuggestion({
    description: "Open YouTube and find a 10-minute yoga video.",
  });
  assert.equal(filterSuggestionsForPicker([bad]).length, 0);
});

test("filterSuggestionsForPicker: drops suggestion with blocked term in reason", () => {
  const bad = makeSuggestion({ reason: "After a long day, a Netflix break fits." });
  assert.equal(filterSuggestionsForPicker([bad]).length, 0);
});

test("source allowlist: drops intention source", () => {
  const bad = makeSuggestion({ sourceType: "intention" });
  assert.equal(filterSuggestionsForPicker([bad]).length, 0);
});

test("source allowlist: drops exploration source", () => {
  const bad = makeSuggestion({ sourceType: "exploration" });
  assert.equal(filterSuggestionsForPicker([bad]).length, 0);
});

test("source allowlist: keeps recovery, recommendation, and generic", () => {
  for (const sourceType of ["recovery", "recommendation", "generic"]) {
    const result = filterSuggestionsForPicker([makeSuggestion({ sourceType })]);
    assert.equal(result.length, 1, `expected ${sourceType} to pass the chokepoint`);
  }
});

// LOAD-BEARING: the chokepoint invariant. These tests assert the PROPERTY
// (unknown / malformed input is dropped), not the fixture (the 15 known-good
// templates). If a future maintainer removes a check, every test in this
// block must still fail.
test("chokepoint: fails closed on unknown sourceType", () => {
  const bad = { ...makeSuggestion(), sourceType: "custom" };
  const result = filterSuggestionsForPicker([bad]);
  assert.equal(result.length, 0, "unknown sourceType must be dropped, not passed through");
});

test("chokepoint: fails closed on unknown category", () => {
  const bad = { ...makeSuggestion(), category: "fun" };
  const result = filterSuggestionsForPicker([bad]);
  assert.equal(result.length, 0, "unknown category must be dropped, not passed through");
});

test("chokepoint: fails closed on empty id", () => {
  const bad = { ...makeSuggestion(), id: "" };
  const result = filterSuggestionsForPicker([bad]);
  assert.equal(result.length, 0, "empty id must be dropped, not passed through");
});

test("chokepoint: fails closed on empty title", () => {
  const bad = { ...makeSuggestion(), title: "" };
  const result = filterSuggestionsForPicker([bad]);
  assert.equal(result.length, 0, "empty title must be dropped, not passed through");
});

test("chokepoint: fails closed on missing description", () => {
  const bad = { ...makeSuggestion() };
  delete bad.description;
  const result = filterSuggestionsForPicker([bad]);
  assert.equal(result.length, 0, "missing description must be dropped");
});

test("chokepoint: fails closed on non-string estimatedDuration", () => {
  const bad = { ...makeSuggestion(), estimatedDuration: "20" };
  const result = filterSuggestionsForPicker([bad]);
  assert.equal(result.length, 0, "non-number duration must be dropped");
});

test("chokepoint: fails closed on null input", () => {
  assert.equal(filterSuggestionsForPicker(null).length, 0);
  assert.equal(filterSuggestionsForPicker(undefined).length, 0);
});

test("chokepoint: fails closed on non-array input", () => {
  assert.equal(filterSuggestionsForPicker("not an array").length, 0);
  assert.equal(filterSuggestionsForPicker(42).length, 0);
});

test("chokepoint: preserves original order of survivors", () => {
  const a = makeSuggestion({ id: "a", title: "First" });
  const b = makeSuggestion({ id: "b", title: "Second" });
  const c = makeSuggestion({ id: "c", title: "Third" });
  const result = filterSuggestionsForPicker([a, b, c]);
  assert.equal(result.length, 3);
  assert.equal(result[0].id, "a");
  assert.equal(result[1].id, "b");
  assert.equal(result[2].id, "c");
});
