/**
 * Runner Status Webhook — discriminated-union Zod schema.
 *
 * Brief 215 §"What Changes" / file `webhook-schema.ts`. The discriminator
 * structure ships now keyed on `runner_kind`. Each kind's payload-shape
 * placeholder is `z.unknown()` here — sub-briefs 216-218 tighten when their
 * adapters land.
 *
 * Brief 216 fills the `claude-code-routine` placeholder per §D9. Brief 217
 * fills the `claude-managed-agent` placeholder per §D10 with the same inline
 * shape (the optional in-prompt callback path mirrors Brief 216's contract).
 *
 * The shape is the runner-state callback the in-session prompt directive
 * posts back to Ditto; it is intentionally narrower than the work-item brief-
 * state schema in `@ditto/core/work-items`. The state-mapping table below
 * documents how a webhook `state` value collapses onto `runner_dispatches.status`.
 *
 * | Webhook `state` | Webhook `error` field      | `runner_dispatches.status` |
 * |-----------------|----------------------------|----------------------------|
 * | `running`       | n/a                        | `running`                  |
 * | `succeeded`     | n/a                        | `succeeded`                |
 * | `cancelled`     | n/a                        | `cancelled`                |
 * | `failed`        | (absent or generic)        | `failed`                   |
 * | `failed`        | matches `/rate.?limit/i`   | `rate_limited`             |
 * | `failed`        | matches `/timeout|timed.?out/i` | `timed_out`           |
 *
 * `revoked`, `queued`, and `dispatched` are dispatcher-internal states; the
 * webhook never asserts them.
 */

import { z } from "zod";
import { runnerKindValues } from "./kinds.js";

// ============================================================
// Per-kind payload schemas
// ============================================================

/**
 * Brief 212 bridge-job-result shape — the local-mac-mini payload. Matches
 * `BridgeResultFrame` in `packages/core/src/bridge/types.ts`. The status
 * webhook receives the daemon's terminal frame after the bridge-server has
 * reconciled it locally; the shape is stable per Brief 212.
 */
export const localMacMiniStatusPayload = z.object({
  jobId: z.string(),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  stdoutBytes: z.number().int().nonnegative(),
  stderrBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  terminationSignal: z.enum(["SIGTERM", "SIGKILL"]).optional(),
  errorMessage: z.string().optional(),
  /** Optional staleness flag if the cloud-side sweeper marked this orphaned. */
  orphaned: z.boolean().optional(),
});

/**
 * Brief 216 §D9 / Brief 217 §D10 — the in-prompt callback payload. Both
 * cloud runner kinds (claude-code-routine, claude-managed-agent) post the
 * same shape on terminal state; the discriminator branch differs only in
 * the `runner_kind` literal.
 */
