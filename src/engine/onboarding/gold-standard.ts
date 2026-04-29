/**
 * Brief 226 — Gold-standard nearest-neighbour matching.
 *
 * Reads `docs/landscape-index.json` (Researcher-curated structured corpus)
 * at engine boot, caches it. Returns the top 1-3 entries whose `stackSignals`
 * overlap with the analyser's detected signals.
 *
 * MVP scope (Brief 226 §Constraints — IMPORTANT #7): if the index file
 * doesn't exist, returns an EMPTY ARRAY gracefully — the analyser report
 * still renders, just without nearestNeighbours. NO landscape.md freeform
 * parsing; NO web search; NO embedding similarity.
 *
 * The Researcher creates / maintains `docs/landscape-index.json` in a
 * follow-on; until it exists, gold-standard is a graceful no-op.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GoldStandardMatch } from "@ditto/core";
import type { StackSignals } from "@ditto/core";

interface LandscapeIndexEntry {
  name: string;
  url: string;
  stackSignals: string[];
  oneLineRationale: string;
}

interface CachedIndex {
  loaded: boolean;
  entries: LandscapeIndexEntry[];
}

let cache: CachedIndex | null = null;

/** Resolve the path to `docs/landscape-index.json` from the repo root.
 *  The engine runs from the repo root in production; the test mode and
 *  one-off scripts may point elsewhere via `DITTO_LANDSCAPE_INDEX_PATH`. */
function resolveIndexPath(): string {
  const override = process.env.DITTO_LANDSCAPE_INDEX_PATH;
  if (override) return override;
  return join(process.cwd(), "docs", "landscape-index.json");
}

function loadIndex(): LandscapeIndexEntry[] {
  // Brief 226 dev-review MEDIUM #3: do NOT cache the "file missing" empty
  // result — the Researcher creates docs/landscape-index.json in a follow-on,
  // and we want a running engine to pick it up without restart. Re-check the
  // filesystem when the cache is empty AND the file is now present.
  const path = resolveIndexPath();
  const fileExists = existsSync(path);
  if (cache && cache.loaded) {
    // Allow re-load if the cache is empty due to a prior missing file but
    // the file has since appeared. Populated caches stay sticky across calls.
    if (cache.entries.length > 0 || !fileExists) return cache.entries;
  }
  if (!fileExists) {
    // Don't write a sticky empty cache — leave `cache = null` so the next
    // call re-checks the filesystem.
    return [];
  }
  try {
    const body = readFileSync(path, "utf-8");
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      cache = { loaded: true, entries: parsed };
      return parsed;
    }
    if (parsed && Array.isArray(parsed.entries)) {
      cache = { loaded: true, entries: parsed.entries };
      return parsed.entries;
    }
    cache = { loaded: true, entries: [] };
    return [];
  } catch {
    // Corrupt index — degrade gracefully but DO cache so we don't re-parse
    // on every call. Researcher fixes the corruption + restart picks it up.
    cache = { loaded: true, entries: [] };
    return [];
  }
}

/** Reset the in-memory cache (test hook). */
export function resetGoldStandardCache(): void {
  cache = null;
}

/**
 * Return the top 1-3 landscape entries whose stack signals overlap most
 * strongly with the detected signals. Empty array when the index is
 * missing or no entry overlaps.
 */
export function matchGoldStandard(
  signals: StackSignals,
): GoldStandardMatch[] {
  const entries = loadIndex();
  if (entries.length === 0) return [];

  const detected = new Set<string>();
  for (const b of signals.buildSystems) {
    detected.add(b.kind);
    if (b.packageManager) detected.add(b.packageManager);
  }
  for (const t of signals.testFrameworks) detected.add(t.framework);
  if (signals.ci.provider !== "none") detected.add(signals.ci.provider);
  for (const f of signals.harness.flavours) {
    if (f !== "none") detected.add(f);
  }

  const scored = entries
    .map((e) => {
      const overlap = e.stackSignals.filter((s) =>
        detected.has(s.toLowerCase()),
      ).length;
      return { entry: e, score: overlap };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ entry }) => ({
    name: entry.name,
    url: entry.url,
    rationale: entry.oneLineRationale,
  }));
}
