/**
 * Claude Managed Agent Adapter — Brief 217.
 *
 * Implements the `RunnerAdapter` interface from `@ditto/core` for the
 * `claude-managed-agent` runner kind. Composes a prompt with `/dev-review`
 * invocation (and an optional in-prompt callback section), creates an
 * Anthropic Managed Agents session via raw `fetch` (the @anthropic-ai/sdk
 * bundled in this stack does not yet expose a `beta.managedAgents.sessions.*`
 * surface — the brief assumed an SDK shape that is not present in the installed
 * package; flagged in the handoff notes for the Architect), sends a single
 * `user.message` event to kick off work, and returns the resulting session id +
 * deep-link.
 *
 * Status path is polling-primary (Brief 217 §D2). The polling cron at
 * `src/engine/runner-poll-cron.ts` walks non-terminal `claude-managed-agent`
 * dispatches every 30 seconds (per `pollCadenceMs` in `@ditto/core`) and calls
 * `status()` to reconcile the heuristic table. Lifecycle is also observed via
 * the kind-agnostic GitHub-fallback handler at
 * `src/engine/github-events/cloud-runner-fallback.ts` (PR opened / merged /
 * deployment_status preview).
 *
 * In-prompt callback is OPTIONAL (callback_mode='in-prompt'). Default is
 * polling-only; no ephemeral token generated, no INTERNAL section in the
 * prompt, `runner_dispatches.callback_token_hash` stays NULL.
 *
 * AC #11 deferral note (Brief 217 §D13): the `observe_events` config flag
 * is accepted by the schema and persisted, but the SSE event-stream
 * subscription itself is NOT yet implemented at adapter runtime. The
 * polling-primary path (status() + GitHub fallback) is the correctness
 * channel; SSE was specified as a UX enhancement (live activity-log
 * stream) that requires a stateful subscription manager + allowlist
 * filter + graceful downgrade — non-trivial scope deferred to a follow-up
 * polish brief. Setting `observe_events=true` today is a no-op at
 * runtime; the field round-trips through config so the future SSE
 * implementation can read it without a schema change.
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
import { composePrompt } from "./cloud-runner-prompt";

type AnyDb = BetterSQLite3Database<typeof schema>;

// ============================================================
// Config schema (project_runners.config_json)
// ============================================================

export const managedAgentConfigSchema = z.object({
  /** Anthropic Managed Agent ID (created in Anthropic web UI / `ant` CLI). */
  agent_id: z
    .string()
    .min(1)
    .regex(/^agt_[a-zA-Z0-9_-]+$/, {
      message: "agent_id must match Anthropic's `agt_<id>` convention",
    }),
  /** Optional pinned agent version (recommended for stability). */
  agent_version: z.number().int().positive().optional(),
  /** Anthropic Environment ID (container template). */
  environment_id: z
    .string()
    .min(1)
    .regex(/^env_[a-zA-Z0-9_-]+$/, {
      message: "environment_id must match Anthropic's `env_<id>` convention",
    }),
  /** Optional MCP vault ids to attach to the session. */
  vault_ids: z.array(z.string().min(1)).optional(),
  /** Default repo in `owner/repo` form (matches routine adapter shape). */
  default_repo: z.string().regex(/^[^/]+\/[^/]+$/, {
    message: "default_repo must be in 'owner/repo' form",
  }),
  /** Default branch the session opens PRs against. */
  default_branch: z.string().min(1),
  /** Pointer into the credentials table (id of a stored project-credential). */
  bearer_credential_id: z.string().min(1),
  /** Optional override for the Anthropic beta header. */
  beta_header: z.string().optional(),
  /** Polling-primary by default (Brief 217 §D3). */
  callback_mode: z.enum(["polling", "in-prompt"]).optional(),
  /** Optional SSE event-stream observability (Brief 217 §D13). Default off. */
  observe_events: z.boolean().optional(),
});

export type ManagedAgentConfig = z.infer<typeof managedAgentConfigSchema>;

// ============================================================
// Constants — Brief 217 defaults
// ============================================================

