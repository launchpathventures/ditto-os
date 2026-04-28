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
  transitionBriefState,
  buildRunnerDispatchCard,
  kindToMode,
  type BriefState,
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
  workItems,
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
    /** Brief 220 D2 — `failure`/`error` events carry a free-text description. */
    description?: string | null;
  };
  /**
   * Brief 220 D2.1 (Reviewer-fix H1) — `id` and `workflow_run_id` are
   * always present in real GitHub `deployment_status` payloads but the
   * earlier (Brief 216) shape only typed `ref`. Widened here so the
   * production-deploy handler can correlate the deploy event back to
   * the workflow run that created the deployment (used for the GitHub-
   * Mobile deep-link). Both are typed `optional | null` so the handler
   * gracefully falls back when GitHub omits them (e.g., legacy deploys
   * not driven by Actions).
   */
  deployment: {
    ref: string;
    id?: number;
    workflow_run_id?: number | null;
  };
  repository: { full_name: string };
}

export type FallbackOutcome =
  | { kind: "no-match"; reason: string }
  | { kind: "pr-opened"; dispatchId: string; prUrl: string }
  | { kind: "pr-merged"; dispatchId: string; prUrl: string }
  | { kind: "pr-closed-unmerged"; dispatchId: string; prUrl: string }
  | { kind: "preview-ready"; dispatchId: string; previewUrl: string }
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
    }
  // Brief 220 D2 — production-deploy lifecycle outcomes. Replace the prior
  // `production-no-op` placeholder with five differentiated variants.
  | {
      kind: "deploy-approval-pending";
      dispatchId: string;
      runUrl: string | null;
    }
  | { kind: "deploy-in-progress"; dispatchId: string }
  | { kind: "deployed"; dispatchId: string; prodUrl: string | null }
  | { kind: "deploy-failed"; dispatchId: string; errorReason: string | null }
  | { kind: "deploy-state-no-op"; dispatchId: string; reason: string };

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
    const card = buildRunnerDispatchCard({
      workItemId: dispatch.workItemId,
      title: `${labelFor(dispatch.runnerKind as RunnerKind)} — PR opened`,
      runnerKind: dispatch.runnerKind as RunnerKind,
      runnerMode: kindToMode(dispatch.runnerKind as RunnerKind),
      status: "running",
      attemptIndex: dispatch.attemptIndex,
      externalUrl: sessionUrl,
      prUrl,
    });
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
      contentBlock: card as unknown as Record<string, unknown>,
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
        const card = buildRunnerDispatchCard({
          workItemId: dispatch.workItemId,
          title: `${labelFor(dispatch.runnerKind as RunnerKind)} finished — PR merged`,
          runnerKind: dispatch.runnerKind as RunnerKind,
          runnerMode: kindToMode(dispatch.runnerKind as RunnerKind),
          status: "succeeded",
          attemptIndex: dispatch.attemptIndex,
          externalUrl: sessionUrl,
          prUrl,
        });
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
          contentBlock: card as unknown as Record<string, unknown>,
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
      attemptIndex: runnerDispatches.attemptIndex,
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
    attemptIndex: rows[0].attemptIndex ?? 0,
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
// deployment_status handler — Vercel preview surfacing (Brief 216 §D5)
// + production deploy gate (Brief 220 §D2)
// ============================================================

/**
 * Brief 220 D2.2 (Reviewer-fix L6) — sanitises GitHub `repo.full_name`
 * before inlining into URLs. The source is HMAC-verified in
 * `packages/web/app/api/v1/integrations/github/webhook/route.ts`, so an
 * attacker cannot forge a malicious payload — but the regex is defence
 * in depth: rejects path-traversal characters, query strings, and
 * fragments that would break the deep-link.
 */
const REPO_FULL_NAME_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

interface MobileApproveActionOk {
  ok: true;
  action: { kind: "external_link"; url: string; label: string };
}
interface MobileApproveActionRejected {
  ok: false;
  reason: string;
}
type MobileApproveActionResult = MobileApproveActionOk | MobileApproveActionRejected;