export const cloudRunnerCallbackStateValues = [
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type CloudRunnerCallbackState =
  (typeof cloudRunnerCallbackStateValues)[number];

/** Backwards-compatible alias — Brief 216's name. */
export const routineCallbackStateValues = cloudRunnerCallbackStateValues;
export type RoutineCallbackState = CloudRunnerCallbackState;

export const claudeCodeRoutineStatusPayload = z.object({
  state: z.enum(cloudRunnerCallbackStateValues),
  prUrl: z.string().url().optional(),
  error: z.string().max(2_000).optional(),
  stepRunId: z.string().min(1),
  externalRunId: z.string().min(1),
});

export const claudeManagedAgentStatusPayload = z.object({
  state: z.enum(cloudRunnerCallbackStateValues),
  prUrl: z.string().url().optional(),
  error: z.string().max(2_000).optional(),
  stepRunId: z.string().min(1),
  externalRunId: z.string().min(1),
});

/**
 * Brief 218 §D9 — github-action callback payload. Same base shape as the
 * other two cloud kinds (`cloudRunnerStateToDispatchStatus` handles all three
 * via one helper) plus two GitHub-Actions-specific optional fields surfaced
 * for the inline card UX:
 *  - `workflowRunUrl` — `https://github.com/<owner>/<repo>/actions/runs/<id>`
 *  - `conclusion` — GitHub's `workflow_run.conclusion` value, preserved into
 *    `harness_decisions.reviewDetails.runner.conclusion` for status-badge UX.
 *    `stale` (Reviewer IMP-1) means the run was superseded by a newer dispatch
 *    on the same branch — semantically a cancellation, not a failure.
 */
export const workflowRunConclusionValues = [
  "success",
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "neutral",
  "skipped",
  "stale",
] as const;
export type WorkflowRunConclusion =
  (typeof workflowRunConclusionValues)[number];

export const githubActionStatusPayload = z.object({
  state: z.enum(cloudRunnerCallbackStateValues),
  prUrl: z.string().url().optional(),
  error: z.string().max(2_000).optional(),
  stepRunId: z.string().min(1),
  externalRunId: z.string().min(1),
  workflowRunUrl: z.string().url().optional(),
  conclusion: z.enum(workflowRunConclusionValues).optional(),
});

/** Remaining cloud-kind placeholders — future briefs tighten. */
const placeholderPayload = z.unknown();

// ============================================================
// Discriminated union — keyed on `runner_kind`
// ============================================================

export const runnerWebhookSchema = z.discriminatedUnion("runner_kind", [
  z.object({
    runner_kind: z.literal("local-mac-mini"),
    dispatch_id: z.string(),
    payload: localMacMiniStatusPayload,
  }),
  z.object({
    runner_kind: z.literal("claude-code-routine"),
    state: z.enum(cloudRunnerCallbackStateValues),
    prUrl: z.string().url().optional(),
    error: z.string().max(2_000).optional(),
    stepRunId: z.string().min(1),
    externalRunId: z.string().min(1),
  }),
  z.object({
    runner_kind: z.literal("claude-managed-agent"),
    state: z.enum(cloudRunnerCallbackStateValues),
    prUrl: z.string().url().optional(),
    error: z.string().max(2_000).optional(),
    stepRunId: z.string().min(1),
    externalRunId: z.string().min(1),
  }),
  z.object({
    runner_kind: z.literal("github-action"),
    state: z.enum(cloudRunnerCallbackStateValues),
    prUrl: z.string().url().optional(),
    error: z.string().max(2_000).optional(),
    stepRunId: z.string().min(1),
    externalRunId: z.string().min(1),
    workflowRunUrl: z.string().url().optional(),
    conclusion: z.enum(workflowRunConclusionValues).optional(),
  }),
  z.object({
    runner_kind: z.literal("e2b-sandbox"),
    dispatch_id: z.string(),
    payload: placeholderPayload,
  }),
]);

export type RunnerWebhookPayload = z.infer<typeof runnerWebhookSchema>;
export type ClaudeCodeRoutineStatusPayload = z.infer<
  typeof claudeCodeRoutineStatusPayload
>;
export type ClaudeManagedAgentStatusPayload = z.infer<
  typeof claudeManagedAgentStatusPayload
>;
export type GithubActionStatusPayload = z.infer<typeof githubActionStatusPayload>;

/**
 * Brief 216 §D9 / Brief 217 §D10 — map a cloud-runner callback state +
 * optional error to the runner_dispatches.status enum value. Pure;
 * cross-runner-reusable (the mapping is identical for claude-code-routine
 * and claude-managed-agent).
 */
export function cloudRunnerStateToDispatchStatus(
  state: CloudRunnerCallbackState,
  error?: string,
):
  | "running"
  | "succeeded"
  | "cancelled"
  | "failed"
  | "rate_limited"
  | "timed_out" {
  if (state === "running") return "running";
  if (state === "succeeded") return "succeeded";
  if (state === "cancelled") return "cancelled";
  if (state === "failed") {
    if (error && /rate.?limit/i.test(error)) return "rate_limited";
    if (error && /(timeout|timed.?out)/i.test(error)) return "timed_out";
    return "failed";
  }
  return "failed";
}

/**
 * Backwards-compatible alias — Brief 216's name. Kept as a re-export so
 * existing imports continue to compile after Brief 217's kind-agnostic
 * rename per §D14.
 */
export const routineStateToDispatchStatus = cloudRunnerStateToDispatchStatus;

// ============================================================
// Type guards / helpers
// ============================================================

export function isKnownRunnerKind(kind: string): boolean {
  return (runnerKindValues as readonly string[]).includes(kind);
}