const DEFAULT_BETA_HEADER = "managed-agents-2026-04-01";
const BCRYPT_COST = 12;
const TEST_MODE = process.env.DITTO_TEST_MODE === "true";
const ENDPOINT_BASE = "https://api.anthropic.com";

const DEFAULT_TERMINAL_IDLE_THRESHOLD_MS = 30 * 1000;
const DEFAULT_DISPATCH_GRACE_MS = 5 * 1000;

function getEnvNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getTerminalIdleThresholdMs(): number {
  return getEnvNumber(
    "MANAGED_AGENT_TERMINAL_IDLE_THRESHOLD_MS",
    DEFAULT_TERMINAL_IDLE_THRESHOLD_MS,
  );
}

function getDispatchGraceMs(): number {
  return getEnvNumber("MANAGED_AGENT_DISPATCH_GRACE_MS", DEFAULT_DISPATCH_GRACE_MS);
}

function getDefaultBetaHeader(): string {
  return process.env.MANAGED_AGENT_BETA_HEADER ?? DEFAULT_BETA_HEADER;
}

// ============================================================
// Anthropic Managed Agents — narrow response shapes
// ============================================================

interface SessionResponse {
  id: string;
  status: "idle" | "running" | "rescheduling" | "terminated";
  created_at?: string;
  terminated_reason?: string;
}

interface SessionEvent {
  type: string;
  created_at?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
  /** Some preview shapes use `error.message`; tolerate both. */
  error?: { message?: string } | string;
  /** When the agent is awaiting a tool-use confirmation. */
  pending?: boolean;
}

interface SessionEventsResponse {
  events?: SessionEvent[];
  data?: SessionEvent[];
}

// ============================================================
// Adapter factory
// ============================================================

export interface ManagedAgentAdapterDeps {
  /** Override for tests — defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Override for tests — resolves the status webhook URL. */
  statusWebhookUrlFor?: (workItemId: string) => string;
  /**
   * Override for tests — the harness type lookup. Production default reads
   * from `projects.harnessType` with a per-project memoization map (matches
   * the routine adapter pattern). Native projects need this to be honest so
   * the prompt composer inlines the dev-review skill text instead of
   * relying on a cloned working tree.
   */
  harnessTypeFor?: (
    project: ProjectRef,
    db: AnyDb,
  ) => Promise<"catalyst" | "native" | "none">;
  /** Override for tests — defaults to the app db singleton. */
  db?: AnyDb;
  /** Override for tests — defaults to credential-vault's getCredentialById. */
  resolveCredential?: (
    credentialId: string,
  ) => Promise<{ value: string; service: string } | null>;
  /** Override for tests — clock for terminal-idle threshold checks. */
  now?: () => Date;
}

