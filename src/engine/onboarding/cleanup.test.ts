/**
 * Brief 226 — temp-dir cleanup tests.
 */

import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAnalyserTempDir,
  cleanupAnalyserDir,
  sweepStaleAnalyserDirs,
} from "./cleanup";

describe("createAnalyserTempDir / cleanupAnalyserDir", () => {
  it("creates and removes a temp dir", () => {
    const dir = createAnalyserTempDir();
    expect(existsSync(dir)).toBe(true);
    cleanupAnalyserDir(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it("swallows missing-dir errors", () => {
    expect(() => cleanupAnalyserDir("/tmp/this-doesnt-exist-226")).not.toThrow();
    expect(() => cleanupAnalyserDir(undefined)).not.toThrow();
    expect(() => cleanupAnalyserDir(null)).not.toThrow();
  });
});

describe("sweepStaleAnalyserDirs", () => {
  it("removes ditto-analyser-* dirs older than the age threshold", () => {
    const stale = createAnalyserTempDir();
    // Backdate the mtime so the sweep treats it as stale (>24h).
    const past = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, past, past);
    const removed = sweepStaleAnalyserDirs();
    expect(existsSync(stale)).toBe(false);
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("leaves recent ditto-analyser-* dirs alone", () => {
    const fresh = createAnalyserTempDir();
    sweepStaleAnalyserDirs();
    expect(existsSync(fresh)).toBe(true);
    cleanupAnalyserDir(fresh);
  });

  it("ignores dirs without the ditto-analyser- prefix", () => {
    const other = join(tmpdir(), `not-ditto-${Date.now()}`);
    mkdirSync(other, { recursive: true });
    const past = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
    utimesSync(other, past, past);
    sweepStaleAnalyserDirs();
    expect(existsSync(other)).toBe(true);
    // Manual cleanup since the sweep correctly left it alone (non-prefix).
    // cleanupAnalyserDir is intentionally narrow — it only removes the
    // analyser-prefixed dirs the handler creates.
    statSync(other);
    try {
      rmSync(other, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });
});
