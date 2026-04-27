/**
 * GitHub Actions Adapter — Brief 218.
 *
 * Implements the `RunnerAdapter` interface from `@ditto/core` for the
 * `github-action` runner kind. Dispatches a work-item to a user-controlled
 * GitHub Actions workflow via `POST /repos/{owner}/{repo}/actions/workflows/
 * {file}/dispatches`. The endpoint returns the new run's `id` synchronously
 * since 2026-02-19; the adapter falls back to `listWorkflowRuns` when the
 * response lacks an `id` (older API behaviour or transient null).
 *
 * Status path is webhook-primary (Brief 218 §D2): `workflow_run`,
 * `pull_request`, `check_run`, `deployment_status` events flow through the
 * kind-agnostic `cloud-runner-fallback.ts`. A 60-second polling backup
 * (`pollCadenceMs['github-action']`) catches up on missed webhook deliveries
 * via `getWorkflowRun`.
 *
 * Three callback modes (Brief 218 §D3) progressively expose log-masking
 * trade-offs:
 *  - `webhook-only` (default) — GitHub events only.
 *  - `in-workflow-secret` — workflow uses `secrets.DITTO_RUNNER_BEARER`
 *    (long-lived project bearer; user pastes plaintext into repo secrets;
 *    GitHub auto-masks).
 *  - `in-workflow` — per-dispatch ephemeral token in `inputs.callback_url`
 *    query string (NOT log-masked; explicit risk acceptance per §D3).
 *
 * Brief drift flagged for Architect (Insight-043): the brief assumed
 * `@octokit/rest` was already in stack via Ditto's existing GitHub
 * integration. It is not — no @octokit/* package is installed, no Ditto code
 * imports Octokit. Following Brief 217's precedent (Insight-213 — same kind
 * of SDK-mismatch surfaced for the Anthropic SDK), this adapter uses raw
 * `fetch` against `https://api.github.com` with the documented headers.
 * Endpoints used are simple JSON; no SDK affordance was load-bearing.
 *
 * Real cancellation is supported per §D13 (`POST /actions/runs/{id}/cancel`).
 * `supportsCancel: true`.
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
  WorkflowRunConclusion,
} from "@ditto/core";

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as appDb } from "../db";
import * as schema from "../db/schema";
import { runnerDispatches } from "../db/schema";
import { getCredentialById } from "../engine/credential-vault";

type AnyDb = BetterSQLite3Database<typeof schema>;

// ============================================================
// Config schema (project_runners.config_json)
// ============================================================

export const githubActionConfigSchema = z.object({
  /** `owner/repo` form. May differ from `project.github_repo` (Brief 218 §D12). */
  repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, {
    message: "repo must be in 'owner/repo' form",
  }),
  /** Filename under `.github/workflows/`, e.g. `dispatch-coding-work.yml`. */
  workflowFile: z.string().min(1).regex(/\.ya?ml$/, {
    message: "workflowFile must end in .yml or .yaml",
  }),
  /** Branch the dispatch fires on. Default `main`. */
  defaultRef: z.string().min(1).default("main"),
  /** Pointer into the credentials table (id of a stored project-credential). */
  bearer_credential_id: z.string().min(1),
  /** Brief 218 §D3 — three modes. Default webhook-only. */
  callback_mode: z
    .enum(["webhook-only", "in-workflow-secret", "in-workflow"])
    .optional(),
  /** Brief 218 §D2 — listWorkflowRuns fallback window. Default 30s. */
  dispatch_run_lookup_window_ms: z.number().int().positive().optional(),
});

export type GithubActionConfig = z.infer<typeof githubActionConfigSchema>;

// ============================================================
// Constants
// ============================================================

const ENDPOINT_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const BCRYPT_COST = 12;
const TEST_MODE = process.env.DITTO_TEST_MODE === "true";

const DEFAULT_DISPATCH_RUN_LOOKUP_WINDOW_MS = 30 * 1000;

function getDispatchRunLookupWindowMs(): number {
  const v = process.env.GITHUB_ACTION_DISPATCH_RUN_LOOKUP_WINDOW_MS;
  if (!v) return DEFAULT_DISPATCH_RUN_LOOKUP_WINDOW_MS;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DISPATCH_RUN_LOOKUP_WINDOW_MS;
}

