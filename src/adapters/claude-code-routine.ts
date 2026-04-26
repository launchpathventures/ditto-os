/**
 * Claude Code Routine Adapter — Brief 216.
 *
 * Implements the `RunnerAdapter` interface from `@ditto/core` for the
 * `claude-code-routine` runner kind. Composes a prompt with `/dev-review`
 * invocation + an in-prompt callback section, dispatches to Anthropic's
 * Claude Code Routines `/fire` endpoint, and returns the resulting session
 * id + url. Status updates flow back asynchronously via:
 *
 *   1. The in-prompt callback (the routine session POSTs to Ditto's status
 *      webhook on terminal state).
 *   2. GitHub `pull_request` / `workflow_run` / `deployment_status` events
 *      (the GitHub fallback handler — Brief 216 §D4 / `routine-fallback.ts`).
 *
 * Either signal is sufficient; whichever arrives first wins. The state
 * machine rejects illegal re-transitions (Brief 215 AC #5).
 */

import { z } from "zod";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type {
  CancelResult,
  DispatchExecuteContext,
  DispatchResult,
  DispatchStatusSnapshot,
  HealthCheckResult,
  ProjectRef,
  ProjectRunnerRef,
  RunnerAdapter,
  RunnerKind,
  RunnerMode,
  WorkItemRef,
} from "@ditto/core";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as appDb } from "../db";
import * as schema from "../db/schema";
import { runnerDispatches, projects } from "../db/schema";
import { getCredentialById } from "../engine/credential-vault";
import { composePrompt } from "./routine-prompt";

type AnyDb = BetterSQLite3Database<typeof schema>;

// ============================================================
// Config schema (project_runners.config_json)
// ============================================================

export const routineConfigSchema = z.object({
  /** Anthropic Routines fire endpoint — must be HTTPS to api.anthropic.com. */
  endpoint_url: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          const url = new URL(u);
          return (
            url.protocol === "https:" &&
            url.hostname === "api.anthropic.com" &&
            /\/v1\/claude_code\/routines\/[^/]+\/fire$/.test(url.pathname)
          );
        } catch {
          return false;
        }
      },
      {
        message:
          "endpoint_url must be https://api.anthropic.com/v1/claude_code/routines/<trigger_id>/fire",
      },
    ),
  /** Pointer into the credentials table (id of a stored project-credential). */
  bearer_credential_id: z.string().min(1),
  /** Default repo in `owner/repo` form. */
  default_repo: z.string().regex(/^[^/]+\/[^/]+$/, {
    message: "default_repo must be in 'owner/repo' form",
  }),
  /** Default branch the routine session opens PRs against. */
  default_branch: z.string().min(1),
  /** Optional override for the Anthropic beta header (Brief 216 §Constraints). */
  beta_header: z.string().optional(),
});

export type RoutineConfig = z.infer<typeof routineConfigSchema>;

// ============================================================
// Constants — Brief 216 defaults
// ============================================================

const DEFAULT_BETA_HEADER = "experimental-cc-routine-2026-04-01";
const BCRYPT_COST = 12;
const TEST_MODE = process.env.DITTO_TEST_MODE === "true";

const DEFAULT_DISPATCH_MAX_AGE_MS = 30 * 60 * 1000;

function getDispatchMaxAgeMs(): number {
  const v = process.env.ROUTINE_DISPATCH_MAX_AGE_MS;
  if (!v) return DEFAULT_DISPATCH_MAX_AGE_MS;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DISPATCH_MAX_AGE_MS;
}

// ============================================================
// Adapter factory
// ============================================================

export interface RoutineAdapterDeps {
  /** Override for tests — defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
  /**
   * Override for tests — resolves the status webhook URL the routine should
   * POST back to. In production the engine boot wires this to the deployed
   * Next.js URL; tests inject a stub.
   */
  statusWebhookUrlFor?: (workItemId: string) => string;
  /** Override for tests — the harness type lookup (catalyst | native | none). */
  harnessTypeFor?: (project: ProjectRef) => "catalyst" | "native" | "none";
  /** Override for tests — defaults to the app db singleton. */
  db?: AnyDb;
  /** Override for tests — defaults to credential-vault's getCredentialById. */
  resolveCredential?: (
    credentialId: string,
  ) => Promise<{ value: string; service: string } | null>;
}

