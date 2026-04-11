/**
 * @ditto/core — Voice Calibration Handler
 *
 * Pre-execution handler that loads voice model from memories when
 * the sending identity is 'ghost' (Alex-as-User). Receives a memory
 * query callback via context.voiceModelLoader (injected by product layer).
 *
 * No-op when identity is not 'ghost' or when no loader is configured.
 *
 * Provenance: Brief 116, Insight-166 (ghost mode voice calibration)
 */

import type { HarnessHandler, HarnessContext } from "../harness.js";

export const voiceCalibrationHandler: HarnessHandler = {
  name: "voice-calibration",

  canHandle(context: HarnessContext): boolean {
    return context.sendingIdentity === "ghost" && context.voiceModelLoader !== null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    if (!context.voiceModelLoader) return context;

    const userId = (context.processRun.inputs.userId as string | undefined) ?? "";
    const voiceModel = await context.voiceModelLoader(
      context.processRun.processId,
      userId,
    );

    context.voiceModel = voiceModel;
    return context;
  },
};
