/**
 * Runner Adapter — interface contract for all runner kinds.
 *
 * Brief 215 §"What Changes" / file `interface.ts`. Each sub-brief 216-218
 * implements this interface for one runner kind. The contract is finalized
 * here so downstream briefs do not redefine.
 *
 * Engine-core only — no Ditto-product imports. The dispatcher (Ditto product
 * layer) instantiates concrete adapters via the in-process registry.
 */

import { type ZodType } from "zod";
import {
  type RunnerKind,
  type RunnerMode,
  type RunnerDispatchStatus,
  type RunnerHealthStatus,
} from "./kinds.js";

// ============================================================
// Refs — passed into adapter methods
// ============================================================

/** Snapshot of the work item being dispatched. */
export interface WorkItemRef {
  id: string;
  /** Work-item body — used as prompt input for cloud runners. */
  content: string;
  /** Existing field on workItems (Brief 064 goal-decomposition lineage). */
  goalAncestry: string[];
  /** Free-form additional context the dispatcher may inject. */
  context: Record<string, unknown>;
}

/** Snapshot of a project_runners row, the per-(project × kind) config. */
export interface ProjectRunnerRef {
  id: string;
  projectId: string;
  kind: RunnerKind;
  mode: RunnerMode;
  /** Kind-specific shape; each adapter validates via its `configSchema`. */
  configJson: Record<string, unknown>;
  /** Pointers into the credentials table (existing AES-256-GCM vault). */
  credentialIds: string[];
}

/** Subset of the projects row needed by adapters at dispatch time. */
export interface ProjectRef {
  id: string;
  slug: string;
  githubRepo: string | null;
  defaultRunnerKind: RunnerKind | null;
  fallbackRunnerKind: RunnerKind | null;
  runnerChain: RunnerKind[] | null;
}

// ============================================================
// Dispatch result + status snapshot
// ============================================================

/** Returned by `execute()` — the dispatch's outcome at hand-off time. */
export interface DispatchResult {
  /** External system's run ID (e.g., Routine fire ID, Actions run ID); null if dispatch failed before the external system created one. */
  externalRunId: string | null;
  /** Deep-link URL to the external run (when available). */
  externalUrl: string | null;
  startedAt: Date;
  /**
   * Set only when the adapter knows the dispatch reached a terminal state
   * synchronously. Async-completing adapters leave this undefined and report
   * later via `status()` and webhook callbacks.
   */
  finalStatus?: Extract<
    RunnerDispatchStatus,
    "succeeded" | "failed" | "timed_out" | "rate_limited" | "cancelled"
  >;
  errorReason?: string;
}

/** Returned by `status()` — a polled snapshot of dispatch lifecycle state. */
export interface DispatchStatusSnapshot {
  status: RunnerDispatchStatus;
  externalRunId: string | null;
  externalUrl: string | null;
  exitCode?: number;
  errorReason?: string;
  lastUpdatedAt: Date;
}

/** Returned by `cancel()` — best-effort acknowledgement. */
export interface CancelResult {
  ok: boolean;
  /** Optional reason from the runner if cancellation was rejected. */
  reason?: string;
}

/** Returned by `healthCheck()` — runner reachability + auth. */
export interface HealthCheckResult {
  status: RunnerHealthStatus;
  /** Optional human-readable reason ("rate-limit ceiling reached", etc.). */
  reason?: string;
}

/**
 * Trust context the dispatcher hands the adapter. Adapters that compose
 * downstream audited primitives (e.g., Brief 212's `dispatchBridgeJob`)
 * MUST forward this faithfully — fabricating `autonomous` here would lie
 * to the bridge-layer audit trail.
 */
export interface DispatchTrustContext {
  trustTier: "supervised" | "spot_checked" | "autonomous" | "critical";
  trustAction: "pause" | "advance" | "sample_pause" | "sample_advance";
}

/**
 * Identifiers the adapter needs to thread into downstream audit rows. The
 * dispatcher writes its own `harness_decisions` row keyed on `stepRunId`;
 * adapters that delegate to other audited primitives (Brief 212) need
 * `processRunId` to satisfy FK constraints on those primitives' tables.
 */
export interface DispatchExecuteContext {
  /** Insight-180 — required. Bypassed only in DITTO_TEST_MODE. */
  stepRunId: string;
  /** FK to processRuns.id; required for downstream audit rows. */
  processRunId: string;
  /** PK of the runner_dispatches row the dispatcher just inserted. */
  dispatchId: string;
  /** Trust decision recorded by the upstream gate. */
  trust: DispatchTrustContext;
}

// ============================================================
// The adapter contract
// ============================================================

export interface RunnerAdapter {
  /** Identifies the kind this adapter handles. Registry uses this as key. */
  kind: RunnerKind;
  /** Mode (local | cloud). Pre-computed from `kind` via `kindToMode()`. */
  mode: RunnerMode;
  /** Zod schema for `project_runners.config_json`. Validated at admin save. */
  configSchema: ZodType;
  /**
   * True iff this adapter can actually cancel an in-flight dispatch. The
   * dispatcher checks this before calling `cancel()` to avoid throws on
   * adapters that never wired cancellation (e.g., the Brief 215 substrate
   * shim for `local-mac-mini`).
   */
  supportsCancel: boolean;

  /**
   * Dispatch a work item to the external runner. Brief 215 §Constraints
   * "Side-effecting function guard" — the dispatcher MUST pass `stepRunId`
   * via `ctx.stepRunId`; adapters reject calls without it (except in
   * `DITTO_TEST_MODE`).
   */
  execute(
    ctx: DispatchExecuteContext,
    workItem: WorkItemRef,
    project: ProjectRef,
    projectRunner: ProjectRunnerRef
  ): Promise<DispatchResult>;

  /** Poll the external runner for current status of a previously-dispatched run. */
  status(dispatchId: string, externalRunId: string): Promise<DispatchStatusSnapshot>;

  /** Best-effort cancel of an in-flight dispatch. */
  cancel(dispatchId: string, externalRunId: string): Promise<CancelResult>;

  /** Lightweight reachability/auth probe. Recorded in `project_runners.last_health_status`. */
  healthCheck(projectRunner: ProjectRunnerRef): Promise<HealthCheckResult>;
}
