/**
 * @ditto/core — Identity Router Handler
 *
 * Pre-execution handler that resolves the sending identity for outbound steps.
 * Reads stepDefinition.sendingIdentity (explicit) or falls back to
 * processDefinition.defaultIdentity.
 *
 * Three generic identity labels:
 * - 'principal': the entity itself (e.g., Alex)
 * - 'agent-of-user': branded agent acting on user's behalf
 * - 'ghost': sends as the user themselves (requires voice calibration)
 *
 * Provenance: Brief 116, Insight-166 (three sending identities)
 */

import type { HarnessHandler, HarnessContext } from "../harness.js";

export const identityRouterHandler: HarnessHandler = {
  name: "identity-router",

  canHandle(context: HarnessContext): boolean {
    // Runs when step or process declares a sending identity
    return !!(
      context.stepDefinition.sendingIdentity ||
      context.processDefinition.defaultIdentity
    );
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    // Step-level identity takes precedence over process-level default
    const identity =
      context.stepDefinition.sendingIdentity ??
      context.processDefinition.defaultIdentity ??
      null;

    context.sendingIdentity = identity;
    return context;
  },
};
