/**
 * routine status decoder tests — Brief 216 AC #5, #8 (ephemeral bearer path).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../../test-utils";
import {
  verifyEphemeralCallbackToken,
  describeRoutineCallback,
  routineStateToDispatchStatus,
} from "./routine";
import { runnerDispatches, processes, processRuns, stepRuns, projects, workItems } from "../../db/schema";

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

async function seedDispatchWithToken(token: string) {
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

  const hash = await bcrypt.hash(token, 12);
  const inserted = await testDb
    .insert(runnerDispatches)
    .values({
      workItemId: "wi_01",
      projectId: "proj_01",
      runnerKind: "claude-code-routine",
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: "sr_01",
      status: "running",
      callbackTokenHash: hash,
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

describe("verifyEphemeralCallbackToken", () => {
  it("returns ok with the matching dispatch id when token matches", async () => {
    const dispatchId = await seedDispatchWithToken("tok_secret");
    const result = await verifyEphemeralCallbackToken("tok_secret", "wi_01", {
      db: testDb,
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("ephemeral");
    expect(result.dispatchId).toBe(dispatchId);
  });

  it("returns ok:false when token does not match any dispatch", async () => {
    await seedDispatchWithToken("tok_correct");
    const result = await verifyEphemeralCallbackToken("tok_wrong", "wi_01", {
      db: testDb,
    });
    expect(result.ok).toBe(false);
    expect(result.source).toBe("none");
  });

  it("returns ok:false when work item has no dispatches with token hashes", async () => {
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
      name: "t",
      slug: "t",
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
    });
    // No dispatch row inserted.
    const result = await verifyEphemeralCallbackToken("anything", "wi_01", {
      db: testDb,
    });
    expect(result.ok).toBe(false);
  });
});

describe("describeRoutineCallback", () => {
  it("describes succeeded with pr url", () => {
    expect(
      describeRoutineCallback({
        state: "succeeded",
        prUrl: "https://github.com/x/y/pull/1",
      }),
    ).toContain("PR opened");
  });

  it("describes failed with error", () => {
    expect(
      describeRoutineCallback({ state: "failed", error: "boom" }),
    ).toContain("boom");
  });

  it("describes running with session url", () => {
    expect(
      describeRoutineCallback({
        state: "running",
        externalUrl: "https://code.claude.com/x",
      }),
    ).toContain("https://code.claude.com/x");
  });

  it("describes cancelled", () => {
    expect(describeRoutineCallback({ state: "cancelled" })).toContain(
      "cancelled",
    );
  });
});

describe("routineStateToDispatchStatus (re-exported)", () => {
  it("works", () => {
    expect(routineStateToDispatchStatus("succeeded")).toBe("succeeded");
    expect(routineStateToDispatchStatus("failed", "rate-limit")).toBe(
      "rate_limited",
    );
  });
});
