/**
 * GitHub fallback handler for claude-code-routine — Brief 216 §D4.
 *
 * Pure function callable by a webhook listener (or directly from tests).
 * Subscribes to the `pull_request`, `workflow_run`, and `deployment_status`
 * events on every repo configured in any project_runner of kind
 * `claude-code-routine`. Provides terminal-state resolution for the runner
 * even when the in-prompt callback never fires (e.g., Ditto down at session
 * end, beta API drift, network failure).
 *
 * Branch matching: routines open PRs on `claude/*` branches by Anthropic
 * default. The handler matches by (repo, branch-prefix, dispatch-status) —
 * not by an exact branch name, since the routine session id and the GitHub
 * branch name are separate identifiers.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  transitionDispatch,
  type RunnerDispatchStatus,
} from "@ditto/core";
import { db as appDb } from "../../db";
import * as schema from "../../db/schema";
import {
  runnerDispatches,
  projects,
  activities,
  projectRunners,
} from "../../db/schema";

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
    conclusion: "success" | "failure" | "cancelled" | "skipped" | "neutral" | null;
    head_branch: string;
    html_url: string;
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
  | { kind: "workflow-completed"; dispatchId: string; conclusion: string };

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
  if (!event.pull_request.head.ref.startsWith(ROUTINE_BRANCH_PREFIX)) {
    return { kind: "no-match", reason: "branch is not claude/*" };
  }

  const dispatch = await findActiveDispatchForRepo(
    dbImpl,
    event.repository.full_name,
  );
  if (!dispatch) {
    return { kind: "no-match", reason: "no active routine dispatch for repo" };
  }

  const prUrl = truncate(event.pull_request.html_url, URL_CAP);

  if (event.action === "opened" || event.action === "synchronize") {
    await dbImpl
      .update(runnerDispatches)
      .set({ externalUrl: prUrl })
      .where(eq(runnerDispatches.id, dispatch.id));
    await insertActivity(dbImpl, {
      action: "routine_pr_opened",
      description: `Routine PR opened: ${prUrl}`,
      workItemId: dispatch.workItemId,
      metadata: { fallback: "pull_request.opened", prUrl, dispatchId: dispatch.id },
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
          action: "routine_pr_merged",
          description: `Routine PR merged: ${prUrl}`,
          workItemId: dispatch.workItemId,
          metadata: { fallback: "pull_request.merged", prUrl, dispatchId: dispatch.id },
        });
        return { kind: "pr-merged", dispatchId: dispatch.id, prUrl };
      }
      // Late callback / illegal transition — log & return no-match-shape.
      await insertActivity(dbImpl, {
        action: "routine_late_callback_rejected",
        description: `Late PR-merged signal rejected (illegal SM transition from ${dispatch.status})`,
        workItemId: dispatch.workItemId,
        metadata: {
          fallback: "pull_request.merged",
          rejected: true,
          fromStatus: dispatch.status,
          prUrl,
        },
      });
      return { kind: "no-match", reason: `illegal SM transition from ${dispatch.status}` };
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
  if (!event.workflow_run.head_branch.startsWith(ROUTINE_BRANCH_PREFIX)) {
    return { kind: "no-match", reason: "branch is not claude/*" };
  }

  const dispatch = await findActiveDispatchForRepo(
    dbImpl,
    event.repository.full_name,
  );
  if (!dispatch) {
    return { kind: "no-match", reason: "no active routine dispatch for repo" };
  }

  const conclusion = event.workflow_run.conclusion ?? "unknown";
  await insertActivity(dbImpl, {
    action: "routine_workflow_completed",
    description: `Routine CI: ${conclusion}`,
    workItemId: dispatch.workItemId,
    metadata: {
      fallback: "workflow_run.completed",
      conclusion,
      runUrl: truncate(event.workflow_run.html_url, URL_CAP),
      dispatchId: dispatch.id,
    },
  });
  return { kind: "workflow-completed", dispatchId: dispatch.id, conclusion };
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
    return { kind: "no-match", reason: "no active routine dispatch for repo" };
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
    action: "routine_preview_ready",
    description: `Vercel preview ready: ${previewUrl}`,
    workItemId: dispatch.workItemId,
    metadata: {
      fallback: "deployment_status.success",
      environment: env,
      previewUrl: truncate(previewUrl, URL_CAP),
      dispatchId: dispatch.id,
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
}

async function findActiveDispatchForRepo(
  dbImpl: AnyDb,
  repoFullName: string,
): Promise<DispatchRow | null> {
  // Find projects matching the repo name (githubRepo column).
  const projectRows = await dbImpl
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName));
  if (projectRows.length === 0) return null;

  const projectIds = projectRows.map((p) => p.id);

  // Find an active routine dispatch for any of those projects. "Active" =
  // status in {dispatched, running} — we don't act on terminal rows.
  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      workItemId: runnerDispatches.workItemId,
      projectId: runnerDispatches.projectId,
      status: runnerDispatches.status,
      createdAt: runnerDispatches.createdAt,
    })
    .from(runnerDispatches)
    .where(
      and(
        inArray(runnerDispatches.projectId, projectIds),
        eq(runnerDispatches.runnerKind, "claude-code-routine"),
      ),
    );

  // Pick the most recent active dispatch (loose match — branch correlation
  // would require tracking the routine's GitHub branch on dispatch, which
  // Anthropic's preview API doesn't expose at fire time).
  const active = rows
    .filter((r) => r.status === "dispatched" || r.status === "running")
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return active[0] ?? null;
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

// ============================================================
// Webhook subscription registration helper
// ============================================================

/**
 * Brief 216 §D4 — collect the subscription declaration. Boot code calls
 * this to know which events to register with the GitHub integration.
 */
export const ROUTINE_FALLBACK_EVENTS = [
  "pull_request",
  "workflow_run",
  "deployment_status",
] as const;

/**
 * Returns true when at least one project_runner of kind `claude-code-routine`
 * exists. Boot code can short-circuit subscription registration if no project
 * has a routine configured.
 */
export async function hasAnyRoutineRunnerConfigured(
  options: { db?: AnyDb } = {},
): Promise<boolean> {
  const dbImpl = options.db ?? appDb;
  const rows = await dbImpl
    .select({ id: projectRunners.id })
    .from(projectRunners)
    .where(eq(projectRunners.kind, "claude-code-routine"))
    .limit(1);
  return rows.length > 0;
}