export function createManagedAgentAdapter(
  deps: ManagedAgentAdapterDeps = {},
): RunnerAdapter {
  const kind: RunnerKind = "claude-managed-agent";
  const mode: RunnerMode = "cloud";
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const dbImpl = deps.db ?? appDb;
  const resolveCredential = deps.resolveCredential ?? getCredentialById;
  const statusWebhookUrlFor = deps.statusWebhookUrlFor ?? defaultStatusWebhookUrlFor;
  const harnessTypeFor = deps.harnessTypeFor ?? defaultManagedAgentHarnessTypeFor;
  const now = deps.now ?? (() => new Date());

  return {
    kind,
    mode,
    configSchema: managedAgentConfigSchema,
    supportsCancel: true,

    async execute(
      ctx: DispatchExecuteContext,
      workItem: WorkItemRef,
      project: ProjectRef,
      projectRunner: ProjectRunnerRef,
    ): Promise<DispatchResult> {
      // Insight-180 guard — pre-DB-write, pre-SDK rejection.
      if (!ctx.stepRunId && !TEST_MODE) {
        throw new Error(
          "claude-managed-agent.execute() requires stepRunId (Insight-180 guard).",
        );
      }

      const cfgParse = managedAgentConfigSchema.safeParse(projectRunner.configJson);
      if (!cfgParse.success) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: new Date(),
          finalStatus: "failed",
          errorReason: `Invalid config_json for claude-managed-agent: ${cfgParse.error.message}`,
        };
      }
      const config = cfgParse.data;
      const callbackMode = config.callback_mode ?? "polling";

      const credential = await resolveCredential(config.bearer_credential_id);
      if (!credential) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: new Date(),
          finalStatus: "failed",
          errorReason: `API key credential not found: ${config.bearer_credential_id}`,
        };
      }

      // Generate per-dispatch ephemeral callback token IFF in-prompt mode.
      let ephemeralToken: string | undefined;
      let ephemeralHash: string | undefined;
      if (callbackMode === "in-prompt") {
        ephemeralToken = randomBytes(32).toString("base64url");
        ephemeralHash = await bcrypt.hash(ephemeralToken, BCRYPT_COST);
      }

      const harnessType = await harnessTypeFor(project, dbImpl);
      const promptResult = composePrompt({
        workItemBody: workItem.content,
        harnessType,
        runnerKind: "claude-managed-agent",
        ...(ephemeralToken
          ? {
              ephemeralToken,
              statusWebhookUrl: statusWebhookUrlFor(workItem.id),
              stepRunId: ctx.stepRunId,
            }
          : {}),
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
      // Only when in-prompt mode is configured (NULL otherwise).
      if (ephemeralHash) {
        await dbImpl
          .update(runnerDispatches)
          .set({ callbackTokenHash: ephemeralHash })
          .where(eq(runnerDispatches.id, ctx.dispatchId));
      }

      const startedAt = new Date();
      const baseHeaders: Record<string, string> = {
        "x-api-key": credential.value,
        "anthropic-beta": config.beta_header ?? getDefaultBetaHeader(),
        "Content-Type": "application/json",
      };

      // 1. Create the session.
      let sessionId: string;
      try {
        const createBody = JSON.stringify({
          agent: config.agent_version
            ? { type: "agent", id: config.agent_id, version: config.agent_version }
            : { type: "agent", id: config.agent_id },
          environment_id: config.environment_id,
          ...(config.vault_ids ? { vault_ids: config.vault_ids } : {}),
        });
        const res = await fetchImpl(`${ENDPOINT_BASE}/v1/sessions`, {
          method: "POST",
          headers: baseHeaders,
          body: createBody,
        });
        if (!res.ok) {
          const body = await safeBody(res);
          let finalStatus: DispatchResult["finalStatus"] = "failed";
          if (res.status === 429) finalStatus = "rate_limited";
          if (res.status === 408 || res.status === 504) finalStatus = "timed_out";
          return {
            externalRunId: null,
            externalUrl: null,
            startedAt,
            finalStatus,
            errorReason: `Managed Agents /v1/sessions failed (${res.status}): ${truncate(
              body,
              500,
            )}`,
          };
        }
        const json = (await res.json()) as Partial<SessionResponse>;
        if (!json || typeof json.id !== "string" || !json.id) {
          return {
            externalRunId: null,
            externalUrl: null,
            startedAt,
            finalStatus: "failed",
            errorReason:
              "Managed Agents /v1/sessions response missing `id` — Anthropic contract drift?",
          };
        }
        sessionId = json.id;
      } catch (e) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt,
          finalStatus: "failed",
          errorReason: `Managed Agents /v1/sessions transport error: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      // 2. Send the first user.message event.
      try {
        const eventsBody = JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: promptResult.prompt }],
            },
          ],
        });
        const res = await fetchImpl(
          `${ENDPOINT_BASE}/v1/sessions/${sessionId}/events`,
          {
            method: "POST",
            headers: baseHeaders,
            body: eventsBody,
          },
        );
        if (!res.ok) {
          const body = await safeBody(res);
          // Best-effort cleanup: archive the orphaned session.
          await archiveSession(fetchImpl, sessionId, baseHeaders).catch(() => {});
          let finalStatus: DispatchResult["finalStatus"] = "failed";
          if (res.status === 429) finalStatus = "rate_limited";
          if (res.status === 408 || res.status === 504) finalStatus = "timed_out";
          return {
            externalRunId: sessionId,
            externalUrl: deepLink(sessionId),
            startedAt,
            finalStatus,
            errorReason: `Managed Agents events.create failed (${res.status}): ${truncate(
              body,
              500,
            )}`,
          };
        }
      } catch (e) {
        await archiveSession(fetchImpl, sessionId, baseHeaders).catch(() => {});
        return {
          externalRunId: sessionId,
          externalUrl: deepLink(sessionId),
          startedAt,
          finalStatus: "failed",
          errorReason: `Managed Agents events.create transport error: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      return {
        externalRunId: sessionId,
        externalUrl: deepLink(sessionId),
        startedAt,
        // Async-pending: terminal state arrives via polling cron, GitHub
        // fallback, or (when callback_mode=in-prompt) the in-prompt webhook.
      };
    },

    async status(
      dispatchId: string,
      externalRunId: string,
    ): Promise<DispatchStatusSnapshot> {
      const dispatchRows = await dbImpl
        .select({
          id: runnerDispatches.id,
          status: runnerDispatches.status,
          startedAt: runnerDispatches.startedAt,
          createdAt: runnerDispatches.createdAt,
          finishedAt: runnerDispatches.finishedAt,
          projectId: runnerDispatches.projectId,
        })
        .from(runnerDispatches)
        .where(eq(runnerDispatches.id, dispatchId))
        .limit(1);

      if (dispatchRows.length === 0) {
        return {
          status: "queued",
          externalRunId,
          externalUrl: deepLink(externalRunId),
          lastUpdatedAt: now(),
        };
      }
      const dispatchRow = dispatchRows[0];

      const cfg = await loadConfigForDispatch(dbImpl, dispatchRow.projectId);
      if (!cfg.ok) {
        return {
          status: dispatchRow.status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: deepLink(externalRunId),
          errorReason: cfg.error,
          lastUpdatedAt: now(),
        };
      }

      const credential = await resolveCredential(cfg.config.bearer_credential_id);
      if (!credential) {
        return {
          status: dispatchRow.status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: deepLink(externalRunId),
          errorReason: "API key credential not found",
          lastUpdatedAt: now(),
        };
      }

      const baseHeaders: Record<string, string> = {
        "x-api-key": credential.value,
        "anthropic-beta": cfg.config.beta_header ?? getDefaultBetaHeader(),
      };

      let session: SessionResponse | null = null;
      let events: SessionEvent[] = [];
      try {
        const sRes = await fetchImpl(`${ENDPOINT_BASE}/v1/sessions/${externalRunId}`, {
          method: "GET",
          headers: baseHeaders,
        });
        if (sRes.ok) {
          session = (await sRes.json()) as SessionResponse;
        } else if (sRes.status === 401) {
          return {
            status: dispatchRow.status as DispatchStatusSnapshot["status"],
            externalRunId,
            externalUrl: deepLink(externalRunId),
            errorReason: "401 from Managed Agents — credential rotated?",
            lastUpdatedAt: now(),
          };
        }
        const eRes = await fetchImpl(
          `${ENDPOINT_BASE}/v1/sessions/${externalRunId}/events?limit=20`,
          { method: "GET", headers: baseHeaders },
        );
        if (eRes.ok) {
          const ej = (await eRes.json()) as SessionEventsResponse;
          events = ej.events ?? ej.data ?? [];
        }
      } catch (e) {
        return {
          status: dispatchRow.status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: deepLink(externalRunId),
          errorReason: `Managed Agents status transport error: ${e instanceof Error ? e.message : String(e)}`,
          lastUpdatedAt: now(),
        };
      }

      if (!session) {
        return {
          status: dispatchRow.status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: deepLink(externalRunId),
          lastUpdatedAt: now(),
        };
      }

      const heuristic = applyTerminalStateHeuristic(session, events, {
        dispatchedAt: dispatchRow.startedAt ?? dispatchRow.createdAt ?? new Date(),
        now: now(),
        terminalIdleThresholdMs: getTerminalIdleThresholdMs(),
        dispatchGraceMs: getDispatchGraceMs(),
      });

      return {
        status: heuristic.status,
        externalRunId,
        externalUrl: deepLink(externalRunId),
        ...(heuristic.errorReason ? { errorReason: heuristic.errorReason } : {}),
        lastUpdatedAt: now(),
      };
    },

    async cancel(_dispatchId: string, externalRunId: string): Promise<CancelResult> {
      const dispatchRows = await dbImpl
        .select({
          projectId: runnerDispatches.projectId,
        })
        .from(runnerDispatches)
        .where(eq(runnerDispatches.id, _dispatchId))
        .limit(1);
      if (dispatchRows.length === 0) {
        return { ok: false, reason: "dispatch row not found" };
      }
      const cfg = await loadConfigForDispatch(dbImpl, dispatchRows[0].projectId);
      if (!cfg.ok) return { ok: false, reason: cfg.error };
      const credential = await resolveCredential(cfg.config.bearer_credential_id);
      if (!credential) return { ok: false, reason: "API key not in vault" };

      const baseHeaders: Record<string, string> = {
        "x-api-key": credential.value,
        "anthropic-beta": cfg.config.beta_header ?? getDefaultBetaHeader(),
      };
      const archived = await archiveSession(fetchImpl, externalRunId, baseHeaders);
      if (!archived.ok) {
        return {
          ok: false,
          reason: `archive failed (${archived.status}): ${archived.body ?? ""}`,
        };
      }
      return { ok: true };
    },

    async healthCheck(projectRunner: ProjectRunnerRef): Promise<HealthCheckResult> {
      const cfgParse = managedAgentConfigSchema.safeParse(projectRunner.configJson);
      if (!cfgParse.success) {
        return {
          status: "unauthenticated",
          reason: `config invalid: ${cfgParse.error.message}`,
        };
      }
      const credential = await resolveCredential(cfgParse.data.bearer_credential_id);
      if (!credential) {
        return {
          status: "unauthenticated",
          reason: "API key credential not found in vault",
        };
      }
      // Brief 217 §D8 — config-validity only; no live API call.
      return { status: "healthy" };
    },
  };
}