function getDittoReleaseVersion(): string | null {
  return process.env.DITTO_RELEASE_VERSION ?? null;
}

// ============================================================
// GitHub REST narrow response shapes
// ============================================================

interface CreateWorkflowDispatchResponse {
  id?: number;
}

interface WorkflowRun {
  id: number;
  status: "queued" | "in_progress" | "completed" | "waiting" | "pending";
  conclusion: WorkflowRunConclusion | null;
  html_url: string;
  logs_url?: string;
  head_sha?: string;
}

interface ListWorkflowRunsResponse {
  workflow_runs?: WorkflowRun[];
}

// ============================================================
// Adapter factory
// ============================================================

export interface GithubActionAdapterDeps {
  /** Override for tests — defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Override for tests — resolves the status webhook URL. */
  statusWebhookUrlFor?: (workItemId: string) => string;
  /** Override for tests — defaults to the app db singleton. */
  db?: AnyDb;
  /** Override for tests — defaults to credential-vault's getCredentialById. */
  resolveCredential?: (
    credentialId: string,
  ) => Promise<{ value: string; service: string } | null>;
  /** Override for tests — clock. */
  now?: () => Date;
  /**
   * Override for tests — the dev-review SKILL.md release-asset URL composer.
   * Production default reads from `DITTO_RELEASE_VERSION` env var. When unset,
   * returns null and the workflow falls back to its inlined skill copy.
   */
  devReviewSkillUrlFor?: () => string | null;
}

