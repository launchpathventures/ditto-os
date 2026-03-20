/**
 * Agent OS — Step Executor
 *
 * Routes step execution to the right adapter based on executor type.
 * This is the bridge between process definitions and agent runtimes.
 */

import type { ProcessDefinition, StepDefinition } from "./process-loader";
import { claudeAdapter } from "../adapters/claude";
import { scriptAdapter } from "../adapters/script";

export interface StepExecutionResult {
  outputs: Record<string, unknown>;
  tokensUsed?: number;
  costCents?: number;
  confidence?: number;
  logs?: string[];
}

/**
 * Execute a single process step using the appropriate adapter.
 */
export async function executeStep(
  step: StepDefinition,
  runInputs: Record<string, unknown>,
  processDefinition: ProcessDefinition
): Promise<StepExecutionResult> {
  console.log(`  Executing step: ${step.name} (${step.executor})`);

  switch (step.executor) {
    case "ai-agent":
      return claudeAdapter.execute(step, runInputs, processDefinition);

    case "script":
      return scriptAdapter.execute(step, runInputs, processDefinition);

    case "handoff":
      // Handoff creates a new process run for the target process
      return {
        outputs: {
          handoff: {
            targetProcess: step.handoff_to,
            targetStep: step.handoff_at_step,
            inputs: runInputs,
          },
        },
        logs: [`Handing off to process: ${step.handoff_to}`],
      };

    case "human":
      // Should not reach here — heartbeat catches human steps
      throw new Error("Human steps are handled by the heartbeat, not the executor");

    default:
      throw new Error(`Unknown executor type: ${step.executor}`);
  }
}