export function createRoutineAdapter(deps: RoutineAdapterDeps = {}): RunnerAdapter {
  const kind: RunnerKind = "claude-code-routine";
  const mode: RunnerMode = "cloud";
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const dbImpl = deps.db ?? appDb;
  const resolveCredential = deps.resolveCredential ?? getCredentialById;

  const statusWebhookUrlFor = deps.statusWebhookUrlFor ?? defaultStatusWebhookUrlFor;
  const harnessTypeFor = deps.harnessTypeFor ?? defaultHarnessTypeFor;

  return {
    kind,
    mode,
    configSchema: routineConfigSchema,
    supportsCancel: false,

    async execute(
      ctx: DispatchExecuteContext,
      workItem: WorkItemRef,
      project: ProjectRef,
      projectRunner: ProjectRunnerRef,
    ): Promise<DispatchResult> {
      // Insight-180 guard — pre-DB-write rejection.
      if (!ctx.stepRunId && !TEST_MODE) {
        throw new Error(
          "claude-code-routine.execute() requires stepRunId (Insight-180 guard).",
        );
      }

      const cfgParse = routineConfigSchema.safeParse(projectRunner.configJson);
      if (!cfgParse.success) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: new Date(),
          finalStatus: "failed",
          errorReason: `Invalid config_json for claude-code-routine: ${cfgParse.error.message}`,
        };
      }
      const config = cfgParse.data;

      // Resolve the Anthropic bearer from the credential vault.
      const credential = await resolveCredential(config.bearer_credential_id);
      if (!credential) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: new Date(),
          finalStatus: "failed",
          errorReason: `Bearer credential not found: ${config.bearer_credential_id}`,
        };
      }

      // Generate per-dispatch ephemeral callback token (Brief 216 §D3).
      const ephemeralToken = randomBytes(32).toString("base64url");
      const ephemeralHash = await bcrypt.hash(ephemeralToken, BCRYPT_COST);

      // Compose the prompt with /dev-review + callback section.
      const harnessType = harnessTypeFor(project);
      const promptResult = composePrompt({
        workItemBody: workItem.content,
        harnessType,
        statusWebhookUrl: statusWebhookUrlFor(workItem.id),
        ephemeralToken,
        stepRunId: ctx.stepRunId,
      });
      if (!promptResult.ok) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: new Date(),
          finalStatus: "failed",
          errorReason: `Prompt composition failed: ${promptResult.error}`,
        };
      }

      // Persist the bcrypt hash on the dispatch row BEFORE wire send so a
      // late callback that arrives before this DB update can still match.
      await dbImpl
        .update(runnerDispatches)
        .set({ callbackTokenHash: ephemeralHash })
        .where(eq(runnerDispatches.id, ctx.dispatchId));

      // Fire the routine.
      const startedAt = new Date();
      try {
        const res = await fetchImpl(config.endpoint_url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential.value}`,
            "anthropic-beta": config.beta_header ?? DEFAULT_BETA_HEADER,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: promptResult.prompt }),
        });

        if (!res.ok) {
          const body = await safeBody(res);
          const errorReason = `Routine /fire failed (${res.status}): ${truncate(body, 500)}`;
          // Map upstream errors to the dispatcher's failure-mode taxonomy.
          let finalStatus: DispatchResult["finalStatus"] = "failed";
          if (res.status === 429) finalStatus = "rate_limited";
          if (res.status === 408 || res.status === 504) finalStatus = "timed_out";
          return {
            externalRunId: null,
            externalUrl: null,
            startedAt,
            finalStatus,
            errorReason,
          };
        }

        const json = (await res.json()) as Record<string, unknown>;
        const sessionId = pickStringField(json, "claude_code_session_id");
        const sessionUrl = pickStringField(json, "claude_code_session_url");

        if (!sessionId) {
          return {
            externalRunId: null,
            externalUrl: null,
            startedAt,
            finalStatus: "failed",
            errorReason:
              "Routine /fire response missing claude_code_session_id — Anthropic contract drift?",
          };
        }

        return {
          externalRunId: sessionId,
          externalUrl: sessionUrl ?? null,
          startedAt,
          // Async-pending: terminal state arrives via webhook callback or
          // GitHub fallback. Don't set finalStatus.
        };
      } catch (e) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt,
          finalStatus: "failed",
          errorReason: `Routine /fire transport error: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },

    async status(_dispatchId: string, externalRunId: string): Promise<DispatchStatusSnapshot> {
      // Status is push-via-webhook for routines — there's no cheap GET on the
      // session URL at preview. Return the persisted row's status; the caller
      // already has it from the DB, but the interface requires a snapshot.
      const rows = await dbImpl
        .select()
        .from(runnerDispatches)
        .where(eq(runnerDispatches.id, _dispatchId))
        .limit(1);
      if (rows.length === 0) {
        return {
          status: "queued",
          externalRunId,
          externalUrl: null,
          lastUpdatedAt: new Date(),
        };
      }
      const r = rows[0];
      return {
        status: r.status,
        externalRunId: r.externalRunId,
        externalUrl: r.externalUrl,
        lastUpdatedAt: r.finishedAt ?? r.startedAt ?? r.createdAt,
      };
    },

    async cancel(_dispatchId: string, _externalRunId: string): Promise<CancelResult> {
      // Anthropic does not document a cancel endpoint at preview. Best-effort:
      // local state is updated to cancelled by the dispatcher; the user is
      // told to terminate manually via the session URL.
      return {
        ok: false,
        reason:
          "Routine cancellation is not supported by Anthropic's preview API. Open the session URL to terminate manually.",
      };
    },

    async healthCheck(projectRunner: ProjectRunnerRef): Promise<HealthCheckResult> {
      const cfgParse = routineConfigSchema.safeParse(projectRunner.configJson);
      if (!cfgParse.success) {
        return {
          status: "unauthenticated",
          reason: `config invalid: ${cfgParse.error.message}`,
        };
      }
      const config = cfgParse.data;
      const credential = await resolveCredential(config.bearer_credential_id);
      if (!credential) {
        return {
          status: "unauthenticated",
          reason: "bearer credential not found in vault",
        };
      }
      // Brief 216 §D6 — config-validity only; no live API call.
      return { status: "healthy" };
    },
  };
}

