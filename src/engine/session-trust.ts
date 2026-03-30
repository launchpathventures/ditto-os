/**
 * Ditto — Session-Scoped Trust Override Store (Brief 053)
 *
 * In-memory store for temporary trust tier overrides scoped to a single
 * pipeline run. Overrides relax trust for specific roles during a run,
 * subject to safety constraints:
 *   - Builder and reviewer roles cannot be relaxed (maker-checker separation)
 *   - Maximum relaxation is spot_checked (never autonomous)
 *   - Critical-tier steps cannot be relaxed
 *   - Overrides are cleared when the run completes or fails
 *
 * Provenance: original (scoped-override-with-auto-cleanup pattern).
 */

import type { TrustTier } from "../db/schema";
import { harnessEvents } from "./events";

// ============================================================
// Types
// ============================================================

/** Roles that can never have trust relaxed (maker-checker non-negotiable) */
const PROTECTED_ROLES = new Set(["builder", "reviewer"]);

/** Maximum trust relaxation allowed via session override */
const MAX_RELAXATION: TrustTier = "spot_checked";

/** Trust tier ordering: lower index = more restrictive */
const TIER_ORDER: TrustTier[] = ["critical", "supervised", "spot_checked", "autonomous"];

export interface SessionTrustOverrides {
  [roleName: string]: TrustTier;
}

export interface SessionTrustValidationError {
  role: string;
  reason: string;
}

// ============================================================
// In-memory store
// ============================================================

const sessionTrustStore = new Map<string, SessionTrustOverrides>();

/**
 * Compare trust tier strictness.
 * Returns positive if `a` is less restrictive than `b`.
 */
function tierIndex(tier: TrustTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Validate and set session trust overrides for a pipeline run.
 *
 * Returns validation errors if any overrides are rejected.
 * Valid overrides are stored; invalid ones are skipped.
 */
export function setSessionTrust(
  runId: string,
  overrides: Record<string, string>,
): { stored: SessionTrustOverrides; errors: SessionTrustValidationError[] } {
  const errors: SessionTrustValidationError[] = [];
  const validOverrides: SessionTrustOverrides = {};

  for (const [roleName, tier] of Object.entries(overrides)) {
    // Reject protected roles
    if (PROTECTED_ROLES.has(roleName)) {
      errors.push({
        role: roleName,
        reason: `${roleName} role cannot have trust relaxed (maker-checker separation is non-negotiable)`,
      });
      continue;
    }

    // Reject autonomous tier
    if (tier === "autonomous") {
      errors.push({
        role: roleName,
        reason: `Cannot set ${roleName} to autonomous — maximum session relaxation is spot_checked`,
      });
      continue;
    }

    // Reject critical tier (it's more restrictive, not a relaxation)
    if (tier === "critical") {
      errors.push({
        role: roleName,
        reason: `Cannot set session override to critical — overrides can only relax, not tighten`,
      });
      continue;
    }

    // Validate tier is a known value
    if (!TIER_ORDER.includes(tier as TrustTier)) {
      errors.push({
        role: roleName,
        reason: `Unknown trust tier: ${tier}`,
      });
      continue;
    }

    // Check max relaxation
    if (tierIndex(tier as TrustTier) > tierIndex(MAX_RELAXATION)) {
      errors.push({
        role: roleName,
        reason: `Cannot relax beyond ${MAX_RELAXATION} — requested ${tier}`,
      });
      continue;
    }

    validOverrides[roleName] = tier as TrustTier;
  }

  if (Object.keys(validOverrides).length > 0) {
    sessionTrustStore.set(runId, validOverrides);
  }

  return { stored: validOverrides, errors };
}

/**
 * Get the session trust override for a specific role in a run.
 * Returns undefined if no override exists.
 */
export function getSessionTrustOverride(
  runId: string,
  roleName: string,
): TrustTier | undefined {
  const overrides = sessionTrustStore.get(runId);
  if (!overrides) return undefined;
  return overrides[roleName];
}

/**
 * Clear session trust overrides for a run.
 */
export function clearSessionTrust(runId: string): void {
  sessionTrustStore.delete(runId);
}

/**
 * Check if a run has any session trust overrides.
 */
export function hasSessionTrust(runId: string): boolean {
  return sessionTrustStore.has(runId);
}

// ============================================================
// Auto-cleanup on run completion/failure
// ============================================================

let cleanupRegistered = false;

/**
 * Register event listeners to auto-clear session trust on run completion.
 * Called once at module load.
 */
export function registerSessionTrustCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  harnessEvents.on((event) => {
    if (event.type === "run-complete" || event.type === "run-failed") {
      clearSessionTrust(event.processRunId);
    }
  });
}

// Auto-register cleanup on module load
registerSessionTrustCleanup();
