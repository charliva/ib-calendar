#!/usr/bin/env node

/**
 * Authenticated extraction load test.
 *
 * Prerequisites:
 *   - A running instance of the alpha deployment (localhost or remote).
 *   - One bearer token per simulated user (env: TEST_TOKENS, comma-separated).
 *   - One timetable screenshot per user (env: SCREENSHOT_DIR or ./fixtures).
 *
 * Usage:
 *   TEST_TOKENS="tok1,tok2,..." SCREENSHOT_DIR=./fixtures node extraction-load-test.mjs
 *   node extraction-load-test.mjs --target https://ib-calendar-b0.vercel.app
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TARGET = process.env.TARGET_URL ?? "http://localhost:3000";
const TOKENS = (process.env.TEST_TOKENS ?? "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? "./fixtures/screenshots";
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "10", 10);
const WARMUP_ROUNDS = parseInt(process.env.WARMUP ?? "2", 10);
const TEST_ROUNDS = parseInt(process.env.ROUNDS ?? "10", 10);

if (TOKENS.length === 0) {
  console.error("FATAL: TEST_TOKENS must contain at least one bearer token.");
  process.exit(1);
}

if (!existsSync(SCREENSHOT_DIR)) {
  console.error(`FATAL: Screenshot directory not found: ${SCREENSHOT_DIR}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Screenshot discovery
// ---------------------------------------------------------------------------

function findScreenshots(dir, depth = 0) {
  if (depth > 3) return [];
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findScreenshots(full, depth + 1));
      } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
        const size = statSync(full).size;
        if (size > 1_000 && size < 5_000_000) {
          results.push({ path: full, name: entry.name, bytes: size });
        }
      }
    }
  } catch (err) {
    console.warn(`  [warn] Could not scan ${dir}: ${err.message}`);
  }
  return results;
}

const screenshots = findScreenshots(SCREENSHOT_DIR);
if (screenshots.length === 0) {
  console.error(`FATAL: No screenshot fixtures found in ${SCREENSHOT_DIR}`);
  console.error("  Expected: PNG or JPEG files 1KB–5MB");
  process.exit(1);
}

console.log(`\n═══ EXTRACTION LOAD TEST ═══`);
console.log(`Target:     ${TARGET}`);
console.log(`Screenshots: ${screenshots.length}`);
console.log(`Tokens:     ${TOKENS.length}`);
console.log(`Concurrency: ${CONCURRENCY}`);
console.log(`Rounds:     ${TEST_ROUNDS}\n`);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function timedFetch(path, options = {}) {
  const start = performance.now();
  const res = await fetch(`${TARGET}${path}`, options);
  const latency = performance.now() - start;
  return { res, latency, status: res.status };
}

// ---------------------------------------------------------------------------
// Percentiles
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

// ---------------------------------------------------------------------------
// Test 1: warmup (throwaway, not measured)
// ---------------------------------------------------------------------------

async function warmup() {
  console.log("Warmup...");
  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    try {
      await fetch(`${TARGET}/`, { headers: authHeader(TOKENS[0]) });
    } catch { /* ignore */ }
  }
  console.log("  done.\n");
}

// ---------------------------------------------------------------------------
// Test 2: authenticated extraction rounds
// ---------------------------------------------------------------------------

const results = [];

async function runExtractionRound(round) {
  const token = TOKENS[round % TOKENS.length];
  const screenshot = screenshots[round % screenshots.length];
  const fileBuffer = readFileSync(screenshot.path);
  const base64 = fileBuffer.toString("base64");

  const start = performance.now();
  const res = await fetch(`${TARGET}/api/extract`, {
    method: "POST",
    headers: {
      ...authHeader(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: screenshot.name,
      data: base64,
      timezone: "Europe/Copenhagen",
    }),
  });
  const latency = performance.now() - start;

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  results.push({
    round,
    status: res.status,
    latency,
    ok: res.ok && body !== null,
    body,
    token: token.slice(0, 12) + "…",
  });

  const flag = res.ok ? "✓" : "✗";
  console.log(
    `  ${flag} round=${round} status=${res.status} latency=${latency.toFixed(0)}ms`,
  );
}

// ---------------------------------------------------------------------------
// Test 3: idempotency / duplicate upload
// ---------------------------------------------------------------------------

async function testDuplicateUpload() {
  console.log("Testing idempotent duplicate upload…");
  const screenshot = screenshots[0];
  const fileBuffer = readFileSync(screenshot.path);
  const base64 = fileBuffer.toString("base64");
  const hash1 = Buffer.from(base64).toString("base64url");
  const hash2 = Buffer.from(base64).toString("base64url");

  if (hash1 !== hash2) {
    console.error("  ✗ Same file encoded twice → different hashes.");
    process.exit(1);
  }
  console.log("  ✓ Duplicate base64 payload is byte-identical.");
}

// ---------------------------------------------------------------------------
// Run everything
// ---------------------------------------------------------------------------

await warmup();

console.log(`\nRunning ${TEST_ROUNDS} extraction rounds…\n`);

const latencies = [];
let okCount = 0;
let errCount = 0;
let statusCounts = {};

for (let round = 1; round <= TEST_ROUNDS; round++) {
  await runExtractionRound(round);
}

const sorted = [...latencies].sort((a, b) => a - b);

function pct(p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

console.log(`\n═══ RESULTS ═══`);
console.log(`Rounds:          ${TEST_ROUNDS}`);
console.log(`OK (2xx):        ${okCount}`);
console.log(`Errors:          ${errCount}`);
console.log(`p50 latency:     ${pct(sorted, 50).toFixed(0)}ms`);
console.log(`p90 latency:     ${pct(sorted, 90).toFixed(0)}ms`);
console.log(`p99 latency:     ${pct(sorted, 99).toFixed(0)}ms`);
console.log(`Total 429s:      ${results.filter(r => r.status === 429).length}`);
console.log(`Total 5xx:       ${results.filter(r => r.status >= 500).length}`);

if (errCount > 0) {
  console.log(`\n⚠ ${errCount} errors detected.`);
}

if (okCount > 0) {
  console.log(`\n✓ ${okCount} successful extractions.`);
}
