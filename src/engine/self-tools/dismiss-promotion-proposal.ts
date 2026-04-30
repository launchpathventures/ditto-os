/**
 * Ditto — Self Tool: Dismiss Memory Promotion Proposal (Brief 227, Reviewer Crit-2)
 *
 * The cross-project memory promotion proposal in the daily briefing
 * (`detectCrossProjectPromotionCandidate` in `briefing-assembler.ts`) suppresses
 * a candidate for 30 days after the user dismisses it. The cooldown read-side
 * queries `activities` for `action='memory_promotion_dismissed'` rows newer
 * than 30 days. THIS tool is the write-side: invoked by the
 * `[Keep per-project]` action in the proactive SuggestionBlock.
 *
 * Insight-180 stepRunId guard (mandatory per Brief 227 §Constraints).
 *
 * Provenance: Brief 227 AC #10 (cooldown via activities query); Designer spec
 *   §"We Noticed" Pattern; Reviewer Crit-2 follow-up.
 */

import { db, schema } from "../../db";
import type { DelegationResult } from "../self-delegation";

export const DISMISS_PROMOTION_PROPOSAL_TOOL_NAME = "dismiss_promotion_proposal";

export interface DismissPromotionProposalInput {
  /** ID of the memory whose promotion proposal is being dismissed. */
  memoryId: string;
  /** Insight-180 invocation guard. Required outside of `DITTO_TEST_MODE`. */
  stepRunId?: string;
  /** Optional actor id (user email or session id) for the activities row. */
  actorId?: string;
}

export async function handleDismissPromotionProposal(
  input: DismissPromotionProposalInput,
): Promise<DelegationResult> {
  if (!input.stepRunId && process.env.DITTO_TEST_MODE !== "true") {
    return {
      toolName: DISMISS_PROMOTION_PROPOSAL_TOOL_NAME,
      success: false,
      output:
        "dismiss_promotion_proposal requires stepRunId — must be called from within step execution (Insight-180).",
    };
  }

  if (!input.memoryId) {
    return {
      toolName: DISMISS_PROMOTION_PROPOSAL_TOOL_NAME,
      success: false,
      output: "memoryId is required.",
    };
  }

  await db.insert(schema.activities).values({
    action: "memory_promotion_dismissed",
    description: "User dismissed cross-project promotion proposal — 30-day cooldown engaged",
    actorType: "user",
    actorId: input.actorId ?? null,
    entityType: "memory",
    entityId: input.memoryId,
    metadata: { reason: "user-dismissed-via-suggestion-block" },
  });

  return {
    toolName: DISMISS_PROMOTION_PROPOSAL_TOOL_NAME,
    success: true,
    output: `Dismissed. I won't suggest promoting this memory again for 30 days.`,
    metadata: { memoryId: input.memoryId },
  };
}
