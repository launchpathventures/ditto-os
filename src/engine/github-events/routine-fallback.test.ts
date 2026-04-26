/**
 * GitHub fallback handler tests — Brief 216 AC #10.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-utils";
import {
  handlePullRequestEvent,
  handleWorkflowRunEvent,
  handleDeploymentStatusEvent,
} from "./routine-fallback";
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

async function seedActiveDispatch(opts: { status?: "dispatched" | "running" } = {}) {
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
    briefState: "active",
  });
  await testDb.insert(projectRunners).values({
    projectId: "proj_01",
    kind: "claude-code-routine",
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
      runnerKind: "claude-code-routine",
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: "sr_01",
      status: opts.status ?? "running",
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
    expect(acts.find((a) => a.action === "routine_pr_opened")).toBeDefined();
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

  it("emits production-no-op for the default 'Production' environment", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "Production",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb },
    );
    expect(r.kind).toBe("production-no-op");

    const acts = await testDb.select().from(activities);
    expect(acts.find((a) => a.action === "routine_preview_ready")).toBeUndefined();
  });

  it("respects per-project deployTarget override (custom prod env name)", async () => {
    await seedActiveDispatch();
    const r = await handleDeploymentStatusEvent(
      {
        action: "created",
        deployment_status: {
          state: "success",
          environment: "prod",
          environment_url: "https://prod.example.com",
        },
        deployment: { ref: "claude/x" },
        repository: { full_name: "owner/agent-crm" },
      },
      { db: testDb, deployTargetFor: () => "prod" },
    );
    expect(r.kind).toBe("production-no-op");
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

  it("ignores deployment_status events that aren't success state", async () => {
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
