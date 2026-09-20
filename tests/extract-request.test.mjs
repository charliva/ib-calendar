// The command palette's "Document → proposed calendar" control used to hand
// /api/extract `mode: "school_timetable"` with no weekStart, because the page
// hardcoded timetable mode on a control that is not the timetable importer.
// Every file type failed: PDFs, text and CSV were turned away in the browser
// with a message about a timetable screenshot, and images got this far and
// were rejected by the schema below.
//
// These pin the contract the wiring violated, in both directions.

import assert from "node:assert/strict";
import test from "node:test";

import { extractRequestSchema } from "../lib/ai/extract-request.ts";

const base = {
  filename: "notes.pdf",
  mediaType: "application/pdf",
  data: "data:application/pdf;base64,AAAA",
  timezone: "Europe/Copenhagen",
};

test("a palette upload defaults to calendar_document and needs no week", () => {
  const parsed = extractRequestSchema.safeParse(base);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.mode, "calendar_document");
  assert.deepEqual(parsed.data.subjects, []);
});

test("the palette's other accepted file types all pass", () => {
  for (const mediaType of [
    "image/png",
    "image/jpeg",
    "application/pdf",
    "text/plain",
    "text/csv",
  ]) {
    const parsed = extractRequestSchema.safeParse({ ...base, mediaType });
    assert.equal(parsed.success, true, `${mediaType} should be accepted`);
  }
});

test("timetable mode without a target week is refused", () => {
  const parsed = extractRequestSchema.safeParse({
    ...base,
    mediaType: "image/png",
    mode: "school_timetable",
  });
  assert.equal(parsed.success, false);
  assert.equal(parsed.error.issues[0].path[0], "weekStart");
});

test("timetable mode with a target week is accepted", () => {
  const parsed = extractRequestSchema.safeParse({
    ...base,
    mediaType: "image/png",
    mode: "school_timetable",
    weekStart: "2026-09-14",
    subjects: [{ name: "English", shortName: "Eng", teacher: "", room: "G4" }],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.weekStart, "2026-09-14");
});

test("an unsupported file type is refused whatever the mode", () => {
  const parsed = extractRequestSchema.safeParse({
    ...base,
    mediaType: "application/zip",
  });
  assert.equal(parsed.success, false);
});
