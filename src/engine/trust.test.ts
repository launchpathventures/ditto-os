/**
 * Tests for trust.ts
 * AC-12: Trust computation returns correct approval rate from test feedback records
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
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

const { computeTrustState, generateUpgradeCelebration, generateDowngradeExplanation } = await import("./trust");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

/**
 * Helper: insert feedback records for a process
 */
async function insertFeedback(
  processId: string,
  type: "approve" | "edit" | "reject",
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const runId = randomUUID();
    await testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      status: "approved",
      triggeredBy: "test",
    });
    const outputId = randomUUID();
    await testDb.insert(schema.processOutputs).values({
      id: outputId,
      processRunId: runId,
      name: "output",
      type: "text",
      content: { text: "test" },
    });
    await testDb.insert(schema.feedback).values({
      id: randomUUID(),
      outputId,
      processId,
      type,
      editSeverity: type === "edit" ? "correction" : undefined,
      editRatio: type === "edit" ? 0.2 : undefined,
    });
  }
}

describe("trust computation", () => {
  it("AC-12: returns correct approval rate from feedback records", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Trust Test",
      slug: "trust-test",
      definition: {},
    });

    // 7 approvals, 2 edits, 1 rejection = 70% approval rate
    await insertFeedback(processId, "approve", 7);
    await insertFeedback(processId, "edit", 2);
    await insertFeedback(processId, "reject", 1);

    const state = await computeTrustState(processId);

    expect(state).toBeDefined();
    expect(state.approvalRate).toBeCloseTo(0.7, 1);
    expect(state.humanReviews).toBe(10);
    // correctionRate = (edits + rejections) / humanReviews = (2 + 1) / 10 = 0.3
    expect(state.correctionRate).toBeCloseTo(0.3, 1);
    expect(state.rejections).toBe(1);
  });

  it("handles zero feedback gracefully", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Empty Trust",
      slug: "empty-trust",
      definition: {},
    });

    const state = await computeTrustState(processId);

    expect(state).toBeDefined();
    expect(state.humanReviews).toBe(0);
    expect(state.approvalRate).toBe(0);
  });

  it("100% approval rate with all approvals", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Perfect Trust",
      slug: "perfect-trust",
      definition: {},
    });

    await insertFeedback(processId, "approve", 5);

    const state = await computeTrustState(processId);

    expect(state.approvalRate).toBe(1.0);
    expect(state.correctionRate).toBe(0);
    expect(state.rejections).toBe(0);
  });
});

// ============================================================
// Trust Milestone Generation (Brief 160)
// ============================================================

describe("trust milestone celebration (MP-5.1)", () => {
  it("generates upgrade celebration with evidence narrative", () => {
    const block = generateUpgradeCelebration({
      processName: "Quoting",
      currentTier: "supervised",
      suggestedTier: "spot_checked",
      state: {
        approvalRate: 0.95,
        correctionRate: 0.05,
        consecutiveCleanRuns: 8,
        runsInWindow: 25,
      } as Parameters<typeof generateUpgradeCelebration>[0]["state"],
      suggestionId: "sug-123",
    });

    expect(block.type).toBe("trust_milestone");
    expect(block.milestoneType).toBe("upgrade");
    expect(block.processName).toBe("Quoting");
    expect(block.fromTier).toBe("supervised");
    expect(block.toTier).toBe("spot-checked");
    expect(block.evidence).toContain("95%");
    expect(block.evidence).toContain("25 runs");
    expect(block.evidence).toContain("8 clean runs");
    expect(block.evidence).toContain("1 in 5");
    expect(block.actions).toHaveLength(2);
    expect(block.actions![0].style).toBe("primary");
    expect(block.actions![0].payload).toHaveProperty("action", "trust_accept");
    expect(block.actions![1].payload).toHaveProperty("action", "trust_reject");
  });

  it("shows zero corrections when correction rate is 0", () => {
    const block = generateUpgradeCelebration({
      processName: "Invoicing",
      currentTier: "spot_checked",
      suggestedTier: "autonomous",
      state: {
        approvalRate: 1.0,
        correctionRate: 0,
        consecutiveCleanRuns: 20,
        runsInWindow: 20,
      } as Parameters<typeof generateUpgradeCelebration>[0]["state"],
      suggestionId: "sug-456",
    });

    expect(block.evidence).toContain("zero corrections needed");
    expect(block.evidence).toContain("flagged outputs");
  });
});

describe("trust milestone downgrade explanation (MP-5.2)", () => {
  it("generates warm downgrade explanation with trigger patterns", () => {
    const block = generateDowngradeExplanation({
      processName: "Email Campaign",
      fromTier: "spot_checked",
      toTier: "supervised",
      triggers: [
        { name: "Correction rate spike (last 10)", threshold: "> 30%", actual: "40%" },
      ],
      processId: "proc-789",
    });

    expect(block.type).toBe("trust_milestone");
    expect(block.milestoneType).toBe("downgrade");
    expect(block.processName).toBe("Email Campaign");
    expect(block.fromTier).toBe("spot-checked");
    expect(block.toTier).toBe("supervised");
    expect(block.explanation).toContain("more corrections than usual");
    expect(block.explanation).toContain("check in more often");
    expect(block.evidence).toContain("Correction rate spike");
    expect(block.actions).toHaveLength(1);
    expect(block.actions![0].payload).toHaveProperty("action", "trust_override");
  });

  it("combines multiple trigger explanations warmly", () => {
    const block = generateDowngradeExplanation({
      processName: "Invoicing",
      fromTier: "autonomous",
      toTier: "supervised",
      triggers: [
        { name: "Rejection detected", threshold: "0", actual: "1" },
        { name: "Auto-check failure rate (last 10)", threshold: "> 20%", actual: "25%" },
      ],
      processId: "proc-abc",
    });

    expect(block.explanation).toContain("needed to be redone");
    expect(block.explanation).toContain("quality issues");
    expect(block.explanation).toContain(" and ");
  });
});
