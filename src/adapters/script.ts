/**
 * Agent OS — Script Adapter
 *
 * Executes deterministic script/command steps.
 * For things that don't need AI: running tests, type-checking,
 * git operations, data transforms.
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { ProcessDefinition, StepDefinition } from "../engine/process-loader";
import type { StepExecutionResult } from "../engine/step-executor";

const execAsync = promisify(exec);

export const scriptAdapter = {
  /**
   * Execute a script step — runs commands sequentially.
   */
  async execute(
    step: StepDefinition,
    runInputs: Record<string, unknown>,
    _processDefinition: ProcessDefinition
  ): Promise<StepExecutionResult> {
    const commands = step.commands || [];

    if (commands.length === 0) {
      return {
        outputs: { result: "No commands to execute" },
        logs: ["No commands defined for this step"],
      };
    }

    const logs: string[] = [];
    let allStdout = "";
    let allStderr = "";

    // Get working directory from inputs if available
    const cwd =
      (runInputs.codebase as string) ||
      (runInputs.workingDirectory as string) ||
      process.cwd();

    for (const command of commands) {
      console.log(`    Script: ${command}`);
      logs.push(`$ ${command}`);

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout: 120_000, // 2 minute timeout per command
          maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
        });

        if (stdout) {
          allStdout += stdout + "\n";
          logs.push(stdout.trim());
        }
        if (stderr) {
          allStderr += stderr + "\n";
          logs.push(`STDERR: ${stderr.trim()}`);
        }
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string; code?: number };
        logs.push(`FAILED (exit ${execError.code})`);
        if (execError.stdout) logs.push(execError.stdout.trim());
        if (execError.stderr) logs.push(`STDERR: ${execError.stderr.trim()}`);

        // Check if step has on_failure handling
        if (step.on_failure) {
          return {
            outputs: {
              "test-results": {
                passed: false,
                stdout: execError.stdout || "",
                stderr: execError.stderr || "",
                exitCode: execError.code,
                failedCommand: command,
                onFailure: step.on_failure,
              },
            },
            logs,
          };
        }

        throw new Error(
          `Command failed: ${command}\n${execError.stderr || execError.stdout || "Unknown error"}`
        );
      }
    }

    // Determine output name
    const outputName = step.outputs?.[0] || "result";

    return {
      outputs: {
        [outputName]: {
          passed: true,
          stdout: allStdout.trim(),
          stderr: allStderr.trim(),
        },
      },
      logs,
    };
  },
};
