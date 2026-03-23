/**
 * Ditto — Step Executor
 *
 * Routes step execution to the right adapter based on executor type.
 * This is the bridge between process definitions and agent runtimes.
 */

import type { ProcessDefinition, StepDefinition } from "./process-loader";
import { claudeAdapter } from "../adapters/claude";
import { cliAdapter } from "../adapters/cli";
import { scriptAdapter } from "../adapters/script";
import { resolveSystemAgent } from "./system-agents";
import { getIntegration } from "./integration-registry";
import { executeIntegration } from "./integration-handlers";

export interface StepExecutionResult {
  outputs: Record<string, unknown>;
  tokensUsed?: number;
  costCents?: number;
  confidence?: "high" | "medium" | "low";
  logs?: string[];
  model?: string; // Which model executed this step (for learning/routing)
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

    case "cli-agent":
      return cliAdapter.execute(step, runInputs, processDefinition);

    case "script": {
      // System agent dispatch: if step config has systemAgent, resolve handler
      const systemAgentName = step.config?.systemAgent as string | undefined;
      if (systemAgentName) {
        console.log(`  System agent: ${systemAgentName}`);
        const handler = resolveSystemAgent(systemAgentName);
        return handler(runInputs);
      }
      return scriptAdapter.execute(step, runInputs, processDefinition);
    }

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

    case "integration": {
      const service = step.config?.service as string | undefined;
      const command = step.config?.command as string | undefined;
      if (!service) {
        throw new Error(`Integration step "${step.id}" missing config.service`);
      }
      if (!command) {
        throw new Error(`Integration step "${step.id}" missing config.command`);
      }
      const integration = getIntegration(service);
      if (!integration) {
        throw new Error(`No integration registered for service: ${service}`);
      }
      const protocol = (step.config?.protocol as string | undefined) || undefined;
      return executeIntegration(
        { service, command, protocol: protocol as "cli" | "mcp" | "rest" | undefined },
        integration,
      );
    }

    case "human":
      // Should not reach here — heartbeat catches human steps
      throw new Error("Human steps are handled by the heartbeat, not the executor");

    default:
      throw new Error(`Unknown executor type: ${step.executor}`);
  }
}
