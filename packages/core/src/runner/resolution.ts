/**
 * Runner Chain Resolution — pure function per Brief 214 §D5.
 *
 * No DB, no I/O. The dispatcher (Ditto product layer) supplies snapshots of
 * the project + the configured project_runners and receives the ordered list
 * of kinds to attempt.
 *
 * Algorithm (Brief 214 §D5):
 *   1. Build chain — workItem.runner_override prepended (if set) to the
 *      project's chain (or [default, fallback] if no chain JSON).
 *   2. Apply mode_required filter — drop kinds whose mode doesn't match.
 *   3. Drop kinds without an enabled project_runners row.
 *   4. Drop unhealthy kinds — UNLESS that leaves the chain empty, in which
 *      case the only remaining unhealthy kind is attempted (and the dispatch
 *      surfaces the error).
 *   5. Dedupe (override may collide with chain entries).
 *   6. Empty result → ResolutionError.
 */

import {
  type RunnerKind,
  type RunnerMode,
  type RunnerHealthStatus,
  type RunnerModeRequired,
  kindToMode,
} from "./kinds.js";

// ============================================================
// Inputs — snapshot shapes the dispatcher hands the resolver
// ============================================================

export interface WorkItemResolutionRef {
  id: string;
  /** Optional override prepended to the chain. */
  runnerOverride?: RunnerKind | null;
  /** Optional mode-required filter. `any` (or null) imposes no constraint. */
  runnerModeRequired?: RunnerModeRequired | null;
}

export interface ProjectResolutionRef {
  id: string;
  defaultRunnerKind: RunnerKind | null;
  fallbackRunnerKind: RunnerKind | null;
  /** When present, overrides default + fallback. */
  runnerChain: RunnerKind[] | null;
}

export interface ProjectRunnerResolutionRef {
  projectId: string;
  kind: RunnerKind;
  mode: RunnerMode;
  enabled: boolean;
  lastHealthStatus: RunnerHealthStatus;
}

// ============================================================
// Result shapes
// ============================================================

export type ResolutionErrorCode =
  | "noEligibleRunner"
  | "modeFilteredEmpty"
  | "configMissing";

export interface ResolutionError {
  code: ResolutionErrorCode;
  /** Human-readable hint for the conversation surface / admin notification. */
  message: string;
  /** What we filtered out at each stage — useful for diagnosis. */
  attempted: RunnerKind[];
}

export type ResolutionOk = { ok: true; chain: RunnerKind[] };
export type ResolutionResult =
  | ResolutionOk
  | { ok: false; error: ResolutionError };

// ============================================================
// Pure function
// ============================================================

export function resolveChain(
  workItem: WorkItemResolutionRef,
  project: ProjectResolutionRef,
  projectRunners: readonly ProjectRunnerResolutionRef[]
): ResolutionResult {
  // Step 1: build raw chain.
  const baseChain: RunnerKind[] = project.runnerChain
    ? [...project.runnerChain]
    : [project.defaultRunnerKind, project.fallbackRunnerKind].filter(
        (k): k is RunnerKind => k !== null
      );

  const withOverride: RunnerKind[] = workItem.runnerOverride
    ? [workItem.runnerOverride, ...baseChain]
    : baseChain;

  const deduped = dedupe(withOverride);

  if (deduped.length === 0) {
    return {
      ok: false,
      error: {
        code: "noEligibleRunner",
        message:
          "Project has no default, no fallback, no chain, and no work-item override. Configure a runner.",
        attempted: [],
      },
    };
  }

  // Step 2: mode filter.
  const modeRequired = workItem.runnerModeRequired;
  const modeFiltered =
    modeRequired && modeRequired !== "any"
      ? deduped.filter((k) => kindToMode(k) === modeRequired)
      : deduped;

  if (modeFiltered.length === 0) {
    return {
      ok: false,
      error: {
        code: "modeFilteredEmpty",
        message: `No runner in chain matches mode_required="${modeRequired}".`,
        attempted: deduped,
      },
    };
  }

  // Step 3: drop kinds without an enabled project_runners row.
  const enabledByKind = new Map<RunnerKind, ProjectRunnerResolutionRef>();
  for (const pr of projectRunners) {
    if (pr.projectId === project.id && pr.enabled) {
      enabledByKind.set(pr.kind, pr);
    }
  }

  const configured = modeFiltered.filter((k) => enabledByKind.has(k));

  if (configured.length === 0) {
    return {
      ok: false,
      error: {
        code: "configMissing",
        message:
          "Chain contains kinds with no enabled `project_runners` row. Add a runner config.",
        attempted: modeFiltered,
      },
    };
  }

  // Step 4: drop unhealthy — unless that empties the chain, in which case
  // attempt the unhealthy ones in order (the dispatcher will surface errors
  // and chain-advance per state machine).
  const healthy = configured.filter((k) => {
    const pr = enabledByKind.get(k)!;
    return pr.lastHealthStatus === "healthy" || pr.lastHealthStatus === "unknown";
  });

  const finalChain = healthy.length > 0 ? healthy : configured;

  return { ok: true, chain: finalChain };
}

function dedupe(chain: RunnerKind[]): RunnerKind[] {
  const seen = new Set<RunnerKind>();
  const out: RunnerKind[] = [];
  for (const k of chain) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
