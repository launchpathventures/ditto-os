/**
 * Brief 226 — Existing-harness detector.
 *
 * Pure function over a cloned repo dir. Detects which AI / agent harness
 * flavours are already installed in the target repo. Each flavour Ditto
 * interoperates with is one of: claude-code (.claude/), cursor (.cursorrules),
 * agents-md (AGENTS.md), catalyst (.catalyst/), ditto (.ditto/), or
 * claude-md (CLAUDE.md as a top-level instruction file).
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  HarnessDetection,
  HarnessFlavour,
} from "@ditto/core";

interface MarkerCheck {
  flavour: HarnessFlavour;
  /** Path relative to repo root. */
  path: string;
  /** Whether the marker is expected to be a directory. */
  isDir: boolean;
}

const MARKERS: MarkerCheck[] = [
  { flavour: "claude-code", path: ".claude", isDir: true },
  { flavour: "cursor", path: ".cursorrules", isDir: false },
  { flavour: "agents-md", path: "AGENTS.md", isDir: false },
  { flavour: "catalyst", path: ".catalyst", isDir: true },
  { flavour: "ditto", path: ".ditto", isDir: true },
  { flavour: "claude-md", path: "CLAUDE.md", isDir: false },
];

export function detectHarness(repoDir: string): HarnessDetection {
  const flavours: HarnessFlavour[] = [];
  const markers: string[] = [];
  for (const check of MARKERS) {
    const full = join(repoDir, check.path);
    if (!existsSync(full)) continue;
    let matchesType = false;
    try {
      matchesType = statSync(full).isDirectory() === check.isDir;
    } catch {
      continue;
    }
    if (!matchesType) continue;
    flavours.push(check.flavour);
    markers.push(check.path);
  }
  if (flavours.length === 0) {
    return { flavours: ["none"], markers: [] };
  }
  return { flavours, markers };
}
