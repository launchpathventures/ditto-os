/**
 * Ditto — Self Tool: Adjust Trust
 *
 * Proposes a trust tier change by computing current trust state
 * and presenting evidence. Actual change happens only after user
 * confirms — the Self MUST confirm before calling executeTierChange.
 *
 * IMPORTANT: This tool is marked as irreversible. The Self's
 * confirmation model must request explicit user confirmation
 * before applying the change.
 *
 * Provenance: Existing trust.ts (Phase 3), executeTierChange(), Brief 040.
 */

import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import {
  computeTrustState,
  formatTrustState,
  executeTierChange,
} from "../trust";
import type { TrustTier } from "../../db/schema";
import { trustTierValues } from "../../db/schema";
import type { DelegationResult } from "../self-delegation";

interface AdjustTrustInput {
  processSlug: string;
  newTier: string;
  reason: string;
  /** Must be true to apply — Self confirms with user first */
  confirmed: boolean;
}

export async function handleAdjustTrust(
  input: AdjustTrustInput,
): Promise<DelegationResult> {
  const { processSlug, newTier, reason, confirmed } = input;

  if (!processSlug || !newTier || !reason) {
    return {
      toolName: "adjust_trust",
      success: false,
      output: "processSlug, newTier, and reason are all required.",
    };
  }

  if (!trustTierValues.includes(newTier as TrustTier)) {
    return {
      toolName: "adjust_trust",
      success: false,
      output: `Invalid tier: ${newTier}. Valid tiers: ${trustTierValues.join(", ")}`,
    };
  }

  try {
    // Look up process
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      return {
        toolName: "adjust_trust",
        success: false,
        output: `Process not found: ${processSlug}`,
      };
    }

    const currentTier = proc.trustTier as TrustTier;

    if (currentTier === newTier) {
      return {
        toolName: "adjust_trust",
        success: false,
        output: `Process "${proc.name}" is already at ${currentTier} tier.`,
      };
    }

    // Compute trust state for evidence
    const trustState = await computeTrustState(proc.id);
    const evidence = formatTrustState(proc.name, currentTier, trustState);

    if (!confirmed) {
      // Return proposal with evidence — Self must confirm with user
      return {
        toolName: "adjust_trust",
        success: true,
        output: JSON.stringify({
          action: "proposal",
          processName: proc.name,
          currentTier,
          proposedTier: newTier,
          reason,
          evidence,
          trust: {
            approvalRate: trustState.approvalRate,
            correctionRate: trustState.correctionRate,
            runsInWindow: trustState.runsInWindow,
            trend: trustState.trend,
          },
          message: `Proposing trust change for "${proc.name}": ${currentTier} → ${newTier}. Reason: ${reason}. Ask the user to confirm before applying.`,
        }),
      };
    }

    // User confirmed — apply the change
    await executeTierChange({
      processId: proc.id,
      fromTier: currentTier,
      toTier: newTier as TrustTier,
      reason,
      actor: "human",
      metadata: { source: "self_conversation" },
    });

    return {
      toolName: "adjust_trust",
      success: true,
      output: JSON.stringify({
        action: "applied",
        processName: proc.name,
        fromTier: currentTier,
        toTier: newTier,
        message: `Trust tier for "${proc.name}" changed from ${currentTier} to ${newTier}.`,
      }),
    };
  } catch (err) {
    return {
      toolName: "adjust_trust",
      success: false,
      output: `Failed to adjust trust: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
