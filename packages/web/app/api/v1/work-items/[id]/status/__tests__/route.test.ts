/**
 * Brief 223 — work-item status webhook route tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "../../../../../../../../../src/test-utils";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../../../../../../../../src/db", () => ({
  get db() {
    return testDb;
  },
}));

beforeEach(() => {
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => cleanup());

async function loadRoute() {
  vi.resetModules();
  const route = await import("../route");
  return route;
}

async function seedProjectWithBearer(slug = "p"): Promise<{
  projectId: string;
  bearer: string;
}> {
  const { projects } = await import(
    "../../../../../../../../../src/db/schema"
  );
  const { generateBearerToken, hashBearerToken } = await import(
    "../../../../../../../../../src/engine/project-credentials"
  );
  const bearer = generateBearerToken();
  const hash = await hashBearerToken(bearer);
  const [row] = await testDb
    .insert(projects)
    .values({
      slug,
      name: "Test",
      harnessType: "native",
      runnerBearerHash: hash,
    })
    .returning();
  return { projectId: row.id, bearer };
}

async function seedWorkItem(
  projectId: string,
  id = "wi-test",
  briefState:
    | "backlog"
    | "approved"
    | "active"
    | "review"
    | "shipped"
    | "blocked"
    | "archived"
    | "deploying"
    | "deployed"
    | "deploy_failed" = "backlog",
): Promise<string> {
  const { workItems } = await import(
    "../../../../../../../../../src/db/schema"
  );
  await testDb.insert(workItems).values({
    id,
    type: "feature",
    content: "Test work item",
    source: "system_generated",
    projectId,
    title: "Test work item",
    body: "Body of the test work item.",
    briefState,
  });
  return id;
}

function jsonReq(
  url: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
): Request {
  return new Request(url, {
    method: init.method,
    headers: {
      ...(init.headers || {}),
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

describe("POST /api/v1/work-items/:id/status", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        body: { state: "approved" },
      }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer", async () => {
    const { projectId } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId);
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
        body: { state: "approved" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid state", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId);
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "intake" }, // not a brief state
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(400);
  });

  it("updates briefState + writes activity on success", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId);
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "approved", stepRunId: "sr-1" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefState).toBe("approved");

    const { workItems, activities } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const wis = await testDb
      .select()
      .from(workItems)
      .where(eq(workItems.id, wid));
    expect(wis[0].briefState).toBe("approved");
    expect(wis[0].stateChangedAt).toBeTruthy();

    const acts = await testDb.select().from(activities);
    const update = acts.find((a) => a.action === "work_item_status_update");
    expect(update).toBeTruthy();
    expect(update?.actorType).toBe("runner-webhook");
    expect((update?.metadata as Record<string, unknown>)?.webhook).toBeTruthy();
  });

  it("activates the bounded waiver when stepRunId is missing (Insight-180)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    // Seed in `active` so the legal `active → review` transition exercises
    // the waiver path without colliding with Brief 220's state-machine gate.
    const wid = await seedWorkItem(projectId, "wi-test", "active");
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "review" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guardWaived).toBe(true);

    const { activities } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const acts = await testDb.select().from(activities);
    const meta = (acts[0]?.metadata ?? {}) as {
      webhook?: { guardWaived?: boolean };
    };
    expect(meta.webhook?.guardWaived).toBe(true);
  });

  it("returns 401 (NOT 404) on unknown work item — Insight-017 prevents existence oracle", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: "Bearer anything" },
        body: { state: "approved" },
      }),
      { params: Promise.resolve({ id: "ghost" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when linkedProcessRunId references a missing row (FK guard)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    // Seed in `approved` so the legal `approved → active` transition runs
    // through to the linkedProcessRunId FK check (the actual subject of
    // this test). Brief 220 state-machine gate fires before the FK check
    // when the transition is illegal.
    const wid = await seedWorkItem(projectId, "wi-test", "approved");
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "active", linkedProcessRunId: "run-does-not-exist" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/linkedProcessRunId/);
  });
});

describe("Brief 216 — ephemeral callback token bearer path", () => {
  async function seedDispatchWithEphemeralToken(opts: {
    workItemId: string;
    projectId: string;
  }): Promise<{ token: string; dispatchId: string }> {
    const bcrypt = (await import("bcryptjs")).default;
    const {
      runnerDispatches,
      processes,
      processRuns,
      stepRuns,
    } = await import("../../../../../../../../../src/db/schema");

    await testDb.insert(processes).values({
      id: "p_01",
      name: "test",
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
    const token = "ephemeral-secret-1234567890";
    const hash = await bcrypt.hash(token, 12);
    const inserted = await testDb
      .insert(runnerDispatches)
      .values({
        workItemId: opts.workItemId,
        projectId: opts.projectId,
        runnerKind: "claude-code-routine",
        runnerMode: "cloud",
        attemptIndex: 0,
        stepRunId: "sr_01",
        status: "running",
        callbackTokenHash: hash,
      })
      .returning({ id: runnerDispatches.id });
    return { token, dispatchId: inserted[0].id };
  }

  it("accepts an ephemeral per-dispatch callback token and reports bearerSource=ephemeral", async () => {
    const { projectId } = await seedProjectWithBearer();
    // Brief 220 state-machine gate: seed in `active` so `active → review`
    // is legal. The test's subject is the bearer-acceptance path, not
    // state-machine semantics.
    const wid = await seedWorkItem(projectId, "wi-test", "active");
    const { token, dispatchId } = await seedDispatchWithEphemeralToken({
      workItemId: wid,
      projectId,
    });

    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
          state: "review",
          runnerKind: "claude-code-routine",
          externalRunId: "session_01",
          stepRunId: "sr_01",
          prUrl: "https://github.com/x/y/pull/1",
        },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bearerSource).toBe("ephemeral");

    const { activities } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const acts = await testDb.select().from(activities);
    const meta = acts[0].metadata as {
      webhook?: { bearerSource?: string; matchedDispatchId?: string };
    };
    expect(meta.webhook?.bearerSource).toBe("ephemeral");
    expect(meta.webhook?.matchedDispatchId).toBe(dispatchId);
  });

  it("falls back to project bearer when ephemeral token does not match", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-test", "active");
    await seedDispatchWithEphemeralToken({
      workItemId: wid,
      projectId,
    });

    const { POST } = await loadRoute();
    // Send the project bearer (NOT the ephemeral token).
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "review", stepRunId: "sr_01" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bearerSource).toBe("project");
  });

  it("rejects bearers that match neither path", async () => {
    const { projectId } = await seedProjectWithBearer();
    // Auth fails before state-machine validation runs; seed state doesn't
    // matter, but use `active` for consistency with the other ephemeral-
    // token tests.
    const wid = await seedWorkItem(projectId, "wi-test", "active");
    await seedDispatchWithEphemeralToken({
      workItemId: wid,
      projectId,
    });

    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: "Bearer not-the-right-secret" },
        body: { state: "review" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("Brief 217 — managed-agent ephemeral callback token bearer path", () => {
  async function seedManagedAgentDispatchWithEphemeralToken(opts: {
    workItemId: string;
    projectId: string;
  }): Promise<{ token: string; dispatchId: string }> {
    const bcrypt = (await import("bcryptjs")).default;
    const {
      runnerDispatches,
      processes,
      processRuns,
      stepRuns,
    } = await import("../../../../../../../../../src/db/schema");

    await testDb.insert(processes).values({
      id: "p_01",
      name: "test",
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
    const token = "managed-agent-ephemeral-secret-9999";
    const hash = await bcrypt.hash(token, 12);
    const inserted = await testDb
      .insert(runnerDispatches)
      .values({
        workItemId: opts.workItemId,
        projectId: opts.projectId,
        runnerKind: "claude-managed-agent",
        runnerMode: "cloud",
        attemptIndex: 0,
        stepRunId: "sr_01",
        status: "running",
        callbackTokenHash: hash,
      })
      .returning({ id: runnerDispatches.id });
    return { token, dispatchId: inserted[0].id };
  }

  it("accepts a managed-agent ephemeral token (callback_mode='in-prompt' path)", async () => {
    const { projectId } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-test", "active");
    const { token, dispatchId } =
      await seedManagedAgentDispatchWithEphemeralToken({
        workItemId: wid,
        projectId,
      });

    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: {
          state: "review",
          runnerKind: "claude-managed-agent",
          externalRunId: "session_ma_01",
          stepRunId: "sr_01",
          prUrl: "https://github.com/x/y/pull/2",
        },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bearerSource).toBe("ephemeral");

    const { activities } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const acts = await testDb.select().from(activities);
    const meta = acts[0].metadata as {
      webhook?: { bearerSource?: string; matchedDispatchId?: string };
    };
    expect(meta.webhook?.bearerSource).toBe("ephemeral");
    expect(meta.webhook?.matchedDispatchId).toBe(dispatchId);
  });
});

// ============================================================
// Brief 220 — deploy-gate briefStates accepted by route (Reviewer-fix H2)
// ============================================================
describe("Brief 220 — deploy-gate briefStates accepted by status route", () => {
  it.each([
    ["deploying", "shipped"],
    ["deployed", "shipped"],
    ["deploy_failed", "shipped"],
  ] as const)(
    "accepts state=%s from %s precondition, persists, writes activity row, leaves runner_dispatches untouched",
    async (targetState, precondition) => {
      const { projectId, bearer } = await seedProjectWithBearer();
      // Seed in the legal precondition for each target state. All three
      // targets are admitted from `shipped` per Brief 220 §D1 (deploying
      // = happy-path; deployed/deploy_failed = out-of-order H3).
      const wid = await seedWorkItem(projectId, "wi-test", precondition);

      // Seed a runner_dispatches row to verify it is NOT mutated by these
      // states (D4: briefStateToDispatchEvent returns null for the new
      // states; the route accepts them but doesn't bridge to a dispatch
      // event).
      const { runnerDispatches, processes, processRuns, stepRuns } =
        await import("../../../../../../../../../src/db/schema");
      await testDb.insert(processes).values({
        id: "p_01",
        name: "test",
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
      const inserted = await testDb
        .insert(runnerDispatches)
        .values({
          workItemId: wid,
          projectId,
          runnerKind: "claude-code-routine",
          runnerMode: "cloud",
          attemptIndex: 0,
          stepRunId: "sr_01",
          status: "succeeded", // Brief 220 deploy is post-runner-completion
          externalRunId: "session_x",
        })
        .returning({ id: runnerDispatches.id });
      const dispatchId = inserted[0].id;

      const { POST } = await loadRoute();
      const res = await POST(
        jsonReq("http://t/api/v1/work-items/x/status", {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}` },
          body: {
            state: targetState,
            stepRunId: "sr_01",
            runnerKind: "claude-code-routine",
            externalRunId: "session_x",
          },
        }),
        { params: Promise.resolve({ id: wid }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.briefState).toBe(targetState);
      // Brief 220 D4 — no runner-dispatch event bridge for deploy states;
      // dispatchTransitioned should be absent on the response.
      expect(body.dispatchTransitioned).toBeUndefined();

      const { workItems, activities } = await import(
        "../../../../../../../../../src/db/schema"
      );
      const wis = await testDb
        .select()
        .from(workItems)
        .where(eq(workItems.id, wid));
      expect(wis[0].briefState).toBe(targetState);

      const acts = await testDb.select().from(activities);
      const update = acts.find((a) => a.action === "work_item_status_update");
      expect(update).toBeTruthy();

      // Verify runner_dispatches row was NOT mutated.
      const dispatchRows = await testDb
        .select()
        .from(runnerDispatches)
        .where(eq(runnerDispatches.id, dispatchId));
      expect(dispatchRows[0].status).toBe("succeeded"); // unchanged
    },
  );
});

// ============================================================
// Brief 220 Reviewer-fix M4 — route-side state-machine validation
// ============================================================
describe("Brief 220 — route validates briefState transition (409 on illegal)", () => {
  it("returns 409 when posting an illegal transition (backlog → review skips approved/active)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-test", "backlog");
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "review", stepRunId: "sr-1" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Illegal briefState transition");
    expect(body.from).toBe("backlog");
    expect(body.attempted).toBe("review");
    expect(body.reason).toBe("illegal-transition");
  });

  it("returns 409 when posting a deploy-state from a non-shipped precondition (backlog → deployed)", async () => {
    // The deploy-gate states must originate from `shipped` (or out-of-order
    // direct transition admitted only from `shipped`/`deploy_failed`).
    // A runner adapter posting `state: "deployed"` against a `backlog`
    // work item is now blocked.
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-test", "backlog");
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "deployed", stepRunId: "sr-1" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.from).toBe("backlog");
    expect(body.attempted).toBe("deployed");
  });

  it("returns 409 when posting a state from a terminal-archived precondition", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-test", "archived");
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "active", stepRunId: "sr-1" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("terminal-state");
  });

  it("admits the out-of-order shipped → deployed transition (Brief 220 H3)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-test", "shipped");
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: { state: "deployed", stepRunId: "sr-1" },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefState).toBe("deployed");
  });
});

// ============================================================
// Brief 232 — runner-dispatch responseBody channel
// ============================================================
describe("Brief 232 — runner-dispatch responseBody persistence", () => {
  async function seedDispatch(opts: {
    workItemId: string;
    projectId: string;
    runnerKind?: "claude-code-routine" | "claude-managed-agent" | "github-action";
    externalRunId?: string;
    status?: "queued" | "dispatched" | "running" | "succeeded";
  }): Promise<{ dispatchId: string }> {
    const {
      runnerDispatches,
      processes,
      processRuns,
      stepRuns,
    } = await import("../../../../../../../../../src/db/schema");

    await testDb.insert(processes).values({
      id: "p_b232",
      name: "test-b232",
      slug: "p_b232",
      description: "t",
      definition: {},
    });
    await testDb.insert(processRuns).values({
      id: "pr_b232",
      processId: "p_b232",
      status: "running",
      triggeredBy: "test",
    });
    await testDb.insert(stepRuns).values({
      id: "sr_b232",
      processRunId: "pr_b232",
      stepId: "dispatch",
      status: "running",
      executorType: "rules",
    });
    const inserted = await testDb
      .insert(runnerDispatches)
      .values({
        workItemId: opts.workItemId,
        projectId: opts.projectId,
        runnerKind: opts.runnerKind ?? "github-action",
        runnerMode: "cloud",
        attemptIndex: 0,
        stepRunId: "sr_b232",
        status: opts.status ?? "running",
        externalRunId: opts.externalRunId ?? "ext_run_001",
      })
      .returning({ id: runnerDispatches.id });
    return { dispatchId: inserted[0].id };
  }

  it("persists responseBody on the matched dispatch row when present (AC #4)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-b232", "review");
    const { dispatchId } = await seedDispatch({
      workItemId: wid,
      projectId,
      runnerKind: "github-action",
      externalRunId: "ext_run_aaa",
      status: "running",
    });

    const { POST } = await loadRoute();
    const responseBody = {
      commitSha: "abc1234def5678",
      actuallyChangedFiles: [".ditto/skills.json", ".ditto/version.txt"],
      skippedFiles: [".ditto/guidance.md (user-edited)"],
    };
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: {
          state: "shipped",
          stepRunId: "sr_b232",
          runnerKind: "github-action",
          externalRunId: "ext_run_aaa",
          responseBody,
        },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);

    const { runnerDispatches } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].responseBody).toEqual(responseBody);
  });

  it("silently drops responseBody when no dispatch row matched (AC #5)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-b232", "review");
    // NB: no seedDispatch — no matching dispatch row exists.

    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: {
          state: "shipped",
          stepRunId: "sr-orphan",
          runnerKind: "github-action",
          externalRunId: "ext_does_not_exist",
          responseBody: { commitSha: "deadbeef" },
        },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);

    // No dispatch rows should exist.
    const { runnerDispatches } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const rows = await testDb.select().from(runnerDispatches);
    expect(rows).toHaveLength(0);
  });

  it("preserves backwards-compat: posting without responseBody leaves the column NULL (AC #6)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-b232", "review");
    const { dispatchId } = await seedDispatch({
      workItemId: wid,
      projectId,
      runnerKind: "github-action",
      externalRunId: "ext_run_bbb",
      status: "running",
    });

    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: {
          state: "shipped",
          stepRunId: "sr_b232",
          runnerKind: "github-action",
          externalRunId: "ext_run_bbb",
          // intentionally omit responseBody
        },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(200);

    const { runnerDispatches } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].responseBody).toBeNull();
  });

  it("rejects non-object responseBody (string/array/number) at the wire boundary (AC #3)", async () => {
    const { projectId, bearer } = await seedProjectWithBearer();
    const wid = await seedWorkItem(projectId, "wi-b232", "review");
    await seedDispatch({
      workItemId: wid,
      projectId,
      runnerKind: "github-action",
      externalRunId: "ext_run_ccc",
      status: "running",
    });

    const { POST } = await loadRoute();
    // String responseBody — must be rejected by z.record(z.unknown()).
    const res = await POST(
      jsonReq("http://t/api/v1/work-items/x/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}` },
        body: {
          state: "shipped",
          stepRunId: "sr_b232",
          runnerKind: "github-action",
          externalRunId: "ext_run_ccc",
          responseBody: "garbage",
        },
      }),
      { params: Promise.resolve({ id: wid }) },
    );
    expect(res.status).toBe(400);
  });
});
