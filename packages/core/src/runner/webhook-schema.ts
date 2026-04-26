/**
 * Runner Status Webhook — discriminated-union Zod schema.
 *
 * Brief 215 §"What Changes" / file `webhook-schema.ts`. The discriminator
 * structure ships now keyed on `runner_kind`. Each kind's payload-shape
 * placeholder is `z.unknown()` here — sub-briefs 216-218 tighten when their
 * adapters land.
 *
 * The endpoint at `POST /api/v1/work-items/:id/status` (Brief 223 owns the
 * route) parses inbound bodies through this schema, then dispatches by
 * `runner_kind` to the kind-specific persistence path.
 */

import { z } from "zod";
import { runnerKindValues } from "./kinds.js";

// ============================================================
// Per-kind payload schemas (placeholders for cloud kinds)
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

/** Cloud-kind placeholders — sub-briefs 216-218 tighten. */
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
    dispatch_id: z.string(),
    payload: placeholderPayload,
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

// ============================================================
// Type guards / helpers
// ============================================================

export function isKnownRunnerKind(kind: string): boolean {
  return (runnerKindValues as readonly string[]).includes(kind);
}
