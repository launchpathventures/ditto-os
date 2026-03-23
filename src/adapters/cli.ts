/**
 * Ditto — CLI Adapter
 *
 * Executes AI agent steps by spawning CLI tools (claude, codex) as subprocesses.
 * Same interface as the Claude API adapter. Uses the user's CLI subscription
 * instead of API tokens — costCents is always 0.
 *
 * Provenance:
 * - Subprocess execution: ralph (snarktank/ralph) autonomous loop with fresh context
 * - Adapter abstraction: Paperclip (paperclipai/paperclip) adapter pattern
 * - Confidence parsing: ADR-011 categorical (high/medium/low)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import type { ProcessDefinition, StepDefinition } from "../engine/process-loader";
import type { StepExecutionResult } from "../engine/step-executor";
import { getConfiguredModel } from "../engine/llm";

const execFileAsync = promisify(execFile);

/** Default CLI binary */
const DEFAULT_CLI = "claude";

/** Default model — resolved lazily from deployment config (Brief 032: no hardcoded default) */
function getDefaultModel(): string {
  return getConfiguredModel();
}

/**
 * Load a role contract from .claude/commands/ as system prompt source.
 * Falls back to a generic prompt if the file doesn't exist.
 */
function loadRoleContract(agentRole: string): string | null {
  const commandsDir = path.join(process.cwd(), ".claude", "commands");
  const filePath = path.join(commandsDir, `dev-${agentRole}.md`);

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }

  return null;
}

/**
 * Parse confidence level from CLI output tail.
 * Looks for: CONFIDENCE: high|medium|low
 */
function parseConfidence(output: string): "high" | "medium" | "low" | undefined {
  // Search from the end of output (last 500 chars) for efficiency
  const tail = output.slice(-500);
  const match = tail.match(/CONFIDENCE:\s*(high|medium|low)/i);
  if (match) {
    return match[1].toLowerCase() as "high" | "medium" | "low";
  }
  return undefined;
}

/**
 * Build the prompt for a CLI agent step.
 * Includes task context, role instructions, memory, and confidence instruction.
 */
function buildPrompt(
  step: StepDefinition,
  runInputs: Record<string, unknown>,
  processDefinition: ProcessDefinition,
  memories: string,
): string {
  const parts: string[] = [];

  // Task context
  parts.push(`# Task\n\nYou are executing the "${step.name}" step of the "${processDefinition.name}" process.`);

  if (step.description) {
    parts.push(`## Description\n\n${step.description}`);
  }

  // Inputs
  if (step.inputs) {
    for (const inputName of step.inputs) {
      const value = runInputs[inputName];
      if (value) {
        parts.push(`## ${inputName}\n\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
      }
    }
  }

  // Verification criteria
  if (step.verification) {
    parts.push(`## Verification Criteria\n\n${step.verification.map((v) => `- ${v}`).join("\n")}`);
  }

  // Injected memories
  if (memories) {
    parts.push(`## Context (from memory)\n\n${memories}`);
  }

  // Confidence instruction (ADR-011)
  parts.push(`## Output Format

At the end of your response, include on its own line:
CONFIDENCE: high|medium|low
REASON: <brief explanation of your confidence level>

Use "high" when you are confident the output meets all criteria.
Use "medium" when the output is reasonable but you have some uncertainty.
Use "low" when you are unsure about correctness or completeness.`);

  return parts.join("\n\n---\n\n");
}

export const cliAdapter = {
  /**
   * Execute an AI agent step by spawning a CLI tool as a subprocess.
   *
   * AC1: Spawns claude -p with --model opus, --dangerously-skip-permissions, --no-session-persistence
   * AC2: Loads role contract from .claude/commands/{agent_role}.md as --append-system-prompt
   * AC3: Parses CONFIDENCE: high|medium|low from output
   * AC5: Returns costCents: 0 (subscription-based, no API cost)
   */
  async execute(
    step: StepDefinition,
    runInputs: Record<string, unknown>,
    processDefinition: ProcessDefinition,
    memories?: string,
  ): Promise<StepExecutionResult> {
    const cli = (step.config?.cli as string) || DEFAULT_CLI;
    const model = (step.config?.model as string) || getDefaultModel();
    const agentRole = step.agent_role || "general";

    console.log(`    CLI adapter: ${agentRole} agent via ${cli}`);
    console.log(`    Model: ${model}`);

    // Build arguments
    const args: string[] = [
      "-p", // Print mode (non-interactive)
      "--model", model,
      "--dangerously-skip-permissions",
      "--no-session-persistence",
    ];

    // AC2: Load role contract as system prompt
    const roleContract = loadRoleContract(agentRole);
    if (roleContract) {
      args.push("--append-system-prompt", roleContract);
      console.log(`    Role contract: .claude/commands/dev-${agentRole}.md`);
    }

    // Build the prompt
    const prompt = buildPrompt(step, runInputs, processDefinition, memories || "");

    // Add the prompt as the positional argument
    args.push(prompt);

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    try {
      const result = await execFileAsync(cli, args, {
        cwd: process.cwd(),
        timeout: 600_000, // 10 minute timeout
        maxBuffer: 50 * 1024 * 1024, // 50MB output buffer
        env: { ...process.env },
      });

      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };

      if (execError.killed) {
        throw new Error(`CLI adapter timed out after 10 minutes for step "${step.name}"`);
      }

      // Non-zero exit but may still have useful output
      stdout = execError.stdout || "";
      stderr = execError.stderr || "";

      if (!stdout) {
        throw new Error(
          `CLI adapter failed for step "${step.name}": ${execError.stderr || "Unknown error"}`
        );
      }
    }

    const duration = Date.now() - startTime;

    // AC3: Parse confidence from output
    const confidence = parseConfidence(stdout);

    // Determine output name from step definition
    const outputName = step.outputs?.[0] || "result";

    const logs: string[] = [
      `CLI: ${cli}`,
      `Model: ${model}`,
      `Role: ${agentRole}`,
      `Duration: ${Math.round(duration / 1000)}s`,
      `Output length: ${stdout.length} chars`,
      `Confidence: ${confidence || "not specified"}`,
    ];

    if (stderr) {
      logs.push(`Stderr: ${stderr.slice(0, 200)}`);
    }

    return {
      outputs: {
        [outputName]: stdout,
      },
      tokensUsed: undefined, // CLI doesn't report token usage
      costCents: 0, // AC5: Subscription-based, no API cost
      confidence,
      model, // Record which model was used (Brief 033)
      logs,
    };
  },

  /**
   * Check status of a running CLI agent.
   */
  async status(): Promise<"idle" | "running" | "complete"> {
    return "idle";
  },

  /**
   * Cancel a running CLI agent.
   */
  async cancel(): Promise<void> {
    // Subprocess management would need PID tracking — not implemented yet
  },
};
