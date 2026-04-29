/**
 * @ditto/core — Step Execution Handler
 *
 * Invokes the configured step adapter to execute a process step.
 * The adapter registry is injected via setStepExecutor().
 */

import type { HarnessHandler, HarnessContext, StepDefinition, ProcessDefinition } from "../harness.js";
import type { StepExecutionResult, StepAdapter } from "../../interfaces.js";

/** Adapter registry — populated by the consuming application */
let adapterRegistry: Record<string, StepAdapter> = {};

/** System agent resolver — populated by the consuming application */
let systemAgentResolver: ((name: string) => ((inputs: Record<string, unknown>) => Promise<StepExecutionResult>) | null) | null = null;

export function setAdapterRegistry(registry: Record<string, StepAdapter>): void {
  adapterRegistry = registry;
}

export function setSystemAgentResolver(
  resolver: (name: string) => ((inputs: Record<string, unknown>) => Promise<StepExecutionResult>) | null,
): void {
  systemAgentResolver = resolver;
}

/**
 * Execute a single process step.
 *
 * `stepRunId` and `processRunId` (when supplied) are forwarded into the
 * inputs that reach the system-agent handler under reserved keys
 * `_stepRunId` / `_processRunId`. Side-effecting handlers read them to
 * enforce the Insight-180 step-run guard. Existing handlers ignore the
 * extra keys.
 */
export async function executeStep(
  step: StepDefinition,
  runInputs: Record<string, unknown>,
  processDefinition: ProcessDefinition,
  resolvedTools?: unknown,
  _processId?: string,
  stepRunId?: string,
  processRunId?: string,
): Promise<StepExecutionResult> {
  console.log(`  Executing step: ${step.name} (${step.executor})`);

  // System agent dispatch
  const systemAgentName = step.config?.systemAgent as string | undefined;
  if (systemAgentName && systemAgentResolver) {
    const handler = systemAgentResolver(systemAgentName);
    if (handler) {
      console.log(`  System agent: ${systemAgentName}`);
      const enrichedInputs = {
        ...runInputs,
        _stepRunId: stepRunId,
        _processRunId: processRunId,
      };
      return handler(enrichedInputs);
    }
  }

  // Adapter dispatch
  const adapter = adapterRegistry[step.executor];
  if (!adapter) {
    throw new Error(
      `No adapter registered for executor type: ${step.executor}. ` +
      `Available: ${Object.keys(adapterRegistry).join(", ")}`,
    );
  }

  return adapter.execute(step, runInputs, processDefinition, resolvedTools);
}

export const stepExecutionHandler: HarnessHandler = {
  name: "step-execution",

  canHandle(_context: HarnessContext): boolean {
    return true;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    try {
      const result = await executeStep(
        context.stepDefinition,
        context.processRun.inputs,
        context.processDefinition,
        context.resolvedTools ?? undefined,
        undefined,
        context.stepRunId,
        context.processRun.id,
      );
      context.stepResult = result;
    } catch (error) {
      context.stepError = error instanceof Error ? error : new Error(String(error));
      context.shortCircuit = true;
    }

    return context;
  },
};
