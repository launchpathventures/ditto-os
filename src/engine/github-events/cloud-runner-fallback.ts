/**
 * GitHub fallback handler — Brief 216 §D4 + Brief 217 §D6 + Brief 218 §D5
 * (kind-agnostic).
 *
 * Pure function callable by a webhook listener (or directly from tests).
 * Subscribes to the `pull_request`, `workflow_run`, `check_run`, and
 * `deployment_status` events on every repo configured in any project_runner
 * of a cloud kind (`claude-code-routine`, `claude-managed-agent`,
 * `github-action`). Provides terminal-state resolution for the runner even
 * when the primary status path (in-prompt callback / polling / webhook)
 * misses an event.
 *
 * Branch matching for routine/managed-agent: cloud runner sessions open PRs
 * on `claude/*` branches by Anthropic default. For github-action the workflow
 * is dispatched on a user-controlled branch (typically `main`); matching is
 * via `external_run_id` correlation (we look up the dispatch by repo plus
 * the workflow_run's id when it's set, and fall back to repo + active
 * dispatch for PR/deployment events).
 *
 * Brief 218 §D5 — `workflow_run.completed` events transition github-action
 * dispatches per the conclusion table in `mapWorkflowRunToDispatchStatus`.
 * `check_run.completed` routing infrastructure is in place; semantic
 * Argos/Greptile gating ships in Brief 219.
 *
 * Brief 217 §D6 — kind-routing is per-row (the matched dispatch's `runnerKind`
 * column drives the deep-link URL only). Behaviour is otherwise identical
 * across the cloud kinds.
 */

import { and, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  transitionDispatch,
  type RunnerDispatchStatus,
  type RunnerKind,
} from "@ditto/core";
import { db as appDb } from "../../db";
import * as schema from "../../db/schema";
import {
  runnerDispatches,
  projects,
  activities,
  projectRunners,
} from "../../db/schema";
import { mapWorkflowRunToDispatchStatus } from "../../adapters/github-action";

type AnyDb = BetterSQLite3Database<typeof schema>;

// ============================================================
// Event payloads — narrow shapes (we don't import @octokit types)
// ============================================================

export interface PullRequestEvent {
  action: "opened" | "synchronize" | "closed";
  pull_request: {
    html_url: string;
    head: { ref: string };
    merged?: boolean;
  };
  repository: { full_name: string };
}

export interface WorkflowRunEvent {
  action: "completed" | "in_progress" | "requested";
  workflow_run: {
    id?: number;
    status?: string;
    conclusion:
      | "success"
      | "failure"
      | "cancelled"
      | "skipped"
      | "neutral"
      | "timed_out"
      | "action_required"
      | "stale"
      | null;
    head_branch: string;
    html_url: string;
    logs_url?: string;
  };
  repository: { full_name: string };
}

/**
 * Brief 218 §D5 — `check_run.completed` routing infrastructure. Used by
 * Brief 219 (Greptile / Argos) to gate work-item progression on per-check
 * outcomes. This brief installs the routing seam; semantic interpretation
 * is deferred to Brief 219.
 */
export interface CheckRunEvent {
  action: "completed" | "created" | "rerequested";
  check_run: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_sha: string;
  };
  repository: { full_name: string };
}

export interface DeploymentStatusEvent {
  action: "created";
  deployment_status: {
    state: string;
    environment: string;
    target_url?: string | null;
    environment_url?: string | null;
  };
  deployment: { ref: string };
  repository: { full_name: string };
}

