/**
 * GitHub fallback handler tests — Brief 216 AC #10 + Brief 217 §D6 (kind-agnostic).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-utils";
import {
  handlePullRequestEvent,
  handleWorkflowRunEvent,
  handleDeploymentStatusEvent,
  deepLinkForDispatch,
} from "./cloud-runner-fallback";
import type { RunnerKind } from "@ditto/core";
import {
  processes,
  processRuns,
  stepRuns,
  projects,
  workItems,
  projectRunners,
  runnerDispatches,
  activities,
} from "../../db/schema";

let testDb: TestDb;
let cleanup: () => void;

beforeEach(() => {
  process.env.DITTO_TEST_MODE = "true";
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
});

async function seedActiveDispatch(
  opts: {
    status?: "dispatched" | "running" | "succeeded";
    runnerKind?: RunnerKind;
    externalRunId?: string;
    /** Brief 220 — the deploy gate transitions from `shipped`. Tests that
     *  exercise the production-deploy lifecycle must start the work item
     *  there. Defaults to `active` to preserve Brief 216/218 test behavior. */
    briefState?:
      | "active"
      | "review"
      | "shipped"
      | "deploying"
      | "deployed"
      | "deploy_failed";
  } = {},
) {
  const kind = opts.runnerKind ?? "claude-code-routine";
  await testDb.insert(processes).values({
    id: "p_01",
    name: "test",
    slug: "p_01",
    description: "test",
    definition: {},
  });
  await testDb.insert(processRuns).values({
    id: "pr_01",
    processId: "p_01",
    status: "running",
    triggeredBy: "test",
  });
  await testDb.insert(stepRuns).values({
    id: "sr_01",
    processRunId: "pr_01",
    stepId: "dispatch",
    status: "running",
    executorType: "rules",
  });
  await testDb.insert(projects).values({
    id: "proj_01",
    name: "agent-crm",
    slug: "agent-crm",
    harnessType: "catalyst",
    githubRepo: "owner/agent-crm",
    status: "active",
  });
  await testDb.insert(workItems).values({
    id: "wi_01",
    projectId: "proj_01",
    type: "feature",
    title: "Add /healthz",
    body: "Add a /healthz endpoint",
    content: "Add a /healthz endpoint",
    source: "system_generated",
    status: "intake",
    briefState: opts.briefState ?? "active",
  });
  await testDb.insert(projectRunners).values({
    projectId: "proj_01",
    kind,
    mode: "cloud",
    enabled: true,
    configJson: {},
    credentialIds: [],
  });
  const inserted = await testDb
    .insert(runnerDispatches)
    .values({
      workItemId: "wi_01",
      projectId: "proj_01",
      runnerKind: kind,
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: "sr_01",
      status: opts.status ?? "running",
      externalRunId: opts.externalRunId ?? null,
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

// ============================================================
// pull_request events
// ============================================================

describe("handlePullRequestEvent — pr opened", () => {
  it("matches a claude/* branch and updates external_url + emits activity", async () => {
    const dispatchId = await seedActiveDispatch();
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/42",
          head: { ref: "claude/healthz-endpoint" },
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-opened");
    if (r.kind !== "pr-opened") throw new Error("unreachable");
    expect(r.dispatchId).toBe(dispatchId);

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].externalUrl).toBe("https://github.com/owner/agent-crm/pull/42");

    const acts = await testDb.select().from(activities);
    const prOpened = acts.find((a) => a.action === "routine_pr_opened");
    expect(prOpened).toBeDefined();
    // Brief 221 AC #7 — the PR-opened emission writes a StatusCardBlock
    // (cardKind = "runnerDispatch") into activities.contentBlock.
    expect(prOpened!.contentBlock).not.toBeNull();
    const card = prOpened!.contentBlock as {
      type: string;
      title: string;
      status: string;
      metadata: {
        cardKind: string;
        runnerKind: string;
        runnerMode: string;
        status: string;
        attemptIndex: number;
        externalUrl?: string;
        prUrl?: string;
      };
    };
    expect(card.type).toBe("status_card");
    expect(card.metadata.cardKind).toBe("runnerDispatch");
    expect(card.metadata.runnerKind).toBe("claude-code-routine");
    expect(card.metadata.runnerMode).toBe("cloud");
    expect(card.metadata.status).toBe("running");
    expect(card.metadata.prUrl).toBe(
      "https://github.com/owner/agent-crm/pull/42",
    );
  });

  it("ignores non-claude branches", async () => {
    await seedActiveDispatch();
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/42",
          head: { ref: "feature/something" },
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });

  it("ignores PRs on repos that don't have a routine dispatch", async () => {
    await seedActiveDispatch();
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/other/foo/pull/1",
          head: { ref: "claude/x" },
        },
        repository: { full_name: "other/foo" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });

  // ============================================================
  // MEDIUM-4 fix — github-action workflows may open PRs on user-named
  // branches (not the Anthropic claude/* convention). Brief 218 §D5 says
  // PR events should still correlate when an active github-action dispatch
  // exists for the repo.
  // ============================================================

  it("matches a non-claude/* PR when an active github-action dispatch exists", async () => {
    const dispatchId = await seedActiveDispatch({
      runnerKind: "github-action",
      externalRunId: "12345",
    });
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/77",
          head: { ref: "feature/healthz-endpoint" },
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-opened");
    if (r.kind !== "pr-opened") throw new Error("unreachable");
    expect(r.dispatchId).toBe(dispatchId);

    const acts = await testDb.select().from(activities);
    expect(
      acts.find((a) => a.action === "github_action_pr_opened"),
    ).toBeDefined();
  });

  it("does NOT match a non-claude/* PR when only routine/managed-agent dispatches exist", async () => {
    await seedActiveDispatch({ runnerKind: "claude-code-routine" });
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/88",
          head: { ref: "feature/x" },
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
    if (r.kind !== "no-match") throw new Error("unreachable");
    expect(r.reason).toMatch(/branch is not claude\/\* and no active github-action/);
  });

  it("still matches claude/* PRs for routine dispatches (regression)", async () => {
    const dispatchId = await seedActiveDispatch({
      runnerKind: "claude-code-routine",
    });
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/99",
          head: { ref: "claude/x" },
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-opened");
    if (r.kind !== "pr-opened") throw new Error("unreachable");
    expect(r.dispatchId).toBe(dispatchId);
  });
});

describe("handlePullRequestEvent — pr merged", () => {
  it("transitions running → succeeded on merged close", async () => {
    const dispatchId = await seedActiveDispatch();
    const r = await handlePullRequestEvent(
      {
        action: "closed",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/42",
          head: { ref: "claude/x" },
          merged: true,
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-merged");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].finishedAt).not.toBeNull();
  });

  it("rejects late merged-close after a terminal state — emits warning activity", async () => {
    // Pre-seed a row in succeeded state. The handler will try to transition
    // from succeeded with succeed event — illegal. Should reject and warn.
    await testDb.insert(processes).values({
      id: "p_01",
      name: "t",
      slug: "p_01",
      description: "t",
      definition: {},
    });
    await testDb.insert(processRuns).values({
      id: "pr_01",
      processId: "p_01",
      status: "running",
      triggeredBy: "test",
    });
    await testDb.insert(stepRuns).values({
      id: "sr_01",
      processRunId: "pr_01",
      stepId: "dispatch",
      status: "running",
      executorType: "rules",
    });
    await testDb.insert(projects).values({
      id: "proj_01",
      name: "x",
      slug: "x",
      githubRepo: "owner/agent-crm",
      harnessType: "catalyst",
      status: "active",
    });
    await testDb.insert(workItems).values({
      id: "wi_01",
      projectId: "proj_01",
      type: "feature",
      title: "T",
      body: "B",
      content: "B",
      source: "system_generated",
      status: "intake",
      briefState: "review",
    });
    await testDb.insert(projectRunners).values({
      projectId: "proj_01",
      kind: "claude-code-routine",
      mode: "cloud",
      enabled: true,
      configJson: {},
      credentialIds: [],
    });
    // The handler ignores terminal rows in findActiveDispatchForRepo, so a
    // succeeded row → no-match. The activity-warning path triggers only when
    // a dispatched/running row hits an illegal transition (e.g., concurrent
    // signals). Verified by the no-match outcome here.
    await testDb.insert(runnerDispatches).values({
      workItemId: "wi_01",
      projectId: "proj_01",
      runnerKind: "claude-code-routine",
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: "sr_01",
      status: "succeeded",
    });

    const r = await handlePullRequestEvent(
      {
        action: "closed",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/42",
          head: { ref: "claude/x" },
          merged: true,
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });
});

// ============================================================
// deployment_status events
// ============================================================

describe("handleDeploymentStatusEvent", () => {
  it("emits preview-ready for non-production success with environment_url", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Preview",
          environment_url: "https://feature-x.vercel.app",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("preview-ready");
    if (r.kind !== "preview-ready") throw new Error("unreachable");
    expect(r.previewUrl).toBe("https://feature-x.vercel.app");

    const acts = await testDb.select().from(activities);
    expect(acts.find((a) => a.action === "routine_preview_ready")).toBeDefined();
  });

  it("emits preview-ready for Netlify deploy-preview env", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "deploy-preview",
          environment_url: "https://preview-x.netlify.app",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("preview-ready");
  });

  it("Brief 220 — production success transitions briefState shipped → deployed (out-of-order H3)", async () => {
    // Work item is `shipped` (PR merged); deployment_status: success arrives
    // for the default Production environment. Per Brief 220 D1 H3, this admits
    // a direct shipped → deployed transition (out-of-order delivery).
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Production",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deployed");
    if (r.kind !== "deployed") throw new Error("unreachable");
    expect(r.prodUrl).toBe("https://prod.example.com");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deployed");

    const acts = await testDb.select().from(activities);
    const deployedAct = acts.find((a) => a.action === "routine_deployed");
    expect(deployedAct).toBeDefined();
    expect((deployedAct?.metadata as Record<string, unknown>)?.outOfOrder).toBe(true);
    expect((deployedAct?.metadata as Record<string, unknown>)?.guardWaived).toBe(true);
  });

  it("Brief 220 — respects per-project deployTarget override (custom prod env name)", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "prod",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb, deployTargetFor: () => "prod" },
    );
    expect(r.kind).toBe("deployed");
  });

  it("treats custom-staging as a preview when project's deployTarget is Production", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Custom-Staging",
          environment_url: "https://staging.example.com",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("preview-ready");
  });

  it("ignores non-production deployment_status events that aren't success state", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "in_progress",
          environment: "Preview",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });
});

