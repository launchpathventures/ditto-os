/**
 * Agent OS — Harness Pipeline
 *
 * The harness is a chain-of-responsibility pipeline that wraps every step execution.
 * Each handler has canHandle() and execute() methods. Handlers execute in order,
 * passing context through. Any handler can short-circuit by setting context.shortCircuit.
 *
 * Provenance: Handler registry pattern from Sim Studio apps/sim/executor/handlers/registry.ts
 */

import type { TrustTier, TrustAction, ReviewResult } from "../db/schema";
import type { ProcessDefinition, StepDefinition } from "./process-loader";
import type { StepExecutionResult } from "./step-executor";

// ============================================================
// Types
// ============================================================

export interface HarnessContext {
  // Input — set before pipeline runs
  processRun: {
    id: string;
    processId: string;
    inputs: Record<string, unknown>;
  };
  stepDefinition: StepDefinition;
  processDefinition: ProcessDefinition;
  trustTier: TrustTier;
  stepRunId: string;

  // Accumulated by handlers
  memories: string; // Rendered memory block (empty in 2a stub)
  memoriesInjected: number;
  stepResult: StepExecutionResult | null;
  stepError: Error | null;
  reviewResult: ReviewResult;
  reviewPattern: string[];
  reviewDetails: Record<string, unknown>;
  reviewCostCents: number;
  trustAction: TrustAction;
  samplingHash: string | null;
  canAutoAdvance: boolean;

  // Control flow
  shortCircuit: boolean;
}

export interface HarnessHandler {
  name: string;
  canHandle(context: HarnessContext): boolean;
  execute(context: HarnessContext): Promise<HarnessContext>;
}

// ============================================================
// Pipeline
// ============================================================

export class HarnessPipeline {
  private handlers: HarnessHandler[] = [];

  register(handler: HarnessHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Run the pipeline for a step execution.
   * Handlers execute in registration order. Each receives and returns context.
   * If a handler sets shortCircuit=true, remaining handlers are skipped
   * (except the feedback recorder, which always runs).
   */
  async run(context: HarnessContext): Promise<HarnessContext> {
    for (const handler of this.handlers) {
      if (context.shortCircuit && handler.name !== "feedback-recorder") {
        continue;
      }

      if (handler.canHandle(context)) {
        context = await handler.execute(context);
      }
    }

    return context;
  }
}

/**
 * Create a fresh HarnessContext for a step execution.
 */
export function createHarnessContext(params: {
  processRun: HarnessContext["processRun"];
  stepDefinition: HarnessContext["stepDefinition"];
  processDefinition: ProcessDefinition;
  trustTier: TrustTier;
  stepRunId: string;
}): HarnessContext {
  return {
    processRun: params.processRun,
    stepDefinition: params.stepDefinition,
    processDefinition: params.processDefinition,
    trustTier: params.trustTier,
    stepRunId: params.stepRunId,

    // Defaults — handlers populate these
    memories: "",
    memoriesInjected: 0,
    stepResult: null,
    stepError: null,
    reviewResult: "skip",
    reviewPattern: [],
    reviewDetails: {},
    reviewCostCents: 0,
    trustAction: "pause", // Safe default: pause until trust gate decides
    samplingHash: null,
    canAutoAdvance: true,
    shortCircuit: false,
  };
}
