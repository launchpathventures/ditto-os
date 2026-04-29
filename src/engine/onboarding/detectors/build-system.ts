/**
 * Brief 226 — Build-system detector.
 *
 * Pure function over a cloned repo dir. Returns 0+ build systems detected
 * (multi-stack repos return multiple). Detection is filesystem-pattern-based
 * — same shape as Vercel / Render / Railway auto-detection.
 *
 * Detector failures (parse errors, missing files mid-scan) propagate to the
 * caller, which surfaces them as partial-success findings per Brief 226 §AC #11.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BuildSystemDetection,
  BuildSystemKind,
} from "@ditto/core";

interface FileCheck {
  /** Path relative to repo root. */
  path: string;
  /** Build system this file evidences. */
  kind: BuildSystemKind;
}

const SIMPLE_MARKERS: FileCheck[] = [
  { path: "Cargo.toml", kind: "rust" },
  { path: "go.mod", kind: "go" },
  { path: "Gemfile", kind: "ruby" },
  { path: "composer.json", kind: "php" },
  { path: "pom.xml", kind: "java" },
  { path: "build.gradle", kind: "java" },
  { path: "build.gradle.kts", kind: "java" },
  { path: "pyproject.toml", kind: "python" },
  { path: "requirements.txt", kind: "python" },
  { path: "setup.py", kind: "python" },
  { path: "Pipfile", kind: "python" },
];

/** Resolve the package manager from a Node lockfile. */
function detectNodePackageManager(repoDir: string): string | undefined {
  const lockfiles: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];
  for (const [lock, manager] of lockfiles) {
    if (existsSync(join(repoDir, lock))) return manager;
  }
  return undefined;
}

/** Resolve the python package manager from a marker file. */
function detectPythonPackageManager(repoDir: string): string | undefined {
  if (existsSync(join(repoDir, "uv.lock"))) return "uv";
  if (existsSync(join(repoDir, "poetry.lock"))) return "poetry";
  if (existsSync(join(repoDir, "Pipfile.lock"))) return "pipenv";
  if (existsSync(join(repoDir, "pyproject.toml"))) {
    try {
      const body = readFileSync(join(repoDir, "pyproject.toml"), "utf-8");
      if (body.includes("[tool.poetry]")) return "poetry";
      if (body.includes("[tool.uv]")) return "uv";
      if (body.includes("[tool.hatch]")) return "hatch";
    } catch {
      // ignore — file may be unreadable; fall through to undefined.
    }
  }
  return "pip";
}

/**
 * Detect all build systems present in the repo.
 *
 * The returned array is empty when no recognised marker files are found —
 * signals a glue-script / docs-only repo rather than throwing.
 */
export function detectBuildSystem(repoDir: string): BuildSystemDetection[] {
  const detections: BuildSystemDetection[] = [];
  const seen = new Set<BuildSystemKind>();

  // Node — special-case for package-manager hint.
  const pkgJson = join(repoDir, "package.json");
  if (existsSync(pkgJson)) {
    detections.push({
      kind: "node",
      evidence: "package.json",
      packageManager: detectNodePackageManager(repoDir),
    });
    seen.add("node");
  }

  for (const marker of SIMPLE_MARKERS) {
    if (seen.has(marker.kind)) continue;
    if (!existsSync(join(repoDir, marker.path))) continue;
    const detection: BuildSystemDetection = {
      kind: marker.kind,
      evidence: marker.path,
    };
    if (marker.kind === "python") {
      detection.packageManager = detectPythonPackageManager(repoDir);
    }
    detections.push(detection);
    seen.add(marker.kind);
  }

  return detections;
}