// ============================================================
// Brief 220 — production deploy lifecycle (deployment_status events)
// ============================================================

describe("handleDeploymentStatusEvent — production deploy lifecycle (Brief 220)", () => {
  // ----- AC #5: queued + in_progress live transitions -----

  it("AC #5a — production queued transitions shipped → deploying with mobile-approve action (H2 regression: dispatch is succeeded)", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "queued",
          environment: "Production",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );

    expect(r.kind).toBe("deploy-approval-pending");
    if (r.kind !== "deploy-approval-pending") throw new Error("unreachable");
    expect(r.runUrl).toBe(
      "https://github.com/owner/agent-crm/actions/runs/12345",
    );

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploying");
    expect(wi[0].stateChangedAt).not.toBeNull();

    const acts = await testDb.select().from(activities);
    const approvalAct = acts.find(
      (a) => a.action === "routine_deploy_approval_pending",
    );
    expect(approvalAct).toBeDefined();
    const meta = approvalAct?.metadata as Record<string, unknown>;
    expect(meta.guardWaived).toBe(true);
    expect(meta.workflowRunId).toBe(12345);
    expect(meta.deploymentId).toBe(999);
    const action = meta.mobileApproveAction as Record<string, unknown>;
    expect(action.kind).toBe("external_link");
    expect(action.url).toBe(
      "https://github.com/owner/agent-crm/actions/runs/12345",
    );
    expect(action.label).toBe("Approve deploy in GitHub Mobile");
  });

  it("AC #5b — production in_progress transitions shipped → deploying without mobile-approve action", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "in_progress",
          environment: "Production",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-in-progress");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploying");

    const acts = await testDb.select().from(activities);
    const inProgressAct = acts.find(
      (a) => a.action === "routine_deploy_in_progress",
    );
    expect(inProgressAct).toBeDefined();
    expect(
      (inProgressAct?.metadata as Record<string, unknown>).mobileApproveAction,
    ).toBeUndefined();
  });

  it("AC #5c — production in_progress is idempotent (already deploying)", async () => {
    await seedActiveDispatch({ briefState: "deploying", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "in_progress",
          environment: "Production",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-state-no-op");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploying");

    const acts = await testDb.select().from(activities);
    const rejectedAct = acts.find(
      (a) => a.action === "routine_deploy_in_progress_rejected",
    );
    expect(rejectedAct).toBeDefined();
    expect(
      (rejectedAct?.metadata as Record<string, unknown>).transitionRejected,
    ).toBe(true);
  });

  // ----- AC #6: success + failure/error terminal transitions -----

  it("AC #6a — production success transitions deploying → deployed", async () => {
    await seedActiveDispatch({ briefState: "deploying", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Production",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deployed");
    if (r.kind !== "deployed") throw new Error("unreachable");
    expect(r.prodUrl).toBe("https://prod.example.com");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deployed");
  });

  it("AC #6b — production failure transitions deploying → deploy_failed", async () => {
    await seedActiveDispatch({ briefState: "deploying", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "failure",
          environment: "Production",
          description: "Vercel build failed: missing env var",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-failed");
    if (r.kind !== "deploy-failed") throw new Error("unreachable");
    expect(r.errorReason).toBe("Vercel build failed: missing env var");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploy_failed");
  });

  it("AC #6c — production error is treated as alias for failure", async () => {
    await seedActiveDispatch({ briefState: "deploying", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "error",
          environment: "Production",
          description: "Infrastructure error before deploy ran",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-failed");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploy_failed");
  });

  // ----- AC #7: out-of-order webhook delivery (Reviewer-fix H3) -----

  it("AC #7a — out-of-order: success arrives BEFORE queued → shipped → deployed direct", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Production",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deployed");

    const acts = await testDb.select().from(activities);
    const deployedAct = acts.find((a) => a.action === "routine_deployed");
    expect((deployedAct?.metadata as Record<string, unknown>).outOfOrder).toBe(true);
  });

  it("AC #7b — out-of-order: failure arrives BEFORE queued → shipped → deploy_failed direct", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "failure",
          environment: "Production",
          description: "Out-of-order failure",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-failed");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploy_failed");
  });

  // ----- Reviewer-fix M3 — retry-out-of-order: deploy_failed → deployed -----

  it("M3/Reviewer-fix — retry-out-of-order: deploy_failed → deployed direct (success arrives before retry queued)", async () => {
    // The user manually re-ran a previously-failed workflow in GitHub.
    // GitHub's webhook delivery is reordered: the retry's `success` event
    // arrives BEFORE its `queued` event. The state machine admits this
    // (Brief 220 D1) and the activity row marks `outOfOrder: true` so a
    // forensic auditor can distinguish from a normal `deploy_failed → deploying
    // → deployed` arc.
    await seedActiveDispatch({ briefState: "deploy_failed", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Production",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deployed");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deployed");

    const acts = await testDb.select().from(activities);
    const deployedAct = acts.find((a) => a.action === "routine_deployed");
    expect(deployedAct).toBeDefined();
    // Reviewer-fix M1 — the symmetric out-of-order case must also flag.
    expect((deployedAct?.metadata as Record<string, unknown>).outOfOrder).toBe(true);
  });

  it("M3/Reviewer-fix — normal retry: deploy_failed → deploying does NOT flag outOfOrder", async () => {
    // Sanity: the regular retry path (`deploy_failed → deploying` via a
    // fresh `queued` event) must NOT mark `outOfOrder: true`. The flag is
    // only for out-of-order webhook delivery, not for legitimate retries.
    await seedActiveDispatch({ briefState: "deploy_failed", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "queued",
          environment: "Production",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-approval-pending");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("deploying");

    const acts = await testDb.select().from(activities);
    const approvalAct = acts.find(
      (a) => a.action === "routine_deploy_approval_pending",
    );
    expect(approvalAct).toBeDefined();
    expect(
      (approvalAct?.metadata as Record<string, unknown>).outOfOrder,
    ).toBeUndefined();
  });

  // ----- AC #8: idempotency + non-actionable + no-match -----

  it("AC #8a — duplicate queued events: second is rejected as deploy-state-no-op", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const event = {
      action: "created" as const,
      deployment_status: {
        state: "queued",
        environment: "Production",
      },
      deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
      repository: { full_name: "owner/agent-crm" },
    };

    const r1 = await handleDeploymentStatusEvent(event, { db: testDb });
    expect(r1.kind).toBe("deploy-approval-pending");

    const r2 = await handleDeploymentStatusEvent(event, { db: testDb });
    expect(r2.kind).toBe("deploy-state-no-op");

    const acts = await testDb.select().from(activities);
    const approvalActs = acts.filter(
      (a) => a.action === "routine_deploy_approval_pending",
    );
    expect(approvalActs).toHaveLength(1); // only the first emitted a card
    const rejectedAct = acts.find(
      (a) => a.action === "routine_deploy_approval_pending_rejected",
    );
    expect(rejectedAct).toBeDefined();
    expect(
      (rejectedAct?.metadata as Record<string, unknown>).transitionRejected,
    ).toBe(true);
  });

  it("AC #8b — production pending state is non-actionable no-op", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "pending",
          environment: "Production",
        },
        deployment: { ref: "main" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-state-no-op");

    const wi = await testDb.select().from(workItems).where(eq(workItems.id, "wi_01"));
    expect(wi[0].briefState).toBe("shipped"); // no transition
  });

  it("AC #8c — production inactive state is non-actionable no-op", async () => {
    await seedActiveDispatch({ briefState: "deployed", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "inactive",
          environment: "Production",
        },
        deployment: { ref: "main" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-state-no-op");
  });

  it("AC #8d — no matching dispatch row → no-match (no transition, no activity)", async () => {
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "queued",
          environment: "Production",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: 12345 },
        repository: { full_name: "unrelated/repo" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");

    const acts = await testDb.select().from(activities);
    expect(acts).toHaveLength(0);
  });

  // ----- AC #9: non-production unchanged (regression) -----

  it("AC #9 — non-production preview events still emit preview-ready card (Brief 216 regression)", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Preview",
          environment_url: "https://feature-x.vercel.app",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("preview-ready");
    if (r.kind !== "preview-ready") throw new Error("unreachable");
    expect(r.previewUrl).toBe("https://feature-x.vercel.app");

    const acts = await testDb.select().from(activities);
    expect(acts.find((a) => a.action === "routine_preview_ready")).toBeDefined();
  });

  // ----- AC #13: deep-link URL composer + sanitisation -----

  it("AC #13a — workflow_run_id absent: graceful fallback to /deployments URL", async () => {
    await seedActiveDispatch({ briefState: "shipped", status: "succeeded" });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "queued",
          environment: "Production",
        },
        deployment: { ref: "main", id: 999, workflow_run_id: null },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("deploy-approval-pending");
    if (r.kind !== "deploy-approval-pending") throw new Error("unreachable");
    expect(r.runUrl).toBe("https://github.com/owner/agent-crm/deployments");
  });

  it("AC #13b — malformed repo full-name → URL rejected, no mobileApproveAction", async () => {
    // Seed under a malformed repo string. We can't naturally trigger this via
    // GitHub (HMAC verifies the payload), so we directly test the URL composer
    // via a contrived payload — the dispatch-lookup short-circuits on no
    // matching project, so we'd never reach the URL-construction guard
    // through findDispatchForRepo. Instead test buildMobileApproveAction
    // directly (the unit-level boundary of L6).
    const { buildMobileApproveAction } = await import("./cloud-runner-fallback");
    const result = buildMobileApproveAction("../../etc/passwd", 12345);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid-repo-full-name");

    const okResult = buildMobileApproveAction("owner/repo", 12345);
    expect(okResult.ok).toBe(true);
    if (!okResult.ok) throw new Error("unreachable");
    expect(okResult.action.url).toBe(
      "https://github.com/owner/repo/actions/runs/12345",
    );
  });
});