// ============================================================
// Terminal-state heuristic (Brief 217 §D2 / AC #7)
// ============================================================

interface HeuristicInput {
  dispatchedAt: Date;
  now: Date;
  terminalIdleThresholdMs: number;
  dispatchGraceMs: number;
}

interface HeuristicResult {
  status: DispatchStatusSnapshot["status"];
  errorReason?: string;
}

export function applyTerminalStateHeuristic(
  session: SessionResponse,
  events: SessionEvent[],
  input: HeuristicInput,
): HeuristicResult {
  // Row 1: terminated → failed (with optional terminate reason).
  if (session.status === "terminated") {
    return {
      status: "failed",
      errorReason: session.terminated_reason ?? "session terminated",
    };
  }

  // Row 2: running → running.
  if (session.status === "running") {
    return { status: "running" };
  }

  // Row 3: rescheduling → running (transient).
  if (session.status === "rescheduling") {
    return { status: "running" };
  }

  // session.status === "idle" beyond this point.
  const sorted = [...events].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
  const last = sorted[sorted.length - 1];

  // Row 7: idle + grace not elapsed → running (just dispatched).
  if (
    input.now.getTime() - input.dispatchedAt.getTime() <
    input.dispatchGraceMs
  ) {
    return { status: "running" };
  }

  // Row 5: idle + recent agent.error event → failed (with error-pattern mapping).
  if (last && last.type === "agent.error") {
    const msg = extractErrorMessage(last);
    if (msg && /rate.?limit/i.test(msg)) return { status: "rate_limited", errorReason: msg };
    if (msg && /(timeout|timed.?out)/i.test(msg)) return { status: "timed_out", errorReason: msg };
    return { status: "failed", errorReason: msg ?? "agent.error" };
  }

  // Row 6: idle + last event is a pending agent.tool_use → running (steering surface absent at MVP).
  if (last && last.type === "agent.tool_use" && last.pending) {
    return { status: "running" };
  }

  // Row 4: idle + last event is agent.message AND idle for > threshold → succeeded.
  if (last && last.type === "agent.message" && last.created_at) {
    const lastEventAt = Date.parse(last.created_at);
    if (
      Number.isFinite(lastEventAt) &&
      input.now.getTime() - lastEventAt > input.terminalIdleThresholdMs
    ) {
      return { status: "succeeded" };
    }
    return { status: "running" };
  }

  // Conservative default: still running.
  return { status: "running" };
}

