/**
 * Ditto — Bridge CLI Adapter (Brief 212).
 *
 * Sibling to `src/adapters/cli.ts`. Same `cliAdapter`-shaped interface
 * (`execute`) but instead of spawning the CLI binary locally with
 * `execFileAsync(...)`, calls `dispatchBridgeJob(...)` with `kind='exec'`
 * — the subprocess runs on a paired user device.
 *
 * Difference from cli.ts (the `--bare` invariant per Brief 212 Constraints
 * line 102): when the CLI binary is `claude`, the cloud-side composer
 * adds `--bare` automatically so behaviour is reproducible regardless of
 * what's in the user's `~/.claude` (skips auto-discovery of hooks,
 * skills, plugins, MCP servers, auto-memory, CLAUDE.md).
 *
 * The local `cli.ts` does NOT pass `--bare` and is OUT OF SCOPE for this
 * brief — fixing that is a separate one-line follow-on.
 */

import { dispatchBridgeJob, type BridgeDispatchOutcome } from "../engine/harness-handlers/bridge-dispatch";
import { sendBridgeFrame, isDeviceConnected } from "../engine/bridge-server";
import type { ProcessDefinition, StepDefinition } from "../engine/process-loader";
import type { StepExecutionResult } from "../engine/step-executor";
import { getConfiguredModel } from "../engine/llm";

const DEFAULT_CLI = "claude";

function getDefaultModel(): string {
  return getConfiguredModel();
}

function parseConfidence(text: string): "high" | "medium" | "low" | null {
  const m = text.match(/^CONFIDENCE:\s*(high|medium|low)/im);
  return (m?.[1] as "high" | "medium" | "low" | undefined) ?? null;
}

/**
 * Compose the args array for a Claude Code dispatch. Auto-injects `--bare`
 * (Brief 212 Constraints line 102). Other CLI binaries pass through with
 * the args the step provided.
 */
export function composeBridgeArgs(cli: string, baseArgs: string[]): string[] {
  if (cli === "claude" || cli === DEFAULT_CLI) {
    if (baseArgs.includes("--bare")) return baseArgs;
    return ["--bare", ...baseArgs];
  }
  return baseArgs;
}

export interface BridgeCliAdapterDeps {
  /** Trust tier captured at call time. Defaults to supervised — the dispatcher's
   *  upstream-trust contract still applies (the harness pipeline trust-gate
   *  produced this earlier in the run). */
  trustTier?: "supervised" | "spot_checked" | "autonomous" | "critical";
  trustAction?: "pause" | "advance" | "sample_pause" | "sample_advance";
  /** Process run id for harness_decisions FK. */
  processRunId: string;
  stepRunId: string;
  /** The device to dispatch to. If omitted, the dispatcher's auto-select
   *  routes to the workspace's only active device or returns an explicit-
   *  deviceId-required error. */
  deviceId?: string;
  fallbackDeviceIds?: string[];
}

/**
 * Build the prompt text the dispatched subprocess will receive on stdin
 * is N/A (bridge `exec` uses /dev/null stdin) — Claude Code's `-p`
 * positional argument carries the prompt instead.
 */
function buildPrompt(step: StepDefinition, runInputs: Record<string, unknown>, _proc: ProcessDefinition, memories: string): string {
  const parts: string[] = [];
  if (memories) parts.push(memories);
  if (step.config?.prompt) parts.push(String(step.config.prompt));
  parts.push(`## Inputs\n\n\`\`\`json\n${JSON.stringify(runInputs, null, 2)}\n\`\`\``);
  parts.push(
    `## Output Format\n\nAt the end of your response, include on its own line:\n` +
      `CONFIDENCE: high|medium|low\nREASON: <brief explanation>`,
  );
  return parts.join("\n\n---\n\n");
}

export const bridgeCliAdapter = {
  /**
   * Execute an AI agent step over the bridge. The deps carry the trust
   * tier + processRunId + stepRunId that the harness pipeline established
   * earlier in this run.
   */
  async execute(
    step: StepDefinition,
    runInputs: Record<string, unknown>,
    processDefinition: ProcessDefinition,
    memories: string | undefined,
    deps: BridgeCliAdapterDeps,
  ): Promise<StepExecutionResult> {
    const cli = (step.config?.cli as string) || DEFAULT_CLI;
    const model = (step.config?.model as string) || getDefaultModel();
    const startTime = Date.now();

    const baseArgs: string[] = [
      "-p",
      "--model",
      model,
      "--dangerously-skip-permissions",
      "--no-session-persistence",
    ];
    const prompt = buildPrompt(step, runInputs, processDefinition, memories ?? "");
    baseArgs.push(prompt);

    // Brief 212 — auto-inject --bare for Claude Code dispatches.
    const args = composeBridgeArgs(cli, baseArgs);

    console.log(`    Bridge CLI adapter: dispatching ${cli} ${args.length > 4 ? "(--bare auto-added)" : ""}`);

    const outcome: BridgeDispatchOutcome = await dispatchBridgeJob(
      {
        stepRunId: deps.stepRunId,
        processRunId: deps.processRunId,
        trustTier: deps.trustTier ?? "supervised",
        trustAction: deps.trustAction ?? "pause",
        deviceId: deps.deviceId,
        fallbackDeviceIds: deps.fallbackDeviceIds,
        payload: {
          kind: "exec",
          command: cli,
          args,
          // cwd defaults to daemon $HOME; per-step override is allowed via
          // step.config.cwd if set.
          cwd: typeof step.config?.cwd === "string" ? (step.config.cwd as string) : undefined,
          timeoutMs: typeof step.config?.timeoutMs === "number" ? (step.config.timeoutMs as number) : undefined,
        },
      },
      {
        sendOverWire: (jobId, deviceId, payload) => sendBridgeFrame(jobId, deviceId, payload),
        isDeviceOnline: (deviceId) => isDeviceConnected(deviceId),
      },
    );

    if (!outcome.ok) {
      throw new Error(`Bridge dispatch failed: ${outcome.reason} — ${outcome.message}`);
    }

    // The dispatcher persists the bridge_jobs row + the wire send (when
    // online). Result frames flow back via bridge-server's frame handlers,
    // which update bridge_jobs.state. Live result-awaiting is a follow-on
    // (the adapter currently returns a "queued/dispatched" stub; the
    // caller polls bridge_jobs / harness_decisions for completion).
    //
    // For now: surface what we know synchronously. The step's success is
    // determined when the result frame later transitions state to
    // succeeded; this method's return represents the dispatch decision,
    // not the final outcome. Confidence is `null` because no output yet.
    const outputName = step.outputs?.[0] || "result";
    const stub = JSON.stringify({
      bridgeJobId: outcome.jobId,
      routedDeviceId: outcome.routedDeviceId,
      routedAs: outcome.routedAs,
      wireSent: outcome.wireSent,
      _note:
        "Bridge dispatch is async — final stdout/exitCode arrive via bridge-server frame handlers; query bridge_jobs by stepRunId for completion.",
    });

    return {
      outputs: { [outputName]: stub },
      confidence: parseConfidence("") ?? undefined,
      logs: [
        `Bridge CLI: ${cli}`,
        `Model: ${model}`,
        `Routed device: ${outcome.routedDeviceId} (${outcome.routedAs})`,
        `Job id: ${outcome.jobId}`,
        `Wire sent: ${outcome.wireSent}`,
        `Duration (dispatch only): ${Date.now() - startTime}ms`,
      ],
      costCents: 0,
    };
  },
};
