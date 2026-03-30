/**
 * Ditto — Brief Lifecycle Sync (Brief 056)
 *
 * Syncs brief lifecycle state from markdown files (`docs/briefs/`) to the
 * `briefs` database table. Meta-processes query the DB, not the filesystem.
 *
 * Uses mtime-based invalidation — skips files not modified since last sync.
 * Called lazily from API endpoints (not on every request).
 * Handles deletions via soft-delete (status → "deleted").
 *
 * Provenance: brief-index.ts file parsing (Brief 055), Brief 056.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { PROJECT_ROOT } from "../paths.js";
import { db, schema } from "../db";

// ============================================================
// Cache — avoids re-scanning unchanged files
// ============================================================

let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 5000; // Don't re-sync more than once every 5 seconds

// ============================================================
// Brief file parsing (adapted from brief-index.ts)
// ============================================================

interface ParsedBrief {
  number: number;
  name: string;
  status: string;
  dependsOn: string;
  unlocks: string;
  filePath: string;
  lastModified: Date;
}

function extractBriefNumber(filename: string): number | null {
  const match = filename.match(/^(\d{3})-/);
  return match ? parseInt(match[1], 10) : null;
}

function parseBriefFile(filePath: string, isComplete: boolean): ParsedBrief | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").slice(0, 20);
    const stat = statSync(filePath);

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
    let status: string;
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
      filePath,
      lastModified: stat.mtime,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Sync
// ============================================================

/**
 * Sync brief lifecycle state from files to the `briefs` DB table.
 * Mtime-based invalidation — skips recently synced.
 * Handles deletions via soft-delete.
 */
export async function syncBriefs(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncTime < SYNC_COOLDOWN_MS) return;
  lastSyncTime = now;

  const briefsDir = join(PROJECT_ROOT, "docs", "briefs");
  const completeDir = join(PROJECT_ROOT, "docs", "briefs", "complete");

  const parsed: ParsedBrief[] = [];

  // Scan active briefs
  try {
    const files = readdirSync(briefsDir).filter(
      (f) => f.endsWith(".md") && f !== "000-template.md" && !f.startsWith("artifact-") && !f.startsWith("prototype-"),
    );
    for (const file of files) {
      const filePath = join(briefsDir, file);
      try {
        if (statSync(filePath).isDirectory()) continue;
      } catch { continue; }
      const brief = parseBriefFile(filePath, false);
      if (brief) parsed.push(brief);
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
      try {
        if (statSync(filePath).isDirectory()) continue;
      } catch { continue; }
      const brief = parseBriefFile(filePath, true);
      if (brief) parsed.push(brief);
    }
  } catch {
    // complete dir may not exist
  }

  // Upsert each parsed brief
  const syncedNumbers = new Set<number>();
  for (const brief of parsed) {
    syncedNumbers.add(brief.number);

    // Check if exists
    const existing = await db
      .select({ number: schema.briefs.number, lastModified: schema.briefs.lastModified })
      .from(schema.briefs)
      .where(eq(schema.briefs.number, brief.number))
      .limit(1);

    if (existing.length > 0) {
      // Update if file changed
      const existingMtime = existing[0].lastModified;
      if (!existingMtime || brief.lastModified.getTime() !== existingMtime.getTime()) {
        await db.update(schema.briefs)
          .set({
            name: brief.name,
            status: brief.status,
            dependsOn: brief.dependsOn,
            unlocks: brief.unlocks,
            filePath: brief.filePath,
            lastModified: brief.lastModified,
            syncedAt: new Date(),
          })
          .where(eq(schema.briefs.number, brief.number));
      }
    } else {
      // Insert new
      await db.insert(schema.briefs).values({
        number: brief.number,
        name: brief.name,
        status: brief.status,
        dependsOn: brief.dependsOn,
        unlocks: brief.unlocks,
        filePath: brief.filePath,
        lastModified: brief.lastModified,
      });
    }
  }

  // Soft-delete: mark DB rows with no corresponding file as "deleted"
  const allDbBriefs = await db
    .select({ number: schema.briefs.number, status: schema.briefs.status })
    .from(schema.briefs);

  for (const row of allDbBriefs) {
    if (!syncedNumbers.has(row.number) && row.status !== "deleted") {
      await db.update(schema.briefs)
        .set({ status: "deleted", syncedAt: new Date() })
        .where(eq(schema.briefs.number, row.number));
    }
  }
}
