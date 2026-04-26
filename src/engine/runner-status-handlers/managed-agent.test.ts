/**
 * managed-agent status decoder tests — Brief 217 AC #10.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../../test-utils";
import {
  verifyManagedAgentEphemeralCallbackToken,
  describeManagedAgentCallback,
  cloudRunnerStateToDispatchStatus,
} from "./managed-agent";
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
  runnerKind: "claude-code-routine" | "claude-managed-agent";
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

describe("verifyManagedAgentEphemeralCallbackToken", () => {
  it("returns ok with the matching dispatch id when token matches a managed-agent dispatch", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      token: "tok_secret",
    });
    const r = await verifyManagedAgentEphemeralCallbackToken(
      "tok_secret",
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
      runnerKind: "claude-managed-agent",
      token: "tok_correct",
    });
    const r = await verifyManagedAgentEphemeralCallbackToken(
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
    const r = await verifyManagedAgentEphemeralCallbackToken(
      "tok_routine",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(false);
    expect(r.source).toBe("none");
  });

  it("returns ok:false when work item has no managed-agent dispatches with token hashes", async () => {
    await seedFixtures();
    await seedDispatch({ runnerKind: "claude-managed-agent" });
    const r = await verifyManagedAgentEphemeralCallbackToken(
      "anything",
      "wi_01",
      { db: testDb },
    );
    expect(r.ok).toBe(false);
  });
});

describe("describeManagedAgentCallback", () => {
  it("describes succeeded with pr url", () => {
    expect(
      describeManagedAgentCallback({
        state: "succeeded",
        prUrl: "https://github.com/x/y/pull/1",
      }),
    ).toContain("PR opened");
  });

  it("describes failed with error", () => {
    expect(
      describeManagedAgentCallback({ state: "failed", error: "boom" }),
    ).toContain("boom");
  });

  it("describes running with session url", () => {
    expect(
      describeManagedAgentCallback({
        state: "running",
        externalUrl: "https://platform.claude.com/sessions/abc",
      }),
    ).toContain("https://platform.claude.com/sessions/abc");
  });

  it("describes cancelled", () => {
    expect(describeManagedAgentCallback({ state: "cancelled" })).toContain(
      "cancelled",
    );
  });

  it("uses Managed Agent label distinct from Routine", () => {
    expect(describeManagedAgentCallback({ state: "succeeded" })).toContain(
      "Managed Agent",
    );
    expect(describeManagedAgentCallback({ state: "succeeded" })).not.toContain(
      "Routine",
    );
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