/**
 * Brief 216 §D4 — webhook subscription declaration. The boot path collects
 * these from each registered adapter and registers them with the GitHub
 * integration handler. The actual matching happens at event-receive time.
 */
export const ROUTINE_GITHUB_WEBHOOK_SUBSCRIPTIONS = {
  events: ["pull_request", "workflow_run", "deployment_status"] as const,
};

// ============================================================
// Default helpers
// ============================================================

function defaultStatusWebhookUrlFor(workItemId: string): string {
  const base =
    process.env.DITTO_STATUS_WEBHOOK_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/v1/work-items/${workItemId}/status`;
}

function defaultHarnessTypeFor(project: ProjectRef): "catalyst" | "native" | "none" {
  // The ProjectRef interface doesn't yet surface harnessType; query DB.
  // (Builder note: a future ProjectRef extension could carry harnessType so
  // the adapter avoids a DB roundtrip per dispatch — flagged for Architect.)
  return looksUpHarnessTypeSync(project.id) ?? "native";
}

let cachedHarnessTypes: Map<string, "catalyst" | "native" | "none"> | null = null;
function looksUpHarnessTypeSync(projectId: string): "catalyst" | "native" | "none" | null {
  if (cachedHarnessTypes && cachedHarnessTypes.has(projectId)) {
    return cachedHarnessTypes.get(projectId)!;
  }
  return null;
}

/**
 * Allow boot/test code to seed the harness-type cache so the adapter doesn't
 * have to await a DB read on every dispatch. The runners admin or dispatcher
 * primes this when a project is loaded.
 */
export function primeHarnessTypeCache(
  entries: Iterable<[string, "catalyst" | "native" | "none"]>,
): void {
  cachedHarnessTypes = new Map(entries);
}

async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}

function pickStringField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

// Re-exports so the dispatch path can read the configured max-age sweep.
export { getDispatchMaxAgeMs };

// Surface project lookup for the default harness-type resolver — wires DB-side
// loading at boot via a tiny eager prime.
export async function primeHarnessTypeCacheFromDb(): Promise<void> {
  const rows = await appDb
    .select({ id: projects.id, harnessType: projects.harnessType })
    .from(projects);
  primeHarnessTypeCache(
    rows.map((r) => [r.id, (r.harnessType ?? "native") as "catalyst" | "native" | "none"]),
  );
}
