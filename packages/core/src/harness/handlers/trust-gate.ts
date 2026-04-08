/**
 * @ditto/core — Trust Gate Handler
 *
 * Decides whether output is auto-advanced or paused for human review
 * based on the process's trust tier.
 *
 * Four tiers:
 * - Supervised: always pause
 * - Spot-checked: ~20% deterministic sampling pause
 * - Autonomous: advance unless review flagged
 * - Critical: always pause, canAutoAdvance=false
 *
 * Provenance: Original — graduated trust with percentage-based sampling
 */

import { createHash } from "crypto";
import type { HarnessHandler, HarnessContext } from "../harness.js";
import type { TrustTier } from "../../db/schema.js";
import { SPOT_CHECK_RATE } from "../../trust/constants.js";

/**
 * Session trust override resolver. Injected by the consuming application.
 * Returns a relaxed trust tier if a session override is active, or null.
 */
let sessionTrustResolver: ((processRunId: string, stepRole: string | undefined) => TrustTier | null) | null = null;

export function setSessionTrustResolver(
  resolver: (processRunId: string, stepRole: string | undefined) => TrustTier | null,
): void {
  sessionTrustResolver = resolver;
}

/**
 * Sampling salt for deterministic spot-check hashing.
 * Injected by the consuming application via setSamplingSalt().
 * Falls back to a generic default — consumers should set their own.
 */
let samplingSalt = "core-default-salt-v1";

export function setSamplingSalt(salt: string): void {
  samplingSalt = salt;
}

function computeSamplingHash(processRunId: string, stepId: string): string {
  return createHash("sha256")
    .update(`${processRunId}:${stepId}:${samplingSalt}`)
    .digest("hex");
}

export const trustGateHandler: HarnessHandler = {
  name: "trust-gate",

  canHandle(_context: HarnessContext): boolean {
    return true;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    let effectiveTier = context.trustTier;

    // Session trust override (if resolver is configured)
    if (sessionTrustResolver) {
      const override = sessionTrustResolver(
        context.processRun.id,
        context.stepDefinition.agent_role,
      );
      if (override) {
        effectiveTier = override;
      }
    }

    // Review flagged — always pause regardless of tier
    if (context.reviewResult === "flag" || context.reviewResult === "retry") {
      context.trustAction = "pause";
      return context;
    }

    switch (effectiveTier) {
      case "supervised":
        context.trustAction = "pause";
        break;

      case "spot_checked": {
        const hash = computeSamplingHash(
          context.processRun.id,
          context.stepDefinition.id,
        );
        context.samplingHash = hash;

        const hashValue = parseInt(hash.slice(0, 8), 16);
        const threshold = Math.floor(SPOT_CHECK_RATE * 0xffffffff);

        if (hashValue < threshold) {
          context.trustAction = "sample_pause";
        } else {
          context.trustAction = "sample_advance";
        }
        break;
      }

      case "autonomous":
        context.trustAction = "advance";
        break;

      case "critical":
        context.trustAction = "pause";
        context.canAutoAdvance = false;
        break;

      default:
        context.trustAction = "pause";
    }

    return context;
  },
};