function extractErrorMessage(event: SessionEvent): string | null {
  if (typeof event.error === "string") return event.error;
  if (event.error?.message) return event.error.message;
  return null;
}

// ============================================================
// Helpers
// ============================================================

function deepLink(sessionId: string): string {
  return `https://platform.claude.com/sessions/${sessionId}`;
}

async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

interface ConfigLoadResult {
  ok: true;
  config: ManagedAgentConfig;
}
interface ConfigLoadError {
  ok: false;
  error: string;
}

async function loadConfigForDispatch(
  dbImpl: AnyDb,
  projectId: string,
): Promise<ConfigLoadResult | ConfigLoadError> {
  const { projectRunners } = schema;
  const rows = await dbImpl
    .select({ configJson: projectRunners.configJson })
    .from(projectRunners)
    .where(eq(projectRunners.projectId, projectId))
    .limit(5);
  for (const row of rows) {
    const parsed = managedAgentConfigSchema.safeParse(row.configJson);
    if (parsed.success) return { ok: true, config: parsed.data };
  }
  return { ok: false, error: "no claude-managed-agent runner config found" };
}

async function archiveSession(
  fetchImpl: typeof globalThis.fetch,
  sessionId: string,
  baseHeaders: Record<string, string>,
): Promise<{ ok: true } | { ok: false; status: number; body?: string }> {
  try {
    const res = await fetchImpl(
      `${ENDPOINT_BASE}/v1/sessions/${sessionId}/archive`,
      { method: "POST", headers: baseHeaders },
    );
    if (res.ok) return { ok: true };
    const body = await safeBody(res);
    return { ok: false, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

function defaultStatusWebhookUrlFor(workItemId: string): string {
  const base =
    process.env.DITTO_STATUS_WEBHOOK_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/v1/work-items/${workItemId}/status`;
}

let cachedManagedAgentHarnessTypes:
  | Map<string, "catalyst" | "native" | "none">
  | null = null;

async function defaultManagedAgentHarnessTypeFor(
  project: ProjectRef,
  db: AnyDb,
): Promise<"catalyst" | "native" | "none"> {
  const cached = cachedManagedAgentHarnessTypes?.get(project.id);
  if (cached) return cached;
  const rows = await db
    .select({ harnessType: projects.harnessType })
    .from(projects)
    .where(eq(projects.id, project.id))
    .limit(1);
  const value = (rows[0]?.harnessType ?? "native") as
    | "catalyst"
    | "native"
    | "none";
  if (!cachedManagedAgentHarnessTypes) {
    cachedManagedAgentHarnessTypes = new Map();
  }
  cachedManagedAgentHarnessTypes.set(project.id, value);
  return value;
}

/** Test-only — clear the cache so DB-fallback paths can be exercised. */
export function _clearManagedAgentHarnessTypeCacheForTests(): void {
  cachedManagedAgentHarnessTypes = null;
}

/**
 * Brief 217 §D6 — webhook subscription declaration. Same set as
 * `claude-code-routine` (the kind-agnostic GitHub-fallback handler reads
 * by repo + active dispatch's `runnerKind`).
 */
export const MANAGED_AGENT_GITHUB_WEBHOOK_SUBSCRIPTIONS = {
  events: ["pull_request", "workflow_run", "deployment_status"] as const,
};
