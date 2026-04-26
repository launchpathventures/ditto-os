/**
 * Runner — kind, mode, and dispatch-status enums.
 *
 * Brief 215 §"What Changes" / file `packages/core/src/runner/kinds.ts`.
 * Engine-core only — no Ditto-product imports per CLAUDE.md core rule 4.
 */

import { z } from "zod";

// ============================================================
// Runner kinds — five values per Brief 214 §D2
// ============================================================

export const runnerKindValues = [
  "local-mac-mini",
  "claude-code-routine",
  "claude-managed-agent",
  "github-action",
  "e2b-sandbox",
] as const;
export type RunnerKind = (typeof runnerKindValues)[number];

export const RunnerKindSchema = z.enum(runnerKindValues);

// ============================================================
// Runner modes — local | cloud
// ============================================================

export const runnerModeValues = ["local", "cloud"] as const;
export type RunnerMode = (typeof runnerModeValues)[number];

export const RunnerModeSchema = z.enum(runnerModeValues);

/** Mode-required filter for work items: `any` (or null) = no constraint. */
export const runnerModeRequiredValues = ["local", "cloud", "any"] as const;
export type RunnerModeRequired = (typeof runnerModeRequiredValues)[number];

// ============================================================
// Dispatch lifecycle status — 9 states per Brief 215 AC #5
// ============================================================

export const runnerDispatchStatusValues = [
  "queued",
  "dispatched",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "rate_limited",
  "cancelled",
  "revoked",
] as const;
export type RunnerDispatchStatus = (typeof runnerDispatchStatusValues)[number];

// ============================================================
// Health status — published by adapter healthCheck()
// ============================================================

export const runnerHealthStatusValues = [
  "healthy",
  "unauthenticated",
  "rate_limited",
  "unreachable",
  "unknown",
] as const;
export type RunnerHealthStatus = (typeof runnerHealthStatusValues)[number];

// ============================================================
// Mode lookup — fixed at brief 214 §D2; new kinds extend the map
// ============================================================

const KIND_TO_MODE: Readonly<Record<RunnerKind, RunnerMode>> = {
  "local-mac-mini": "local",
  "claude-code-routine": "cloud",
  "claude-managed-agent": "cloud",
  "github-action": "cloud",
  "e2b-sandbox": "cloud",
};

export function kindToMode(kind: RunnerKind): RunnerMode {
  return KIND_TO_MODE[kind];
}

export function isCloudKind(kind: RunnerKind): boolean {
  return kindToMode(kind) === "cloud";
}

export function isLocalKind(kind: RunnerKind): boolean {
  return kindToMode(kind) === "local";
}
