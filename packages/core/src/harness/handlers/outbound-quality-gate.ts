/**
 * @ditto/core — Outbound Quality Gate Handler
 *
 * Post-execution handler that checks outbound actions against configurable
 * house value rules. Non-bypassable — runs regardless of trust tier.
 *
 * Supports two modes:
 * 1. Legacy single-action: checks context.outboundAction (backward compat)
 * 2. Staged queue: iterates context.stagedOutboundActions, checking each
 *    independently. Approved drafts dispatch via callback. Rejected drafts
 *    are recorded as flagged. (Brief 129)
 *
 * Does NOT short-circuit — downstream handlers still run after flagging.
 *
 * Provenance: Brief 116 (quality gate), Brief 129 (per-action staging)
 */

import type { HarnessHandler, HarnessContext, StagedOutboundAction } from "../harness.js";

/**
 * Check a single piece of content against quality rules.
 * Returns array of violation strings (empty = passed).
 */
function checkRules(
  content: string,
  channel: string | undefined,
  recipientId: string | undefined,
  rules: HarnessContext["outboundQualityRules"],
): string[] {
  const violations: string[] = [];
  for (const rule of rules ?? []) {
    const violation = rule.check(content, { channel, recipientId });
    if (violation) {
      violations.push(`[${rule.id}] ${violation}`);
    }
  }
  return violations;
}

export const outboundQualityGateHandler: HarnessHandler = {
  name: "outbound-quality-gate",
  alwaysRun: true,

  canHandle(context: HarnessContext): boolean {
    return (
      context.outboundAction !== null ||
      context.stagedOutboundActions.length > 0
    );
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const allViolations: string[] = [];

    // ── Staged queue (Brief 129) ──────────────────────────────
    if (context.stagedOutboundActions.length > 0) {
      for (const staged of context.stagedOutboundActions) {
        const content = staged.content ?? "";
        const violations = checkRules(
          content,
          staged.channel,
          staged.recipientId,
          context.outboundQualityRules,
        );
        let blocked = violations.length > 0;
        staged.approved = !blocked;

        // Brief 172: pre-dispatch budget guard. Runs only for actions that
        // passed content rules — an exhausted budget blocks the dispatch
        // and flags the action as a quality violation, so nothing ships
        // against a goal that can't afford it.
        if (staged.approved && context.checkBudgetBeforeDispatch) {
          const decision = await context.checkBudgetBeforeDispatch(staged);
          if (decision.blocked) {
            const reason = decision.reason ?? "budget exhausted";
            violations.push(`[budget] ${reason}`);
            blocked = true;
            staged.approved = false;
          }
        }

        if (blocked) {
          allViolations.push(...violations);
        }

        // Record each action individually
        if (context.recordOutboundAction) {
          await context.recordOutboundAction({
            processRunId: context.processRun.id,
            stepRunId: context.stepRunId,
            channel: staged.channel ?? "unknown",
            sendingIdentity: context.sendingIdentity ?? "unknown",
            recipientId: staged.recipientId,
            contentSummary: content.slice(0, 500),
            blocked,
            blockReason: blocked ? violations.join("; ") : undefined,
          });
        }

        // Dispatch approved actions via product-layer callback
        if (staged.approved && context.dispatchStagedAction) {
          await context.dispatchStagedAction(staged);
        }
      }
    }

    // ── Legacy single-action (backward compat) ───────────────
    if (context.outboundAction) {
      const content = context.outboundAction.content ?? "";
      const violations = checkRules(
        content,
        context.outboundAction.channel,
        context.outboundAction.recipientId,
        context.outboundQualityRules,
      );
      const blocked = violations.length > 0;

      if (blocked) {
        allViolations.push(...violations);
      }

      if (context.recordOutboundAction) {
        await context.recordOutboundAction({
          processRunId: context.processRun.id,
          stepRunId: context.stepRunId,
          channel: context.outboundAction.channel,
          sendingIdentity: context.sendingIdentity ?? "unknown",
          recipientId: context.outboundAction.recipientId,
          contentSummary: content.slice(0, 500),
          blocked,
          blockReason: blocked ? violations.join("; ") : undefined,
        });
      }
    }

    // Flag if any violations found (staged or legacy)
    if (allViolations.length > 0) {
      context.reviewResult = "flag";
      context.reviewDetails = {
        ...context.reviewDetails,
        outboundQualityViolations: allViolations,
      };
    }

    return context;
  },
};