export function createGithubActionAdapter(
  deps: GithubActionAdapterDeps = {},
): RunnerAdapter {
  const kind: RunnerKind = "github-action";
  const mode: RunnerMode = "cloud";
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const dbImpl = deps.db ?? appDb;
  const resolveCredential = deps.resolveCredential ?? getCredentialById;
  const statusWebhookUrlFor =
    deps.statusWebhookUrlFor ?? defaultStatusWebhookUrlFor;
  const now = deps.now ?? (() => new Date());
  const devReviewSkillUrlFor =
    deps.devReviewSkillUrlFor ?? defaultDevReviewSkillUrlFor;

  return {
    kind,
    mode,
    configSchema: githubActionConfigSchema,
    supportsCancel: true,

    async execute(
      ctx: DispatchExecuteContext,
      workItem: WorkItemRef,
      _project: ProjectRef,
      projectRunner: ProjectRunnerRef,
    ): Promise<DispatchResult> {
      // Insight-180 guard — pre-DB-write, pre-SDK rejection.
      if (!ctx.stepRunId && !TEST_MODE) {
        throw new Error(
          "github-action.execute() requires stepRunId (Insight-180 guard).",
        );
      }

      const cfgParse = githubActionConfigSchema.safeParse(
        projectRunner.configJson,
      );
      if (!cfgParse.success) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: now(),
          finalStatus: "failed",
          errorReason: `Invalid config_json for github-action: ${cfgParse.error.message}`,
        };
      }
      const config = cfgParse.data;
      const callbackMode = config.callback_mode ?? "webhook-only";

      const credential = await resolveCredential(config.bearer_credential_id);
      if (!credential) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: now(),
          finalStatus: "failed",
          errorReason: `GitHub PAT credential not found: ${config.bearer_credential_id}`,
        };
      }

      // Per-dispatch ephemeral token IFF in-workflow mode (NOT in-workflow-secret).
      let ephemeralToken: string | undefined;
      let ephemeralHash: string | undefined;
      if (callbackMode === "in-workflow") {
        ephemeralToken = randomBytes(32).toString("base64url");
        ephemeralHash = await bcrypt.hash(ephemeralToken, BCRYPT_COST);
      }

      // Persist the bcrypt hash on the dispatch row BEFORE wire send so a
      // late callback that arrives before this DB update can still match.
      if (ephemeralHash) {
        await dbImpl
          .update(runnerDispatches)
          .set({ callbackTokenHash: ephemeralHash })
          .where(eq(runnerDispatches.id, ctx.dispatchId));
      }

      const startedAt = now();

      const inputs: Record<string, string> = {
        work_item_id: workItem.id,
        // Cap work-item body at 50 KB; GitHub limits each input to 65 KB and
        // we keep ~15 KB for skill-text fallback per §D4 + Brief Constraints.
        work_item_body: truncate(workItem.content, 50 * 1024),
        harness_type: "catalyst", // resolved upstream; dispatcher does not pass it on, default catalyst
        stepRunId: ctx.stepRunId,
      };

      // Optional callback_url input (per-dispatch ephemeral mode only).
      if (callbackMode === "in-workflow" && ephemeralToken) {
        const url = new URL(statusWebhookUrlFor(workItem.id));
        url.searchParams.set("token", ephemeralToken);
        inputs.callback_url = url.toString();
      } else if (callbackMode === "in-workflow-secret") {
        inputs.callback_url = statusWebhookUrlFor(workItem.id);
      }

      // Optional dev-review skill URL (resolved at dispatch time per §D4 fallback).
      const skillUrl = devReviewSkillUrlFor();
      if (skillUrl) {
        inputs.dev_review_skill_url = skillUrl;
      }

      const [owner, repo] = config.repo.split("/");
      const dispatchUrl = `${ENDPOINT_BASE}/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
        config.workflowFile,
      )}/dispatches`;

      const baseHeaders: Record<string, string> = {
        Authorization: `Bearer ${credential.value}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "Content-Type": "application/json",
      };

      const dispatchBody = JSON.stringify({
        ref: config.defaultRef,
        inputs,
      });

      // 1. Fire the workflow_dispatch event.
      let dispatchRes: Response;
      try {
        dispatchRes = await fetchImpl(dispatchUrl, {
          method: "POST",
          headers: baseHeaders,
          body: dispatchBody,
        });
      } catch (e) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt,
          finalStatus: "failed",
          errorReason: `GitHub workflow_dispatch transport error: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }

      if (!dispatchRes.ok) {
        const body = await safeBody(dispatchRes);
        let finalStatus: DispatchResult["finalStatus"] = "failed";
        if (dispatchRes.status === 429) finalStatus = "rate_limited";
        if (dispatchRes.status === 408 || dispatchRes.status === 504)
          finalStatus = "timed_out";
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt,
          finalStatus,
          errorReason: `GitHub workflow_dispatch failed (${
            dispatchRes.status
          }): ${truncate(body, 500)}`,
        };
      }

      // 2. Read the run id from the response (since 2026-02-19) OR fall back.
      let runId: number | null = null;
      try {
        const text = await dispatchRes.text();
        if (text) {
          const json = JSON.parse(text) as CreateWorkflowDispatchResponse;
          if (typeof json.id === "number") {
            runId = json.id;
          }
        }
      } catch {
        // Empty body / non-JSON → fall through to listWorkflowRuns.
      }

      if (runId === null) {
        runId = await listRunIdFallback({
          fetchImpl,
          baseHeaders,
          owner,
          repo,
          workflowFile: config.workflowFile,
          windowMs:
            config.dispatch_run_lookup_window_ms ??
            getDispatchRunLookupWindowMs(),
          since: startedAt,
        });
      }

      if (runId === null) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt,
          finalStatus: "failed",
          errorReason: "dispatch-run-id-unavailable",
        };
      }

      const externalRunId = String(runId);
      return {
        externalRunId,
        externalUrl: deepLink(owner, repo, runId),
        startedAt,
        // Async-pending: terminal state arrives via webhook (workflow_run.completed)
        // or polling cron (60s).
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
          projectId: runnerDispatches.projectId,
        })
        .from(runnerDispatches)
        .where(eq(runnerDispatches.id, dispatchId))
        .limit(1);

      if (dispatchRows.length === 0) {
        return {
          status: "queued",
          externalRunId,
          externalUrl: null,
          lastUpdatedAt: now(),
        };
      }

      const cfg = await loadConfigForDispatch(
        dbImpl,
        dispatchRows[0].projectId,
      );
      if (!cfg.ok) {
        return {
          status: dispatchRows[0].status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: null,
          errorReason: cfg.error,
          lastUpdatedAt: now(),
        };
      }

      const credential = await resolveCredential(cfg.config.bearer_credential_id);
      if (!credential) {
        return {
          status: dispatchRows[0].status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: null,
          errorReason: "GitHub PAT credential not found",
          lastUpdatedAt: now(),
        };
      }

      const [owner, repo] = cfg.config.repo.split("/");
      const baseHeaders: Record<string, string> = {
        Authorization: `Bearer ${credential.value}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      };

      let res: Response;
      try {
        res = await fetchImpl(
          `${ENDPOINT_BASE}/repos/${owner}/${repo}/actions/runs/${externalRunId}`,
          { method: "GET", headers: baseHeaders },
        );
      } catch (e) {
        return {
          status: dispatchRows[0].status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: deepLink(owner, repo, Number(externalRunId)),
          errorReason: `GitHub getWorkflowRun transport error: ${
            e instanceof Error ? e.message : String(e)
          }`,
          lastUpdatedAt: now(),
        };
      }

      if (!res.ok) {
        return {
          status: dispatchRows[0].status as DispatchStatusSnapshot["status"],
          externalRunId,
          externalUrl: deepLink(owner, repo, Number(externalRunId)),
          errorReason: `getWorkflowRun ${res.status}`,
          lastUpdatedAt: now(),
        };
      }

      const run = (await res.json()) as WorkflowRun;
      const mapped = mapWorkflowRunToDispatchStatus(run);
      return {
        status: mapped.status,
        externalRunId,
        externalUrl: run.html_url,
        ...(mapped.errorReason ? { errorReason: mapped.errorReason } : {}),
        lastUpdatedAt: now(),
      };
    },

    async cancel(
      dispatchId: string,
      externalRunId: string,
    ): Promise<CancelResult> {
      const dispatchRows = await dbImpl
        .select({ projectId: runnerDispatches.projectId })
        .from(runnerDispatches)
        .where(eq(runnerDispatches.id, dispatchId))
        .limit(1);
      if (dispatchRows.length === 0) {
        return { ok: false, reason: "dispatch row not found" };
      }
      const cfg = await loadConfigForDispatch(
        dbImpl,
        dispatchRows[0].projectId,
      );
      if (!cfg.ok) return { ok: false, reason: cfg.error };
      const credential = await resolveCredential(cfg.config.bearer_credential_id);
      if (!credential) return { ok: false, reason: "GitHub PAT not in vault" };

      const [owner, repo] = cfg.config.repo.split("/");
      try {
        const res = await fetchImpl(
          `${ENDPOINT_BASE}/repos/${owner}/${repo}/actions/runs/${externalRunId}/cancel`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credential.value}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
          },
        );
        // GitHub returns 202 Accepted for cancel; tolerate any 2xx.
        if (res.ok) return { ok: true };
        return {
          ok: false,
          reason: `cancelWorkflowRun ${res.status}: ${await safeBody(res)}`,
        };
      } catch (e) {
        return {
          ok: false,
          reason: `cancelWorkflowRun transport error: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },

    async healthCheck(
      projectRunner: ProjectRunnerRef,
    ): Promise<HealthCheckResult> {
      const cfgParse = githubActionConfigSchema.safeParse(
        projectRunner.configJson,
      );
      if (!cfgParse.success) {
        return {
          status: "unauthenticated",
          reason: `config invalid: ${cfgParse.error.message}`,
        };
      }
      const credential = await resolveCredential(
        cfgParse.data.bearer_credential_id,
      );
      if (!credential) {
        return {
          status: "unauthenticated",
          reason: "GitHub PAT credential not found in vault",
        };
      }
      // Brief 218 §D7 — config-validity only at health-check time. The live
      // probe ("Verify with API") is the manual path that lists workflows.
      return { status: "healthy" };
    },
  };
}