export type FallbackOutcome =
  | { kind: "no-match"; reason: string }
  | { kind: "pr-opened"; dispatchId: string; prUrl: string }
  | { kind: "pr-merged"; dispatchId: string; prUrl: string }
  | { kind: "pr-closed-unmerged"; dispatchId: string; prUrl: string }
  | { kind: "preview-ready"; dispatchId: string; previewUrl: string }
  | { kind: "production-no-op"; dispatchId: string }
  | { kind: "workflow-completed"; dispatchId: string; conclusion: string }
  | {
      kind: "workflow-transitioned";
      dispatchId: string;
      from: RunnerDispatchStatus;
      to: RunnerDispatchStatus;
      conclusion: string;
    }
  | {
      kind: "check-run-routed";
      dispatchId: string;
      checkRunName: string;
      conclusion: string | null;
    };

const ROUTINE_BRANCH_PREFIX = "claude/";
const URL_CAP = 2 * 1024;

interface FallbackOptions {
  db?: AnyDb;
  /**
   * Per-project deploy-target environment names. When unset, defaults to
   * "Production" matching Vercel's default. The brief allows projects to
   * override this for non-default production env names.
   */
  deployTargetFor?: (projectId: string) => string | null;
}

// ============================================================
// pull_request handler
// ============================================================

export async function handlePullRequestEvent(
  event: PullRequestEvent,
  options: FallbackOptions = {},
): Promise<FallbackOutcome> {
  const dbImpl = options.db ?? appDb;

  const prUrl = truncate(event.pull_request.html_url, URL_CAP);
  const isClaudeBranch = event.pull_request.head.ref.startsWith(
    ROUTINE_BRANCH_PREFIX,
  );

  // Brief 218 §D5 — github-action workflows run on user-controlled branches
  // (typically `main`/`develop`), so the `claude/*` filter would exclude
  // legitimate github-action PR events. Strategy: if the branch IS `claude/*`,
  // proceed (covers routine + managed-agent + Claude-Code-via-github-action).
  // If the branch is NOT `claude/*`, only proceed when an active github-action
  // dispatch exists for the repo (the only kind whose workflow may open
  // arbitrary-named branches).
  const includeTerminal =
    event.action === "closed" && event.pull_request.merged === true;
  const dispatch = await findDispatchForRepo(
    dbImpl,
    event.repository.full_name,
    {
      includeTerminal,
      preferUrl: prUrl,
      ...(isClaudeBranch ? {} : { onlyKinds: ["github-action"] }),
    },
  );
  if (!dispatch) {
    return {
      kind: "no-match",
      reason: isClaudeBranch
        ? "no cloud-runner dispatch for repo"
        : "branch is not claude/* and no active github-action dispatch for repo",
    };
  }

  const sessionUrl = deepLinkForDispatch(
    dispatch.runnerKind,
    dispatch.externalRunId,
  );

  if (event.action === "opened" || event.action === "synchronize") {
    await dbImpl
      .update(runnerDispatches)
      .set({ externalUrl: prUrl })
      .where(eq(runnerDispatches.id, dispatch.id));
    await insertActivity(dbImpl, {
      action: `${activityPrefix(dispatch.runnerKind)}_pr_opened`,
      description: `${labelFor(dispatch.runnerKind)} PR opened: ${prUrl}`,
      workItemId: dispatch.workItemId,
      metadata: {
        fallback: "pull_request.opened",
        prUrl,
        dispatchId: dispatch.id,
        runnerKind: dispatch.runnerKind,
        sessionUrl,
      },
    });
    return { kind: "pr-opened", dispatchId: dispatch.id, prUrl };
  }

  if (event.action === "closed") {
    if (event.pull_request.merged) {
      const tr = transitionDispatch(
        dispatch.status as RunnerDispatchStatus,
        "succeed",
      );
      if (tr.ok) {
        await dbImpl
          .update(runnerDispatches)
          .set({ status: tr.to, finishedAt: new Date() })
          .where(eq(runnerDispatches.id, dispatch.id));
        await insertActivity(dbImpl, {
          action: `${activityPrefix(dispatch.runnerKind)}_pr_merged`,
          description: `${labelFor(dispatch.runnerKind)} PR merged: ${prUrl}`,
          workItemId: dispatch.workItemId,
          metadata: {
            fallback: "pull_request.merged",
            prUrl,
            dispatchId: dispatch.id,
            runnerKind: dispatch.runnerKind,
            sessionUrl,
          },
        });
        return { kind: "pr-merged", dispatchId: dispatch.id, prUrl };
      }
      // Late callback / illegal transition — reachable now that the lookup
      // includes terminal rows for merged-close (Brief 216 §D4).
      await insertActivity(dbImpl, {
        action: `${activityPrefix(dispatch.runnerKind)}_late_callback_rejected`,
        description: `Late PR-merged signal rejected (illegal SM transition from ${dispatch.status})`,
        workItemId: dispatch.workItemId,
        metadata: {
          fallback: "pull_request.merged",
          rejected: true,
          fromStatus: dispatch.status,
          prUrl,
          dispatchId: dispatch.id,
          runnerKind: dispatch.runnerKind,
        },
      });
      return {
        kind: "no-match",
        reason: `illegal SM transition from ${dispatch.status}`,
      };
    }
    return { kind: "pr-closed-unmerged", dispatchId: dispatch.id, prUrl };
  }

  return { kind: "no-match", reason: `unhandled action ${event.action}` };
}

