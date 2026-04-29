/**
 * pauseRunnerDispatchForApproval — Brief 221 AC #4 unit tests.
 *
 * Matrix:
 *   (a) trustAction = pause → mints review-page, returns reviewToken
 *   (b) trustAction = sample_pause → identical to (a)
 *   (c) trustAction = advance → calls dispatchWorkItem, returns dispatch
 *   (d) trustAction = sample_advance → identical to (c)
 *   (e) trustTier = critical → rejects pre-flight, no review-page minted
 *
 * Insight-180: missing stepRunId → reject, no DB writes.
 *
 * Production-caller AC: a grep test verifies post-Brief-221, the
 * production callers of `dispatchWorkItem` are exactly:
 *   - src/engine/harness-handlers/runner-pause.ts
 *   - packages/web/app/api/v1/review/[token]/approve/route.ts
 * (Brief 231 will add `runner-dispatches/[id]/retry-next-in-chain/route.ts`;
 * pre-Brief-221 the count was 0.)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-utils";
import {
  registerAdapter,
  _resetRegistryForTests,
} from "../runner-registry";
import {
  projects,
  projectRunners,
  workItems,
  processes,
  processRuns,
  stepRuns,
  reviewPages,
  harnessDecisions,
} from "../../db/schema";
import type { RunnerAdapter } from "@ditto/core";

let testDb: TestDb;
let cleanup: () => void;

// Stub the workspace `db` import the handler uses, by replacing it via
// dynamic import after creating the test DB and pointing the module-scoped
// `db` reference at it. (Mirrors runner-dispatcher.test.ts pattern.)
beforeEach(() => {
  process.env.DITTO_TEST_MODE = "true";
  // The pause handler also uses `createReviewPage` which needs an HMAC secret.
  if (!process.env.REVIEW_PAGE_SECRET) {
    process.env.REVIEW_PAGE_SECRET = "test-secret";
  }
  _resetRegistryForTests();
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
  // Module-scoped `db` import: replace via vi.doMock before importing handler.
  vi.doMock("../../db", () => ({ db: testDb, schema: { reviewPages } }));
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
  vi.restoreAllMocks();
  vi.resetModules();
});

// ============================================================
// Seed helper — same shape as runner-dispatcher.test.ts
// ============================================================

async function seedPauseContext(opts: {
  trustTier?: "supervised" | "spot_checked" | "autonomous" | "critical";
  modeRequired?: "local" | "cloud" | "any" | null;
  runnersConfigured?: Array<"local-mac-mini" | "claude-code-routine">;
}): Promise<{
  workItemId: string;
  projectId: string;
  processRunId: string;
  stepRunId: string;
}> {
  const projectId = "proj_pause";
  const processId = "proc_pause";
  const processRunId = "run_pause";
  const stepRunId = "step_pause";
  const workItemId = "wi_pause";

  await testDb.insert(projects).values({
    id: projectId,
    slug: "pause-project",
    name: "Pause Project",
    githubRepo: "test/repo",
    harnessType: "catalyst",
    defaultRunnerKind: "claude-code-routine",
    fallbackRunnerKind: "claude-managed-agent",
    status: "active",
  });
  await testDb.insert(processes).values({
    id: processId,
    name: "Pause Process",
    slug: "pause-process",
    definition: { steps: [] },
  });
  await testDb.insert(processRuns).values({
    id: processRunId,
    processId,
    triggeredBy: "test-fixture",
  });
  await testDb.insert(stepRuns).values({
    id: stepRunId,
    processRunId,
    stepId: "s1",
    executorType: "ai-agent",
  });

  const kinds = opts.runnersConfigured ?? ["claude-code-routine"];
  for (const kind of kinds) {
    await testDb.insert(projectRunners).values({
      projectId,
      kind,
      mode: kind === "local-mac-mini" ? "local" : "cloud",
      enabled: true,
      configJson: { endpoint_url: "https://example", bearer: "x" },
      credentialIds: [],
      lastHealthStatus: "healthy",
    });
  }

  await testDb.insert(workItems).values({
    id: workItemId,
    type: "feature",
    status: "intake",
    content: "Add /healthz endpoint to agent-crm app router.",
    source: "system_generated",
    projectId,
    runnerModeRequired: opts.modeRequired ?? null,
    context: { title: "Add /healthz endpoint" },
  });

  return { workItemId, projectId, processRunId, stepRunId };
}

function happyPathAdapter(kind: RunnerAdapter["kind"]): RunnerAdapter {
  return {
    kind,
    mode: kind === "local-mac-mini" ? "local" : "cloud",
    configSchema: z.object({}).passthrough(),
    supportsCancel: false,
    execute: async () => ({
      externalRunId: `ext_${kind}`,
      externalUrl: null,
      startedAt: new Date(),
    }),
    status: async () => ({
      status: "running",
      externalRunId: null,
      externalUrl: null,
      lastUpdatedAt: new Date(),
    }),
    cancel: async () => ({ ok: true }),
    healthCheck: async () => ({ status: "healthy" }),
  };
}

// ============================================================
// (a) + (b) — pause / sample_pause mint a review-page
// ============================================================

describe("pauseRunnerDispatchForApproval — pause / sample_pause", () => {
  it("(a) trustAction=pause → mints review-page + harness_decisions row", async () => {
    const ctx = await seedPauseContext({});
    const { pauseRunnerDispatchForApproval } = await import("./runner-pause");
    const out = await pauseRunnerDispatchForApproval({
      stepRunId: ctx.stepRunId,
      workItemId: ctx.workItemId,
      processRunId: ctx.processRunId,
      trustTier: "supervised",
      trustAction: "pause",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.kind).toBe("paused");
    }
    if (out.ok && out.kind === "paused") {
      expect(out.reviewToken).toBeTruthy();
      expect(out.reviewUrl).toBe(`/review/${out.reviewToken}`);
      expect(out.eligibleKinds).toContain("claude-code-routine");
    }

    // review_pages row written.
    const pages = await testDb.select().from(reviewPages);
    expect(pages).toHaveLength(1);
    const blocks = pages[0].contentBlocks as Array<{ type: string; formId?: string }>;
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("work_item_form");
    expect(blocks[1].formId).toBe("runner-dispatch-approval");
    expect(blocks[2].type).toBe("actions");

    // harness_decisions row written.
    const decisions = await testDb.select().from(harnessDecisions);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].stepRunId).toBe(ctx.stepRunId);
    expect(decisions[0].trustAction).toBe("pause");
    expect(decisions[0].reviewPattern).toEqual(["runner_dispatch_pause"]);
  });

  it("(b) trustAction=sample_pause behaves identically to pause", async () => {
    const ctx = await seedPauseContext({});
    const { pauseRunnerDispatchForApproval } = await import("./runner-pause");
    const out = await pauseRunnerDispatchForApproval({
      stepRunId: ctx.stepRunId,
      workItemId: ctx.workItemId,
      processRunId: ctx.processRunId,
      trustTier: "spot_checked",
      trustAction: "sample_pause",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.kind).toBe("paused");
    }
  });
});

// ============================================================
// (c) + (d) — advance / sample_advance call dispatchWorkItem directly
// ============================================================

describe("pauseRunnerDispatchForApproval — advance / sample_advance", () => {
  it("(c) trustAction=advance → no review-page; calls dispatchWorkItem", async () => {
    registerAdapter(happyPathAdapter("claude-code-routine"));
    const ctx = await seedPauseContext({});
    const { pauseRunnerDispatchForApproval } = await import("./runner-pause");
    const out = await pauseRunnerDispatchForApproval({
      stepRunId: ctx.stepRunId,
      workItemId: ctx.workItemId,
      processRunId: ctx.processRunId,
      trustTier: "autonomous",
      trustAction: "advance",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.kind).toBe("dispatched");
    }
    const pages = await testDb.select().from(reviewPages);
    expect(pages).toHaveLength(0);
  });

  it("(d) trustAction=sample_advance behaves identically to advance", async () => {
    registerAdapter(happyPathAdapter("claude-code-routine"));
    const ctx = await seedPauseContext({});
    const { pauseRunnerDispatchForApproval } = await import("./runner-pause");
    const out = await pauseRunnerDispatchForApproval({
      stepRunId: ctx.stepRunId,
      workItemId: ctx.workItemId,
      processRunId: ctx.processRunId,
      trustTier: "spot_checked",
      trustAction: "sample_advance",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.kind).toBe("dispatched");
    }
  });
});

// ============================================================
// (e) — critical-tier rejected pre-flight
// ============================================================

describe("pauseRunnerDispatchForApproval — critical tier", () => {
  it("trustTier=critical rejects pre-flight without minting review-page", async () => {
    const ctx = await seedPauseContext({ trustTier: "critical" });
    const { pauseRunnerDispatchForApproval } = await import("./runner-pause");
    const out = await pauseRunnerDispatchForApproval({
      stepRunId: ctx.stepRunId,
      workItemId: ctx.workItemId,
      processRunId: ctx.processRunId,
      trustTier: "critical",
      trustAction: "pause",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.kind).toBe("criticalRejected");
    }
    const pages = await testDb.select().from(reviewPages);
    expect(pages).toHaveLength(0);
    const decisions = await testDb.select().from(harnessDecisions);
    expect(decisions).toHaveLength(0);
  });
});

// ============================================================
// Insight-180 — stepRunId guard at handler entry
// ============================================================

describe("pauseRunnerDispatchForApproval — Insight-180 guard", () => {
  it("throws on missing stepRunId when DITTO_TEST_MODE is unset", async () => {
    delete process.env.DITTO_TEST_MODE;
    vi.resetModules();
    vi.doMock("../../db", () => ({ db: testDb, schema: { reviewPages } }));
    const { pauseRunnerDispatchForApproval } = await import("./runner-pause");
    await expect(
      pauseRunnerDispatchForApproval({
        stepRunId: "",
        workItemId: "wi",
        processRunId: "p",
        trustTier: "supervised",
        trustAction: "pause",
      }),
    ).rejects.toThrow(/Insight-180/);
    process.env.DITTO_TEST_MODE = "true";
  });
});

// ============================================================
// Production-caller AC — Brief 221 AC #4 grep test
// ============================================================

describe("dispatchWorkItem production-caller set (AC #4)", () => {
  it("only the expected production files import dispatchWorkItem", () => {
    const repoRoot = join(__dirname, "..", "..", "..");
    const callers: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry === "dist")
          continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        if (/\.test\.tsx?$/.test(entry)) continue;
        const src = readFileSync(full, "utf-8");
        // Match `dispatchWorkItem` as an imported symbol or a call site.
        if (
          /from\s+["']\.{1,2}.*runner-dispatcher["']/.test(src) &&
          /dispatchWorkItem/.test(src)
        ) {
          callers.push(full.slice(repoRoot.length + 1));
        }
      }
    }

    walk(join(repoRoot, "src"));
    walk(join(repoRoot, "packages", "web", "app"));

    // The dispatcher file itself defines + exports dispatchWorkItem; not a caller.
    const callerSet = new Set(callers);
    callerSet.delete("src/engine/runner-dispatcher.ts");

    // Brief 221 introduces runner-pause.ts as the first production caller.
    // Brief 231 will add the retry-next-in-chain route.
    // Once Brief 221's web-side approve route lands, that becomes the second.
    // For incremental commits, accept any subset of these as long as each
    // present file is on the allow-list.
    const allowList = new Set([
      "src/engine/harness-handlers/runner-pause.ts",
      "packages/web/app/api/v1/review/[token]/approve/route.ts",
      // Brief 231 (deferred):
      "packages/web/app/api/v1/runner-dispatches/[id]/retry-next-in-chain/route.ts",
    ]);
    for (const c of callerSet) {
      expect(
        allowList.has(c),
        `unexpected production caller of dispatchWorkItem: ${c}`,
      ).toBe(true);
    }
    // Must include at least the pause handler (post-Brief-221).
    expect(callerSet.has("src/engine/harness-handlers/runner-pause.ts")).toBe(
      true,
    );
  });
});
