/**
 * Trust Evaluator — Phase 3b
 *
 * Post-run trust evaluation: called after feedback is recorded.
 * Checks upgrade eligibility and downgrade triggers, creates
 * suggestions or executes downgrades as appropriate.
 *
 * AC-15: Runs automatically after every feedback record.
 * AC-7: Grace period suppresses downgrades (except safety valve).
 * AC-7a: Downgrade dismisses pending suggestions.
 *
 * Provenance:
 * - Quality gate pattern: SonarQube QualityGateEvaluatorImpl.java
 * - Conjunctive upgrade / disjunctive downgrade: eBay seller standards
 * - Grace period: Discourse TL3
 */

import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import type { TrustTier } from "../db/schema";
import {
  computeAndCacheTrustState,
  checkUpgradeEligibility,
  checkDowngradeTriggers,
  isGraceSafetyValveTriggered,
  countRunsAtCurrentTier,
  createUpgradeSuggestion,
  dismissPendingSuggestion,
  executeTierChange,
  getPendingSuggestion,
} from "./trust";

export interface TrustEvaluationResult {
  action: "none" | "suggestion_created" | "downgrade_executed" | "grace_period";
  details?: string;
}

/**
 * Evaluate trust state after feedback and take action if warranted.
 *
 * Called after every feedback record (approve/edit/reject).
 * Checks:
 * 1. Downgrade triggers (disjunctive — any fires)
 * 2. Grace period (suppresses downgrades unless safety valve)
 * 3. Upgrade eligibility (conjunctive — all must pass)
 */
export async function evaluateTrust(
  processId: string,
): Promise<TrustEvaluationResult> {
  // Get current process
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, processId))
    .limit(1);

  if (!proc) return { action: "none" };

  const currentTier = proc.trustTier as TrustTier;

  // Critical tier: no programmatic changes ever
  if (currentTier === "critical") {
    return { action: "none" };
  }

  // Compute fresh trust state
  const state = await computeAndCacheTrustState(processId);

  // --- Step 1: Check downgrade triggers ---
  const downgrade = checkDowngradeTriggers(currentTier, state);

  if (downgrade.triggered) {
    // Check grace period
    if (state.gracePeriodRemaining > 0) {
      if (isGraceSafetyValveTriggered(state)) {
        // AC-7: Safety valve — immediate downgrade despite grace
        await dismissPendingSuggestion(processId, "Downgrade safety valve during grace period");
        await executeTierChange({
          processId,
          fromTier: currentTier,
          toTier: "supervised",
          reason: "Safety valve: correction rate exceeded 50% during grace period",
          actor: "system",
          metadata: { triggers: downgrade.triggers, graceSafetyValve: true },
        });
        return {
          action: "downgrade_executed",
          details: "Safety valve triggered during grace period",
        };
      }
      // Grace period active — suppress downgrade
      return {
        action: "grace_period",
        details: `${state.gracePeriodRemaining} runs remaining in grace period`,
      };
    }

    // AC-7a: Dismiss any pending upgrade suggestion
    await dismissPendingSuggestion(processId, "Downgrade trigger fired");

    // AC-11: Execute downgrade
    await executeTierChange({
      processId,
      fromTier: currentTier,
      toTier: "supervised",
      reason: `Auto-downgrade: ${downgrade.triggers.map((t) => t.name).join(", ")}`,
      actor: "system",
      metadata: { triggers: downgrade.triggers },
    });

    return {
      action: "downgrade_executed",
      details: downgrade.triggers.map((t) => `${t.name}: ${t.actual}`).join("; "),
    };
  }

  // --- Step 2: Check upgrade eligibility ---
  // Only if no pending suggestion already exists
  const pendingSuggestion = await getPendingSuggestion(processId);
  if (pendingSuggestion) {
    return { action: "none" };
  }

  // Skip upgrade check during grace period
  if (state.gracePeriodRemaining > 0) {
    return { action: "none" };
  }

  const runsAtTier = await countRunsAtCurrentTier(processId, currentTier);
  const upgrade = checkUpgradeEligibility(currentTier, state, runsAtTier);

  if (upgrade.eligible && upgrade.targetTier) {
    // AC-8: Create upgrade suggestion
    await createUpgradeSuggestion({
      processId,
      currentTier,
      suggestedTier: upgrade.targetTier,
      conditions: upgrade.conditions,
    });

    return {
      action: "suggestion_created",
      details: `Eligible for ${upgrade.targetTier}`,
    };
  }

  return { action: "none" };
}
