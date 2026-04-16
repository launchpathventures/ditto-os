/**
 * Tests for Brief 162: Exception Handling — Escalation Quality, Guidance Memory,
 * Stale Detection, Dependency Visibility
 *
 * MP-7.1: Escalation message templates
 * MP-7.2: Guidance-to-memory bridge
 * MP-7.3: Stale escalation detection
 * MP-7.4: Cross-process dependency visibility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
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

// Import after mock
const {
  classifyFailureType,
  formatEscalationMessage,
} = await import("./heartbeat");

const {
  createGuidanceMemory,
  findGuidanceForFailure,
} = await import("./harness-handlers/feedback-recorder");

const {
  detectAllRisks,
} = await import("./risk-detector");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// MP-7.1: Escalation Message Templates
// ============================================================

describe("MP-7.1: Escalation message templates", () => {
  describe("classifyFailureType", () => {
    it("classifies confidence-related errors", () => {
      expect(classifyFailureType("Low confidence output", {})).toBe("confidence_low");
      expect(classifyFailureType("Uncertain about the result", {})).toBe("confidence_low");
    });

    it("classifies timeout errors", () => {
      expect(classifyFailureType("Request timed out after 30s", {})).toBe("timeout");
      expect(classifyFailureType("Deadline exceeded", {})).toBe("timeout");
    });

    it("classifies dependency blocked errors", () => {
      expect(classifyFailureType("Blocked by upstream step", {})).toBe("dependency_blocked");
      expect(classifyFailureType("Waiting on dependency", {})).toBe("dependency_blocked");
    });

    it("classifies external/integration errors", () => {
      expect(classifyFailureType("API returned status code 500", {})).toBe("external_error");
      expect(classifyFailureType("ECONNREFUSED", {})).toBe("external_error");
      expect(classifyFailureType("Network error", {})).toBe("external_error");
      expect(classifyFailureType("Some error", { executor: "integration" })).toBe("external_error");
    });

    it("classifies max retries errors", () => {
      expect(classifyFailureType("Max retries exceeded", {})).toBe("max_retries");
      expect(classifyFailureType("Exhausted retries for step", {})).toBe("max_retries");
    });

    it("falls back to unknown for unrecognized errors", () => {
      expect(classifyFailureType("Something unexpected happened", {})).toBe("unknown");
    });
  });

  describe("formatEscalationMessage", () => {
    it("produces human-readable message for confidence_low", () => {
      const result = formatEscalationMessage(
        "Draft quote",
        "Low confidence output",
        {},
      );
      expect(result.failureType).toBe("confidence_low");
      expect(result.message).toContain("Draft quote");
      expect(result.message).toContain("quality bar");
    });

    it("produces human-readable message for external_error", () => {
      const result = formatEscalationMessage(
        "Fetch pricing",
        "API returned status code 503",
        { executor: "integration" },
      );
      expect(result.failureType).toBe("external_error");
      expect(result.message).toContain("Fetch pricing");
      expect(result.message).toContain("external service");
    });

    it("produces human-readable message for timeout", () => {
      const result = formatEscalationMessage(
        "Research supplier",
        "Request timed out after 60s",
        {},
      );
      expect(result.failureType).toBe("timeout");
      expect(result.message).toContain("timed out");
    });

    it("produces human-readable message for dependency_blocked", () => {
      const result = formatEscalationMessage(
        "Generate report",
        "Blocked by data collection step",
        { depends_on: ["data_collection"] },
      );
      expect(result.failureType).toBe("dependency_blocked");
      expect(result.message).toContain("depends on work");
    });

    it("includes process name context when provided", () => {
      const result = formatEscalationMessage(
        "Draft quote",
        "Low confidence output",
        {},
        { processName: "Bathroom Renovation Quote" },
      );
      expect(result.message).toContain("[Bathroom Renovation Quote]");
    });

    it("truncates long error messages", () => {
      const longError = "A".repeat(500);
      const result = formatEscalationMessage(
        "Some step",
        longError,
        {},
      );
      expect(result.message.length).toBeLessThan(600);
    });

    it("reads like a teammate asking for help", () => {
      const result = formatEscalationMessage(
        "Calculate margin",
        "API returned error: invalid pricing data",
        { executor: "integration" },
      );
      // Should contain conversational phrasing, not raw error dumps
      expect(result.message).toMatch(/stuck|try|approach|handle/i);
    });
  });
});

// ============================================================
// MP-7.2: Guidance-to-Memory Bridge
// ============================================================

describe("MP-7.2: Guidance-to-memory bridge", () => {
  async function insertTestProcess(): Promise<string> {
    const id = randomUUID();
    await testDb.insert(schema.processes).values({
      id,
      name: "Test Process",
      slug: "test-process",
      status: "active",
      trustTier: "supervised",
      definition: { steps: [] },
    });
    return id;
  }

  it("creates guidance memory tagged with failure pattern", async () => {
    const processId = await insertTestProcess();

    await createGuidanceMemory(
      processId,
      "Use the backup supplier API endpoint when the primary is down",
      "external_error:fetch_pricing",
      "Fetch pricing",
      "API returned 503",
    );

    const memories = await testDb
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, processId),
          eq(schema.memories.type, "guidance"),
        ),
      );

    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain("backup supplier API");
    expect(memories[0].source).toBe("escalation_resolution");
    expect(memories[0].confidence).toBe(0.5);

    const metadata = memories[0].metadata as Record<string, unknown>;
    expect(metadata.failurePattern).toBe("external_error:fetch_pricing");
    expect(metadata.stepName).toBe("Fetch pricing");
  });

  it("reinforces existing guidance for same failure pattern", async () => {
    const processId = await insertTestProcess();

    await createGuidanceMemory(processId, "Use backup API", "external_error:fetch", "Fetch", "503");
    await createGuidanceMemory(processId, "Actually use v2 endpoint", "external_error:fetch", "Fetch", "503");

    const memories = await testDb
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, processId),
          eq(schema.memories.type, "guidance"),
        ),
      );

    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("Actually use v2 endpoint"); // Updated to latest
    expect(memories[0].reinforcementCount).toBe(2); // 1 (default) + 1 reinforcement
    expect(memories[0].confidence).toBeGreaterThan(0.5);
  });

  it("retrieves stored guidance for a failure pattern", async () => {
    const processId = await insertTestProcess();

    await createGuidanceMemory(processId, "Try the fallback endpoint", "external_error:fetch", "Fetch");

    const guidance = await findGuidanceForFailure(processId, "external_error:fetch");
    expect(guidance).not.toBeNull();
    expect(guidance!.guidance).toBe("Try the fallback endpoint");
    expect(guidance!.confidence).toBe(0.5);
  });

  it("returns null when no guidance exists for pattern", async () => {
    const processId = await insertTestProcess();

    const guidance = await findGuidanceForFailure(processId, "timeout:unknown_step");
    expect(guidance).toBeNull();
  });

  it("ignores empty guidance", async () => {
    const processId = await insertTestProcess();

    await createGuidanceMemory(processId, "", "external_error:fetch", "Fetch");
    await createGuidanceMemory(processId, "   ", "external_error:fetch", "Fetch");

    const memories = await testDb
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, processId),
          eq(schema.memories.type, "guidance"),
        ),
      );

    expect(memories).toHaveLength(0);
  });
});

// ============================================================
// MP-7.3: Stale Escalation Detection
// ============================================================

describe("MP-7.3: Stale escalation detection", () => {
  async function insertProcessAndRun(
    status: "waiting_human" | "waiting_review" | "running" | "failed" | "approved",
    hoursAgo: number,
  ): Promise<{ processId: string; runId: string }> {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Stale Test Process",
      slug: `stale-test-${processId.slice(0, 8)}`,
      status: "active",
      trustTier: "supervised",
      definition: { steps: [] },
    });

    const runId = randomUUID();
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    await testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      status,
      triggeredBy: "test",
      inputs: {},
      createdAt,
    });

    return { processId, runId };
  }

  it("detects escalations older than 24 hours", async () => {
    await insertProcessAndRun("waiting_human", 48); // 2 days old

    const risks = await detectAllRisks({ staleEscalationHours: 24 });
    const staleRisks = risks.filter((r) => r.type === "stale_escalation");

    expect(staleRisks).toHaveLength(1);
    expect(staleRisks[0].detail).toContain("waiting for your input");
    expect(staleRisks[0].detail).toContain("2 day");
    expect(staleRisks[0].entityLabel).toBe("Stale Test Process");
  });

  it("detects waiting_review escalations", async () => {
    await insertProcessAndRun("waiting_review", 30); // 30h old

    const risks = await detectAllRisks({ staleEscalationHours: 24 });
    const staleRisks = risks.filter((r) => r.type === "stale_escalation");

    expect(staleRisks).toHaveLength(1);
    expect(staleRisks[0].detail).toContain("waiting for review");
  });

  it("does not flag recent escalations", async () => {
    await insertProcessAndRun("waiting_human", 12); // Only 12h old

    const risks = await detectAllRisks({ staleEscalationHours: 24 });
    const staleRisks = risks.filter((r) => r.type === "stale_escalation");

    expect(staleRisks).toHaveLength(0);
  });

  it("includes age and context in risk data", async () => {
    const { runId } = await insertProcessAndRun("waiting_human", 72); // 3 days

    const risks = await detectAllRisks({ staleEscalationHours: 24 });
    const staleRisks = risks.filter((r) => r.type === "stale_escalation");

    expect(staleRisks).toHaveLength(1);
    expect(staleRisks[0].data.processRunId).toBe(runId);
    expect(staleRisks[0].data.daysSinceUpdate).toBe(3);
    expect(staleRisks[0].severity).toBe("high"); // 3 days = high
  });

  it("respects configurable threshold", async () => {
    await insertProcessAndRun("waiting_human", 6); // 6h old

    // With 4h threshold, this should be flagged
    const risks = await detectAllRisks({ staleEscalationHours: 4 });
    const staleRisks = risks.filter((r) => r.type === "stale_escalation");
    expect(staleRisks).toHaveLength(1);

    // With default 24h threshold, should not be flagged
    const risks2 = await detectAllRisks({ staleEscalationHours: 24 });
    const staleRisks2 = risks2.filter((r) => r.type === "stale_escalation");
    expect(staleRisks2).toHaveLength(0);
  });
});

// ============================================================
// MP-7.4: Cross-Process Dependency Visibility
// ============================================================

describe("MP-7.4: Cross-process dependency visibility", () => {
  it("detects blocked dependency when source process has failed", async () => {
    const sourceId = randomUUID();
    const targetId = randomUUID();

    await testDb.insert(schema.processes).values([
      {
        id: sourceId,
        name: "Supplier Research",
        slug: "supplier-research",
        status: "active",
        trustTier: "supervised",
        definition: { steps: [] },
      },
      {
        id: targetId,
        name: "Quoting",
        slug: "quoting",
        status: "active",
        trustTier: "supervised",
        definition: { steps: [] },
      },
    ]);

    // Source process has a failed run
    const runId = randomUUID();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await testDb.insert(schema.processRuns).values({
      id: runId,
      processId: sourceId,
      status: "failed",
      triggeredBy: "test",
      inputs: {},
      createdAt: twoHoursAgo,
    });

    // Create dependency: target depends on source
    await testDb.insert(schema.processDependencies).values({
      sourceProcessId: sourceId,
      targetProcessId: targetId,
      outputName: "supplier_data",
      inputName: "supplier_data",
    });

    const risks = await detectAllRisks();
    const depRisks = risks.filter((r) => r.type === "dependency_blockage");

    expect(depRisks).toHaveLength(1);
    expect(depRisks[0].entityLabel).toBe("Quoting");
    expect(depRisks[0].detail).toContain("Supplier Research");
    expect(depRisks[0].detail).toContain("failed");
    expect(depRisks[0].severity).toBe("high");
  });

  it("does not flag when source process is running fine", async () => {
    const sourceId = randomUUID();
    const targetId = randomUUID();

    await testDb.insert(schema.processes).values([
      {
        id: sourceId,
        name: "Supplier Research",
        slug: "supplier-research-ok",
        status: "active",
        trustTier: "supervised",
        definition: { steps: [] },
      },
      {
        id: targetId,
        name: "Quoting",
        slug: "quoting-ok",
        status: "active",
        trustTier: "supervised",
        definition: { steps: [] },
      },
    ]);

    // Source process completed successfully
    await testDb.insert(schema.processRuns).values({
      id: randomUUID(),
      processId: sourceId,
      status: "approved",
      triggeredBy: "test",
      inputs: {},
    });

    await testDb.insert(schema.processDependencies).values({
      sourceProcessId: sourceId,
      targetProcessId: targetId,
      outputName: "data",
      inputName: "data",
    });

    const risks = await detectAllRisks();
    const depRisks = risks.filter((r) => r.type === "dependency_blockage");
    expect(depRisks).toHaveLength(0);
  });

  it("includes dependency chain data for downstream reasoning", async () => {
    const sourceId = randomUUID();
    const targetId = randomUUID();

    await testDb.insert(schema.processes).values([
      {
        id: sourceId,
        name: "Data Collection",
        slug: `data-collection-${sourceId.slice(0, 8)}`,
        status: "active",
        trustTier: "supervised",
        definition: { steps: [] },
      },
      {
        id: targetId,
        name: "Report Generation",
        slug: `report-gen-${targetId.slice(0, 8)}`,
        status: "active",
        trustTier: "supervised",
        definition: { steps: [] },
      },
    ]);

    await testDb.insert(schema.processRuns).values({
      id: randomUUID(),
      processId: sourceId,
      status: "waiting_human",
      triggeredBy: "test",
      inputs: {},
    });

    await testDb.insert(schema.processDependencies).values({
      sourceProcessId: sourceId,
      targetProcessId: targetId,
      outputName: "collected_data",
      inputName: "input_data",
    });

    const risks = await detectAllRisks();
    const depRisks = risks.filter((r) => r.type === "dependency_blockage");

    expect(depRisks).toHaveLength(1);
    expect(depRisks[0].data.sourceProcessName).toBe("Data Collection");
    expect(depRisks[0].data.targetProcessName).toBe("Report Generation");
    expect(depRisks[0].data.outputName).toBe("collected_data");
    expect(depRisks[0].data.sourceRunStatus).toBe("waiting_human");
  });
});

// ============================================================
// ProgressBlock text fallback with blockedBy (L2 review finding)
// ============================================================

describe("ProgressBlock blockedBy text fallback", () => {
  it("renders blockedBy in text fallback", async () => {
    const { renderBlockToText } = await import("@ditto/core");
    const block = {
      type: "progress" as const,
      entityType: "process_run" as const,
      entityId: "run-1",
      currentStep: "Generate report",
      totalSteps: 3,
      completedSteps: 1,
      status: "paused" as const,
      blockedBy: {
        processName: "Supplier Research",
        status: "failed",
        since: "2026-04-13T10:00:00Z",
      },
    };

    const text = renderBlockToText(block);
    expect(text).toContain("Blocked");
    expect(text).toContain("Supplier Research");
    expect(text).toContain("failed");
  });

  it("renders without blockedBy normally", async () => {
    const { renderBlockToText } = await import("@ditto/core");
    const block = {
      type: "progress" as const,
      entityType: "process_run" as const,
      entityId: "run-2",
      currentStep: "Draft email",
      totalSteps: 2,
      completedSteps: 1,
      status: "running" as const,
    };

    const text = renderBlockToText(block);
    expect(text).toContain("Draft email");
    expect(text).not.toContain("Blocked");
  });
});