// ============================================================
// workflow_run handler
// ============================================================

export async function handleWorkflowRunEvent(
  event: WorkflowRunEvent,
  options: FallbackOptions = {},
): Promise<FallbackOutcome> {
  const dbImpl = options.db ?? appDb;
  if (event.action !== "completed") {
    return { kind: "no-match", reason: "workflow_run not completed" };
  }

  // Brief 218 §D5 — github-action dispatches correlate by external_run_id
  // (the workflow_run.id GitHub returns at dispatch time). Routine + Managed
  // Agent dispatches still match by claude/* branch prefix.
  const dispatchByRunId =
    typeof event.workflow_run.id === "number"
      ? await findGithubActionDispatchByRunId(
          dbImpl,
          event.repository.full_name,
          event.workflow_run.id,
        )
      : null;
  if (dispatchByRunId) {
    return await processGithubActionWorkflowRun(dbImpl, dispatchByRunId, event);
  }

  if (!event.workflow_run.head_branch.startsWith(ROUTINE_BRANCH_PREFIX)) {
    return { kind: "no-match", reason: "branch is not claude/*" };
  }

  const dispatch = await findActiveDispatchForRepo(
    dbImpl,
    event.repository.full_name,
  );
  if (!dispatch) {
    return { kind: "no-match", reason: "no active cloud-runner dispatch for repo" };
  }

  const conclusion = event.workflow_run.conclusion ?? "unknown";
  await insertActivity(dbImpl, {
    action: `${activityPrefix(dispatch.runnerKind)}_workflow_completed`,
    description: `${labelFor(dispatch.runnerKind)} CI: ${conclusion}`,
    workItemId: dispatch.workItemId,
    metadata: {
      fallback: "workflow_run.completed",
      conclusion,
      runUrl: truncate(event.workflow_run.html_url, URL_CAP),
      dispatchId: dispatch.id,
      runnerKind: dispatch.runnerKind,
    },
  });
  return { kind: "workflow-completed", dispatchId: dispatch.id, conclusion };
}

/**
 * Brief 218 §D5 — `workflow_run` event for a github-action dispatch is the
 * canonical terminal-state path (webhook-primary). Maps the conclusion to a
 * runner_dispatches.status via the same table the polling cron uses.
 */
