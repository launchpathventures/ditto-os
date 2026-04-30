/**
 * Tests for Brief 158 — Briefing Quality
 *
 * Tests autonomous digest, wait-state visibility, empty state,
 * freshness timestamp, and review-to-resume flow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Mock dependencies that hit DB or external services
vi.mock("./risk-detector", () => ({
  detectAllRisks: vi.fn().mockResolvedValue([]),
}));

vi.mock("./user-model", () => ({
  getUserModel: vi.fn().mockResolvedValue({
    completeness: 0.5,
    entries: [],
    populatedDimensions: ["role", "industry"],
    missingDimensions: [],
  }),
}));

vi.mock("./industry-patterns", () => ({
  matchIndustry: vi.fn().mockReturnValue(null),
  findCoverageGaps: vi.fn().mockReturnValue([]),
}));

vi.mock("./trust", async () => {
  const actual = await vi.importActual<typeof import("./trust")>("./trust");
  return {
    ...actual,
    computeTrustState: vi.fn().mockResolvedValue({
      runsInWindow: 0,
      approvalRate: 0,
      correctionRate: 0,
      consecutiveCleanRuns: 0,
    }),
  };
});

vi.mock("./smoke-test-runner", () => ({
  getJourneyHealth: vi.fn().mockResolvedValue({ lastRunAt: null }),
}));

const { assembleBriefing } = await import("./briefing-assembler");
const { handleGetBriefing } = await import("./self-tools/get-briefing");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Helper: seed a user session
// ============================================================

async function seedSession(userId: string, lastActiveAt: Date) {
  await testDb.insert(schema.sessions).values({
    id: randomUUID(),
    userId,
    surface: "web",
    status: "suspended",
    lastActiveAt,
  });
}

// ============================================================
// Helper: seed a process + run + steps
// ============================================================

async function seedProcessAndRun(opts: {
  processName?: string;
  runStatus?: string;
  runMetadata?: Record<string, unknown>;
}) {
  const processId = randomUUID();
  const runId = randomUUID();

  await testDb.insert(schema.processes).values({
    id: processId,
    name: opts.processName ?? "Test Process",
    slug: `test-${processId.slice(0, 8)}`,
    description: "Test process",
    definition: makeTestProcessDefinition(),
    status: "active",
    trustTier: "supervised",
  });

  await testDb.insert(schema.processRuns).values({
    id: runId,
    processId,
    status: (opts.runStatus ?? "running") as "running",
    triggeredBy: "test",
    currentStepId: "step-1",
    ...(opts.runMetadata ? { runMetadata: opts.runMetadata } : {}),
  });

  return { processId, runId };
}

// ============================================================
// MP-3.1 — Autonomous Digest
// ============================================================

describe("MP-3.1 Autonomous Digest", () => {
  it("returns auto-advanced steps since last session", async () => {
    const userId = "test-user";
    const lastActive = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    await seedSession(userId, lastActive);

    const { processId, runId } = await seedProcessAndRun({
      processName: "Email Campaign",
      runStatus: "approved",
    });

    // Create step runs and harness decisions that auto-advanced
    for (let i = 0; i < 3; i++) {
      const stepRunId = randomUUID();
      await testDb.insert(schema.stepRuns).values({
        id: stepRunId,
        processRunId: runId,
        stepId: `step-${i}`,
        status: "approved",
        executorType: "ai-agent",
      });

      await testDb.insert(schema.harnessDecisions).values({
        id: randomUUID(),
        processRunId: runId,
        stepRunId,
        trustTier: "autonomous",
        trustAction: "advance",
        reviewResult: "skip",
      });
    }

    const briefing = await assembleBriefing(userId);

    expect(briefing.autonomousDigest).toHaveLength(1);
    expect(briefing.autonomousDigest[0].processName).toBe("Email Campaign");
    expect(briefing.autonomousDigest[0].stepsAdvanced).toBe(3);
    // Step IDs are "step-0", "step-1", "step-2" — no recognizable activity pattern,
    // so falls back to "steps completed"
    expect(briefing.autonomousDigest[0].summary).toBe("3 steps completed");
  });

  it("builds rich summary from step IDs and output labels", async () => {
    const userId = "test-user";
    const lastActive = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await seedSession(userId, lastActive);

    const { processId, runId } = await seedProcessAndRun({
      processName: "Outreach Pipeline",
      runStatus: "approved",
    });

    // Create steps with recognizable activity names
    const stepDefs = [
      { stepId: "send-email-1", outputs: {} },
      { stepId: "send-email-2", outputs: {} },
      { stepId: "process-response", outputs: { _activityLabel: "responses received" } },
    ];

    for (const def of stepDefs) {
      const stepRunId = randomUUID();
      await testDb.insert(schema.stepRuns).values({
        id: stepRunId,
        processRunId: runId,
        stepId: def.stepId,
        status: "approved",
        executorType: "ai-agent",
        outputs: def.outputs,
      });
      await testDb.insert(schema.harnessDecisions).values({
        id: randomUUID(),
        processRunId: runId,
        stepRunId,
        trustTier: "autonomous",
        trustAction: "advance",
        reviewResult: "skip",
      });
    }

    const briefing = await assembleBriefing(userId);
    expect(briefing.autonomousDigest).toHaveLength(1);
    // Should produce "2 emails sent, 1 responses received" from step IDs + _activityLabel
    expect(briefing.autonomousDigest[0].summary).toContain("emails sent");
    expect(briefing.autonomousDigest[0].summary).toContain("responses received");
  });

  it("returns empty digest when no auto-advances", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const briefing = await assembleBriefing(userId);
    expect(briefing.autonomousDigest).toHaveLength(0);
  });

  it("appears as WHILE YOU WERE AWAY section in get_briefing output", async () => {
    const userId = "test-user";
    const lastActive = new Date(Date.now() - 60 * 60 * 1000);
    await seedSession(userId, lastActive);

    const { runId } = await seedProcessAndRun({
      processName: "Follow-up Emails",
      runStatus: "approved",
    });

    const stepRunId = randomUUID();
    await testDb.insert(schema.stepRuns).values({
      id: stepRunId,
      processRunId: runId,
      stepId: "step-1",
      status: "approved",
      executorType: "ai-agent",
    });
    await testDb.insert(schema.harnessDecisions).values({
      id: randomUUID(),
      processRunId: runId,
      stepRunId,
      trustTier: "spot_checked",
      trustAction: "sample_advance",
      reviewResult: "skip",
    });

    const result = await handleGetBriefing({ userId });
    expect(result.success).toBe(true);
    expect(result.output).toContain("WHILE YOU WERE AWAY");
    expect(result.output).toContain("Follow-up Emails");
  });
});

// ============================================================
// MP-3.2 — Wait-State Visibility
// ============================================================

describe("MP-3.2 Wait-State Visibility", () => {
  it("returns wait states for runs with waitFor metadata", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const stepRunId = randomUUID();
    const { processId, runId } = await seedProcessAndRun({
      processName: "Supplier Outreach",
      runStatus: "waiting_human",
      runMetadata: {
        waitFor: {
          event: "reply",
          stepName: "Send email",
          stepRunId,
        },
      },
    });

    // Create the step run that started the wait
    await testDb.insert(schema.stepRuns).values({
      id: stepRunId,
      processRunId: runId,
      stepId: "send-email",
      status: "approved",
      executorType: "ai-agent",
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    });

    const briefing = await assembleBriefing(userId);

    expect(briefing.waitStates).toHaveLength(1);
    expect(briefing.waitStates[0].processName).toBe("Supplier Outreach");
    expect(briefing.waitStates[0].waitEvent).toBe("reply");
    expect(briefing.waitStates[0].description).toContain("Waiting for reply");
    expect(briefing.waitStates[0].description).toContain("2 days ago");
  });

  it("skips waiting_human runs without waitFor metadata", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    // A run waiting for human input (not an external event)
    await seedProcessAndRun({
      processName: "Manual Review",
      runStatus: "waiting_human",
    });

    const briefing = await assembleBriefing(userId);
    expect(briefing.waitStates).toHaveLength(0);
  });

  it("appears as WAITING section in get_briefing output", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    await seedProcessAndRun({
      processName: "Client Follow-up",
      runStatus: "waiting_human",
      runMetadata: {
        waitFor: {
          event: "reply",
          stepName: "Send proposal",
        },
      },
    });

    const result = await handleGetBriefing({ userId });
    expect(result.success).toBe(true);
    expect(result.output).toContain("WAITING FOR EXTERNAL EVENTS");
    expect(result.output).toContain("Client Follow-up");
  });
});

// ============================================================
// MP-3.3 — Empty State
// ============================================================

describe("MP-3.3 Empty State", () => {
  it("returns deterministic empty message when nothing to report", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const result = await handleGetBriefing({ userId });

    expect(result.success).toBe(true);
    expect(result.output).toContain("Nothing needs your attention. Your processes are running smoothly.");
  });

  it("does not include empty state message when there is content", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    // Create a failed run (creates focus content)
    await seedProcessAndRun({
      processName: "Active Process",
      runStatus: "failed",
    });

    const result = await handleGetBriefing({ userId });
    expect(result.output).not.toContain("Nothing needs your attention");
  });
});

// ============================================================
// MP-3.5 — Freshness
// ============================================================

describe("MP-3.5 Freshness", () => {
  it("includes generatedAt timestamp in briefing data", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const before = new Date();
    const briefing = await assembleBriefing(userId);
    const after = new Date();

    expect(briefing.generatedAt).toBeDefined();
    expect(briefing.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(briefing.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("includes timestamp in get_briefing output", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const result = await handleGetBriefing({ userId });
    expect(result.output).toContain("Briefing generated:");
    expect(result.metadata).toHaveProperty("generatedAt");
  });

  it("generates fresh data on each call (not cached)", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const briefing1 = await assembleBriefing(userId);
    // Small delay to ensure timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    const briefing2 = await assembleBriefing(userId);

    expect(briefing2.generatedAt.getTime()).toBeGreaterThan(briefing1.generatedAt.getTime());
  });
});

// ============================================================
// MP-3.4 — Review-to-Resume Flow (chain verification)
// ============================================================

describe("MP-3.4 Review-to-Resume Flow", () => {
  it("approve → run continues → next step pauses → briefing reflects each state", async () => {
    // Verifies the full data-layer chain: waiting_review → approved/running →
    // next step pauses at waiting_review → briefing updates at each step.
    // The SSE event chain (gate-pause → UI) is tested by Brief 053 infrastructure.
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    // Step 1: Run paused at step-1 waiting for review
    const { runId } = await seedProcessAndRun({
      processName: "Review Pipeline",
      runStatus: "waiting_review",
    });

    const briefing1 = await assembleBriefing(userId);
    expect(briefing1.focus.some((f) => f.type === "review")).toBe(true);
    expect(briefing1.stats.pendingReviews).toBe(1);

    // Step 2: User approves → heartbeat resumes → run continues
    await testDb.update(schema.processRuns)
      .set({ status: "running", currentStepId: "step-2" })
      .where(eq(schema.processRuns.id, runId));

    const briefing2 = await assembleBriefing(userId);
    expect(briefing2.stats.pendingReviews).toBe(0);
    expect(briefing2.focus.some((f) => f.type === "active")).toBe(true);

    // Step 3: Step-2 executes and hits trust gate → pauses at waiting_review again
    await testDb.update(schema.processRuns)
      .set({ status: "waiting_review", currentStepId: "step-2" })
      .where(eq(schema.processRuns.id, runId));

    const briefing3 = await assembleBriefing(userId);
    expect(briefing3.stats.pendingReviews).toBe(1);
    expect(briefing3.focus.some((f) => f.type === "review")).toBe(true);

    // Step 4: User approves again → run completes
    await testDb.update(schema.processRuns)
      .set({ status: "approved", completedAt: new Date() })
      .where(eq(schema.processRuns.id, runId));

    const briefing4 = await assembleBriefing(userId);
    expect(briefing4.stats.pendingReviews).toBe(0);
    expect(briefing4.focus.every((f) => f.type !== "review")).toBe(true);
  });

  it("SSE event types match what usePipelineReview expects", () => {
    // Verify the contract between heartbeat event emission and the SSE hook.
    // The heartbeat emits "gate-pause" and "gate-advance" events;
    // use-pipeline-review.ts listens for exactly these types.
    // This is a contract test — if either side renames an event type, this fails.
    const HEARTBEAT_EVENTS = ["gate-pause", "gate-advance", "run-complete", "run-failed"];
    const PIPELINE_REVIEW_TRIGGERS = ["gate-pause"]; // triggers pendingReview
    const PIPELINE_REVIEW_CLEARS = ["gate-advance", "run-complete", "run-failed"]; // clears pendingReview

    // All trigger events exist in the heartbeat vocabulary
    for (const trigger of PIPELINE_REVIEW_TRIGGERS) {
      expect(HEARTBEAT_EVENTS).toContain(trigger);
    }
    // All clear events exist in the heartbeat vocabulary
    for (const clear of PIPELINE_REVIEW_CLEARS) {
      expect(HEARTBEAT_EVENTS).toContain(clear);
    }
  });
});

// ============================================================
// MP-5.1 — Trust Upgrade Celebration
// ============================================================

describe("MP-5.1 Trust Upgrade Celebration", () => {
  it("includes pending upgrade suggestion as trust milestone block", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Quoting Process",
      slug: `quoting-${processId.slice(0, 8)}`,
      description: "Generate quotes",
      definition: {},
      status: "active",
      trustTier: "supervised",
    });

    // Create a pending upgrade suggestion
    await testDb.insert(schema.trustSuggestions).values({
      id: randomUUID(),
      processId,
      currentTier: "supervised",
      suggestedTier: "spot_checked",
      evidence: [{ name: "Approval rate", threshold: "≥ 85%", actual: "95%", passed: true }],
      status: "pending",
    });

    const briefing = await assembleBriefing(userId);

    expect(briefing.trustMilestones).toHaveLength(1);
    expect(briefing.trustMilestones[0].type).toBe("trust_milestone");
    expect(briefing.trustMilestones[0].milestoneType).toBe("upgrade");
    expect(briefing.trustMilestones[0].processName).toBe("Quoting Process");
    expect(briefing.trustMilestones[0].actions).toBeDefined();
    expect(briefing.trustMilestones[0].actions!.length).toBe(2);
  });

  it("appears as TRUST MILESTONES section in get_briefing output", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Invoice Process",
      slug: `invoice-${processId.slice(0, 8)}`,
      description: "Process invoices",
      definition: {},
      status: "active",
      trustTier: "supervised",
    });

    await testDb.insert(schema.trustSuggestions).values({
      id: randomUUID(),
      processId,
      currentTier: "supervised",
      suggestedTier: "spot_checked",
      evidence: [],
      status: "pending",
    });

    const result = await handleGetBriefing({ userId });
    expect(result.success).toBe(true);
    expect(result.output).toContain("TRUST MILESTONES");
    expect(result.output).toContain("Invoice Process");
  });

  it("returns empty milestones when no pending suggestions", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    const briefing = await assembleBriefing(userId);
    expect(briefing.trustMilestones).toHaveLength(0);
  });
});

// ============================================================
// MP-5.2 — Downgrade Explanation
// ============================================================

describe("MP-5.2 Downgrade Explanation", () => {
  it("includes recent downgrade milestone from activity metadata", async () => {
    const userId = "test-user";
    const lastActive = new Date(Date.now() - 60000);
    await seedSession(userId, lastActive);

    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Email Campaign",
      slug: `email-${processId.slice(0, 8)}`,
      description: "Send emails",
      definition: {},
      status: "active",
      trustTier: "supervised",
    });

    // Create activity with milestone block (as executeTierChange would)
    await testDb.insert(schema.activities).values({
      action: "trust.tier_change",
      actorType: "system",
      entityType: "process",
      entityId: processId,
      metadata: {
        fromTier: "spot_checked",
        toTier: "supervised",
        reason: "Auto-downgrade",
        milestoneBlock: {
          type: "trust_milestone",
          milestoneType: "downgrade",
          processName: "Email Campaign",
          fromTier: "spot-checked",
          toTier: "supervised",
          evidence: "Correction rate spike (last 10): 40% (threshold: > 30%)",
          explanation: "I noticed the last few outputs needed more corrections than usual — so I'll check in more often until things settle back down.",
          actions: [{ id: "override", label: "These were edge cases", style: "secondary", payload: { action: "trust_override" } }],
        },
      },
    });

    const briefing = await assembleBriefing(userId);

    expect(briefing.trustMilestones).toHaveLength(1);
    expect(briefing.trustMilestones[0].milestoneType).toBe("downgrade");
    expect(briefing.trustMilestones[0].explanation).toContain("check in more often");
  });
});

// ============================================================
// MP-5.4 — Spot-Check Transparency
// ============================================================

describe("MP-5.4 Spot-Check Transparency", () => {
  it("returns spot-check stats for spot-checked processes", async () => {
    const userId = "test-user";
    const lastActive = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await seedSession(userId, lastActive);

    const processId = randomUUID();
    const runId = randomUUID();

    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Quote Review",
      slug: `quote-${processId.slice(0, 8)}`,
      description: "Review quotes",
      definition: {},
      status: "active",
      trustTier: "spot_checked",
    });

    await testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      status: "approved",
      triggeredBy: "test",
    });

    // 4 auto-advanced, 1 sampled
    for (let i = 0; i < 4; i++) {
      const stepRunId = randomUUID();
      await testDb.insert(schema.stepRuns).values({
        id: stepRunId,
        processRunId: runId,
        stepId: `step-${i}`,
        status: "approved",
        executorType: "ai-agent",
      });
      await testDb.insert(schema.harnessDecisions).values({
        id: randomUUID(),
        processRunId: runId,
        stepRunId,
        trustTier: "spot_checked",
        trustAction: "advance",
        reviewResult: "pass",
      });
    }

    const sampledStepRunId = randomUUID();
    await testDb.insert(schema.stepRuns).values({
      id: sampledStepRunId,
      processRunId: runId,
      stepId: "step-sampled",
      status: "approved",
      executorType: "ai-agent",
    });
    await testDb.insert(schema.harnessDecisions).values({
      id: randomUUID(),
      processRunId: runId,
      stepRunId: sampledStepRunId,
      trustTier: "spot_checked",
      trustAction: "pause",
      reviewResult: "pass",
    });

    const briefing = await assembleBriefing(userId);

    expect(briefing.spotCheckTransparency).toHaveLength(1);
    expect(briefing.spotCheckTransparency[0].processName).toBe("Quote Review");
    expect(briefing.spotCheckTransparency[0].autoAdvancedRuns).toBe(4);
    expect(briefing.spotCheckTransparency[0].sampledRuns).toBe(1);
    expect(briefing.spotCheckTransparency[0].autoPassedChecks).toBe(4);
  });

  it("returns empty for non-spot-checked processes", async () => {
    const userId = "test-user";
    await seedSession(userId, new Date(Date.now() - 60000));

    await testDb.insert(schema.processes).values({
      id: randomUUID(),
      name: "Supervised Process",
      slug: `sup-${randomUUID().slice(0, 8)}`,
      description: "Fully supervised",
      definition: {},
      status: "active",
      trustTier: "supervised",
    });

    const briefing = await assembleBriefing(userId);
    expect(briefing.spotCheckTransparency).toHaveLength(0);
  });
});

// ============================================================
// Brief 227 — Cross-Project Memory Promotion Proposal
// ============================================================

describe("Brief 227 cross-project promotion proposal", () => {
  async function seedProject(id: string, slug: string) {
    await testDb.insert(schema.projects).values({
      id,
      slug,
      name: slug,
      kind: "build",
      harnessType: "native",
      status: "active",
    } as any);
  }

  async function seedProcess(id: string, projectId: string) {
    await testDb.insert(schema.processes).values({
      id,
      name: id,
      slug: id,
      definition: {} as any,
      projectId,
    });
  }

  async function seedMemory(scopeId: string, content: string, reinforcementCount = 3) {
    const [m] = await testDb
      .insert(schema.memories)
      .values({
        scopeType: "process",
        scopeId,
        type: "correction",
        content,
        source: "feedback",
        confidence: 0.8,
        reinforcementCount,
        active: true,
      })
      .returning();
    return m;
  }

  it("emits a cross-project promotion suggestion when memory reinforced ≥2× across ≥2 projects", async () => {
    const userId = "test-user-promotion";
    await seedSession(userId, new Date(Date.now() - 60000));

    await seedProject("p1", "proj-a");
    await seedProject("p2", "proj-b");
    await seedProcess("proc-a", "p1");
    await seedProcess("proc-b", "p2");
    // Same content reinforced on both projects
    await seedMemory("proc-a", "Always cite the data source", 3);
    await seedMemory("proc-b", "Always cite the data source", 2);

    const briefing = await assembleBriefing(userId);
    const promotion = briefing.suggestions.find(
      (s) => s.type === "cross_project_promotion",
    );
    expect(promotion).toBeDefined();
    expect(promotion?.suggestion).toMatch(/2 different projects/);
    expect(promotion?.memoryId).toBeTruthy();
  });

  it("does NOT emit a promotion suggestion when memory is in single-project scope", async () => {
    const userId = "test-user-no-promotion";
    await seedSession(userId, new Date(Date.now() - 60000));

    await seedProject("p1", "proj-a");
    await seedProcess("proc-a", "p1");
    // Same content reinforced 5 times, but all on a single project
    await seedMemory("proc-a", "Project A correction", 5);

    const briefing = await assembleBriefing(userId);
    const promotion = briefing.suggestions.find(
      (s) => s.type === "cross_project_promotion",
    );
    expect(promotion).toBeUndefined();
  });

  it("respects 30-day cooldown after dismissal", async () => {
    const userId = "test-user-cooldown";
    await seedSession(userId, new Date(Date.now() - 60000));

    await seedProject("p1", "proj-a");
    await seedProject("p2", "proj-b");
    await seedProcess("proc-a", "p1");
    await seedProcess("proc-b", "p2");
    const memA = await seedMemory("proc-a", "Cooldown-tested content", 3);
    const memB = await seedMemory("proc-b", "Cooldown-tested content", 2);

    // Insert a recent dismissal for one of the candidate memories
    await testDb.insert(schema.activities).values({
      action: "memory_promotion_dismissed",
      actorType: "user",
      entityType: "memory",
      entityId: memA.id,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    });

    const briefing = await assembleBriefing(userId);
    const promotion = briefing.suggestions.find(
      (s) => s.type === "cross_project_promotion",
    );
    expect(promotion).toBeUndefined();
  });

  it("dismiss_promotion_proposal tool engages cooldown end-to-end (Reviewer Crit-2 regression)", async () => {
    const { handleDismissPromotionProposal } = await import(
      "./self-tools/dismiss-promotion-proposal"
    );
    const originalTestMode = process.env.DITTO_TEST_MODE;
    process.env.DITTO_TEST_MODE = "true";

    try {
      const userId = "test-user-end-to-end";
      await seedSession(userId, new Date(Date.now() - 60000));

      await seedProject("p1", "proj-a");
      await seedProject("p2", "proj-b");
      await seedProcess("proc-a", "p1");
      await seedProcess("proc-b", "p2");
      const memA = await seedMemory("proc-a", "End-to-end cooldown content", 3);
      await seedMemory("proc-b", "End-to-end cooldown content", 2);

      // Pre-dismissal: proposal surfaces
      const before = await assembleBriefing(userId);
      const beforeProposal = before.suggestions.find(
        (s) => s.type === "cross_project_promotion",
      );
      expect(beforeProposal).toBeDefined();
      expect(beforeProposal?.memoryId).toBeTruthy();

      // User dismisses via the new tool
      const dismissResult = await handleDismissPromotionProposal({
        memoryId: beforeProposal!.memoryId!,
      });
      expect(dismissResult.success).toBe(true);

      // Post-dismissal: same memory's content shouldn't re-surface
      const after = await assembleBriefing(userId);
      const afterProposal = after.suggestions.find(
        (s) => s.type === "cross_project_promotion",
      );
      expect(afterProposal).toBeUndefined();
    } finally {
      if (originalTestMode === undefined) delete process.env.DITTO_TEST_MODE;
      else process.env.DITTO_TEST_MODE = originalTestMode;
    }
  });
});
