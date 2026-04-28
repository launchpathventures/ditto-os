/**
 * pauseRunnerDispatchForApproval — Brief 221 §D9.
 *
 * The first production caller of `dispatchWorkItem`. Reads the upstream
 * trust-gate decision; if it's a pause, mints a `/review/[token]` page
 * carrying the structured runner-dispatch-approval payload (selector +
 * Approve/Reject); otherwise calls dispatchWorkItem directly.
 *
 * Insight-180 stepRunId guard: required at entry. Bypassed only in
 * DITTO_TEST_MODE.
 *
 * The mint helper itself (`mintRunnerDispatchPause`) lives in
 * `packages/core/src/runner/` and is generic. This file is the
 * Ditto-product caller that hardcodes the Ditto-flavoured strings.
 */

import { eq } from "drizzle-orm";
import {
  resolveChain,
  mintRunnerDispatchPause,
  type RunnerKind,
  type RunnerMode,
  type PauseRunnerOption,
} from "@ditto/core";
import { db } from "../../db";
import {
  projects,
  projectRunners,
  workItems,
  harnessDecisions,
} from "../../db/schema";
import { dispatchWorkItem, type DispatchOutcome } from "../runner-dispatcher";
import { createReviewPage } from "../review-pages";
import type { ContentBlock } from "../content-blocks";

const TEST_MODE = process.env.DITTO_TEST_MODE === "true";

// ============================================================
// Constants — Ditto-product-flavoured form-id, action namespace, copy
// ============================================================

const RUNNER_DISPATCH_APPROVAL_FORM_ID = "runner-dispatch-approval";
const RUNNER_DISPATCH_APPROVAL_ACTION_NAMESPACE = "runner-dispatch-approval";

const DITTO_PAUSE_COPY = {
  header: "Approve dispatch",
  runnerLabel: "This work will run on:",
  forceCloudLabel: "Force cloud for this approval",
  approveLabel: "Approve & dispatch",
  rejectLabel: "Reject",
} as const;

// ============================================================
// User-facing labels for runner kinds (Designer spec §4)
// ============================================================

const KIND_LABELS: Record<RunnerKind, string> = {
  "local-mac-mini": "Mac mini",
  "claude-code-routine": "Routine",
  "claude-managed-agent": "Managed Agent",
  "github-action": "GitHub Action",
  "e2b-sandbox": "E2B Sandbox",
};

function labelForKind(kind: RunnerKind): string {
  return KIND_LABELS[kind] ?? kind;
}

// ============================================================
// Input / Output
// ============================================================

export interface PauseRunnerDispatchInput {
  /** Insight-180: required. Bypassed only in DITTO_TEST_MODE. */
  stepRunId: string;
  workItemId: string;
  processRunId: string;
  trustTier: "supervised" | "spot_checked" | "autonomous" | "critical";
  trustAction: "pause" | "advance" | "sample_pause" | "sample_advance";
}

export type PauseRunnerDispatchOutcome =
  | {
      ok: true;
      kind: "paused";
      reviewToken: string;
      reviewUrl: string;
      eligibleKinds: RunnerKind[];
    }
  | {
      ok: true;
      kind: "dispatched";
      dispatch: DispatchOutcome;
    }
  | {
      ok: true;
      kind: "criticalRejected";
      reason: "critical_tier_rejected_pre_flight";
    }
  | {
      ok: false;
      kind: "noEligibleRunner";
      reason: string;
    };

// ============================================================
// Handler
// ============================================================

/**
 * Routes the work item per the upstream trust decision.
 *
 *  - `pause` / `sample_pause` → mint review-page (D8 helper) + harness_decisions row + return reviewToken
 *  - `advance` / `sample_advance` → call dispatchWorkItem directly
 *  - `critical` → reject pre-flight per Brief 214 §D8 (not a TrustAction value
 *    today; checked via `trustTier === "critical"` since the dispatcher's
 *    TrustAction enum has only 4 values)
 */