async function processGithubActionWorkflowRun(
  dbImpl: AnyDb,
  dispatch: DispatchRow,
  event: WorkflowRunEvent,
): Promise<FallbackOutcome> {
  const conclusion = event.workflow_run.conclusion ?? "unknown";
  const mapped = mapWorkflowRunToDispatchStatus({
    status: event.workflow_run.status ?? "completed",
    conclusion: event.workflow_run.conclusion ?? null,
  });

  // Decide which transition event to fire on the dispatch's state machine.
  let smEvent:
    | "succeed"
    | "fail"
    | "cancel"
    | "timeout"
    | "rate_limit"
    | "start"
    | null = null;
  switch (mapped.status) {
    case "succeeded":
      smEvent = "succeed";
      break;
    case "failed":
      smEvent = "fail";
      break;
    case "cancelled":
      smEvent = "cancel";
      break;
    case "timed_out":
      smEvent = "timeout";
      break;
    case "running":
      smEvent = dispatch.status === "dispatched" ? "start" : null;
      break;
    default:
      smEvent = null;
  }

  if (!smEvent) {
    await insertActivity(dbImpl, {
      action: `github_action_workflow_${event.action}`,
      description: `GitHub Actions workflow ${event.action} (conclusion: ${conclusion})`,
      workItemId: dispatch.workItemId,
      metadata: {
        fallback: "workflow_run",
        conclusion,
        runUrl: truncate(event.workflow_run.html_url, URL_CAP),
        logsUrl: event.workflow_run.logs_url
          ? truncate(event.workflow_run.logs_url, URL_CAP)
          : undefined,
        dispatchId: dispatch.id,
        runnerKind: dispatch.runnerKind,
      },
    });
    return { kind: "workflow-completed", dispatchId: dispatch.id, conclusion };
  }

  const tr = transitionDispatch(
    dispatch.status as RunnerDispatchStatus,
    smEvent,
  );
  if (!tr.ok) {
    await insertActivity(dbImpl, {
      action: "github_action_late_callback_rejected",
      description: `Late workflow_run signal rejected (illegal SM transition from ${dispatch.status})`,
      workItemId: dispatch.workItemId,
      metadata: {
        fallback: "workflow_run",
        rejected: true,
        fromStatus: dispatch.status,
        conclusion,
        dispatchId: dispatch.id,
        runnerKind: dispatch.runnerKind,
      },
    });
    return {
      kind: "no-match",
      reason: `illegal SM transition from ${dispatch.status}`,
    };
  }

  const updates: Record<string, unknown> = { status: tr.to };
  if (
    smEvent === "succeed" ||
    smEvent === "fail" ||
    smEvent === "cancel" ||
    smEvent === "timeout"
  ) {
    updates.finishedAt = new Date();
  }
  if (mapped.errorReason) {
    updates.errorReason = mapped.errorReason;
  }
  if (event.workflow_run.html_url) {
    updates.externalUrl = event.workflow_run.html_url;
  }

  await dbImpl
    .update(runnerDispatches)
    .set(updates)
    .where(eq(runnerDispatches.id, dispatch.id));

  await insertActivity(dbImpl, {
    action: `github_action_workflow_${tr.to}`,
    description: `GitHub Actions workflow → ${tr.to} (conclusion: ${conclusion})`,
    workItemId: dispatch.workItemId,
    metadata: {
      fallback: "workflow_run",
      conclusion,
      runUrl: truncate(event.workflow_run.html_url, URL_CAP),
      logsUrl: event.workflow_run.logs_url
        ? truncate(event.workflow_run.logs_url, URL_CAP)
        : undefined,
      dispatchId: dispatch.id,
      runnerKind: dispatch.runnerKind,
      transitioned: { from: dispatch.status, to: tr.to },
    },
  });

  return {
    kind: "workflow-transitioned",
    dispatchId: dispatch.id,
    from: dispatch.status as RunnerDispatchStatus,
    to: tr.to,
    conclusion,
  };
}

/**
 * Brief 218 §D5 — match a workflow_run webhook to a github-action dispatch
 * by `external_run_id`. Constrained to the repo's projects to avoid cross-
 * project ID collisions (run IDs are per-repo, not globally unique).
 */
