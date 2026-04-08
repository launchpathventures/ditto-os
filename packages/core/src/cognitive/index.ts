/**
 * @ditto/core — Cognitive Core Loader
 *
 * Loads and caches the universal judgment layer from markdown files.
 * Consumers provide the path to their cognitive framework files.
 *
 * Two variants:
 * - getCognitiveCore() — full core for conversational surfaces (~800 tokens)
 * - getCognitiveCoreCompact() — trade-offs + escalation only (~200 tokens)
 *
 * Provenance: Extracted from src/engine/cognitive-core.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

// ============================================================
// Cache
// ============================================================

let coreCache: string | null = null;
let compactCache: string | null = null;
let configuredCorePath: string | null = null;

// ============================================================
// Fallback (minimal judgment if file not found)
// ============================================================

const FALLBACK_CORE = `# Core Judgment

## Consultative Protocol
1. Listen. Accept it however they state it.
2. Assess clarity. Match depth to signal.
3. Ask targeted questions. The 1-3 that sharpen intent.
4. Reflect back. Confirm understanding.
5. Hand off to work only after understanding is confirmed.

## Trade-Off Heuristics
1. Competence over personality.
2. Silence over noise.
3. Evidence over assumption.
4. Action over planning.
5. Human judgment over AI confidence.
6. Domain language over technical language.`.trim();

// ============================================================
// Section Extraction (for compact variant)
// ============================================================

/**
 * Extract specific markdown sections by heading.
 * Returns the content between the heading and the next heading of equal or higher level.
 */
export function extractSections(markdown: string, headings: string[]): string {
  const lines = markdown.split("\n");
  const sections: string[] = [];
  let capturing = false;
  let captureLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (headings.some((h) => title.toLowerCase().includes(h.toLowerCase()))) {
        capturing = true;
        captureLevel = level;
        sections.push(line);
        continue;
      }

      if (capturing && level <= captureLevel) {
        capturing = false;
      }
    }

    if (capturing) {
      sections.push(line);
    }
  }

  return sections.join("\n").trim();
}

// ============================================================
// Configuration
// ============================================================

/**
 * Configure where the cognitive core markdown lives.
 * Call this before getCognitiveCore() if using a custom path.
 *
 * @param corePath - Absolute path to core.md (or directory containing core.md)
 */
export function configureCognitivePath(corePath: string): void {
  configuredCorePath = corePath;
  clearCognitiveCoreCache();
}

// ============================================================
// Public API
// ============================================================

/**
 * Load the full cognitive core for conversational surfaces.
 * ~800 tokens. Contains the full judgment framework.
 *
 * Resolution order:
 * 1. Configured path (via configureCognitivePath)
 * 2. {cwd}/cognitive/core.md (convention)
 * 3. Fallback minimal framework
 */
export function getCognitiveCore(): string {
  if (coreCache) return coreCache;

  const paths = [
    configuredCorePath,
    join(process.cwd(), "cognitive", "core.md"),
  ].filter(Boolean) as string[];

  for (const p of paths) {
    try {
      // If path is a directory, append core.md
      const filePath = p.endsWith(".md") ? p : join(p, "core.md");
      coreCache = readFileSync(filePath, "utf-8").trim();
      return coreCache;
    } catch {
      continue;
    }
  }

  return FALLBACK_CORE;
}

/**
 * Load a compact version of the cognitive core for task-execution surfaces.
 * ~200 tokens. Contains only: trade-off heuristics + escalation sensitivity.
 * Always derived from the full core — no drift possible.
 */
export function getCognitiveCoreCompact(): string {
  if (compactCache) return compactCache;
  const full = getCognitiveCore();
  compactCache = extractSections(full, ["Trade-Off Heuristics", "Escalation Sensitivity"]);
  if (!compactCache) {
    compactCache = extractSections(FALLBACK_CORE, ["Trade-Off Heuristics"]);
  }
  return compactCache;
}

/**
 * Clear the cache. Used in tests or when switching cognitive paths.
 */
export function clearCognitiveCoreCache(): void {
  coreCache = null;
  compactCache = null;
}
