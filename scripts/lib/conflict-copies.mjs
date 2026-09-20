// Finding and safely deleting OneDrive/iCloud sync conflict copies.
//
// The working copy lives inside a synced folder, so switching branches or
// rewriting a file can leave a duplicate beside the original: `page 2.tsx`,
// `LICENSE 2`, `offline 3.ts`. They are invisible to the app but they feed
// duplicate entries to Vite's optimizer and to TypeScript's project scan,
// which is how they turn into "the dev server hangs" and "two definitions of
// the same symbol".
//
// `.gitignore` deliberately does not ignore them — a pattern broad enough to
// catch `page 2.tsx` would also swallow a legitimate `Phase 2.md` — so
// removing them is this module's job.
//
// Deleting is only safe when git can prove nothing is lost, which means all
// three of:
//
//   * the copy itself is untracked, so it has never been committed;
//   * the name it was copied from is tracked, so the real file still exists;
//   * that original is unmodified in the working tree, so the copy cannot be
//     the only place an edit survived.
//
// Anything that fails those tests is reported rather than removed.

import { readdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".next", ".vercel"]);

// "page 2.tsx" -> stem "page", copy index "2", extension ".tsx".
// "LICENSE 2" -> stem "LICENSE", no extension.
const CONFLICT_COPY = /^(.*?) (\d+)(\.[^.]+)?$/;

export function conflictCopyOriginal(path) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const match = CONFLICT_COPY.exec(name);
  if (!match) return null;
  const [, stem, , extension = ""] = match;
  return `${dir}${stem}${extension}`;
}

export async function findConflictCopies(root, dir = root, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await findConflictCopies(root, path, found);
    } else if (CONFLICT_COPY.test(entry.name)) {
      found.push(relative(root, path));
    }
  }
  return found;
}

async function git(root, args) {
  const { stdout } = await run("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/**
 * Delete every conflict copy git can prove is redundant.
 *
 * Returns `{ removed, kept }`. `kept` carries a reason per path so the caller
 * can tell the difference between "there was nothing to do" and "I did not
 * dare touch these".
 */
export async function removeRedundantConflictCopies(root, paths) {
  const removed = [];
  const kept = [];
  if (paths.length === 0) return { removed, kept };

  let tracked;
  let dirty;
  try {
    tracked = new Set((await git(root, ["ls-files"])).split("\n").filter(Boolean));
    // Tracked files with staged or unstaged changes. A conflict copy of one of
    // these might be holding an edit that only exists in the copy.
    dirty = new Set(
      (await git(root, ["diff", "--name-only", "HEAD"])).split("\n").filter(Boolean),
    );
  } catch {
    // No git, or not a repository. Without it there is no proof of safety.
    return { removed, kept: paths.map((path) => ({ path, reason: "git unavailable" })) };
  }

  for (const path of paths) {
    const original = conflictCopyOriginal(path);
    if (!original) {
      kept.push({ path, reason: "not a conflict-copy name" });
    } else if (tracked.has(path)) {
      kept.push({ path, reason: "the copy itself is tracked" });
    } else if (!tracked.has(original)) {
      kept.push({ path, reason: `no tracked original (${original})` });
    } else if (dirty.has(original)) {
      kept.push({ path, reason: `original has uncommitted changes (${original})` });
    } else {
      await rm(join(root, path), { force: true });
      removed.push(path);
    }
  }

  return { removed, kept };
}
