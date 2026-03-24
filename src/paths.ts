/**
 * Ditto — Project Root Resolution
 *
 * Resolves the monorepo root directory by walking up from process.cwd()
 * until it finds the root package.json (name: "ditto"). This ensures all
 * data and resource paths are stable regardless of which package starts
 * the process (e.g., Next.js in packages/web/ vs CLI at root).
 *
 * Provenance: Standard monorepo root-finding pattern (find-up)
 */

import path from "path";
import fs from "fs";

/**
 * Find the monorepo root by walking up from cwd looking for
 * package.json with name "ditto".
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "ditto") return dir;
      } catch {
        // Malformed package.json, keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root without finding it — fall back to cwd
      return process.cwd();
    }
    dir = parent;
  }
}

/** Absolute path to the monorepo root (where package.json, data/, processes/ live) */
export const PROJECT_ROOT = findProjectRoot();

/** Absolute path to the data directory (DB, config) */
export const DATA_DIR = path.join(PROJECT_ROOT, "data");

/** Absolute path to the SQLite database */
export const DB_PATH = path.join(DATA_DIR, "ditto.db");