async function findGithubActionDispatchByRunId(
  dbImpl: AnyDb,
  repoFullName: string,
  runId: number,
): Promise<DispatchRow | null> {
  const projectRows = await dbImpl
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName));
  if (projectRows.length === 0) return null;
  const projectIds = projectRows.map((p) => p.id);

  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      workItemId: runnerDispatches.workItemId,
      projectId: runnerDispatches.projectId,
      status: runnerDispatches.status,
      runnerKind: runnerDispatches.runnerKind,
      externalRunId: runnerDispatches.externalRunId,
      externalUrl: runnerDispatches.externalUrl,
    })
    .from(runnerDispatches)
    .where(
      and(
        inArray(runnerDispatches.projectId, projectIds),
        eq(runnerDispatches.runnerKind, "github-action"),
        eq(runnerDispatches.externalRunId, String(runId)),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    workItemId: rows[0].workItemId,
    projectId: rows[0].projectId,
    status: rows[0].status,
    runnerKind: rows[0].runnerKind as RunnerKind,
    externalRunId: rows[0].externalRunId ?? null,
    externalUrl: rows[0].externalUrl ?? null,
  };
}

// ============================================================
// check_run handler — Brief 218 §D5 routing infrastructure (Brief 219 owns semantics)
// ============================================================

export async function handleCheckRunEvent(
  event: CheckRunEvent,
  options: FallbackOptions = {},
): Promise<FallbackOutcome> {
  const dbImpl = options.db ?? appDb;
  if (event.action !== "completed") {
    return { kind: "no-match", reason: "check_run not completed" };
  }

  // Look up active dispatches for this repo. The check_run is associated
  // with a head_sha — we have no easy correlation to a Ditto dispatch in
  // this brief beyond "is there any active cloud-runner dispatch for this
  // repo". Brief 219 will add per-check semantic interpretation
  // (Argos/Greptile gating); this brief provides the routing seam only.
  const dispatch = await findActiveDispatchForRepo(
    dbImpl,
    event.repository.full_name,
  );
  if (!dispatch) {
    return { kind: "no-match", reason: "no active cloud-runner dispatch for repo" };
  }

  await insertActivity(dbImpl, {
    action: `${activityPrefix(dispatch.runnerKind)}_check_run_completed`,
    description: `Check run completed: ${event.check_run.name} → ${event.check_run.conclusion ?? "unknown"}`,
    workItemId: dispatch.workItemId,
    metadata: {
      fallback: "check_run.completed",
      checkRunId: event.check_run.id,
      checkRunName: event.check_run.name,
      conclusion: event.check_run.conclusion,
      headSha: event.check_run.head_sha,
      runUrl: truncate(event.check_run.html_url, URL_CAP),
      dispatchId: dispatch.id,
      runnerKind: dispatch.runnerKind,
    },
  });

  return {
    kind: "check-run-routed",
    dispatchId: dispatch.id,
    checkRunName: event.check_run.name,
    conclusion: event.check_run.conclusion,
  };
}

// ============================================================
// deployment_status handler — Vercel preview surfacing (§D5)
// ============================================================

export async function handleDeploymentStatusEvent(
  event: DeploymentStatusEvent,
  options: FallbackOptions = {},
): Promise<FallbackOutcome> {
  const dbImpl = options.db ?? appDb;
  if (event.deployment_status.state !== "success") {
    return { kind: "no-match", reason: `state is ${event.deployment_status.state}` };
  }

  const dispatch = await findActiveDispatchForRepo(
    dbImpl,
    event.repository.full_name,
  );
  if (!dispatch) {
    return { kind: "no-match", reason: "no active cloud-runner dispatch for repo" };
  }

  const env = event.deployment_status.environment;
  const deployTarget =
    options.deployTargetFor?.(dispatch.projectId) ?? "Production";

  // Production deploy: Brief 220 owns this surface; no card here.
  if (env === deployTarget || env === "Production") {
    return { kind: "production-no-op", dispatchId: dispatch.id };
  }

  const previewUrl =
    event.deployment_status.environment_url ?? event.deployment_status.target_url ?? null;
  if (!previewUrl) {
    return { kind: "no-match", reason: "deployment_status without preview url" };
  }

  await insertActivity(dbImpl, {
    action: `${activityPrefix(dispatch.runnerKind)}_preview_ready`,
    description: `Vercel preview ready: ${previewUrl}`,
    workItemId: dispatch.workItemId,
    metadata: {
      fallback: "deployment_status.success",
      environment: env,
      previewUrl: truncate(previewUrl, URL_CAP),
      dispatchId: dispatch.id,
      runnerKind: dispatch.runnerKind,
    },
  });
  return {
    kind: "preview-ready",
    dispatchId: dispatch.id,
    previewUrl: truncate(previewUrl, URL_CAP),
  };
}