/**
 * Brief 220 D3 — composes the GitHub-Mobile deep-link `ActionBlock`
 * payload. When `workflow_run_id` is present, deep-links to the
 * workflow run page (GitHub Mobile auto-detects deployment-review-
 * pending and surfaces the approve dialog). When absent (Reviewer-fix
 * H1 fallback path), falls back to the project's repo `/deployments`
 * page — universal across GitHub-Mobile-installed and mobile-web-only.
 */
export function buildMobileApproveAction(
  repoFullName: string,
  workflowRunId: number | null | undefined,
): MobileApproveActionResult {
  if (!REPO_FULL_NAME_REGEX.test(repoFullName)) {
    return { ok: false, reason: "invalid-repo-full-name" };
  }
  const url =
    workflowRunId != null
      ? `https://github.com/${repoFullName}/actions/runs/${workflowRunId}`
      : `https://github.com/${repoFullName}/deployments`;
  return {
    ok: true,
    action: {
      kind: "external_link",
      url,
      label: "Approve deploy in GitHub Mobile",
    },
  };
}

export async function handleDeploymentStatusEvent(
  event: DeploymentStatusEvent,
  options: FallbackOptions = {},
): Promise<FallbackOutcome> {
  const dbImpl = options.db ?? appDb;

  // Brief 220 D2.2 (Reviewer-fix H2 + post-build M2) — `deployment_status`
  // events fire post-runner-completion (the runner's PR has merged before
  // the deploy starts), so the matching `runner_dispatches` row is
  // `succeeded`. Both the production and the preview paths use
  // `includeTerminal: true` and pick the most-recent-by-createdAt row
  // regardless of status. This aligns with the M5 non-goal "the most-
  // recently-shipped work item transitions" and avoids the M2 mis-
  // correlation bug where an in-flight dispatch shadows a more-recent
  // terminal dispatch for the just-merged PR.
  //
  // Side effect on the preview branch: when an in-flight dispatch coexists
  // with a more-recently-created terminal dispatch in the same repo, the
  // preview event correlates to the more-recent one. This matches the
  // production branch's semantics and is a strict improvement on Brief
  // 216's active-only lookup (which would silently no-match in that
  // scenario). Documented as a deliberate behavior alignment, not drift.
  const dispatch = await findDispatchForRepo(
    dbImpl,
    event.repository.full_name,
    { includeTerminal: true },
  );
  if (!dispatch) {
    return {
      kind: "no-match",
      reason: "no cloud-runner dispatch for repo",
    };
  }

  const env = event.deployment_status.environment;
  const deployTarget =
    options.deployTargetFor?.(dispatch.projectId) ?? "Production";
  const isProduction = env === deployTarget || env === "Production";

  if (isProduction) {
    return processProductionDeployStatus(dbImpl, dispatch, event);
  }

  // Non-production: Brief 216 §D5 preview-card path (unchanged).
  if (event.deployment_status.state !== "success") {
    return {
      kind: "no-match",
      reason: `non-production state is ${event.deployment_status.state}`,
    };
  }

  const previewUrl =
    event.deployment_status.environment_url ??
    event.deployment_status.target_url ??
    null;
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
// Production deploy lifecycle (Brief 220 §D2)
// ============================================================

interface DeployStateMapping {
  target: BriefState;
  activitySuffix: string;
  outcomeKind:
    | "deploy-approval-pending"
    | "deploy-in-progress"
    | "deployed"
    | "deploy-failed";
  description: (env: string, urlOrError: string | null) => string;
}

function mapDeploymentStateToBriefState(
  state: string,
): DeployStateMapping | null {
  // GitHub `deployment_status.state` enum (per the webhook payload spec):
  // `pending | queued | in_progress | success | failure | error | inactive`.
  // The actionable subset is `queued | in_progress | success | failure | error`;
  // `pending` and `inactive` deliberately fall through to `null` (no card,
  // no transition). Any future GitHub addition (e.g., a new lifecycle state)
  // also falls through to `null` until the handler is updated — safe default.
  switch (state) {
    case "queued":
      return {
        target: "deploying",
        activitySuffix: "deploy_approval_pending",
        outcomeKind: "deploy-approval-pending",
        description: () => "Deploy approval pending",
      };
    case "in_progress":
      return {
        target: "deploying",
        activitySuffix: "deploy_in_progress",
        outcomeKind: "deploy-in-progress",
        description: (env) => `Deploying to ${env}`,
      };
    case "success":
      return {
        target: "deployed",
        activitySuffix: "deployed",
        outcomeKind: "deployed",
        description: (_env, url) =>
          url ? `Deployed to production: ${url}` : "Deployed to production",
      };
    case "failure":
    case "error":
      return {
        target: "deploy_failed",
        activitySuffix: "deploy_failed",
        outcomeKind: "deploy-failed",
        description: (_env, err) =>
          err ? `Deploy failed: ${err}` : "Deploy failed",
      };
    case "pending":
    case "inactive":
      return null;
    default:
      // Future GitHub additions land here. Safe default: no transition, no
      // card. Surfaces as a `deploy-state-no-op` outcome.
      return null;
  }
}

const ERROR_REASON_CAP = 4 * 1024;

async function processProductionDeployStatus(
  dbImpl: AnyDb,
  dispatch: DispatchRow,
  event: DeploymentStatusEvent,
): Promise<FallbackOutcome> {
  const state = event.deployment_status.state;
  const env = event.deployment_status.environment;

  const mapping = mapDeploymentStateToBriefState(state);
  if (!mapping) {
    // pending / inactive — no card, no transition
    return {
      kind: "deploy-state-no-op",
      dispatchId: dispatch.id,
      reason: `production state ${state} is not actionable`,
    };
  }

  // Read work item's current briefState. Deploy gate applies to project-
  // flavored items only; non-project items have NULL briefState.
  const wiRows = await dbImpl
    .select({ briefState: workItems.briefState })
    .from(workItems)
    .where(eq(workItems.id, dispatch.workItemId))
    .limit(1);
  if (wiRows.length === 0) {
    return { kind: "no-match", reason: "work item not found" };
  }
  const currentState = wiRows[0].briefState;
  if (!currentState) {
    return {
      kind: "no-match",
      reason: "non-project work item; deploy gate not applicable",
    };
  }

  // Resolve URL fields used by the activity payload.
  const prodUrl =
    event.deployment_status.environment_url ??
    event.deployment_status.target_url ??
    null;
  const errorReason =
    state === "failure" || state === "error"
      ? truncate(
          event.deployment_status.description ??
            event.deployment_status.target_url ??
            `GitHub deployment_status: ${state}`,
          ERROR_REASON_CAP,
        )
      : null;

  // Brief 220 D3 — compose the GitHub-Mobile deep-link payload for `queued`.
  const mobileApproveResult =
    mapping.outcomeKind === "deploy-approval-pending"
      ? buildMobileApproveAction(
          event.repository.full_name,
          event.deployment.workflow_run_id ?? null,
        )
      : null;

  // Attempt the briefState transition.
  const tr = transitionBriefState(currentState, mapping.target);
  if (!tr.ok) {
    // Idempotent replay or illegal transition. Audit but no card.
    await insertActivity(dbImpl, {
      action: `${activityPrefix(dispatch.runnerKind)}_${mapping.activitySuffix}_rejected`,
      description: `Late or duplicate ${mapping.activitySuffix} signal — illegal SM transition from ${currentState} → ${mapping.target}`,
      workItemId: dispatch.workItemId,
      metadata: {
        fallback: `deployment_status.${state}`,
        guardWaived: true,
        rejected: true,
        transitionRejected: true,
        fromBriefState: currentState,
        attemptedBriefState: mapping.target,
        environment: env,
        dispatchId: dispatch.id,
        runnerKind: dispatch.runnerKind,
        ...(event.deployment.workflow_run_id != null
          ? { workflowRunId: event.deployment.workflow_run_id }
          : {}),
        ...(event.deployment.id != null
          ? { deploymentId: event.deployment.id }
          : {}),
      },
    });
    return {
      kind: "deploy-state-no-op",
      dispatchId: dispatch.id,
      reason: tr.reason,
    };
  }

  // Apply the transition.
  const now = new Date();
  await dbImpl
    .update(workItems)
    .set({
      briefState: tr.to,
      stateChangedAt: now,
      updatedAt: now,
    })
    .where(eq(workItems.id, dispatch.workItemId));

  // Out-of-order detection (Reviewer-fix H3 + post-build M1): a
  // `success`/`failure` event arrived before the corresponding
  // `queued`/`in_progress` for the same deployment. Two cases:
  //  1. `shipped → deployed | deploy_failed` (initial deploy out-of-order)
  //  2. `deploy_failed → deployed` (retry success out-of-order — the retry's
  //     `success` event arrived before its `queued` event)
  // Both skip the informational `deploying` intermediate. Forensic audit
  // distinguishes "retry happened normally" from "retry success arrived
  // before retry queued" via this flag.
  const outOfOrder =
    (currentState === "shipped" &&
      (tr.to === "deployed" || tr.to === "deploy_failed")) ||
    (currentState === "deploy_failed" && tr.to === "deployed");

  // Build activity metadata.
  const metadata: Record<string, unknown> = {
    fallback: `deployment_status.${state}`,
    guardWaived: true,
    environment: env,
    dispatchId: dispatch.id,
    runnerKind: dispatch.runnerKind,
    transitioned: { from: currentState, to: tr.to },
    ...(prodUrl ? { prodUrl: truncate(prodUrl, URL_CAP) } : {}),
    ...(errorReason ? { error: errorReason } : {}),
    ...(outOfOrder ? { outOfOrder: true } : {}),
    ...(event.deployment.workflow_run_id != null
      ? { workflowRunId: event.deployment.workflow_run_id }
      : {}),
    ...(event.deployment.id != null
      ? { deploymentId: event.deployment.id }
      : {}),
  };

  if (mobileApproveResult) {
    if (mobileApproveResult.ok) {
      metadata.mobileApproveAction = mobileApproveResult.action;
    } else {
      // Reviewer-fix L4 — this branch is unit-tested via
      // `buildMobileApproveAction(...)` directly (see AC #13b in
      // cloud-runner-fallback.test.ts), but cannot be reached through the
      // integration path because `findDispatchForRepo` short-circuits on a
      // mismatched repo before this branch executes. Defence in depth: the
      // branch persists if the lookup-side guards ever weaken.
      metadata.urlConstructionRejected = true;
      metadata.urlConstructionRejectedReason = mobileApproveResult.reason;
    }
  }

  await insertActivity(dbImpl, {
    action: `${activityPrefix(dispatch.runnerKind)}_${mapping.activitySuffix}`,
    description: mapping.description(env, prodUrl ?? errorReason),
    workItemId: dispatch.workItemId,
    metadata,
  });

  // Build outcome.
  switch (mapping.outcomeKind) {
    case "deploy-approval-pending":
      return {
        kind: "deploy-approval-pending",
        dispatchId: dispatch.id,
        runUrl: mobileApproveResult?.ok ? mobileApproveResult.action.url : null,
      };
    case "deploy-in-progress":
      return { kind: "deploy-in-progress", dispatchId: dispatch.id };
    case "deployed":
      return {
        kind: "deployed",
        dispatchId: dispatch.id,
        prodUrl: prodUrl ? truncate(prodUrl, URL_CAP) : null,
      };
    case "deploy-failed":
      return {
        kind: "deploy-failed",
        dispatchId: dispatch.id,
        errorReason,
      };
  }
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
  attemptIndex: number;
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
      attemptIndex: runnerDispatches.attemptIndex,
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
    attemptIndex: r.attemptIndex ?? 0,
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
  /**
   * Brief 221 §D12 — optional structured ContentBlock to render this
   * activity inline as a typed card on the conversation surface. NULL
   * for activities that don't have a paired card.
   */
  contentBlock?: Record<string, unknown> | null;
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
    contentBlock: row.contentBlock ?? null,
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
