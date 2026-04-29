/**
 * Brief 226 — CI provider detector.
 *
 * Pure function over a cloned repo dir. Checks for CI config files /
 * directories. Returns the FIRST provider detected (CI configurations
 * rarely overlap meaningfully); aggregates workflow paths when multiple
 * files exist for the same provider (e.g., several .github/workflows/*.yml).
 *
 * Brief 226 §Constraints — depth=1 explicit non-goal: we don't query
 * GitHub Actions API for last-known status here. The `lastKnownStatus`
 * field stays `unknown` for filesystem-only detection. A future detector
 * brief could light it up.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CIDetection, CIProvider } from "@ditto/core";

interface ProviderCheck {
  provider: CIProvider;
  /** Either a single file path or a directory whose contents are workflows. */
  marker: { kind: "file" | "dir"; path: string };
}

const PROVIDER_CHECKS: ProviderCheck[] = [
  { provider: "github-actions", marker: { kind: "dir", path: ".github/workflows" } },
  { provider: "gitlab-ci", marker: { kind: "file", path: ".gitlab-ci.yml" } },
  { provider: "circleci", marker: { kind: "file", path: ".circleci/config.yml" } },
  { provider: "azure-pipelines", marker: { kind: "file", path: "azure-pipelines.yml" } },
  { provider: "jenkins", marker: { kind: "file", path: "Jenkinsfile" } },
];

/** List YAML workflow files inside a directory, prefixed with the
 *  repo-relative path of the directory itself (NOT a hardcoded path —
 *  decouples the lister from the github-actions-specific dir name so a
 *  future dir-based provider can reuse the lister without bug). */
function listWorkflows(absDir: string, repoRelativeDir: string): string[] {
  try {
    return readdirSync(absDir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => join(repoRelativeDir, f))
      .sort();
  } catch {
    return [];
  }
}

export function detectCI(repoDir: string): CIDetection {
  for (const check of PROVIDER_CHECKS) {
    const full = join(repoDir, check.marker.path);
    if (!existsSync(full)) continue;
    if (check.marker.kind === "dir") {
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      const workflows = listWorkflows(full, check.marker.path);
      if (workflows.length === 0) continue;
      return {
        provider: check.provider,
        workflowPaths: workflows,
        lastKnownStatus: "unknown",
      };
    }
    return {
      provider: check.provider,
      workflowPaths: [check.marker.path],
      lastKnownStatus: "unknown",
    };
  }
  return { provider: "none", workflowPaths: [] };
}