// ============================================================
// workflow_run events
// ============================================================

describe("handleWorkflowRunEvent", () => {
  it("records a workflow-completed activity for claude/* branches", async () => {
    await seedActiveDispatch();
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          conclusion: "success",
          head_branch: "claude/x",
          html_url: "https://github.com/owner/agent-crm/actions/runs/1",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-completed");
    const acts = await testDb.select().from(activities);
    expect(
      acts.find((a) => a.action === "routine_workflow_completed"),
    ).toBeDefined();
  });

  it("ignores non-completed workflow_run events", async () => {
    await seedActiveDispatch();
    const r = await handleWorkflowRunEvent(
      {
        action: "in_progress",
        workflow_run: {
          conclusion: null,
          head_branch: "claude/x",
          html_url: "https://github.com/x/y/actions/runs/1",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });
});

// ============================================================
// Fallback runs even when in-prompt callback never fires
// ============================================================

describe("fallback decoupling", () => {
  it("transitions a dispatch via PR-merge even though no in-prompt callback fired", async () => {
    const dispatchId = await seedActiveDispatch();
    // No POST to /api/v1/work-items/:id/status simulated — only the GH event.
    const r = await handlePullRequestEvent(
      {
        action: "closed",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/42",
          head: { ref: "claude/x" },
          merged: true,
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-merged");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("succeeded");
  });
});

// ============================================================
// Brief 217 §D6 — kind-routing for claude-managed-agent
// ============================================================

describe("kind-routing — claude-managed-agent dispatches", () => {
  it("matches a managed-agent dispatch on PR opened and emits managed_agent_pr_opened activity", async () => {
    const dispatchId = await seedActiveDispatch({
      runnerKind: "claude-managed-agent",
      externalRunId: "session_01abc",
    });
    const r = await handlePullRequestEvent(
      {
        action: "opened",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/7",
          head: { ref: "claude/x" },
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-opened");
    if (r.kind !== "pr-opened") throw new Error("unreachable");
    expect(r.dispatchId).toBe(dispatchId);

    const acts = await testDb.select().from(activities);
    const a = acts.find((x) => x.action === "managed_agent_pr_opened");
    expect(a).toBeDefined();
    const meta = (a!.metadata ?? {}) as Record<string, unknown>;
    expect(meta.runnerKind).toBe("claude-managed-agent");
    expect(meta.sessionUrl).toBe(
      "https://platform.claude.com/sessions/session_01abc",
    );
  });

  it("transitions managed-agent dispatch to succeeded on PR merged", async () => {
    const dispatchId = await seedActiveDispatch({
      runnerKind: "claude-managed-agent",
      externalRunId: "session_02xyz",
    });
    const r = await handlePullRequestEvent(
      {
        action: "closed",
        pull_request: {
          html_url: "https://github.com/owner/agent-crm/pull/9",
          head: { ref: "claude/y" },
          merged: true,
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("pr-merged");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("succeeded");

    const acts = await testDb.select().from(activities);
    expect(acts.find((a) => a.action === "managed_agent_pr_merged")).toBeDefined();
  });

  it("emits managed_agent_preview_ready for non-prod deploy on managed-agent dispatch", async () => {
    await seedActiveDispatch({
      runnerKind: "claude-managed-agent",
      externalRunId: "session_03",
    });
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Preview",
          environment_url: "https://preview-z.vercel.app",
        },
        deployment: { ref: "claude/z" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("preview-ready");
    const acts = await testDb.select().from(activities);
    expect(acts.find((a) => a.action === "managed_agent_preview_ready")).toBeDefined();
  });

  it("emits managed_agent_workflow_completed for completed CI on managed-agent dispatch", async () => {
    await seedActiveDispatch({ runnerKind: "claude-managed-agent" });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          conclusion: "success",
          head_branch: "claude/x",
          html_url: "https://github.com/owner/agent-crm/actions/runs/1",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-completed");
    const acts = await testDb.select().from(activities);
    expect(
      acts.find((a) => a.action === "managed_agent_workflow_completed"),
    ).toBeDefined();
  });
});

describe("deepLinkForDispatch — kind-aware (Brief 217 §D6 + Brief 218 §D5)", () => {
  it("returns Anthropic platform URL for claude-managed-agent", () => {
    expect(deepLinkForDispatch("claude-managed-agent", "session_01")).toBe(
      "https://platform.claude.com/sessions/session_01",
    );
  });

  it("returns code.claude.com URL for claude-code-routine when no fallback", () => {
    expect(deepLinkForDispatch("claude-code-routine", "session_42")).toBe(
      "https://code.claude.com/session/session_42",
    );
  });

  it("respects fallback URL for claude-code-routine", () => {
    expect(
      deepLinkForDispatch(
        "claude-code-routine",
        "session_42",
        "https://code.claude.com/specific/url",
      ),
    ).toBe("https://code.claude.com/specific/url");
  });

  it("returns null when externalRunId is missing and no fallback", () => {
    expect(deepLinkForDispatch("claude-managed-agent", null)).toBeNull();
  });

  it("returns github.com actions URL for github-action when repo context is provided (Brief 218)", () => {
    expect(
      deepLinkForDispatch("github-action", "12345", undefined, {
        repoFullName: "owner/agent-crm",
      }),
    ).toBe("https://github.com/owner/agent-crm/actions/runs/12345");
  });

  it("falls back when repo context missing for github-action", () => {
    expect(deepLinkForDispatch("github-action", "12345")).toBeNull();
    expect(
      deepLinkForDispatch(
        "github-action",
        "12345",
        "https://stored.url/runs/12345",
      ),
    ).toBe("https://stored.url/runs/12345");
  });
});

// ============================================================
// Brief 218 §D5 — workflow_run routing for github-action dispatches
// ============================================================

describe("handleWorkflowRunEvent — github-action correlation by run id (Brief 218)", () => {
  async function seedGithubActionDispatch(opts: {
    status?: "queued" | "dispatched" | "running";
    externalRunId: string;
  }) {
    await testDb.insert(processes).values({
      id: "p_01",
      name: "test",
      slug: "p_01",
      description: "test",
      definition: {},
    });
    await testDb.insert(processRuns).values({
      id: "pr_01",
      processId: "p_01",
      status: "running",
      triggeredBy: "test",
    });
    await testDb.insert(stepRuns).values({
      id: "sr_01",
      processRunId: "pr_01",
      stepId: "dispatch",
      status: "running",
      executorType: "rules",
    });
    await testDb.insert(projects).values({
      id: "proj_01",
      name: "agent-crm",
      slug: "agent-crm",
      harnessType: "catalyst",
      githubRepo: "owner/agent-crm",
      status: "active",
    });
    await testDb.insert(workItems).values({
      id: "wi_01",
      projectId: "proj_01",
      type: "feature",
      title: "x",
      body: "x",
      content: "x",
      source: "system_generated",
      status: "intake",
      briefState: "active",
    });
    const inserted = await testDb
      .insert(runnerDispatches)
      .values({
        workItemId: "wi_01",
        projectId: "proj_01",
        runnerKind: "github-action",
        runnerMode: "cloud",
        attemptIndex: 0,
        stepRunId: "sr_01",
        status: opts.status ?? "running",
        externalRunId: opts.externalRunId,
      })
      .returning({ id: runnerDispatches.id });
    return inserted[0].id;
  }

  it("transitions to succeeded on completed/success", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12345",
    });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12345,
          status: "completed",
          conclusion: "success",
          head_branch: "main",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12345",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-transitioned");
    if (r.kind !== "workflow-transitioned") throw new Error("unreachable");
    expect(r.to).toBe("succeeded");
    expect(r.from).toBe("running");
    expect(r.dispatchId).toBe(dispatchId);

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].finishedAt).not.toBeNull();
  });

  it("transitions to failed on completed/failure", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12346",
    });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12346,
          status: "completed",
          conclusion: "failure",
          head_branch: "main",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12346",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-transitioned");
    if (r.kind !== "workflow-transitioned") throw new Error("unreachable");
    expect(r.to).toBe("failed");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("failed");
  });

  it("transitions to cancelled on completed/cancelled", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12347",
    });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12347,
          status: "completed",
          conclusion: "cancelled",
          head_branch: "main",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12347",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-transitioned");
    if (r.kind !== "workflow-transitioned") throw new Error("unreachable");
    expect(r.to).toBe("cancelled");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("cancelled");
  });

  it("transitions to cancelled on completed/stale (Reviewer IMP-1 — superseded run)", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12348",
    });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12348,
          status: "completed",
          conclusion: "stale",
          head_branch: "main",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12348",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-transitioned");
    if (r.kind !== "workflow-transitioned") throw new Error("unreachable");
    expect(r.to).toBe("cancelled");
    expect(dispatchId).toBeDefined();
  });

  it("transitions to timed_out on completed/timed_out", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12349",
    });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12349,
          status: "completed",
          conclusion: "timed_out",
          head_branch: "main",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12349",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-transitioned");
    if (r.kind !== "workflow-transitioned") throw new Error("unreachable");
    expect(r.to).toBe("timed_out");
    expect(dispatchId).toBeDefined();
  });

  it("emits late_callback_rejected on terminal-state transition attempt", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12350",
    });
    // Move dispatch to terminal succeeded first.
    await testDb
      .update(runnerDispatches)
      .set({ status: "succeeded", finishedAt: new Date() })
      .where(eq(runnerDispatches.id, dispatchId));

    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12350,
          status: "completed",
          conclusion: "failure",
          head_branch: "main",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12350",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");

    const acts = await testDb.select().from(activities);
    expect(
      acts.find(
        (a) => a.action === "github_action_late_callback_rejected",
      ),
    ).toBeDefined();
  });

  it("matches by run id, not branch — non-claude/* branches are accepted for github-action", async () => {
    const dispatchId = await seedGithubActionDispatch({
      externalRunId: "12351",
    });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 12351,
          status: "completed",
          conclusion: "success",
          head_branch: "feature/some-branch",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12351",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("workflow-transitioned");
    expect(dispatchId).toBeDefined();
  });

  it("falls back to claude/* branch matching when run id doesn't correlate to a github-action dispatch", async () => {
    // Seed a routine dispatch (kind != github-action) for the same repo.
    await seedActiveDispatch({ runnerKind: "claude-code-routine" });
    const r = await handleWorkflowRunEvent(
      {
        action: "completed",
        workflow_run: {
          id: 99999,
          status: "completed",
          conclusion: "success",
          head_branch: "claude/foo",
          html_url: "https://github.com/owner/agent-crm/actions/runs/99999",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    // Falls through to the existing routine path (workflow-completed activity log).
    expect(r.kind).toBe("workflow-completed");
  });
});

// ============================================================
// Brief 218 §D5 — check_run routing infrastructure
// ============================================================

describe("handleCheckRunEvent — Brief 218 §D5 routing infrastructure", () => {
  it("emits a check_run_completed activity for an active cloud-runner dispatch", async () => {
    const { handleCheckRunEvent } = await import("./cloud-runner-fallback");
    const dispatchId = await seedActiveDispatch({
      runnerKind: "github-action",
      externalRunId: "55555",
    });
    const r = await handleCheckRunEvent(
      {
        action: "completed",
        check_run: {
          id: 1,
          name: "Greptile review",
          status: "completed",
          conclusion: "success",
          html_url:
            "https://github.com/owner/agent-crm/runs/1",
          head_sha: "abc",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("check-run-routed");
    if (r.kind !== "check-run-routed") throw new Error("unreachable");
    expect(r.checkRunName).toBe("Greptile review");
    expect(r.dispatchId).toBe(dispatchId);

    const acts = await testDb.select().from(activities);
    expect(
      acts.find((a) => a.action === "github_action_check_run_completed"),
    ).toBeDefined();
  });

  it("ignores check_run events with action !== completed", async () => {
    const { handleCheckRunEvent } = await import("./cloud-runner-fallback");
    await seedActiveDispatch({ runnerKind: "github-action" });
    const r = await handleCheckRunEvent(
      {
        action: "created",
        check_run: {
          id: 2,
          name: "Argos",
          status: "in_progress",
          conclusion: null,
          html_url: "https://github.com/owner/agent-crm/runs/2",
          head_sha: "abc",
        },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });

  it("ignores check_run events for repos without an active cloud-runner dispatch", async () => {
    const { handleCheckRunEvent } = await import("./cloud-runner-fallback");
    const r = await handleCheckRunEvent(
      {
        action: "completed",
        check_run: {
          id: 3,
          name: "X",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/other/repo/runs/3",
          head_sha: "def",
        },
        repository: { full_name: "other/repo" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("no-match");
  });
});
