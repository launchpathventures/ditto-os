/**
 * Brief 226 — Temp-dir cleanup helpers.
 *
 * The analyser clones each repo into a `mkdtemp`-based directory under
 * `os.tmpdir()` with prefix `ditto-analyser-`. Cleanup runs at two layers:
 *
 *   1. `try { … } finally { rm -rf <dir> }` in the surface-report handler —
 *      fires on success AND on parent-step throw.
 *   2. Boot-time sweep (`sweepStaleAnalyserDirs`) of all `ditto-analyser-*`
 *      directories older than 24 hours — protects against engine-crash-mid-
 *      handler dir leaks.
 */

import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = "ditto-analyser-";
const STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Create a fresh temp dir for one clone. */
export function createAnalyserTempDir(): string {
  return mkdtempSync(join(tmpdir(), PREFIX));
}

/** Delete a single analyser temp dir; swallows ENOENT. */
export function cleanupAnalyserDir(dir: string | undefined | null): void {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort — swallow.
  }
}

/**
 * Sweep stale `ditto-analyser-*` dirs from os.tmpdir().
 * Called once at engine boot. Removes anything older than 24 hours.
 *
 * Returns the count of dirs removed (for logging).
 */
export function sweepStaleAnalyserDirs(now: number = Date.now()): number {
  const root = tmpdir();
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.startsWith(PREFIX)) continue;
    const full = join(root, entry);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs < STALE_AGE_MS) continue;
    try {
      rmSync(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      // best-effort.
    }
  }
  return removed;
}
