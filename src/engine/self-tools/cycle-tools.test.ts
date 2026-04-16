/**
 * Tests for Brief 118 — Operating Cycle Self-Tools
 *
 * Tests: activate_cycle, pause_cycle, resume_cycle, cycle_briefing, cycle_status
 * Also tests cycle-aware network tools and scheduler dual triggers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Mock heartbeat to avoid actual process execution
vi.mock("../heartbeat", () => ({
  startProcessRun: vi.fn(async (slug: string, inputs: Record<string, unknown>, triggeredBy: string, options?: { cycleType?: string; cycleConfig?: Record<string, unknown> }) => {
    // Look up the real process ID from the test DB
    const [proc] = testDb
      .select({ id: schema.processes.id })
      .from(schema.processes)
      .where(eq(schema.processes.slug, slug))
      .all();

    const processId = proc?.id ?? `proc-${slug}`;

    const runId = randomUUID();
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      status: "queued",
      triggeredBy,
      inputs: inputs as Record<string, unknown>,
      cycleType: options?.cycleType ?? null,
      cycleConfig: options?.cycleConfig ?? null,
    }).run();

    return runId;
  }),
  fullHeartbeat: vi.fn(async () => ({
    processRunId: "mock",
    stepsExecuted: 0,
    status: "completed",
    message: "mock",
  })),
}));

// Import after mocks
const {
  handleActivateCycle,
  handlePauseCycle,
  handleResumeCycle,
  handleCycleBriefing,
  handleCycleStatus,
} = await import("./cycle-tools");

const SALES_DEFINITION = {
  name: "Sales & Marketing Cycle",
  id: "sales-marketing-cycle",
  version: 1,
  status: "active",
  trigger: { type: "schedule", cron: "0 8 * * 1-5" },
  inputs: [],
  steps: [],
  outputs: [],
  quality_criteria: [],
  feedback: { metrics: [], capture: [] },
  trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
};

const CONNECT_DEFINITION = {
  name: "Network Connecting Cycle",
  id: "network-connecting-cycle",
  version: 1,
  status: "active",
  trigger: { type: "schedule", cron: "0 9 * * 1,4" },
  inputs: [],
  steps: [],
  outputs: [],
  quality_criteria: [],
  feedback: { metrics: [], capture: [] },
  trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
};

const GTM_DEFINITION = {
  name: "GTM Pipeline Cycle",
  id: "gtm-pipeline-cycle",
  version: 2,
  status: "active",
  trigger: { type: "schedule", cron: "0 8 * * 1,4" },
  inputs: [],
  steps: [],
  outputs: [],
  quality_criteria: [],
  feedback: { metrics: [], capture: [] },
  trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
};

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;

  // Seed processes
  testDb.insert(schema.processes).values({
    name: "Sales & Marketing Cycle",
    slug: "sales-marketing-cycle",
    definition: SALES_DEFINITION as unknown as Record<string, unknown>,
  }).run();

  testDb.insert(schema.processes).values({
    name: "Network Connecting Cycle",
    slug: "network-connecting-cycle",
    definition: CONNECT_DEFINITION as unknown as Record<string, unknown>,
  }).run();

  testDb.insert(schema.processes).values({
    name: "GTM Pipeline Cycle",
    slug: "gtm-pipeline-cycle",
    definition: GTM_DEFINITION as unknown as Record<string, unknown>,
  }).run();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ============================================================
// activate_cycle
// ============================================================

describe("activate_cycle", () => {
  it("creates and starts a sales-marketing cycle with user config", async () => {
    const result = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Fill pipeline with 10 qualified leads per month",
      icp: "B2B SaaS companies, 50-200 employees",
      sendingIdentity: "principal",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("activate_cycle");
    expect(result.metadata?.cycleType).toBe("sales-marketing");
    expect(result.metadata?.runId).toBeDefined();

    // Verify process run was created
    const runs = testDb
      .select()
      .from(schema.processRuns)
      .all();
    expect(runs.length).toBeGreaterThan(0);
  });

  it("returns continuous operation framing", async () => {
    const result = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Grow revenue",
      icp: "SMBs",
      sendingIdentity: "principal",
    });

    expect(result.success).toBe(true);
    // AC2: framed as continuous operation
    expect(result.output).toContain("continuous");
    expect(result.output).not.toContain("I'll research your targets");
  });

  it("rejects unknown cycle type", async () => {
    const result = await handleActivateCycle({
      cycleType: "unknown-cycle",
      goals: "test",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("Unknown cycle type");
  });

  it("requires goals or ICP", async () => {
    const result = await handleActivateCycle({
      cycleType: "sales-marketing",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("goal or ICP");
  });

  it("triggers fullHeartbeat after activation (MP-1.3)", async () => {
    const { fullHeartbeat: mockFullHeartbeat } = await import("../heartbeat");

    const result = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Test heartbeat",
      icp: "Tech companies",
      sendingIdentity: "principal",
    });

    expect(result.success).toBe(true);

    // fullHeartbeat is called via setImmediate — flush microtasks
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockFullHeartbeat).toHaveBeenCalledWith(result.metadata?.runId);
  });

  it("prevents duplicate active cycles", async () => {
    // Activate first
    const first = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "First goal",
      icp: "Tech companies",
      sendingIdentity: "principal",
    });
    expect(first.success).toBe(true);

    const runId = first.metadata?.runId as string;

    // Mark it as running with cycleType set
    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    // Try to activate again
    const second = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Second goal",
      icp: "Different companies",
      sendingIdentity: "principal",
    });

    expect(second.success).toBe(false);
    expect(second.output).toContain("already running");
  });
});

// ============================================================
// pause_cycle / resume_cycle
// ============================================================

describe("pause_cycle and resume_cycle", () => {
  it("pauses a running cycle (status -> paused)", async () => {
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Test",
      icp: "Test",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const pauseResult = await handlePauseCycle({ cycleType: "sales-marketing" });
    expect(pauseResult.success).toBe(true);

    const [run] = testDb
      .select({ status: schema.processRuns.status })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId))
      .all();
    expect(run.status).toBe("paused");
  });

  it("resumes a paused cycle (status -> running)", async () => {
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Test",
      icp: "Test",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({ status: "paused", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const resumeResult = await handleResumeCycle({ cycleType: "sales-marketing" });
    expect(resumeResult.success).toBe(true);

    const [run] = testDb
      .select({ status: schema.processRuns.status })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId))
      .all();
    expect(run.status).toBe("running");
  });

  it("returns error when no cycle to pause", async () => {
    const result = await handlePauseCycle({ cycleType: "sales-marketing" });
    expect(result.success).toBe(false);
    expect(result.output).toContain("No active");
  });
});

// ============================================================
// cycle_briefing
// ============================================================

describe("cycle_briefing", () => {
  it("produces four-section briefing: context, summary, recommendations, options", async () => {
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Fill pipeline",
      icp: "B2B SaaS",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    // Set cycle metadata
    testDb.update(schema.processRuns)
      .set({
        status: "running",
        cycleType: "sales-marketing",
        cycleConfig: { goals: "Fill pipeline", icp: "B2B SaaS", continuous: true } as Record<string, unknown>,
        startedAt: new Date(),
        currentStepId: "assess",
      })
      .where(eq(schema.processRuns.id, runId))
      .run();

    // Add a completed step
    testDb.insert(schema.stepRuns).values({
      processRunId: runId,
      stepId: "sense",
      status: "approved",
      executorType: "ai-agent",
    }).run();

    // Add a pending review step
    testDb.insert(schema.stepRuns).values({
      processRunId: runId,
      stepId: "assess",
      status: "waiting_review",
      executorType: "ai-agent",
    }).run();

    const result = await handleCycleBriefing({ cycleType: "sales-marketing" });

    expect(result.success).toBe(true);
    // AC4: four sections
    expect(result.output).toContain("**Context**");
    expect(result.output).toContain("**Summary**");
    expect(result.output).toContain("**Recommendations**");
    expect(result.output).toContain("**Options**");
    expect(result.metadata?.completedSteps).toBe(1);
    expect(result.metadata?.pendingReviews).toBe(1);
  });
});

// ============================================================
// cycle_status
// ============================================================

describe("cycle_status", () => {
  it("returns active cycles with current phase and pending reviews", async () => {
    // Create two active cycles
    const sales = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Sales goal",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    testDb.update(schema.processRuns)
      .set({
        status: "running",
        cycleType: "sales-marketing",
        currentStepId: "act",
      })
      .where(eq(schema.processRuns.id, sales.metadata?.runId as string))
      .run();

    const connect = await handleActivateCycle({
      cycleType: "network-connecting",
      goals: "Connect goal",
      icp: "People",
      sendingIdentity: "principal",
    });
    testDb.update(schema.processRuns)
      .set({
        status: "running",
        cycleType: "network-connecting",
        currentStepId: "sense",
      })
      .where(eq(schema.processRuns.id, connect.metadata?.runId as string))
      .run();

    const result = await handleCycleStatus({});

    expect(result.success).toBe(true);
    expect(result.output).toContain("Operating Cycles");
    expect(result.output).toContain("sales-marketing");
    expect(result.output).toContain("network-connecting");
    expect(result.metadata?.activeCycles).toContain("sales-marketing");
    expect(result.metadata?.activeCycles).toContain("network-connecting");
  });

  it("shows empty state when no cycles active", async () => {
    const result = await handleCycleStatus({});
    expect(result.success).toBe(true);
    expect(result.output).toContain("No operating cycles active");
  });
});

// ============================================================
// Brief 139: GTM Pipeline as cycle type
// ============================================================

describe("gtm-pipeline cycle type", () => {
  it("activates with gtmContext and returns plan summary", async () => {
    const result = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: {
        planName: "Dev audience on X",
        product: "Ditto",
        audience: "Developers frustrated with AI agents",
        channels: "X",
      },
      goals: "Grow developer audience on X",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("activate_cycle");
    expect(result.output).toContain("growth plan");
    expect(result.output).toContain("Dev audience on X");
    expect(result.metadata?.cycleType).toBe("gtm-pipeline");
    expect(result.metadata?.runId).toBeDefined();
  });

  it("requires planName in gtmContext", async () => {
    const result = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      goals: "Grow audience",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("planName");
  });

  it("allows multiple concurrent plans with different planNames", async () => {
    const first = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Plan A" },
      goals: "Grow on X",
    });
    expect(first.success).toBe(true);

    // The mock now sets cycleType+cycleConfig, so the run is visible to overlap check

    const second = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Plan B" },
      goals: "Grow on LinkedIn",
    });
    expect(second.success).toBe(true);
    expect(second.metadata?.runId).not.toBe(first.metadata?.runId);
  });

  it("rejects duplicate planName within active GTM runs", async () => {
    await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Same Plan" },
      goals: "Grow audience",
    });

    const duplicate = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Same Plan" },
      goals: "Different goal",
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.output).toContain("already running");
    expect(duplicate.output).toContain("Same Plan");
  });

  it("pause_cycle with planName targets specific plan", async () => {
    const planA = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Plan A" },
      goals: "Grow on X",
    });

    const planB = await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Plan B" },
      goals: "Grow on LinkedIn",
    });

    // Mark both as running
    testDb.update(schema.processRuns)
      .set({ status: "running" })
      .where(eq(schema.processRuns.id, planA.metadata?.runId as string))
      .run();
    testDb.update(schema.processRuns)
      .set({ status: "running" })
      .where(eq(schema.processRuns.id, planB.metadata?.runId as string))
      .run();

    // Pause only Plan A
    const pauseResult = await handlePauseCycle({
      cycleType: "gtm-pipeline",
      planName: "Plan A",
    });
    expect(pauseResult.success).toBe(true);
    expect(pauseResult.output).toContain("Plan A");

    // Plan B should still be running
    const [runB] = testDb
      .select({ status: schema.processRuns.status })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, planB.metadata?.runId as string))
      .all();
    expect(runB.status).toBe("running");
  });

  it("existing cycle types ignore planName parameter", async () => {
    const result = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Sales goal",
      icp: "Tech companies",
      sendingIdentity: "principal",
    });
    expect(result.success).toBe(true);

    // planName on pause is ignored for non-GTM types
    const runId = result.metadata?.runId as string;
    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const pauseResult = await handlePauseCycle({
      cycleType: "sales-marketing",
      planName: "ignored",
    });
    expect(pauseResult.success).toBe(true);
  });

  it("cycle_status shows all active GTM plans", async () => {
    await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Dev audience" },
      goals: "X growth",
    });
    await handleActivateCycle({
      cycleType: "gtm-pipeline",
      gtmContext: { planName: "Enterprise outbound" },
      goals: "LinkedIn growth",
    });

    const result = await handleCycleStatus({});
    expect(result.success).toBe(true);
    expect(result.output).toContain("gtm-pipeline");
    expect(result.output).toContain("Dev audience");
    expect(result.output).toContain("Enterprise outbound");
  });
});

// ============================================================
// Brief 163: MP-8.2 — Aggregate Metrics
// ============================================================

describe("cycle aggregate metrics (MP-8.2)", () => {
  it("computes KPIs from interactions linked to cycle runs", async () => {
    const { computeCycleMetrics } = await import("./cycle-tools");

    // Create a sales cycle run
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Metrics test",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    // Seed a person
    const personId = randomUUID();
    testDb.insert(schema.people).values({
      id: personId,
      userId: "default",
      name: "Test Contact",
    }).run();

    // Seed interactions: 3 outreach, 1 reply, 1 meeting
    for (let i = 0; i < 3; i++) {
      testDb.insert(schema.interactions).values({
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "selling",
        processRunId: runId,
      }).run();
    }
    testDb.insert(schema.interactions).values({
      personId,
      userId: "default",
      type: "reply_received",
      channel: "email",
      mode: "selling",
      processRunId: runId,
    }).run();
    testDb.insert(schema.interactions).values({
      personId,
      userId: "default",
      type: "meeting_booked",
      channel: "email",
      mode: "selling",
      processRunId: runId,
    }).run();

    const metrics = await computeCycleMetrics("sales-marketing");

    expect(metrics.outreachVolume).toBe(3);
    expect(metrics.replyCount).toBe(1);
    expect(metrics.meetingCount).toBe(1);
    expect(metrics.responseRate).toBeCloseTo(1 / 3, 2);
    expect(metrics.conversionRate).toBeCloseTo(1 / 3, 2);
  });

  it("returns empty metrics when no cycle runs exist", async () => {
    const { computeCycleMetrics } = await import("./cycle-tools");
    const metrics = await computeCycleMetrics("sales-marketing");

    expect(metrics.outreachVolume).toBe(0);
    expect(metrics.replyCount).toBe(0);
    expect(metrics.trends.responseRate).toBe("flat");
  });

  it("cycle_briefing includes performance section", async () => {
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Briefing metrics test",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({
        status: "running",
        cycleType: "sales-marketing",
        cycleConfig: { goals: "Briefing metrics test", icp: "Tech" } as Record<string, unknown>,
        startedAt: new Date(),
      })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const result = await handleCycleBriefing({ cycleType: "sales-marketing" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("**Performance (last 30 days)**");
    expect(result.output).toContain("outreach sent");
    expect(result.output).toContain("response rate");
    expect(result.metadata?.metrics).toBeDefined();
  });

  it("computes trend indicators vs previous period", async () => {
    const { computeCycleMetrics } = await import("./cycle-tools");

    // Create a cycle run
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Trend test",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    // Seed a person
    const personId = randomUUID();
    testDb.insert(schema.people).values({
      id: personId,
      userId: "default",
      name: "Trend Contact",
    }).run();

    // Seed previous period interactions (35 days ago): 10 outreach, 5 replies
    const prevDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) {
      testDb.insert(schema.interactions).values({
        id: randomUUID(),
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "selling",
        processRunId: runId,
        createdAt: prevDate,
      }).run();
    }
    for (let i = 0; i < 5; i++) {
      testDb.insert(schema.interactions).values({
        id: randomUUID(),
        personId,
        userId: "default",
        type: "reply_received",
        channel: "email",
        mode: "selling",
        processRunId: runId,
        createdAt: prevDate,
      }).run();
    }

    // Current period: 10 outreach, 1 reply (declining)
    for (let i = 0; i < 10; i++) {
      testDb.insert(schema.interactions).values({
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "selling",
        processRunId: runId,
      }).run();
    }
    testDb.insert(schema.interactions).values({
      personId,
      userId: "default",
      type: "reply_received",
      channel: "email",
      mode: "selling",
      processRunId: runId,
    }).run();

    const metrics = await computeCycleMetrics("sales-marketing");

    expect(metrics.outreachVolume).toBe(10);
    expect(metrics.replyCount).toBe(1);
    expect(metrics.previousPeriod.outreachVolume).toBe(10);
    expect(metrics.previousPeriod.replyCount).toBe(5);
    expect(metrics.trends.responseRate).toBe("down"); // 10% vs 50%
    expect(metrics.trends.volume).toBe("flat"); // same volume
  });
});

// ============================================================
// Brief 163: MP-8.4 — Health Signals
// ============================================================

describe("cycle health signals (MP-8.4)", () => {
  it("detects declining response rate", async () => {
    const { computeCycleMetrics, detectHealthSignals } = await import("./cycle-tools");

    // Create a cycle with declining metrics scenario
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Health test",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const personId = randomUUID();
    testDb.insert(schema.people).values({
      id: personId,
      userId: "default",
      name: "Health Contact",
    }).run();

    // Previous period: 10 outreach, 5 replies (50% rate)
    const prevDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) {
      testDb.insert(schema.interactions).values({
        id: randomUUID(),
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "selling",
        processRunId: runId,
        createdAt: prevDate,
      }).run();
    }
    for (let i = 0; i < 5; i++) {
      testDb.insert(schema.interactions).values({
        id: randomUUID(),
        personId,
        userId: "default",
        type: "reply_received",
        channel: "email",
        mode: "selling",
        processRunId: runId,
        createdAt: prevDate,
      }).run();
    }

    // Current period: 10 outreach, 1 reply (10% rate — dropped 40 points)
    for (let i = 0; i < 10; i++) {
      testDb.insert(schema.interactions).values({
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "selling",
        processRunId: runId,
      }).run();
    }
    testDb.insert(schema.interactions).values({
      personId,
      userId: "default",
      type: "reply_received",
      channel: "email",
      mode: "selling",
      processRunId: runId,
    }).run();

    const metrics = await computeCycleMetrics("sales-marketing");
    const signals = await detectHealthSignals("sales-marketing", metrics);

    expect(signals.length).toBeGreaterThan(0);
    const declining = signals.find((s) => s.type === "declining_response_rate");
    expect(declining).toBeDefined();
    expect(declining!.severity).toBe("alert");
    expect(declining!.message).toContain("dropped");
  });

  it("detects zero responses with meaningful volume", async () => {
    const { computeCycleMetrics, detectHealthSignals } = await import("./cycle-tools");

    const activate = await handleActivateCycle({
      cycleType: "network-connecting",
      goals: "Zero test",
      icp: "People",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({ status: "running", cycleType: "network-connecting" })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const personId = randomUUID();
    testDb.insert(schema.people).values({
      id: personId,
      userId: "default",
      name: "Ghost Contact",
    }).run();

    // 6 outreach, zero replies
    for (let i = 0; i < 6; i++) {
      testDb.insert(schema.interactions).values({
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "connecting",
        processRunId: runId,
      }).run();
    }

    const metrics = await computeCycleMetrics("network-connecting");
    const signals = await detectHealthSignals("network-connecting", metrics);

    const zeroSignal = signals.find((s) => s.type === "zero_responses");
    expect(zeroSignal).toBeDefined();
    expect(zeroSignal!.message).toContain("zero responses");
  });

  it("detects stalled cycles with no completed steps", async () => {
    const { computeCycleMetrics, detectHealthSignals } = await import("./cycle-tools");

    // Create 2 cycle runs with no completed steps
    const run1 = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Stall test 1",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    const runId1 = run1.metadata?.runId as string;
    testDb.update(schema.processRuns)
      .set({ status: "approved", cycleType: "sales-marketing" })
      .where(eq(schema.processRuns.id, runId1))
      .run();

    // Need a second run — manually insert since overlap prevention blocks it
    const runId2 = randomUUID();
    const [proc] = testDb
      .select({ id: schema.processes.id })
      .from(schema.processes)
      .where(eq(schema.processes.slug, "sales-marketing-cycle"))
      .all();
    testDb.insert(schema.processRuns).values({
      id: runId2,
      processId: proc.id,
      status: "approved",
      triggeredBy: "test",
      cycleType: "sales-marketing",
    }).run();

    const metrics = await computeCycleMetrics("sales-marketing");
    const signals = await detectHealthSignals("sales-marketing", metrics);

    const stalled = signals.find((s) => s.type === "stalled_cycle");
    expect(stalled).toBeDefined();
    expect(stalled!.message).toContain("stalled");
  });

  it("cycle_briefing includes health alerts when signals present", async () => {
    const activate = await handleActivateCycle({
      cycleType: "sales-marketing",
      goals: "Health briefing test",
      icp: "Tech",
      sendingIdentity: "principal",
    });
    const runId = activate.metadata?.runId as string;

    testDb.update(schema.processRuns)
      .set({
        status: "running",
        cycleType: "sales-marketing",
        cycleConfig: { goals: "Health briefing test", icp: "Tech" } as Record<string, unknown>,
        startedAt: new Date(),
      })
      .where(eq(schema.processRuns.id, runId))
      .run();

    const personId = randomUUID();
    testDb.insert(schema.people).values({
      id: personId,
      userId: "default",
      name: "Health Briefing Contact",
    }).run();

    // 6 outreach, zero replies → zero_responses signal
    for (let i = 0; i < 6; i++) {
      testDb.insert(schema.interactions).values({
        personId,
        userId: "default",
        type: "outreach_sent",
        channel: "email",
        mode: "selling",
        processRunId: runId,
      }).run();
    }

    const result = await handleCycleBriefing({ cycleType: "sales-marketing" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("**Health Alerts**");
    expect(result.output).toContain("zero responses");
    expect(result.metadata?.healthSignals).toBeDefined();
    expect((result.metadata?.healthSignals as unknown[]).length).toBeGreaterThan(0);
  });
});

// ============================================================
// Network tools cycle-aware (Brief 118 AC6, AC7)
// ============================================================

describe("network tools cycle-aware", () => {
  it("create_sales_plan activates a sales-marketing cycle", async () => {
    const { handleCreateSalesPlan } = await import("./network-tools");

    const result = await handleCreateSalesPlan({
      goal: "Get 10 new clients",
      icp: "SMB tech companies",
      cadence: "daily",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("create_sales_plan");
    expect(result.metadata?.cycleType).toBe("sales-marketing");
    expect(result.metadata?.mode).toBe("selling");
  });
});

// ============================================================
// Tool registration (Brief 118 AC8)
// ============================================================

describe("cycle tools registered in selfTools", () => {
  it("all 5 cycle tools are registered", async () => {
    const { selfTools } = await import("../self-delegation");

    const cycleToolNames = [
      "activate_cycle",
      "pause_cycle",
      "resume_cycle",
      "cycle_briefing",
      "cycle_status",
    ];

    for (const name of cycleToolNames) {
      const found = selfTools.find((t) => t.name === name);
      expect(found, `Tool "${name}" should be registered`).toBeDefined();
    }
  });
});
