/**
 * Trust Gate Handler
 *
 * Runs after step execution and review patterns. Decides whether the output
 * is auto-advanced or paused for human review based on the process's trust tier.
 *
 * Four tiers:
 * - Supervised: always pause
 * - Spot-checked: ~20% deterministic sampling pause
 * - Autonomous: advance unless review flagged
 * - Critical: always pause, canAutoAdvance=false
 *
 * Session trust overrides (Brief 053): Before checking the process trust tier,
 * check for a session-scoped override. Overrides can only relax (supervised →
 * spot_checked), never tighten. Ignored for builder/reviewer roles and critical-tier steps.
 *
 * Provenance: Original — no system implements graduated trust with percentage-based sampling.
 */

import { createHash } from "crypto";
import type { HarnessHandler, HarnessContext } from "../harness";
import type { TrustTier } from "../../db/schema";
import { SPOT_CHECK_RATE } from "../trust-constants";
import { getSessionTrustOverride } from "../session-trust";

/**
 * Salt for sampling hash. Prevents gaming by making the hash unpredictable
 * from processRunId + stepId alone. Override via DITTO_SAMPLING_SALT env var.
 */
const SAMPLING_SALT = process.env.DITTO_SAMPLING_SALT || "ditto-default-salt-v1";

/**
 * Deterministic hash-based sampling.
 * Same processRunId + stepId + salt always produces the same decision.
 */
function computeSamplingHash(processRunId: string, stepId: string): string {
  return createHash("sha256")
    .update(`${processRunId}:${stepId}:${SAMPLING_SALT}`)
    .digest("hex");
}

function shouldSample(samplingHash: string): boolean {
  // Use first 8 hex chars as a 32-bit number, normalize to 0-1
  const value = parseInt(samplingHash.slice(0, 8), 16) / 0xffffffff;
  return value < SPOT_CHECK_RATE;
}

/** Trust tier ordering: higher index = less restrictive */
const TIER_ORDER: TrustTier[] = ["critical", "supervised", "spot_checked", "autonomous"];

/** Returns true if `a` is strictly less restrictive than `b`. */
function isLessRestrictive(a: TrustTier, b: TrustTier): boolean {
  return TIER_ORDER.indexOf(a) > TIER_ORDER.indexOf(b);
}

export const trustGateHandler: HarnessHandler = {
  name: "trust-gate",

  canHandle(context: HarnessContext): boolean {
    // Only runs if step execution succeeded (failed steps already short-circuited)
    return context.stepError === null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    let { trustTier } = context;
    const { reviewResult } = context;
    const confidence = context.stepResult?.confidence;

    // Brief 053: Check for session-scoped trust override.
    // Override can only relax, never tighten. Ignored for critical-tier steps.
    if (trustTier !== "critical") {
      const roleName = context.stepDefinition.agent_role;
      if (roleName) {
        const override = getSessionTrustOverride(context.processRun.id, roleName);
        if (override && isLessRestrictive(override, trustTier)) {
          trustTier = override;
        }
      }
    }

    // AC15: Low confidence overrides tier — always pause regardless of trust level
    // Provenance: ADR-011, SAE Level 3 self-assessment
    if (confidence === "low") {
      context.trustAction = "pause";
      return context;
    }

    switch (trustTier) {
      case "supervised": {
        context.trustAction = "pause";
        break;
      }

      case "spot_checked": {
        const hash = computeSamplingHash(
          context.processRun.id,
          context.stepDefinition.id
        );
        context.samplingHash = hash;

        // If review flagged, always pause regardless of sampling
        if (reviewResult === "flag") {
          context.trustAction = "pause";
          break;
        }

        if (shouldSample(hash)) {
          context.trustAction = "sample_pause";
        } else {
          context.trustAction = "sample_advance";
        }
        break;
      }

      case "autonomous": {
        // Advance unless review pattern flagged or step is marked always_review
        if (
          reviewResult === "flag" ||
          context.stepDefinition.config?.always_review === true
        ) {
          context.trustAction = "pause";
        } else {
          context.trustAction = "advance";
        }
        break;
      }

      case "critical": {
        context.trustAction = "pause";
        context.canAutoAdvance = false;
        break;
      }
    }

    return context;
  },
};
