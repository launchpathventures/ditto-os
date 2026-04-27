/**
 * github-action status decoder tests — Brief 218 AC #10.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../../test-utils";
import {
  verifyGithubActionEphemeralCallbackToken,
  describeGithubActionCallback,
  cloudRunnerStateToDispatchStatus,
} from "./github-action";
import {
  runnerDispatches,
  processes,
  processRuns,
  stepRuns,
  projects,
  workItems,
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

async function seedFixtures() {
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
    title: "Test",
    body: "Test body",
    content: "Test body",
    source: "system_generated",
    status: "intake",
    briefState: "active",
  });
}

async function seedDispatch(opts: {
  runnerKind:
    | "claude-code-routine"
    | "claude-managed-agent"
    | "github-action";
  token?: string;
}) {
  const hash = opts.token ? await bcrypt.hash(opts.token, 12) : null;
  const inserted = await testDb
    .insert(runnerDispatches)
    .values({
      workItemId: "wi_01",
      projectId: "proj_01",
      runnerKind: opts.runnerKind,
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: "sr_01",
      status: "running",
      callbackTokenHash: hash,
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

describe("verifyGithubActionEphemeralCallbackToken", () => {
  it("returns ok with the matching dispatch id when token matches a github-action dispatch", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatch({
      runnerKind: "github-action",
      token: "tok_ga_secret",
    });
    const r = await verifyGithubActionEphemeralCallbackToken(
      "tok_ga_secret",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(true);
    expect(r.source).toBe("ephemeral");
    expect(r.dispatchId).toBe(dispatchId);
  });

  it("returns ok:false when token does not match", async () => {
    await seedFixtures();
    await seedDispatch({
      runnerKind: "github-action",
      token: "tok_correct",
    });
    const r = await verifyGithubActionEphemeralCallbackToken(
      "tok_wrong",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(false);
    expect(r.source).toBe("none");
  });

  it("does NOT match a routine-bound ephemeral token (kind isolation)", async () => {
    await seedFixtures();
    await seedDispatch({
      runnerKind: "claude-code-routine",
      token: "tok_routine",
    });
    const r = await verifyGithubActionEphemeralCallbackToken(
      "tok_routine",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(false);
    expect(r.source).toBe("none");
  });

  it("does NOT match a managed-agent-bound ephemeral token (kind isolation)", async () => {
    await seedFixtures();
    await seedDispatch({
      runnerKind: "claude-managed-agent",
      token: "tok_ma",
    });
    const r = await verifyGithubActionEphemeralCallbackToken(
      "tok_ma",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(false);
    expect(r.source).toBe("none");
  });

  it("returns ok:false when work item has no github-action dispatches with token hashes", async () => {
    await seedFixtures();
    await seedDispatch({ runnerKind: "github-action" });
    const r = await verifyGithubActionEphemeralCallbackToken(
      "anything",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(false);
  });
});

describe("describeGithubActionCallback", () => {
  it("describes succeeded with pr url", () => {
    expect(
      describeGithubActionCallback({
        state: "succeeded",
        prUrl: "https://github.com/x/y/pull/1",
      }),
    ).toContain("PR opened");
  });

  it("describes failed with error", () => {
    expect(
      describeGithubActionCallback({ state: "failed", error: "boom" }),
    ).toContain("boom");
  });

  it("describes running with workflow run url", () => {
    expect(
      describeGithubActionCallback({
        state: "running",
        workflowRunUrl: "https://github.com/owner/repo/actions/runs/12345",
      }),
    ).toContain("https://github.com/owner/repo/actions/runs/12345");
  });

  it("describes cancelled", () => {
    expect(describeGithubActionCallback({ state: "cancelled" })).toContain(
      "cancelled",
    );
  });

  it("uses GitHub Actions label distinct from Routine and Managed Agent", () => {
    const text = describeGithubActionCallback({ state: "succeeded" });
    expect(text).toContain("GitHub Actions");
    expect(text).not.toContain("Managed Agent");
    expect(text).not.toContain("Routine");
  });
});

describe("cloudRunnerStateToDispatchStatus (re-exported)", () => {
  it("works", () => {
    expect(cloudRunnerStateToDispatchStatus("succeeded")).toBe("succeeded");
    expect(cloudRunnerStateToDispatchStatus("failed", "rate-limit")).toBe(
      "rate_limited",
    );
  });
});
