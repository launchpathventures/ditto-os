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
    briefState: "backlog",
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
    const wid = await seedWorkItem(projectId);
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
    const wid = await seedWorkItem(projectId);
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
    const wid = await seedWorkItem(projectId);
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
    const wid = await seedWorkItem(projectId);
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
    const wid = await seedWorkItem(projectId);
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
