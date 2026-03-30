/**
 * Ditto — Brief Index
 *
 * Scans `docs/briefs/` and `docs/briefs/complete/` directories, parses
 * brief metadata from Markdown header lines, and returns structured
 * BriefSummary[] with mtime-based cache invalidation.
 *
 * Provenance: Brief 055 (Scope Selection + Roadmap Visualization).
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT } from "../paths.js";

// ============================================================
// Types
// ============================================================

export interface BriefSummary {
  number: number;
  name: string;
  status: "draft" | "ready" | "in-progress" | "complete";
  dependsOn: string;
  unlocks: string;
  date: string;
  filePath: string;
}

export interface Phase {
  number: number;
  name: string;
  status: "done" | "in-progress" | "not-started";
  briefCount: number;
  completedBriefCount: number;
}

export interface RoadmapData {
  phases: Phase[];
  briefs: BriefSummary[];
  stats: {
    total: number;
    ready: number;
    inProgress: number;
    complete: number;
    draft: number;
  };
}

// ============================================================
// Cache
// ============================================================

let cachedBriefs: BriefSummary[] | null = null;
let cachedMtimes: Map<string, number> = new Map();
let cachedFileCount = 0;

function countMdFiles(dir: string): number {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "000-template.md").length;
  } catch {
    return 0;
  }
}

function hasFilesChanged(dir: string): boolean {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "000-template.md");
    for (const file of files) {
      const filePath = join(dir, file);
      const mtime = statSync(filePath).mtimeMs;
      const cached = cachedMtimes.get(filePath);
      if (cached === undefined || cached !== mtime) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// ============================================================
// Brief parsing
// ============================================================

/**
 * Extract brief number from filename like "055-scope-selection.md" or "001-phase-1-storage.md".
 */
function extractBriefNumber(filename: string): number | null {
  const match = filename.match(/^(\d{3})-/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse a brief Markdown file and extract metadata from the header lines.
 * Briefs use `**Key:** value` format (not YAML frontmatter).
 */
function parseBriefFile(filePath: string, isComplete: boolean): BriefSummary | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").slice(0, 20); // Metadata is always in the first 20 lines

    const filename = filePath.split("/").pop() ?? "";
    const number = extractBriefNumber(filename);
    if (number === null) return null;

    // Extract title from first heading
    const titleLine = lines.find((l) => l.startsWith("# "));
    const name = titleLine
      ? titleLine
          .replace(/^#\s+/, "")
          .replace(/^Brief\s+\d+:\s*/, "")
          .trim()
      : filename.replace(/^\d+-/, "").replace(/\.md$/, "");

    // Extract metadata fields
    const getValue = (key: string): string => {
      const line = lines.find((l) => l.includes(`**${key}:**`));
      if (!line) return "";
      return line.replace(new RegExp(`.*\\*\\*${key}:\\*\\*\\s*`), "").trim();
    };

    const rawStatus = getValue("Status").toLowerCase();
    let status: BriefSummary["status"];
    if (isComplete) {
      status = "complete";
    } else if (rawStatus === "draft") {
      status = "draft";
    } else if (rawStatus === "ready") {
      status = "ready";
    } else if (rawStatus.includes("progress")) {
      status = "in-progress";
    } else {
      status = "draft";
    }

    return {
      number,
      name,
      status,
      dependsOn: getValue("Depends on"),
      unlocks: getValue("Unlocks"),
      date: getValue("Date"),
      filePath,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Scan briefs directories and return BriefSummary[].
 * Results are cached with mtime-based invalidation.
 */
export function indexBriefs(): BriefSummary[] {
  const briefsDir = join(PROJECT_ROOT, "docs", "briefs");
  const completeDir = join(PROJECT_ROOT, "docs", "briefs", "complete");

  // Check cache validity (mtime + file count comparison detects additions/deletions)
  const currentFileCount = countMdFiles(briefsDir) + countMdFiles(completeDir);
  if (cachedBriefs && currentFileCount === cachedFileCount && !hasFilesChanged(briefsDir) && !hasFilesChanged(completeDir)) {
    return cachedBriefs;
  }

  const briefs: BriefSummary[] = [];
  const newMtimes = new Map<string, number>();

  // Scan active briefs
  try {
    const files = readdirSync(briefsDir).filter(
      (f) => f.endsWith(".md") && f !== "000-template.md" && !f.startsWith("artifact-") && !f.startsWith("prototype-"),
    );
    for (const file of files) {
      const filePath = join(briefsDir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) continue;
      newMtimes.set(filePath, stat.mtimeMs);
      const brief = parseBriefFile(filePath, false);
      if (brief) briefs.push(brief);
    }
  } catch {
    // briefs dir may not exist
  }

  // Scan complete briefs
  try {
    const files = readdirSync(completeDir).filter(
      (f) => f.endsWith(".md") && f !== "000-template.md",
    );
    for (const file of files) {
      const filePath = join(completeDir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) continue;
      newMtimes.set(filePath, stat.mtimeMs);
      const brief = parseBriefFile(filePath, true);
      if (brief) briefs.push(brief);
    }
  } catch {
    // complete dir may not exist
  }

  // Sort by number ascending
  briefs.sort((a, b) => a.number - b.number);

  cachedBriefs = briefs;
  cachedMtimes = newMtimes;
  cachedFileCount = currentFileCount;
  return briefs;
}

/**
 * Parse phases from roadmap.md header structure.
 * Phases are identified by `## Phase N:` headings with status derived from content.
 */
export function indexPhases(): Phase[] {
  const roadmapPath = join(PROJECT_ROOT, "docs", "roadmap.md");
  try {
    const content = readFileSync(roadmapPath, "utf-8");
    const phases: Phase[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      // Match "## Phase N: Name" or "## Pre-Phase N: Name"
      const match = lines[i].match(/^##\s+(?:Pre-)?Phase\s+(\d+)[^:]*:\s*(.+)/);
      if (!match) continue;

      const phaseNum = parseInt(match[1], 10);
      const phaseName = match[2].replace(/\s*\(.*\)$/, "").trim();

      // Check status by looking at capabilities in this section
      let hasDone = false;
      let hasNotDone = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith("## ")) break;
        if (lines[j].includes("| done |")) hasDone = true;
        if (lines[j].includes("| not started |") || lines[j].includes("| in progress |")) hasNotDone = true;
      }

      let status: Phase["status"];
      if (hasDone && !hasNotDone) {
        status = "done";
      } else if (hasDone || hasNotDone) {
        status = "in-progress";
      } else {
        status = "not-started";
      }

      phases.push({
        number: phaseNum,
        name: phaseName,
        status,
        briefCount: 0,
        completedBriefCount: 0,
      });
    }

    return phases;
  } catch {
    return [];
  }
}

/**
 * Build complete roadmap data: phases enriched with brief counts + stats.
 */
export function buildRoadmapData(): RoadmapData {
  const briefs = indexBriefs();
  const phases = indexPhases();

  const stats = {
    total: briefs.length,
    ready: briefs.filter((b) => b.status === "ready").length,
    inProgress: briefs.filter((b) => b.status === "in-progress").length,
    complete: briefs.filter((b) => b.status === "complete").length,
    draft: briefs.filter((b) => b.status === "draft").length,
  };

  return { phases, briefs, stats };
}