// ============================================================
// Shared lookup helpers
// ============================================================

interface DispatchRow {
  id: string;
  workItemId: string;
  projectId: string;
  status: string;
  runnerKind: RunnerKind;
  externalRunId: string | null;
  externalUrl: string | null;
}

const CLOUD_RUNNER_KINDS: ReadonlyArray<RunnerKind> = [
  "claude-code-routine",
  "claude-managed-agent",
  "github-action",
];

interface FindDispatchOptions {
  /** Include terminal rows (Brief 216 §D4 late-callback warning path). */
  includeTerminal?: boolean;
  /** Prefer a row whose externalUrl already matches — branch correlation. */
  preferUrl?: string;
  /**
   * Restrict to specific runner kinds (Brief 218 §D5 — non-claude/* PR
   * events should only match github-action dispatches because those are the
   * only kind whose workflow may open user-named branches).
   */
  onlyKinds?: ReadonlyArray<RunnerKind>;
}

async function findDispatchForRepo(
  dbImpl: AnyDb,
  repoFullName: string,
  options: FindDispatchOptions = {},
): Promise<DispatchRow | null> {
  const projectRows = await dbImpl
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName));
  if (projectRows.length === 0) return null;

  const projectIds = projectRows.map((p) => p.id);
  const kindsFilter = options.onlyKinds ?? CLOUD_RUNNER_KINDS;

  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      workItemId: runnerDispatches.workItemId,
      projectId: runnerDispatches.projectId,
      status: runnerDispatches.status,
      runnerKind: runnerDispatches.runnerKind,
      externalRunId: runnerDispatches.externalRunId,
      externalUrl: runnerDispatches.externalUrl,
      createdAt: runnerDispatches.createdAt,
    })
    .from(runnerDispatches)
    .where(
      and(
        inArray(runnerDispatches.projectId, projectIds),
        inArray(runnerDispatches.runnerKind, [...kindsFilter]),
      ),
    );

  const toRow = (r: (typeof rows)[number]): DispatchRow => ({
    id: r.id,
    workItemId: r.workItemId,
    projectId: r.projectId,
    status: r.status,
    runnerKind: r.runnerKind as RunnerKind,
    externalRunId: r.externalRunId ?? null,
    externalUrl: r.externalUrl ?? null,
  });

  // Branch correlation: prefer a dispatch whose externalUrl already matches
  // the PR url. Mitigates cross-wiring when concurrent dispatches share a repo.
  if (options.preferUrl) {
    const exactActive = rows.find(
      (r) =>
        r.externalUrl === options.preferUrl &&
        (r.status === "dispatched" || r.status === "running"),
    );
    if (exactActive) return toRow(exactActive);
    if (options.includeTerminal) {
      const exactAny = rows.find((r) => r.externalUrl === options.preferUrl);
      if (exactAny) return toRow(exactAny);
    }
  }

  const active = rows
    .filter((r) => r.status === "dispatched" || r.status === "running")
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  if (active.length > 0) return toRow(active[0]);

  if (options.includeTerminal) {
    const recent = rows.sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
    if (recent.length > 0) return toRow(recent[0]);
  }

  return null;
}

