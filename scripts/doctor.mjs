#!/usr/bin/env node
// Clears the local tool state that stops `vinext dev` from starting.
//
// Three failure modes bite this project repeatedly, all because the working
// copy lives inside a synced folder:
//
//  1. `.vinext/dev/lock.json` survives a hard kill, so the next `vinext dev`
//     refuses to start with "Another vinext dev server is already running"
//     while naming a PID that no longer exists.
//  2. A `node_modules/.vite/deps_temp_*` directory survives a hard kill during
//     dependency optimization. Vite then parks on "[optimizer] bundling
//     dependencies..." forever: the port opens but no request is ever served.
//  3. A sync conflict copy ("index 2.ts") feeds a duplicate entry to the
//     optimizer and to TypeScript's project scan, producing both symptoms
//     above plus duplicate-symbol noise. These are deleted when git can
//     prove the original is intact, and reported otherwise.
//
// `npm run dev` runs this first, so the normal path self-heals. Run
// `npm run doctor` on its own to see what it found.

import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  findConflictCopies,
  removeRedundantConflictCopies,
} from "./lib/conflict-copies.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const removed = [];
const warnings = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 checks for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return error.code === "EPERM";
  }
}

// A lock whose PID is gone is stale; a lock whose PID is alive is a dev server
// the user actually wants, so leave it be.
async function clearStaleDevLock() {
  const lockPath = join(root, ".vinext", "dev", "lock.json");
  if (!(await exists(lockPath))) return;

  let pid = null;
  try {
    pid = JSON.parse(await readFile(lockPath, "utf8")).pid ?? null;
  } catch {
    // An unreadable lock is stale by definition.
  }

  if (processAlive(pid)) {
    warnings.push(
      `A dev server is already running (pid ${pid}). Stop it with \`kill ${pid}\` before starting another.`,
    );
    return;
  }

  await rm(lockPath, { force: true });
  removed.push(`.vinext/dev/lock.json (stale, pid ${pid ?? "unknown"})`);
}

// Half-written optimizer output. Vite never reclaims these itself.
async function clearOptimizerTempDirs() {
  const viteCache = join(root, "node_modules", ".vite");
  if (!(await exists(viteCache))) return;

  for (const entry of await readdir(viteCache, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.includes("_temp_")) continue;
    await rm(join(viteCache, entry.name), { recursive: true, force: true });
    removed.push(`node_modules/.vite/${entry.name} (abandoned optimizer run)`);
  }
}

await clearStaleDevLock();
await clearOptimizerTempDirs();

const conflicts = await findConflictCopies(root);
const { removed: deletedCopies, kept } = await removeRedundantConflictCopies(
  root,
  conflicts,
);
for (const path of deletedCopies) removed.push(path);
if (kept.length > 0) {
  warnings.push(
    `${kept.length} sync conflict ${kept.length === 1 ? "copy" : "copies"} left in place. ` +
      `Check each original before deleting by hand:\n` +
      kept.map(({ path, reason }) => `    ${path} — ${reason}`).join("\n"),
  );
}

for (const item of removed) console.log(`cleared  ${item}`);
for (const warning of warnings) console.warn(`warning  ${warning}`);
if (removed.length === 0 && warnings.length === 0) {
  console.log("workspace clean");
}
