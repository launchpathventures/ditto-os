/**
 * Runner Status Webhook — discriminated-union Zod schema.
 *
 * Brief 215 §"What Changes" / file `webhook-schema.ts`. The discriminator
 * structure ships now keyed on `runner_kind`. Each kind's payload-shape
 * placeholder is `z.unknown()` here — sub-briefs 216-218 tighten when their
 * adapters land.
 *
 * Brief 216 fills the `claude-code-routine` placeholder per §D9. The shape is
 * the runner-state callback the in-prompt directive in the Routine session
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
 * Brief 216 §D9 — the in-prompt callback payload. The routine session POSTs
 * this body back to `POST /api/v1/work-items/:id/status` on terminal state.
 */
export const routineCallbackStateValues = [
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type RoutineCallbackState = (typeof routineCallbackStateValues)[number];

export const claudeCodeRoutineStatusPayload = z.object({
  state: z.enum(routineCallbackStateValues),
  prUrl: z.string().url().optional(),
  error: z.string().max(2_000).optional(),
  stepRunId: z.string().min(1),
  externalRunId: z.string().min(1),
});

/** Remaining cloud-kind placeholders — sub-briefs 217-218 tighten. */
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
    state: z.enum(routineCallbackStateValues),
    prUrl: z.string().url().optional(),
    error: z.string().max(2_000).optional(),
    stepRunId: z.string().min(1),
    externalRunId: z.string().min(1),
  }),
  z.object({
    runner_kind: z.literal("claude-managed-agent"),
    dispatch_id: z.string(),
    payload: placeholderPayload,
  }),
  z.object({
    runner_kind: z.literal("github-action"),
    dispatch_id: z.string(),
    payload: placeholderPayload,
  }),
  z.object({
    runner_kind: z.literal("e2b-sandbox"),
    dispatch_id: z.string(),
    payload: placeholderPayload,
  }),
]);

export type RunnerWebhookPayload = z.infer<typeof runnerWebhookSchema>;
export type ClaudeCodeRoutineStatusPayload = z.infer<typeof claudeCodeRoutineStatusPayload>;

/**
 * Brief 216 §D9 — map a routine callback state + optional error to the
 * runner_dispatches.status enum value. Pure, cross-runner-reusable.
 */
export function routineStateToDispatchStatus(
  state: RoutineCallbackState,
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

// ============================================================
// Type guards / helpers
// ============================================================

export function isKnownRunnerKind(kind: string): boolean {
  return (runnerKindValues as readonly string[]).includes(kind);
}
