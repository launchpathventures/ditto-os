/**
 * @ditto/core — Broadcast/Direct Classifier Handler
 *
 * Post-execution handler that classifies outbound actions by audience size.
 * Deterministic lookup: channel + action type → 'broadcast' or 'direct'.
 *
 * Classification table is configurable via context.audienceClassificationRules
 * (injected by product layer, e.g., { 'linkedin.post': 'broadcast', 'email.single': 'direct' }).
 *
 * Only activates when context.outboundAction is set.
 *
 * Provenance: Brief 116, Insight-167 (broadcast/direct trust split)
 */

import type { HarnessHandler, HarnessContext } from "../harness.js";

export const broadcastDirectClassifierHandler: HarnessHandler = {
  name: "broadcast-direct-classifier",

  canHandle(context: HarnessContext): boolean {
    return context.outboundAction !== null && context.audienceClassificationRules !== null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    if (!context.outboundAction || !context.audienceClassificationRules) {
      return context;
    }

    const key = `${context.outboundAction.channel}.${context.outboundAction.actionType}`;
    const classification = context.audienceClassificationRules[key] ?? null;

    context.audienceClassification = classification;
    return context;
  },
};
