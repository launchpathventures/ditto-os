/**
 * Step Execution Handler
 *
 * Wraps the existing executeStep function as a pipeline handler.
 * On success, sets stepResult. On failure, sets stepError and shortCircuits.
 *
 * Provenance: Wraps the existing adapter pattern (Paperclip server/src/services/heartbeat.ts)
 */

import type { HarnessHandler, HarnessContext } from "../harness";
import { executeStep } from "../step-executor";

export const stepExecutionHandler: HarnessHandler = {
  name: "step-execution",

  canHandle(_context: HarnessContext): boolean {
    // Always runs for non-human steps (human steps are handled before pipeline)
    return true;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    try {
      const result = await executeStep(
        context.stepDefinition,
        context.processRun.inputs,
        context.processDefinition
      );

      context.stepResult = result;
    } catch (error) {
      context.stepError =
        error instanceof Error ? error : new Error(String(error));
      context.shortCircuit = true;
      context.trustAction = "pause"; // Failed steps always pause
    }

    return context;
  },
};