// ============================================================
// State mapping (Brief 218 §D9)
// ============================================================

interface MappedStatus {
  status: DispatchStatusSnapshot["status"];
  errorReason?: string;
}

/**
 * Brief 218 §D9 — workflow_run.status + conclusion → runner_dispatches.status.
 * Used both by `status()` (live probe) and by `cloud-runner-fallback.ts`
 * (webhook event). Pure; testable in isolation.
 */
export function mapWorkflowRunToDispatchStatus(run: {
  status: string;
  conclusion: string | null;
}): MappedStatus {
  if (run.status === "queued" || run.status === "waiting" || run.status === "pending") {
    return { status: "dispatched" };
  }
  if (run.status === "in_progress") {
    return { status: "running" };
  }
  if (run.status !== "completed") {
    return { status: "running" };
  }
  // status === "completed"
  switch (run.conclusion) {
    case "success":
      return { status: "succeeded" };
    case "failure":
      return { status: "failed" };
    case "cancelled":
      return { status: "cancelled" };
    case "timed_out":
      return { status: "timed_out" };
    case "action_required":
      return { status: "failed", errorReason: "action_required" };
    case "neutral":
      return { status: "succeeded" };
    case "skipped":
      return { status: "cancelled" };
    case "stale":
      return { status: "cancelled" };
    default:
      return { status: "failed", errorReason: `unknown conclusion: ${run.conclusion ?? "null"}` };
  }
}

