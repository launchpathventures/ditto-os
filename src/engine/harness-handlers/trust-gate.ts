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
 * Provenance: Original — no system implements graduated trust with percentage-based sampling.
 */

import { createHash } from "crypto";
import type { HarnessHandler, HarnessContext } from "../harness";
import { SPOT_CHECK_RATE } from "../trust-constants";

/**
 * Salt for sampling hash. Prevents gaming by making the hash unpredictable
 * from processRunId + stepId alone. Override via AGENT_OS_SAMPLING_SALT env var.
 */
const SAMPLING_SALT = process.env.AGENT_OS_SAMPLING_SALT || "agent-os-default-salt-v1";

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

export const trustGateHandler: HarnessHandler = {
  name: "trust-gate",

  canHandle(context: HarnessContext): boolean {
    // Only runs if step execution succeeded (failed steps already short-circuited)
    return context.stepError === null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const { trustTier, reviewResult } = context;

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
        // Advance unless review pattern flagged, confidence is low,
        // or step is marked always_review
        if (
          reviewResult === "flag" ||
          (context.stepResult?.confidence !== undefined &&
            context.stepResult.confidence < 0.5) ||
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
        // canAutoAdvance=false is data-only in Phase 2a.
        // Phase 3 enforces this in the CLI approve flow (prevents batch-auto-approve).
        context.canAutoAdvance = false;
        break;
      }
    }

    return context;
  },
};
