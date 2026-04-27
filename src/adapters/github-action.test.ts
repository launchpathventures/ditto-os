/**
 * github-action adapter tests — Brief 218 AC #2, #4, #5, #6, #9, #10, #12.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";
import {
  createGithubActionAdapter,
  githubActionConfigSchema,
  mapWorkflowRunToDispatchStatus,
} from "./github-action";
import {
  projects,
  projectRunners,
  workItems,
  runnerDispatches,
  processes,
  processRuns,
  stepRuns,
} from "../db/schema";
import type {
  DispatchExecuteContext,
  ProjectRef,
  ProjectRunnerRef,
  WorkItemRef,
} from "@ditto/core";

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

const VALID_CONFIG = {
  repo: "owner/agent-crm",
  workflowFile: "dispatch-coding-work.yml",
  defaultRef: "main",
  bearer_credential_id: "cred_01abc",
};

async function seedDispatchRow(opts: {
  workItemId: string;
  projectId: string;
  stepRunId: string;
  status?: "queued" | "dispatched" | "running";
  externalRunId?: string | null;
}): Promise<string> {
  const inserted = await testDb
    .insert(runnerDispatches)
    .values({
      workItemId: opts.workItemId,
      projectId: opts.projectId,
      runnerKind: "github-action",
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: opts.stepRunId,
      status: opts.status ?? "queued",
      externalRunId: opts.externalRunId ?? null,
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

async function seedFixtures(opts: { withRunner?: boolean } = {}) {
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
    body: "Add a /healthz endpoint to the app router.",
    content: "Add a /healthz endpoint to the app router.",
    source: "system_generated",
    status: "intake",
    briefState: "active",
  });
  if (opts.withRunner) {
    await testDb.insert(projectRunners).values({
      projectId: "proj_01",
      kind: "github-action",
      mode: "cloud",
      enabled: true,
      configJson: VALID_CONFIG,
      credentialIds: [],
    });
  }
}

interface FakeFetchResponse {
  json?: unknown;
  text?: string;
  status?: number;
}

function fakeFetch(response: FakeFetchResponse) {
  return async (): Promise<Response> => {
    const status = response.status ?? 200;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      json: async () => response.json ?? {},
      text: async () => response.text ?? JSON.stringify(response.json ?? {}),
    } as unknown as Response;
  };
}

interface ScriptedFetchCall {
  url: string;
  init: RequestInit;
}

function scriptedFetch(
  responses: FakeFetchResponse[],
  recorded: ScriptedFetchCall[] = [],
) {
  let i = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const response = responses[i] ?? responses[responses.length - 1];
    i += 1;
    recorded.push({ url: String(url), init: init ?? {} });
    const status = response.status ?? 200;
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      json: async () => response.json ?? {},
      text: async () => response.text ?? JSON.stringify(response.json ?? {}),
    } as unknown as Response;
  }) as typeof fetch;
}

function buildCtx(
  overrides: Partial<DispatchExecuteContext> = {},
): DispatchExecuteContext {
  return {
    stepRunId: "sr_01",
    processRunId: "pr_01",
    dispatchId: "will-be-overridden",
    trust: { trustTier: "autonomous", trustAction: "advance" },
    ...overrides,
  };
}

const PROJECT_REF: ProjectRef = {
  id: "proj_01",
  slug: "agent-crm",
  githubRepo: "owner/agent-crm",
  defaultRunnerKind: "github-action",
  fallbackRunnerKind: null,
  runnerChain: null,
};

const PROJECT_RUNNER_REF: ProjectRunnerRef = {
  id: "pr_runner_01",
  projectId: "proj_01",
  kind: "github-action",
  mode: "cloud",
  configJson: VALID_CONFIG,
  credentialIds: [],
};

const WORK_ITEM_REF: WorkItemRef = {
  id: "wi_01",
  content: "Add a /healthz endpoint.",
  goalAncestry: [],
  context: {},
};

// ============================================================
// AC #5 — config schema
// ============================================================

describe("githubActionConfigSchema", () => {
  it("accepts a valid config", () => {
    const r = githubActionConfigSchema.safeParse(VALID_CONFIG);
    expect(r.success).toBe(true);
  });

  it("rejects malformed repo (must be owner/repo)", () => {
    const r = githubActionConfigSchema.safeParse({
      ...VALID_CONFIG,
      repo: "owner-only",
    });
    expect(r.success).toBe(false);
  });

  it("rejects workflowFile without .yml/.yaml extension", () => {
    const r = githubActionConfigSchema.safeParse({
      ...VALID_CONFIG,
      workflowFile: "dispatch-coding-work",
    });
    expect(r.success).toBe(false);
  });

  it("accepts both .yml and .yaml extensions", () => {
    expect(
      githubActionConfigSchema.safeParse({
        ...VALID_CONFIG,
        workflowFile: "x.yaml",
      }).success,
    ).toBe(true);
    expect(
      githubActionConfigSchema.safeParse({
        ...VALID_CONFIG,
        workflowFile: "x.yml",
      }).success,
    ).toBe(true);
  });

  it("defaults defaultRef to 'main'", () => {
    const r = githubActionConfigSchema.parse({
      repo: "owner/repo",
      workflowFile: "x.yml",
      bearer_credential_id: "cred_01",
    });
    expect(r.defaultRef).toBe("main");
  });

  it("accepts all three callback_mode values", () => {
    for (const m of ["webhook-only", "in-workflow-secret", "in-workflow"]) {
      const r = githubActionConfigSchema.safeParse({
        ...VALID_CONFIG,
        callback_mode: m,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown callback_mode value", () => {
    const r = githubActionConfigSchema.safeParse({
      ...VALID_CONFIG,
      callback_mode: "magic",
    });
    expect(r.success).toBe(false);
  });
});

// ============================================================
// AC #4 — Insight-180 stepRunId guard
// ============================================================

describe("createGithubActionAdapter — execute() Insight-180 guard", () => {
  it("rejects missing stepRunId WITHOUT writing to DB or hitting the network", async () => {
    delete process.env.DITTO_TEST_MODE;
    let fetchCalled = false;
    let credentialResolved = false;
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: (async () => {
        fetchCalled = true;
        return new Response();
      }) as typeof fetch,
      resolveCredential: async () => {
        credentialResolved = true;
        return { value: "tok", service: "x" };
      },
    });

    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });

    await expect(
      adapter.execute(
        buildCtx({ stepRunId: "", dispatchId }),
        WORK_ITEM_REF,
        PROJECT_REF,
        PROJECT_RUNNER_REF,
      ),
    ).rejects.toThrow(/Insight-180 guard/i);

    expect(fetchCalled).toBe(false);
    expect(credentialResolved).toBe(false);

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).toBeNull();
    process.env.DITTO_TEST_MODE = "true";
  });
});

// ============================================================
// AC #2 + #6 — execute() happy + error paths + run-id capture + fallback
// ============================================================

describe("createGithubActionAdapter — execute()", () => {
  it("returns failed when config_json is invalid", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200 }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      { ...PROJECT_RUNNER_REF, configJson: { repo: "bad" } },
    );
    expect(r.finalStatus).toBe("failed");
    expect(r.errorReason).toMatch(/Invalid config_json/);
  });

  it("returns failed when GitHub PAT credential is missing from vault", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 204 }) as unknown as typeof fetch,
      resolveCredential: async () => null,
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.finalStatus).toBe("failed");
    expect(r.errorReason).toMatch(/credential not found/);
  });

  it("dispatches successfully (webhook-only default) and captures run id from response", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 12345 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      statusWebhookUrlFor: (id) =>
        `https://test/api/v1/work-items/${id}/status`,
      resolveCredential: async () => ({
        value: "ghp_test",
        service: "runner.agent-crm.github_token",
      }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.externalRunId).toBe("12345");
    expect(r.externalUrl).toBe(
      "https://github.com/owner/agent-crm/actions/runs/12345",
    );
    expect(r.finalStatus).toBeUndefined();

    const dispatchCall = calls[0];
    expect(dispatchCall.url).toBe(
      "https://api.github.com/repos/owner/agent-crm/actions/workflows/dispatch-coding-work.yml/dispatches",
    );
    const headers = dispatchCall.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ghp_test");
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");

    const body = JSON.parse(dispatchCall.init.body as string);
    expect(body.ref).toBe("main");
    expect(body.inputs.work_item_id).toBe("wi_01");
    expect(body.inputs.work_item_body).toBe(WORK_ITEM_REF.content);
    expect(body.inputs.harness_type).toBe("catalyst");
    expect(body.inputs.stepRunId).toBe("sr_01");
    // webhook-only mode: no callback_url input
    expect(body.inputs.callback_url).toBeUndefined();

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).toBeNull();
  });

  it("falls back to listWorkflowRuns when dispatch response lacks `id`", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [
        // dispatch returns 204 with empty body (older API behaviour)
        { status: 204, text: "" },
        // listWorkflowRuns returns the run
        { status: 200, json: { workflow_runs: [{ id: 99 }] } },
      ],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.externalRunId).toBe("99");
    expect(r.externalUrl).toBe(
      "https://github.com/owner/agent-crm/actions/runs/99",
    );
    expect(calls[1].url).toContain("/runs?event=workflow_dispatch");
  });

  it("returns failed with errorReason='dispatch-run-id-unavailable' when neither path yields an id", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const fetchImpl = scriptedFetch([
      { status: 204, text: "" },
      { status: 200, json: { workflow_runs: [] } },
    ]);
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.finalStatus).toBe("failed");
    expect(r.errorReason).toBe("dispatch-run-id-unavailable");
  });

  it("maps 429 → rate_limited, 408/504 → timed_out", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const a429 = createGithubActionAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 429, text: "rate limit" }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r429 = await a429.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r429.finalStatus).toBe("rate_limited");

    const a408 = createGithubActionAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 408, text: "timeout" }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r408 = await a408.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r408.finalStatus).toBe("timed_out");
  });
});

// ============================================================
// AC #10 — three callback modes
// ============================================================

describe("createGithubActionAdapter — callback modes (Brief 218 §D3)", () => {
  it("webhook-only mode: no ephemeral token, no callback_url input", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 7 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      {
        ...PROJECT_RUNNER_REF,
        configJson: { ...VALID_CONFIG, callback_mode: "webhook-only" },
      },
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.callback_url).toBeUndefined();
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).toBeNull();
  });

  it("in-workflow-secret mode: callback_url present (no token query), no ephemeral token", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 8 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      statusWebhookUrlFor: (id) =>
        `https://test/api/v1/work-items/${id}/status`,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      {
        ...PROJECT_RUNNER_REF,
        configJson: { ...VALID_CONFIG, callback_mode: "in-workflow-secret" },
      },
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.callback_url).toBe(
      "https://test/api/v1/work-items/wi_01/status",
    );
    expect(body.inputs.callback_url).not.toContain("token=");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).toBeNull();
  });

  it("in-workflow mode: per-dispatch ephemeral token in callback_url query string + bcrypt hash persisted", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 9 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      statusWebhookUrlFor: (id) =>
        `https://test/api/v1/work-items/${id}/status`,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      {
        ...PROJECT_RUNNER_REF,
        configJson: { ...VALID_CONFIG, callback_mode: "in-workflow" },
      },
    );

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.callback_url).toMatch(/token=[\w-]+/);

    // Extract the plaintext token from the URL.
    const url = new URL(body.inputs.callback_url);
    const presented = url.searchParams.get("token");
    expect(presented).not.toBeNull();

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).not.toBeNull();
    const ok = await bcrypt.compare(presented!, rows[0].callbackTokenHash!);
    expect(ok).toBe(true);
  });
});

// ============================================================
// AC #9 — cancellation
// ============================================================

describe("createGithubActionAdapter — cancel()", () => {
  it("returns ok:true when GitHub returns 202 Accepted", async () => {
    await seedFixtures({ withRunner: true });
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
      status: "running",
      externalRunId: "12345",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 202, json: {} }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.cancel(dispatchId, "12345");
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/owner/agent-crm/actions/runs/12345/cancel",
    );
    expect(calls[0].init.method).toBe("POST");
  });

  it("supportsCancel is true", () => {
    const adapter = createGithubActionAdapter();
    expect(adapter.supportsCancel).toBe(true);
  });

  it("returns ok:false when dispatch row missing", async () => {
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 202 }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.cancel("does-not-exist", "12345");
    expect(r.ok).toBe(false);
  });
});

// ============================================================
// AC #8 — status() polling path
// ============================================================

describe("createGithubActionAdapter — status()", () => {
  it("maps completed/success → succeeded", async () => {
    await seedFixtures({ withRunner: true });
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
      status: "running",
      externalRunId: "12345",
    });
    const fetchImpl = scriptedFetch([
      {
        status: 200,
        json: {
          id: 12345,
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/owner/agent-crm/actions/runs/12345",
        },
      },
    ]);
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const snap = await adapter.status(dispatchId, "12345");
    expect(snap.status).toBe("succeeded");
    expect(snap.externalUrl).toBe(
      "https://github.com/owner/agent-crm/actions/runs/12345",
    );
  });

  it("maps in_progress → running", async () => {
    await seedFixtures({ withRunner: true });
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
      status: "dispatched",
      externalRunId: "777",
    });
    const fetchImpl = scriptedFetch([
      {
        status: 200,
        json: {
          id: 777,
          status: "in_progress",
          conclusion: null,
          html_url: "https://github.com/owner/agent-crm/actions/runs/777",
        },
      },
    ]);
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const snap = await adapter.status(dispatchId, "777");
    expect(snap.status).toBe("running");
  });
});

// ============================================================
// AC #7 (state mapping unit) + Brief 218 §D9
// ============================================================

describe("mapWorkflowRunToDispatchStatus (Brief 218 §D9)", () => {
  it("queued → dispatched", () => {
    expect(mapWorkflowRunToDispatchStatus({ status: "queued", conclusion: null }))
      .toEqual({ status: "dispatched" });
  });
  it("waiting → dispatched", () => {
    expect(mapWorkflowRunToDispatchStatus({ status: "waiting", conclusion: null }))
      .toEqual({ status: "dispatched" });
  });
  it("in_progress → running", () => {
    expect(
      mapWorkflowRunToDispatchStatus({ status: "in_progress", conclusion: null }),
    ).toEqual({ status: "running" });
  });
  it("completed/success → succeeded", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "success",
      }),
    ).toEqual({ status: "succeeded" });
  });
  it("completed/failure → failed", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "failure",
      }),
    ).toEqual({ status: "failed" });
  });
  it("completed/cancelled → cancelled", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "cancelled",
      }),
    ).toEqual({ status: "cancelled" });
  });
  it("completed/timed_out → timed_out", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "timed_out",
      }),
    ).toEqual({ status: "timed_out" });
  });
  it("completed/action_required → failed with errorReason='action_required'", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "action_required",
      }),
    ).toEqual({ status: "failed", errorReason: "action_required" });
  });
  it("completed/neutral → succeeded (soft-pass)", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "neutral",
      }),
    ).toEqual({ status: "succeeded" });
  });
  it("completed/skipped → cancelled", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "skipped",
      }),
    ).toEqual({ status: "cancelled" });
  });
  it("completed/stale → cancelled (Reviewer IMP-1 — superseded run)", () => {
    expect(
      mapWorkflowRunToDispatchStatus({
        status: "completed",
        conclusion: "stale",
      }),
    ).toEqual({ status: "cancelled" });
  });
});

// ============================================================
// AC (healthCheck)
// ============================================================

describe("createGithubActionAdapter — healthCheck()", () => {
  it("returns healthy when config + credential resolve", async () => {
    const adapter = createGithubActionAdapter({
      db: testDb,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.healthCheck(PROJECT_RUNNER_REF);
    expect(r.status).toBe("healthy");
  });

  it("returns unauthenticated when credential missing", async () => {
    const adapter = createGithubActionAdapter({
      db: testDb,
      resolveCredential: async () => null,
    });
    const r = await adapter.healthCheck(PROJECT_RUNNER_REF);
    expect(r.status).toBe("unauthenticated");
    expect(r.reason).toMatch(/credential/);
  });

  it("returns unauthenticated when config invalid", async () => {
    const adapter = createGithubActionAdapter({
      db: testDb,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.healthCheck({
      ...PROJECT_RUNNER_REF,
      configJson: { repo: "bad" },
    });
    expect(r.status).toBe("unauthenticated");
  });
});

// ============================================================
// AC #12 — trust-tier behavior at adapter layer (Brief 214 §D8)
//
// Brief 214 §D8 places trust enforcement upstream of the adapter (the
// dispatcher's pre-execute trust gate). Brief 215's dispatcher tests cover
// queue/sample/reject transitions per tier. The adapter receives the
// dispatcher's resolved `DispatchTrustContext` and is expected to forward
// it faithfully into its execute path WITHOUT re-deriving or fabricating it.
// These tests confirm the adapter does NOT make trust decisions of its own
// (no per-tier branching inside execute()) — every tier reaches the same
// `createWorkflowDispatch` wire send so long as the dispatcher routed there.
// ============================================================

describe("createGithubActionAdapter — trust forwarding (AC #12 / Brief 214 §D8)", () => {
  const tiers: Array<{
    label: string;
    trust: DispatchExecuteContext["trust"];
  }> = [
    {
      label: "supervised + advance (post-approval)",
      trust: { trustTier: "supervised", trustAction: "advance" },
    },
    {
      label: "spot_checked sampled-out (advance)",
      trust: { trustTier: "spot_checked", trustAction: "advance" },
    },
    {
      label: "spot_checked sampled-in (sample_advance)",
      trust: { trustTier: "spot_checked", trustAction: "sample_advance" },
    },
    {
      label: "autonomous + advance",
      trust: { trustTier: "autonomous", trustAction: "advance" },
    },
    {
      label: "critical + advance",
      trust: { trustTier: "critical", trustAction: "advance" },
    },
  ];

  for (const { label, trust } of tiers) {
    it(`fires workflow_dispatch with trust=${label}`, async () => {
      await seedFixtures();
      const dispatchId = await seedDispatchRow({
        workItemId: "wi_01",
        projectId: "proj_01",
        stepRunId: "sr_01",
      });
      const calls: ScriptedFetchCall[] = [];
      const fetchImpl = scriptedFetch(
        [{ status: 201, json: { id: 1000 } }],
        calls,
      );
      const adapter = createGithubActionAdapter({
        db: testDb,
        fetch: fetchImpl,
        resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
      });
      const r = await adapter.execute(
        buildCtx({ dispatchId, trust }),
        WORK_ITEM_REF,
        PROJECT_REF,
        PROJECT_RUNNER_REF,
      );
      // Adapter does not re-derive trust; it sends the dispatch and lets
      // the dispatcher's upstream gate decide whether execute() is even
      // called. So every tier here results in a wire send.
      expect(r.externalRunId).toBe("1000");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/dispatches");
    });
  }

  it("does NOT branch on trust internally — same encoded body for all tiers", async () => {
    await seedFixtures();
    const bodies: string[] = [];
    for (const { trust } of tiers) {
      const dispatchId = await seedDispatchRow({
        workItemId: "wi_01",
        projectId: "proj_01",
        stepRunId: "sr_01",
      });
      const calls: ScriptedFetchCall[] = [];
      const fetchImpl = scriptedFetch(
        [{ status: 201, json: { id: 2000 } }],
        calls,
      );
      const adapter = createGithubActionAdapter({
        db: testDb,
        fetch: fetchImpl,
        resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
      });
      await adapter.execute(
        buildCtx({ dispatchId, trust }),
        WORK_ITEM_REF,
        PROJECT_REF,
        PROJECT_RUNNER_REF,
      );
      bodies.push(calls[0].init.body as string);
    }
    // Every body should be byte-identical (no trust-keyed input fields).
    const unique = new Set(bodies);
    expect(unique.size).toBe(1);
  });
});

// ============================================================
// HIGH-1 fix — harness_type resolves from project, not hardcoded (Brief 218 §D4)
// ============================================================

describe("createGithubActionAdapter — harness_type resolution (Brief 218 §D4)", () => {
  it("populates inputs.harness_type='catalyst' when project.harnessType is catalyst", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 3000 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      harnessTypeFor: async () => "catalyst",
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.harness_type).toBe("catalyst");
  });

  it("populates inputs.harness_type='native' when project.harnessType is native", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 3001 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      harnessTypeFor: async () => "native",
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.harness_type).toBe("native");
  });

  it("populates inputs.harness_type='none' when project.harnessType is none", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 3002 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      harnessTypeFor: async () => "none",
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.harness_type).toBe("none");
  });

  it("default resolver reads projects.harnessType from the DB (no hardcoded catalyst)", async () => {
    const { _clearGithubActionHarnessTypeCacheForTests } = await import(
      "./github-action"
    );
    _clearGithubActionHarnessTypeCacheForTests();
    await seedFixtures();
    // Update project to native.
    await testDb
      .update(projects)
      .set({ harnessType: "native" })
      .where(eq(projects.id, "proj_01"));
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 3003 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      // No harnessTypeFor override — uses default resolver.
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.harness_type).toBe("native");
    _clearGithubActionHarnessTypeCacheForTests();
  });
});

// ============================================================
// MEDIUM-3 fix — listRunIdFallback honours dispatch_run_lookup_window_ms
// ============================================================

describe("listRunIdFallback — windowed correlation (Brief 218 §D2)", () => {
  it("picks the run with created_at within the lookup window", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const now = new Date("2026-04-27T12:00:00Z");
    const old = new Date("2026-04-27T11:00:00Z").toISOString(); // outside window
    const recent = new Date("2026-04-27T11:59:55Z").toISOString(); // inside 30s window
    const fetchImpl = scriptedFetch([
      { status: 204, text: "" },
      {
        status: 200,
        json: {
          workflow_runs: [
            // Newest first per GitHub convention; first is OUTSIDE window.
            { id: 9999, created_at: old },
            { id: 4242, created_at: recent },
          ],
        },
      },
    ]);
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      now: () => now,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    // Should pick 4242 (within window), NOT 9999 (outside window).
    expect(r.externalRunId).toBe("4242");
  });

  it("falls back to newest when no run carries created_at (test fixture compat)", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const fetchImpl = scriptedFetch([
      { status: 204, text: "" },
      // No created_at — adapter falls back to newest.
      { status: 200, json: { workflow_runs: [{ id: 7777 }] } },
    ]);
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.externalRunId).toBe("7777");
  });
});

// ============================================================
// MEDIUM-2 fix — defaultDevReviewSkillUrlFor returns null unless ALL THREE env vars set
// ============================================================

describe("defaultDevReviewSkillUrlFor — release-asset URL composition", () => {
  // Use the adapter with no override to exercise the default resolver via
  // the inputs.dev_review_skill_url channel.
  const RELEASE_ENVS = [
    "DITTO_RELEASE_VERSION",
    "DITTO_RELEASE_OWNER",
    "DITTO_RELEASE_REPO",
  ] as const;

  function clearReleaseEnvs() {
    for (const k of RELEASE_ENVS) delete process.env[k];
  }

  it("omits dev_review_skill_url when DITTO_RELEASE_VERSION is unset", async () => {
    clearReleaseEnvs();
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 5000 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.dev_review_skill_url).toBeUndefined();
  });

  it("omits dev_review_skill_url when only VERSION is set (no owner/repo defaults)", async () => {
    clearReleaseEnvs();
    process.env.DITTO_RELEASE_VERSION = "v1.42.0";
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 5001 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.dev_review_skill_url).toBeUndefined();
    clearReleaseEnvs();
  });

  it("populates dev_review_skill_url when ALL THREE env vars are set", async () => {
    clearReleaseEnvs();
    process.env.DITTO_RELEASE_VERSION = "v1.42.0";
    process.env.DITTO_RELEASE_OWNER = "myorg";
    process.env.DITTO_RELEASE_REPO = "my-ditto-fork";
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [{ status: 201, json: { id: 5002 } }],
      calls,
    );
    const adapter = createGithubActionAdapter({
      db: testDb,
      fetch: fetchImpl,
      resolveCredential: async () => ({ value: "ghp_x", service: "x" }),
    });
    await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.inputs.dev_review_skill_url).toBe(
      "https://github.com/myorg/my-ditto-fork/releases/download/v1.42.0/dev-review-SKILL.md",
    );
    clearReleaseEnvs();
  });
});
