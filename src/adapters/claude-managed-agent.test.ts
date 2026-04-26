/**
 * claude-managed-agent adapter tests — Brief 217 AC #2, #4, #5, #6, #7, #8, #10.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";
import {
  createManagedAgentAdapter,
  managedAgentConfigSchema,
  applyTerminalStateHeuristic,
} from "./claude-managed-agent";
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
  agent_id: "agt_01abc",
  environment_id: "env_01abc",
  default_repo: "owner/repo",
  default_branch: "main",
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
      runnerKind: "claude-managed-agent",
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
      kind: "claude-managed-agent",
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

function buildCtx(overrides: Partial<DispatchExecuteContext> = {}): DispatchExecuteContext {
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
  defaultRunnerKind: "claude-managed-agent",
  fallbackRunnerKind: null,
  runnerChain: null,
};

const PROJECT_RUNNER_REF: ProjectRunnerRef = {
  id: "pr_runner_01",
  projectId: "proj_01",
  kind: "claude-managed-agent",
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

describe("managedAgentConfigSchema", () => {
  it("accepts a valid config", () => {
    const r = managedAgentConfigSchema.safeParse(VALID_CONFIG);
    expect(r.success).toBe(true);
  });

  it("rejects malformed agent_id (must match agt_*)", () => {
    const r = managedAgentConfigSchema.safeParse({
      ...VALID_CONFIG,
      agent_id: "12345",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed environment_id (must match env_*)", () => {
    const r = managedAgentConfigSchema.safeParse({
      ...VALID_CONFIG,
      environment_id: "myenv",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed default_repo", () => {
    const r = managedAgentConfigSchema.safeParse({
      ...VALID_CONFIG,
      default_repo: "owner-only",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional agent_version, vault_ids, callback_mode, observe_events", () => {
    const r = managedAgentConfigSchema.safeParse({
      ...VALID_CONFIG,
      agent_version: 4,
      vault_ids: ["vault_a", "vault_b"],
      callback_mode: "in-prompt",
      observe_events: true,
      beta_header: "managed-agents-2026-09-01",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown callback_mode value", () => {
    const r = managedAgentConfigSchema.safeParse({
      ...VALID_CONFIG,
      callback_mode: "magic",
    });
    expect(r.success).toBe(false);
  });
});

// ============================================================
// AC #4 — Insight-180 stepRunId guard
// ============================================================

describe("createManagedAgentAdapter — execute() Insight-180 guard", () => {
  it("rejects missing stepRunId WITHOUT writing to DB or hitting the network", async () => {
    delete process.env.DITTO_TEST_MODE;
    let fetchCalled = false;
    let credentialResolved = false;
    const adapter = createManagedAgentAdapter({
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
// AC #2 — execute() happy + error paths
// ============================================================

describe("createManagedAgentAdapter — execute()", () => {
  it("returns failed when config_json is invalid", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200 }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      { ...PROJECT_RUNNER_REF, configJson: { agent_id: "bad" } },
    );
    expect(r.finalStatus).toBe("failed");
    expect(r.errorReason).toMatch(/Invalid config_json/);
  });

  it("returns failed when API key credential is missing from vault", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200 }) as unknown as typeof fetch,
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

  it("dispatches successfully (polling-mode default) and does NOT persist a callback token", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [
        { status: 200, json: { id: "session_01xyz", status: "idle" } },
        { status: 202, json: { ok: true } },
      ],
      calls,
    );
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: fetchImpl,
      statusWebhookUrlFor: (id) => `https://test/api/v1/work-items/${id}/status`,
      harnessTypeFor: () => "catalyst",
      resolveCredential: async () => ({
        value: "sk-ant-key",
        service: "runner.agent-crm.api_key",
      }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.externalRunId).toBe("session_01xyz");
    expect(r.externalUrl).toBe("https://platform.claude.com/sessions/session_01xyz");
    expect(r.finalStatus).toBeUndefined();

    const sessionsCall = calls[0];
    const headers = sessionsCall.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-key");
    expect(headers["anthropic-beta"]).toBe("managed-agents-2026-04-01");

    const sessionsBody = JSON.parse(sessionsCall.init.body as string);
    expect(sessionsBody.agent).toEqual({ type: "agent", id: "agt_01abc" });
    expect(sessionsBody.environment_id).toBe("env_01abc");

    const eventsCall = calls[1];
    expect(eventsCall.url).toBe(
      "https://api.anthropic.com/v1/sessions/session_01xyz/events",
    );
    const eventsBody = JSON.parse(eventsCall.init.body as string);
    expect(eventsBody.events[0].type).toBe("user.message");
    expect(eventsBody.events[0].content[0].text).toContain(WORK_ITEM_REF.content);
    expect(eventsBody.events[0].content[0].text).toContain("/dev-review");
    expect(eventsBody.events[0].content[0].text).not.toContain("INTERNAL DIRECTIVE");
    expect(eventsBody.events[0].content[0].text).not.toContain("Bearer");

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).toBeNull();
  });

  it("persists bcrypt-hashed callback token when callback_mode='in-prompt' (AC #10)", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [
        { status: 200, json: { id: "session_01zzz", status: "idle" } },
        { status: 202, json: { ok: true } },
      ],
      calls,
    );
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: fetchImpl,
      statusWebhookUrlFor: (id) => `https://test/api/v1/work-items/${id}/status`,
      harnessTypeFor: () => "catalyst",
      resolveCredential: async () => ({
        value: "sk-ant-key",
        service: "runner.agent-crm.api_key",
      }),
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      {
        ...PROJECT_RUNNER_REF,
        configJson: { ...VALID_CONFIG, callback_mode: "in-prompt" },
      },
    );
    expect(r.externalRunId).toBe("session_01zzz");

    const eventsBody = JSON.parse(calls[1].init.body as string);
    const promptText = eventsBody.events[0].content[0].text as string;
    expect(promptText).toContain("INTERNAL DIRECTIVE");
    expect(promptText).toContain('"runnerKind": "claude-managed-agent"');
    expect(promptText).toContain("https://test/api/v1/work-items/wi_01/status");

    const tokenMatch = /Bearer ([\w-]+)/.exec(promptText);
    expect(tokenMatch).not.toBeNull();
    const presented = tokenMatch![1];
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).not.toBeNull();
    const ok = await bcrypt.compare(presented, rows[0].callbackTokenHash!);
    expect(ok).toBe(true);
  });

  it("maps 429 → rate_limited and 408/504 → timed_out on session.create", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter429 = createManagedAgentAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 429, text: "rate limit" }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      harnessTypeFor: () => "catalyst",
    });
    const r429 = await adapter429.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r429.finalStatus).toBe("rate_limited");

    const adapter408 = createManagedAgentAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 408, text: "timeout" }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      harnessTypeFor: () => "catalyst",
    });
    const r408 = await adapter408.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r408.finalStatus).toBe("timed_out");
  });

  it("returns failed when /v1/sessions response is missing `id`", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200, json: { not_id: "x" } }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      harnessTypeFor: () => "catalyst",
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.finalStatus).toBe("failed");
    expect(r.errorReason).toMatch(/missing `id`/);
  });

  it("includes agent_version + vault_ids in session.create body when configured", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const calls: ScriptedFetchCall[] = [];
    const fetchImpl = scriptedFetch(
      [
        { status: 200, json: { id: "session_v", status: "idle" } },
        { status: 202, json: { ok: true } },
      ],
      calls,
    );
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: fetchImpl,
      harnessTypeFor: () => "catalyst",
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    await adapter.execute(buildCtx({ dispatchId }), WORK_ITEM_REF, PROJECT_REF, {
      ...PROJECT_RUNNER_REF,
      configJson: {
        ...VALID_CONFIG,
        agent_version: 7,
        vault_ids: ["vault_a"],
      },
    });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.agent).toEqual({ type: "agent", id: "agt_01abc", version: 7 });
    expect(body.vault_ids).toEqual(["vault_a"]);
  });
});

// ============================================================
// AC #7 — Terminal-state heuristic table
// ============================================================

describe("applyTerminalStateHeuristic — Brief 217 §D2 / AC #7", () => {
  const baseInput = {
    dispatchedAt: new Date(2026, 0, 1, 10, 0, 0),
    now: new Date(2026, 0, 1, 10, 5, 0),
    terminalIdleThresholdMs: 30_000,
    dispatchGraceMs: 5_000,
  };

  it("Row 1: terminated → failed (with terminate reason)", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "terminated", terminated_reason: "container OOM" },
      [],
      baseInput,
    );
    expect(r.status).toBe("failed");
    expect(r.errorReason).toBe("container OOM");
  });

  it("Row 2: running → running", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "running" },
      [],
      baseInput,
    );
    expect(r.status).toBe("running");
  });

  it("Row 3: rescheduling → running", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "rescheduling" },
      [],
      baseInput,
    );
    expect(r.status).toBe("running");
  });

  it("Row 4: idle + last agent.message + idle for >30s → succeeded", () => {
    const lastEventAt = new Date(2026, 0, 1, 10, 4, 0).toISOString();
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [{ type: "agent.message", created_at: lastEventAt }],
      baseInput,
    );
    expect(r.status).toBe("succeeded");
  });

  it("Row 5a: idle + last agent.error matching /rate.?limit/i → rate_limited", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [
        {
          type: "agent.error",
          created_at: new Date(2026, 0, 1, 10, 4, 0).toISOString(),
          error: { message: "Rate-limit exceeded" },
        },
      ],
      baseInput,
    );
    expect(r.status).toBe("rate_limited");
  });

  it("Row 5b: idle + last agent.error matching /timeout|timed.?out/i → timed_out", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [
        {
          type: "agent.error",
          created_at: new Date(2026, 0, 1, 10, 4, 0).toISOString(),
          error: "request timed out",
        },
      ],
      baseInput,
    );
    expect(r.status).toBe("timed_out");
  });

  it("Row 5c: idle + last agent.error generic → failed", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [
        {
          type: "agent.error",
          created_at: new Date(2026, 0, 1, 10, 4, 0).toISOString(),
          error: "auth blew up",
        },
      ],
      baseInput,
    );
    expect(r.status).toBe("failed");
    expect(r.errorReason).toBe("auth blew up");
  });

  it("Row 6: idle + last pending agent.tool_use → running (steering surface absent at MVP)", () => {
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [
        {
          type: "agent.tool_use",
          created_at: new Date(2026, 0, 1, 10, 4, 0).toISOString(),
          pending: true,
        },
      ],
      baseInput,
    );
    expect(r.status).toBe("running");
  });

  it("Row 7: idle + dispatch grace not elapsed → running", () => {
    const justDispatched = {
      ...baseInput,
      dispatchedAt: new Date(2026, 0, 1, 10, 4, 58),
      now: new Date(2026, 0, 1, 10, 4, 59),
    };
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [],
      justDispatched,
    );
    expect(r.status).toBe("running");
  });

  it("idle + last agent.message but recent (<30s) → running (still settling)", () => {
    const lastEventAt = new Date(2026, 0, 1, 10, 4, 50).toISOString();
    const r = applyTerminalStateHeuristic(
      { id: "s", status: "idle" },
      [{ type: "agent.message", created_at: lastEventAt }],
      baseInput,
    );
    expect(r.status).toBe("running");
  });
});

// ============================================================
// healthCheck (D8)
// ============================================================

describe("createManagedAgentAdapter — healthCheck()", () => {
  it("returns healthy when config + credential are present (no live API call)", async () => {
    let fetchCalled = false;
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: (async () => {
        fetchCalled = true;
        return new Response();
      }) as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const r = await adapter.healthCheck(PROJECT_RUNNER_REF);
    expect(r.status).toBe("healthy");
    expect(fetchCalled).toBe(false);
  });

  it("returns unauthenticated when API key is missing from vault", async () => {
    const adapter = createManagedAgentAdapter({
      db: testDb,
      resolveCredential: async () => null,
    });
    const r = await adapter.healthCheck(PROJECT_RUNNER_REF);
    expect(r.status).toBe("unauthenticated");
  });

  it("returns unauthenticated on invalid config", async () => {
    const adapter = createManagedAgentAdapter({
      db: testDb,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const r = await adapter.healthCheck({
      ...PROJECT_RUNNER_REF,
      configJson: { agent_id: "bad" },
    });
    expect(r.status).toBe("unauthenticated");
  });
});

// ============================================================
// cancel() — Anthropic archive endpoint
// ============================================================

describe("createManagedAgentAdapter — cancel()", () => {
  it("calls archive endpoint and returns ok on 2xx", async () => {
    await seedFixtures({ withRunner: true });
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
      externalRunId: "session_x",
    });
    const calls: ScriptedFetchCall[] = [];
    const adapter = createManagedAgentAdapter({
      db: testDb,
      fetch: scriptedFetch([{ status: 200, json: { ok: true } }], calls),
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const r = await adapter.cancel(dispatchId, "session_x");
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe(
      "https://api.anthropic.com/v1/sessions/session_x/archive",
    );
  });

  it("returns ok:false when dispatch row missing", async () => {
    const adapter = createManagedAgentAdapter({ db: testDb });
    const r = await adapter.cancel("does_not_exist", "session_x");
    expect(r.ok).toBe(false);
  });
});