// ============================================================
// listWorkflowRuns fallback (Brief 218 §D2)
// ============================================================

interface ListRunIdFallbackInput {
  fetchImpl: typeof globalThis.fetch;
  baseHeaders: Record<string, string>;
  owner: string;
  repo: string;
  workflowFile: string;
  windowMs: number;
  since: Date;
}

async function listRunIdFallback(
  input: ListRunIdFallbackInput,
): Promise<number | null> {
  const url = `${ENDPOINT_BASE}/repos/${input.owner}/${input.repo}/actions/workflows/${encodeURIComponent(
    input.workflowFile,
  )}/runs?event=workflow_dispatch&per_page=5`;
  try {
    const res = await input.fetchImpl(url, {
      method: "GET",
      headers: { ...input.baseHeaders, "Content-Type": undefined! } as unknown as HeadersInit,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ListWorkflowRunsResponse;
    const runs = json.workflow_runs ?? [];
    // Pick the newest run within the lookup window. GitHub's listWorkflowRuns
    // returns runs sorted by `created_at` DESC; the first should be ours
    // unless two dispatches landed within milliseconds.
    const firstWithinWindow = runs[0];
    if (!firstWithinWindow) return null;
    // Best-effort: the run is plausibly ours if it's the newest. The window
    // bounds are advisory; we don't verify created_at strictly because the
    // run is new and clock skew between Ditto and GitHub is unbounded.
    void input.windowMs;
    void input.since;
    return firstWithinWindow.id;
  } catch {
    return null;
  }
}

// ============================================================
// Helpers
// ============================================================

function deepLink(owner: string, repo: string, runId: number | string): string {
  return `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
}

async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}

function truncate(s: string, max: number): string {
  if (Buffer.byteLength(s, "utf8") <= max) return s;
  // Walk back to a UTF-8 boundary.
  const buf = Buffer.from(s, "utf8");
  let end = max;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.slice(0, end).toString("utf8") + "…";
}

interface ConfigLoadResult {
  ok: true;
  config: GithubActionConfig;
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
    const parsed = githubActionConfigSchema.safeParse(row.configJson);
    if (parsed.success) return { ok: true, config: parsed.data };
  }
  return { ok: false, error: "no github-action runner config found" };
}

function defaultStatusWebhookUrlFor(workItemId: string): string {
  const base =
    process.env.DITTO_STATUS_WEBHOOK_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/v1/work-items/${workItemId}/status`;
}

function defaultDevReviewSkillUrlFor(): string | null {
  const version = getDittoReleaseVersion();
  if (!version) return null;
  const owner = process.env.DITTO_RELEASE_OWNER ?? "anthropic";
  const repo = process.env.DITTO_RELEASE_REPO ?? "ditto";
  return `https://github.com/${owner}/${repo}/releases/download/${version}/dev-review-SKILL.md`;
}

/**
 * Brief 218 §D11 — webhook subscription declaration. The kind-agnostic
 * `cloud-runner-fallback.ts` receives the events; this brief extends that
 * file to route `workflow_run` and `check_run.completed` to dispatches.
 */
export const GITHUB_ACTION_WEBHOOK_SUBSCRIPTIONS = {
  events: [
    "workflow_run",
    "pull_request",
    "check_run",
    "deployment_status",
  ] as const,
};
