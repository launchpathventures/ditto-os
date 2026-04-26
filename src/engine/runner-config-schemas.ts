/**
 * Per-kind runnerConfig validators (Brief 223 AC #13).
 *
 * The CRUD layer validates the runnerConfig shape against the kind-specific
 * schema BEFORE writing the row. Brief 215's adapters carry their own
 * `RunnerAdapter.configSchema` for dispatch-time validation; this is the
 * API-boundary gate.
 *
 * For `local-mac-mini` we re-use Brief 215's adapter schema (canonical
 * source) so the API and dispatch enforce the same shape.
 */
import { z } from "zod";
import { type RunnerKind } from "@ditto/core";
import { localMacMiniConfigSchema } from "../adapters/local-mac-mini.js";

const claudeCodeRoutineSchema = z.object({
  endpoint: z.string().url(),
  /**
   * Pointer to the credential vault entry (`runner.<projectSlug>.bearer`).
   * Plaintext bearer is never stored in `project_runners.config_json`.
   */
  credentialService: z.string().min(1).optional(),
});

const claudeManagedAgentSchema = z.object({
  agentId: z.string().min(1),
  credentialService: z.string().min(1).optional(),
});

const githubActionSchema = z.object({
  repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  workflowFile: z.string().min(1),
  credentialService: z.string().min(1).optional(),
});

const e2bSandboxSchema = z.object({
  template: z.string().min(1),
  credentialService: z.string().min(1).optional(),
});

const SCHEMAS: Record<RunnerKind, z.ZodTypeAny> = {
  "local-mac-mini": localMacMiniConfigSchema,
  "claude-code-routine": claudeCodeRoutineSchema,
  "claude-managed-agent": claudeManagedAgentSchema,
  "github-action": githubActionSchema,
  "e2b-sandbox": e2bSandboxSchema,
};

export type RunnerConfigValidationResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; error: z.ZodError };

/** Validate a runnerConfig payload against the kind-specific Zod schema. */
export function validateRunnerConfig(
  kind: RunnerKind,
  config: unknown,
): RunnerConfigValidationResult {
  const schema = SCHEMAS[kind];
  const parsed = schema.safeParse(config);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, config: parsed.data as Record<string, unknown> };
}
