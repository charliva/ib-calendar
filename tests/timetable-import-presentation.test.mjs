import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proposalReview = readFileSync(
  new URL("../components/calendar/ProposalReview.tsx", import.meta.url),
  "utf8",
);

test("timetable proposals render inside the fixed proposal overlay", () => {
  assert.match(
    proposalReview,
    /className=["{].*proposal-overlay/s,
    "a successful extraction must open a viewport-level review overlay",
  );
});

test("the proposal overlay closes when its backdrop is clicked", () => {
  assert.match(proposalReview, /event\.target === event\.currentTarget/);
  assert.match(proposalReview, /onClose\(\)/);
});