export async function pauseRunnerDispatchForApproval(
  input: PauseRunnerDispatchInput,
): Promise<PauseRunnerDispatchOutcome> {
  // Insight-180 guard.
  if (!input.stepRunId && !TEST_MODE) {
    throw new Error(
      "pauseRunnerDispatchForApproval requires stepRunId (Insight-180 guard). Set DITTO_TEST_MODE=true to bypass in tests.",
    );
  }

  // Critical tier short-circuit (Brief 214 §D8).
  if (input.trustTier === "critical") {
    return {
      ok: true,
      kind: "criticalRejected",
      reason: "critical_tier_rejected_pre_flight",
    };
  }

  // For advance / sample_advance, no pause needed — go straight to dispatch.
  if (
    input.trustAction === "advance" ||
    input.trustAction === "sample_advance"
  ) {
    const dispatch = await dispatchWorkItem({
      stepRunId: input.stepRunId,
      workItemId: input.workItemId,
      processRunId: input.processRunId,
      trustTier: input.trustTier,
      trustAction: input.trustAction,
    });
    return { ok: true, kind: "dispatched", dispatch };
  }

  // Pause path — mint the review page.
  const workItemRows = await db
    .select()
    .from(workItems)
    .where(eq(workItems.id, input.workItemId))
    .limit(1);
  if (workItemRows.length === 0) {
    return {
      ok: false,
      kind: "noEligibleRunner",
      reason: `Work item not found: ${input.workItemId}`,
    };
  }
  const workItemRow = workItemRows[0];

  if (!workItemRow.projectId) {
    return {
      ok: false,
      kind: "noEligibleRunner",
      reason: `Work item ${input.workItemId} has no projectId — runner-dispatch pause requires a project-bound work item.`,
    };
  }

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, workItemRow.projectId))
    .limit(1);
  if (projectRows.length === 0) {
    return {
      ok: false,
      kind: "noEligibleRunner",
      reason: `Project not found: ${workItemRow.projectId}`,
    };
  }
  const projectRow = projectRows[0];

  const projectRunnerRows = await db
    .select()
    .from(projectRunners)
    .where(eq(projectRunners.projectId, projectRow.id));

  // Resolve the eligible chain via the pure core resolver.
  const resolution = resolveChain(
    {
      id: workItemRow.id,
      runnerOverride: workItemRow.runnerOverride as RunnerKind | null,
      runnerModeRequired:
        (workItemRow.runnerModeRequired as
          | "local"
          | "cloud"
          | "any"
          | null) ?? null,
    },
    {
      id: projectRow.id,
      defaultRunnerKind: projectRow.defaultRunnerKind as RunnerKind | null,
      fallbackRunnerKind:
        projectRow.fallbackRunnerKind as RunnerKind | null,
      runnerChain: projectRow.runnerChain as RunnerKind[] | null,
    },
    projectRunnerRows.map((pr) => ({
      projectId: pr.projectId,
      kind: pr.kind as RunnerKind,
      mode: pr.mode as RunnerMode,
      enabled: pr.enabled,
      lastHealthStatus: pr.lastHealthStatus as
        | "healthy"
        | "unauthenticated"
        | "rate_limited"
        | "unreachable"
        | "unknown",
    })),
  );

  if (!resolution.ok) {
    return {
      ok: false,
      kind: "noEligibleRunner",
      reason: resolution.error.message,
    };
  }

  // Build the eligible-runner option list with labels + degraded reasons.
  const runnerByKind = new Map<RunnerKind, (typeof projectRunnerRows)[number]>();
  for (const pr of projectRunnerRows) {
    runnerByKind.set(pr.kind as RunnerKind, pr);
  }

  const eligibleRunners: PauseRunnerOption[] = resolution.chain.map((kind) => {
    const pr = runnerByKind.get(kind);
    const health = pr?.lastHealthStatus ?? "unknown";
    const degradedReason =
      health === "rate_limited"
        ? "rate-limited"
        : health === "unreachable"
          ? "offline"
          : health === "unauthenticated"
            ? "needs re-auth"
            : null;
    return {
      kind,
      mode: (pr?.mode as RunnerMode) ?? (kind === "local-mac-mini" ? "local" : "cloud"),
      label: labelForKind(kind),
      degradedReason,
    };
  });

  // Mint the structured payload via the core helper.
  const blocks: ContentBlock[] = mintRunnerDispatchPause({
    workItem: {
      id: workItemRow.id,
      title:
        (workItemRow.context as { title?: string } | null)?.title ??
        workItemRow.content.split("\n")[0].slice(0, 80) ??
        "Work item",
      summary: workItemRow.content.slice(0, 500),
    },
    project: {
      id: projectRow.id,
      slug: projectRow.slug,
      name: projectRow.name,
    },
    eligibleRunners,
    modeRequired:
      (workItemRow.runnerModeRequired as "local" | "cloud" | "any" | null) ??
      null,
    formId: RUNNER_DISPATCH_APPROVAL_FORM_ID,
    actionNamespace: RUNNER_DISPATCH_APPROVAL_ACTION_NAMESPACE,
    copy: DITTO_PAUSE_COPY,
  }) as ContentBlock[];

  const created = await createReviewPage({
    userId: "founder",
    personId: "self",
    title: `Approve dispatch: ${projectRow.name}`,
    blocks,
  });

  // Audit row keyed on stepRunId per Insight-180 + Brief 215 trust-pause contract.
  await db.insert(harnessDecisions).values({
    processRunId: input.processRunId,
    stepRunId: input.stepRunId,
    trustTier: input.trustTier,
    trustAction: input.trustAction,
    reviewPattern: ["runner_dispatch_pause"],
    reviewResult: "skip",
    reviewDetails: {
      runnerPause: {
        workItemId: workItemRow.id,
        projectId: projectRow.id,
        eligibleChain: resolution.chain,
        reviewToken: created.token,
      },
    },
  });

  return {
    ok: true,
    kind: "paused",
    reviewToken: created.token,
    reviewUrl: created.url,
    eligibleKinds: resolution.chain,
  };
}
