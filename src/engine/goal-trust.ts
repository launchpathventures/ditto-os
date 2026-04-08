/**
 * Goal Trust — Trust Tier Inheritance for Sub-Goal Process Runs
 *
 * Resolves the effective trust tier for a sub-goal's process run.
 * Goal-level trust can only RELAX sub-process trust (consistent with
 * session trust Brief 053). Cannot tighten beyond the process's own tier.
 * Builder/reviewer roles and critical-tier steps cannot be relaxed.
 *
 * Provenance: Session trust (Brief 053) — same relax-only inheritance model,
 * extended from run to goal scope.
 *
 * Brief 103
 */

import type { TrustTier } from "../db/schema";

// ============================================================
// Types
// ============================================================

export interface GoalTrust {
  /** Trust tier set on the goal (may be more permissive than individual processes) */
  goalTier: TrustTier;
  /** Per-sub-goal trust overrides (sub-goal ID → tier) */
  subGoalOverrides?: Record<string, TrustTier>;
}

export interface ResolvedTrust {
  /** The effective trust tier for this sub-goal's process run */
  effectiveTier: TrustTier;
  /** Explanation of how the tier was resolved */
  reasoning: string;
  /** Whether the goal trust relaxed the process tier */
  wasRelaxed: boolean;
}

// ============================================================
// Trust tier ordering
// ============================================================

/**
 * Trust tier restrictiveness order (most restrictive first).
 * Matches heartbeat.ts TRUST_TIER_ORDER.
 */
const TRUST_TIER_ORDER: TrustTier[] = ["critical", "supervised", "spot_checked", "autonomous"];

function tierIndex(tier: TrustTier): number {
  return TRUST_TIER_ORDER.indexOf(tier);
}

function isMoreRestrictive(a: TrustTier, b: TrustTier): boolean {
  return tierIndex(a) < tierIndex(b);
}

function moreRestrictiveTier(a: TrustTier, b: TrustTier): TrustTier {
  return tierIndex(a) <= tierIndex(b) ? a : b;
}

// ============================================================
// Roles and steps that cannot be relaxed
// ============================================================

/** Step roles that are always supervised regardless of goal trust */
const PROTECTED_ROLES = new Set(["builder", "reviewer"]);

// ============================================================
// Resolution
// ============================================================

/**
 * Resolve the effective trust tier for a sub-goal's process run.
 *
 * Rules:
 * 1. The effective tier is the MORE RESTRICTIVE of the goal tier and the process tier.
 *    This means goal trust can only relax, never tighten.
 * 2. Critical-tier steps cannot be relaxed (always critical).
 * 3. Builder/reviewer roles cannot be relaxed.
 * 4. Per-sub-goal overrides take precedence over the goal-level tier.
 *
 * Effective tier = more restrictive of goal tier and process tier (AC8).
 * Goal trust can tighten (add oversight) but never relax below a process's own tier.
 */
export function resolveSubGoalTrust(
  goalTrust: GoalTrust,
  processTrustTier: TrustTier,
  subGoalId?: string,
  stepRole?: string,
): ResolvedTrust {
  // Check for per-sub-goal override
  const goalTier = (subGoalId && goalTrust.subGoalOverrides?.[subGoalId])
    || goalTrust.goalTier;

  // Critical-tier steps cannot be relaxed
  if (processTrustTier === "critical") {
    return {
      effectiveTier: "critical",
      reasoning: "Process trust tier is critical — cannot be relaxed",
      wasRelaxed: false,
    };
  }

  // Builder/reviewer roles cannot be relaxed
  if (stepRole && PROTECTED_ROLES.has(stepRole)) {
    return {
      effectiveTier: moreRestrictiveTier(goalTier, processTrustTier),
      reasoning: `Role "${stepRole}" is protected — trust constrained to more restrictive`,
      wasRelaxed: false,
    };
  }

  // Standard resolution: MORE RESTRICTIVE of goal and process tier
  const effectiveTier = moreRestrictiveTier(goalTier, processTrustTier);
  const wasRelaxed = false; // More restrictive never relaxes

  const reasoning = effectiveTier === processTrustTier
    ? `Goal tier (${goalTier}) did not change process tier (${processTrustTier})`
    : `Goal tier (${goalTier}) tightened process tier from ${processTrustTier} to ${effectiveTier}`;

  return { effectiveTier, reasoning, wasRelaxed };
}

/**
 * Check whether a goal trust configuration is valid.
 * Goal trust cannot specify a tier less restrictive than "autonomous"
 * or more restrictive than "critical".
 */
export function isValidGoalTrust(goalTrust: GoalTrust): boolean {
  const validTiers = new Set(TRUST_TIER_ORDER);
  if (!validTiers.has(goalTrust.goalTier)) return false;
  if (goalTrust.subGoalOverrides) {
    for (const tier of Object.values(goalTrust.subGoalOverrides)) {
      if (!validTiers.has(tier)) return false;
    }
  }
  return true;
}
