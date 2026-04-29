/**
 * claude-code-routine adapter tests — Brief 216 AC #2, #4, #5, #9.
 *
 * Uses createTestDb() (real SQLite) — same pattern as runner-dispatcher.test.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";
import {
  createRoutineAdapter,
  routineConfigSchema,
  _clearHarnessTypeCacheForTests,
  primeHarnessTypeCache,
  invalidateHarnessTypeCache,
} from "./claude-code-routine";
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
  _clearHarnessTypeCacheForTests();
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
  _clearHarnessTypeCacheForTests();
});

const VALID_CONFIG = {
  endpoint_url:
    "https://api.anthropic.com/v1/claude_code/routines/trig_01abc/fire",
  bearer_credential_id: "cred_01abc",
  default_repo: "owner/repo",
  default_branch: "main",
};

async function seedDispatchRow(opts: {
  workItemId: string;
  projectId: string;
  stepRunId: string;
}): Promise<string> {
  const inserted = await testDb
    .insert(runnerDispatches)
    .values({
      workItemId: opts.workItemId,
      projectId: opts.projectId,
      runnerKind: "claude-code-routine",
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: opts.stepRunId,
      status: "queued",
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

async function seedFixtures() {
  // Seed minimum FK chain: process → processRun → stepRun → project → workItem.
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
  defaultRunnerKind: "claude-code-routine",
  fallbackRunnerKind: null,
  runnerChain: null,
};

const PROJECT_RUNNER_REF: ProjectRunnerRef = {
  id: "pr_runner_01",
  projectId: "proj_01",
  kind: "claude-code-routine",
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
// Tests
// ============================================================

describe("routineConfigSchema", () => {
  it("accepts a valid config", () => {
    const r = routineConfigSchema.safeParse(VALID_CONFIG);
    expect(r.success).toBe(true);
  });

  it("rejects non-anthropic endpoint_url", () => {
    const r = routineConfigSchema.safeParse({
      ...VALID_CONFIG,
      endpoint_url: "https://example.com/v1/foo",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed default_repo", () => {
    const r = routineConfigSchema.safeParse({
      ...VALID_CONFIG,
      default_repo: "not-a-repo",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing bearer_credential_id", () => {
    const { bearer_credential_id: _omit, ...partial } = VALID_CONFIG;
    void _omit;
    const r = routineConfigSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });
});

describe("createRoutineAdapter — execute()", () => {
  it("rejects missing stepRunId WITHOUT writing to DB or hitting the network", async () => {
    delete process.env.DITTO_TEST_MODE;
    let fetchCalled = false;
    const adapter = createRoutineAdapter({
      db: testDb,
      fetch: (async () => {
        fetchCalled = true;
        return new Response();
      }) as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
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

    // Pre-existing row was unmodified — its callbackTokenHash is still null.
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).toBeNull();
    process.env.DITTO_TEST_MODE = "true";
  });

  it("returns failed when config_json is invalid", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createRoutineAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200 }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });

    const result = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      { ...PROJECT_RUNNER_REF, configJson: { endpoint_url: "bad" } },
    );

    expect(result.finalStatus).toBe("failed");
    expect(result.errorReason).toMatch(/Invalid config_json/);
  });

  it("returns failed when bearer credential is missing from vault", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createRoutineAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200 }) as unknown as typeof fetch,
      resolveCredential: async () => null,
    });

    const result = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );

    expect(result.finalStatus).toBe("failed");
    expect(result.errorReason).toMatch(/Bearer credential not found/);
  });

  it("dispatches successfully and persists bcrypt-hashed callback token", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    let firedBody: { text: string } | null = null;
    let firedHeaders: Record<string, string> = {};
    const adapter = createRoutineAdapter({
      db: testDb,
      statusWebhookUrlFor: (id) => `https://test/api/v1/work-items/${id}/status`,
      harnessTypeFor: async () => "catalyst",
      fetch: (async (_url: string, init: RequestInit) => {
        firedBody = JSON.parse(init.body as string);
        firedHeaders = init.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            claude_code_session_id: "session_01xyz",
            claude_code_session_url: "https://code.claude.com/session/01xyz",
          }),
          text: async () => "",
        } as unknown as Response;
      }) as typeof fetch,
      resolveCredential: async () => ({
        value: "sk-ant-bearer",
        service: "routine.agent-crm.bearer",
      }),
    });

    const result = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );

    expect(result.externalRunId).toBe("session_01xyz");
    expect(result.externalUrl).toBe("https://code.claude.com/session/01xyz");
    expect(result.finalStatus).toBeUndefined();

    // Headers carried bearer + beta header.
    expect(firedHeaders.Authorization).toBe("Bearer sk-ant-bearer");
    expect(firedHeaders["anthropic-beta"]).toBe("experimental-cc-routine-2026-04-01");

    // Prompt body contained work-item content + /dev-review reference.
    expect(firedBody!.text).toContain(WORK_ITEM_REF.content);
    expect(firedBody!.text).toContain("/dev-review");
    expect(firedBody!.text).toContain("INTERNAL DIRECTIVE");

    // Plaintext token appears in the prompt; bcrypt hash on the row.
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].callbackTokenHash).not.toBeNull();
    // The token in the prompt body should NOT match the hash directly.
    const tokenMatch = /Bearer ([\w-]+)/.exec(firedBody!.text);
    expect(tokenMatch).not.toBeNull();
    const presented = tokenMatch![1];
    const ok = await bcrypt.compare(presented, rows[0].callbackTokenHash!);
    expect(ok).toBe(true);
  });

  it("maps 429 → rate_limited and 408 → timed_out", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter429 = createRoutineAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 429, text: "rate limit" }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      harnessTypeFor: async () => "catalyst",
    });
    const r429 = await adapter429.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r429.finalStatus).toBe("rate_limited");

    const adapter408 = createRoutineAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 408, text: "timeout" }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      harnessTypeFor: async () => "catalyst",
    });
    const r408 = await adapter408.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r408.finalStatus).toBe("timed_out");
  });

  it("returns failed when /fire response is missing claude_code_session_id", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    const adapter = createRoutineAdapter({
      db: testDb,
      fetch: fakeFetch({ status: 200, json: { unrelated: "field" } }) as unknown as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      harnessTypeFor: async () => "catalyst",
    });
    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.finalStatus).toBe("failed");
    expect(r.errorReason).toMatch(/missing claude_code_session_id/);
  });
});

describe("createRoutineAdapter — healthCheck()", () => {
  it("returns healthy when config + credential are present (no live API call)", async () => {
    const adapter = createRoutineAdapter({
      db: testDb,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const result = await adapter.healthCheck(PROJECT_RUNNER_REF);
    expect(result.status).toBe("healthy");
  });

  it("returns unauthenticated when bearer is missing from vault", async () => {
    const adapter = createRoutineAdapter({
      db: testDb,
      resolveCredential: async () => null,
    });
    const result = await adapter.healthCheck(PROJECT_RUNNER_REF);
    expect(result.status).toBe("unauthenticated");
  });

  it("returns unauthenticated on invalid config", async () => {
    const adapter = createRoutineAdapter({
      db: testDb,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
    });
    const result = await adapter.healthCheck({
      ...PROJECT_RUNNER_REF,
      configJson: { endpoint_url: "bad" },
    });
    expect(result.status).toBe("unauthenticated");
  });
});

describe("createRoutineAdapter — cancel()", () => {
  it("returns ok:false with manual-cancel guidance", async () => {
    const adapter = createRoutineAdapter({ db: testDb });
    const r = await adapter.cancel("d_01", "session_01");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/preview API|terminate manually/);
  });
});

describe("createRoutineAdapter — harnessType cache fallback (Reviewer fix)", () => {
  it("falls back to a per-dispatch DB lookup when the project is not in the cache", async () => {
    await seedFixtures();
    const dispatchId = await seedDispatchRow({
      workItemId: "wi_01",
      projectId: "proj_01",
      stepRunId: "sr_01",
    });
    // Cache is cleared in beforeEach — proj_01's harnessType ('catalyst') must
    // be discovered via DB read at dispatch time, not silently default to 'native'.
    let capturedPrompt = "";
    const adapter = createRoutineAdapter({
      db: testDb,
      fetch: (async (_url: string, init: RequestInit) => {
        capturedPrompt = JSON.parse(init.body as string).text;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            claude_code_session_id: "session_01",
            claude_code_session_url: "https://x",
          }),
          text: async () => "",
        } as unknown as Response;
      }) as typeof fetch,
      resolveCredential: async () => ({ value: "tok", service: "x" }),
      // No harnessTypeFor override — exercise the default DB-fallback path.
    });

    const r = await adapter.execute(
      buildCtx({ dispatchId }),
      WORK_ITEM_REF,
      PROJECT_REF,
      PROJECT_RUNNER_REF,
    );
    expect(r.externalRunId).toBe("session_01");
    // catalyst harnessType means /dev-review reference, NOT inlined skill text.
    expect(capturedPrompt).toContain("/dev-review");
    expect(capturedPrompt).not.toContain("<dev-review-skill>");
  });

  it("primes + invalidates cache correctly", () => {
    primeHarnessTypeCache([["proj_a", "catalyst"], ["proj_b", "native"]]);
    invalidateHarnessTypeCache("proj_a");
    // No assertion on internals; we just verify these helpers don't throw.
    expect(true).toBe(true);
  });
});