/** Back-compat alias — kept so existing callers don't need to be updated. */
const findActiveDispatchForRepo = (
  dbImpl: AnyDb,
  repoFullName: string,
): Promise<DispatchRow | null> => findDispatchForRepo(dbImpl, repoFullName);

/**
 * Brief 217 §D6 — per-kind deep-link to the live session URL. Only the
 * URL shape differs across cloud runner kinds.
 */
export function deepLinkForDispatch(
  runnerKind: RunnerKind,
  externalRunId: string | null,
  fallbackUrl?: string | null,
  context?: { repoFullName?: string },
): string | null {
  if (!externalRunId) return fallbackUrl ?? null;
  switch (runnerKind) {
    case "claude-code-routine":
      return fallbackUrl ?? `https://code.claude.com/session/${externalRunId}`;
    case "claude-managed-agent":
      return `https://platform.claude.com/sessions/${externalRunId}`;
    case "github-action":
      // Brief 218 §D5 — `https://github.com/<owner>/<repo>/actions/runs/<id>`.
      // Repo is per-runner-config; the caller supplies it via context (the
      // dispatch row's project / runner_config holds it). Falls back to the
      // already-stored externalUrl when the caller doesn't provide repo.
      if (context?.repoFullName) {
        return `https://github.com/${context.repoFullName}/actions/runs/${externalRunId}`;
      }
      return fallbackUrl ?? null;
    default:
      return fallbackUrl ?? null;
  }
}

interface ActivityWrite {
  action: string;
  description: string;
  workItemId: string;
  metadata: Record<string, unknown>;
}

async function insertActivity(
  dbImpl: AnyDb,
  row: ActivityWrite,
): Promise<void> {
  await dbImpl.insert(activities).values({
    action: row.action,
    description: row.description,
    actorType: "github-webhook",
    entityType: "work_item",
    entityId: row.workItemId,
    metadata: row.metadata,
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** Brief 217 §D6 / Brief 218 §D5 — kind-aware activity-action prefix. */
function activityPrefix(kind: RunnerKind): string {
  if (kind === "claude-managed-agent") return "managed_agent";
  if (kind === "github-action") return "github_action";
  return "routine";
}

/** Kind-aware label for human-readable activity descriptions. */
function labelFor(kind: RunnerKind): string {
  if (kind === "claude-managed-agent") return "Managed Agent";
  if (kind === "github-action") return "GitHub Actions";
  return "Routine";
}

// ============================================================
// Webhook subscription registration helper
// ============================================================

/**
 * Brief 216 §D4 / Brief 217 §D6 — collect the subscription declaration.
 * Boot code calls this to know which events to register with the GitHub
 * integration. Identical event set across both cloud kinds.
 */
export const CLOUD_RUNNER_FALLBACK_EVENTS = [
  "pull_request",
  "workflow_run",
  "check_run",
  "deployment_status",
] as const;

/** Backwards-compatible alias — Brief 216 name. */
export const ROUTINE_FALLBACK_EVENTS = CLOUD_RUNNER_FALLBACK_EVENTS;

/**
 * Returns true when at least one project_runner of a cloud kind
 * (claude-code-routine OR claude-managed-agent) exists.
 */
export async function hasAnyCloudRunnerConfigured(
  options: { db?: AnyDb } = {},
): Promise<boolean> {
  const dbImpl = options.db ?? appDb;
  const rows = await dbImpl
    .select({ id: projectRunners.id })
    .from(projectRunners)
    .where(
      or(
        eq(projectRunners.kind, "claude-code-routine"),
        eq(projectRunners.kind, "claude-managed-agent"),
        eq(projectRunners.kind, "github-action"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Backwards-compatible alias — Brief 216 helper. */
export const hasAnyRoutineRunnerConfigured = hasAnyCloudRunnerConfigured;
