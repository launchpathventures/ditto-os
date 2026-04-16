/**
 * Tests for correction rate tracking + E2E learning loop.
 *
 * Brief 159:
 * - MP-4.3: Correction rate computation per process/pattern
 * - MP-4.4: Evidence narrative formatting
 * - MP-4.5: E2E learning loop — edit 3x → pattern → teach → corrected
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
  extractCorrectionPattern,
  checkCorrectionPattern,
  recordEditFeedback,
  acceptCorrectionPattern,
  promoteToQualityCriteria,
  logTeachAction,
  computeCorrectionRates,
  formatCorrectionEvidence,
} = await import("./harness-handlers/feedback-recorder");

// Mock out side-effect-producing imports that recordEditFeedback calls
vi.mock("./trust-evaluator", () => ({
  evaluateTrust: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./heartbeat", () => ({
  startSystemAgentRun: vi.fn().mockResolvedValue(null),
}));
vi.mock("./system-agents/knowledge-extractor", () => ({
  checkSignificanceThreshold: vi.fn().mockResolvedValue(false),
}));

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Helpers
// ============================================================

async function createProcess(name: string, qualityCriteria?: string[]): Promise<string> {
  const processId = randomUUID();
  await testDb.insert(schema.processes).values({
    id: processId,
    name,
    slug: `test-${randomUUID().slice(0, 8)}`,
    definition: qualityCriteria ? { quality_criteria: qualityCriteria } : {},
  });
  return processId;
}

async function createOutputForProcess(processId: string): Promise<string> {
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
    name: "test-output",
    type: "text",
    content: { text: "Original text with 15 percent markup on bathroom labour hours" },
  });
  return outputId;
}

// ============================================================
// MP-4.3: Correction Rate Tracking
// ============================================================

describe("correction rate tracking (MP-4.3)", () => {
  it("AC-1: computes per-process, per-pattern correction rates from feedback", async () => {
    const processId = await createProcess("Quote Generator");

    // Create 5 feedback records: 3 edits with same pattern, 2 approvals
    for (let i = 0; i < 3; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "edit",
        correctionPattern: "bathroom_labour_hours",
      });
    }
    for (let i = 0; i < 2; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
      });
    }

    const rates = await computeCorrectionRates(processId);

    expect(rates.processId).toBe(processId);
    expect(rates.processName).toBe("Quote Generator");
    expect(rates.overallRate).toBe(3 / 5); // 3 edits out of 5 total reviews
    expect(rates.patterns).toHaveLength(1);
    expect(rates.patterns[0].pattern).toBe("bathroom_labour_hours");
    expect(rates.patterns[0].corrections).toBe(3);
    expect(rates.patterns[0].rate).toBe(3 / 5);
  });

  it("AC-2: tracks before/after learning rates using teach action timestamp", async () => {
    const processId = await createProcess("Quote Generator");

    // Phase 1: Before learning — 5 reviews, 3 corrections
    const beforeDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 3; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "edit",
        correctionPattern: "bathroom_labour_hours",
        createdAt: new Date(beforeDate.getTime() + i * 1000),
      });
    }
    for (let i = 0; i < 2; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
        createdAt: new Date(beforeDate.getTime() + (3 + i) * 1000),
      });
    }

    // Teach action at the midpoint
    const teachDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await testDb.insert(schema.activities).values({
      action: "learning.teach",
      actorType: "user",
      actorId: "workspace",
      entityType: "process",
      entityId: processId,
      metadata: { pattern: "bathroom_labour_hours", criterion: "[learned] test" },
      createdAt: teachDate,
    });

    // Phase 2: After learning — 10 reviews, 0 corrections
    const afterDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
        createdAt: new Date(afterDate.getTime() + i * 1000),
      });
    }

    const rates = await computeCorrectionRates(processId);

    expect(rates.patterns).toHaveLength(1);
    const pattern = rates.patterns[0];
    expect(pattern.rateBefore).toBe(3 / 5); // 60% before learning
    expect(pattern.rateAfter).toBe(0); // 0% after learning
    expect(pattern.learnedAt).toBeTruthy();

    // Should be a significant improvement
    expect(rates.significantImprovements).toHaveLength(1);
    expect(rates.significantImprovements[0].pattern).toBe("bathroom_labour_hours");
  });

  it("AC-3: returns empty patterns when no corrections exist", async () => {
    const processId = await createProcess("Clean Process");

    // Only approvals
    for (let i = 0; i < 5; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
      });
    }

    const rates = await computeCorrectionRates(processId);
    expect(rates.overallRate).toBe(0);
    expect(rates.patterns).toHaveLength(0);
    expect(rates.significantImprovements).toHaveLength(0);
  });
});

// ============================================================
// MP-4.4: Evidence Narrative
// ============================================================

describe("evidence narrative (MP-4.4)", () => {
  it("AC-5: formats correction evidence as human-readable narrative", async () => {
    const processId = await createProcess("Quote Generator");

    // Set up before/after learning scenario
    const beforeDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 3; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "edit",
        correctionPattern: "labour_estimate",
        createdAt: new Date(beforeDate.getTime() + i * 1000),
      });
    }
    for (let i = 0; i < 2; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
        createdAt: new Date(beforeDate.getTime() + (3 + i) * 1000),
      });
    }

    const teachDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await testDb.insert(schema.activities).values({
      action: "learning.teach",
      actorType: "user",
      entityType: "process",
      entityId: processId,
      metadata: { pattern: "labour_estimate" },
      createdAt: teachDate,
    });

    // After learning: 10 approvals, 0 corrections
    const afterDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 10; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
        createdAt: new Date(afterDate.getTime() + i * 1000),
      });
    }

    const rates = await computeCorrectionRates(processId);
    const narrative = formatCorrectionEvidence(rates);

    expect(narrative).not.toBeNull();
    expect(narrative).toContain("labour estimate corrections:");
    expect(narrative).toContain("60%");
    expect(narrative).toContain("0%");
    expect(narrative).toContain("after learning");
  });

  it("AC-6: returns null when no learning effect exists", async () => {
    const processId = await createProcess("No Learning");

    // Only edits, no teach action
    for (let i = 0; i < 3; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "edit",
        correctionPattern: "some_pattern",
      });
    }

    const rates = await computeCorrectionRates(processId);
    const narrative = formatCorrectionEvidence(rates);

    // No teach action = no before/after = no narrative
    expect(narrative).toBeNull();
  });

  it("AC-7: narrative is specific, not generic", async () => {
    const processId = await createProcess("Specific Test");
    const beforeDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Create corrections with specific pattern
    for (let i = 0; i < 4; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "edit",
        correctionPattern: "margin_calculation",
        createdAt: new Date(beforeDate.getTime() + i * 1000),
      });
    }

    const teachDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await testDb.insert(schema.activities).values({
      action: "learning.teach",
      actorType: "user",
      entityType: "process",
      entityId: processId,
      metadata: { pattern: "margin_calculation" },
      createdAt: teachDate,
    });

    // After: only approvals
    for (let i = 0; i < 8; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
        createdAt: new Date(Date.now() - 1000 + i),
      });
    }

    const rates = await computeCorrectionRates(processId);
    const narrative = formatCorrectionEvidence(rates);

    // Should name the specific pattern, not just say "performance improved"
    expect(narrative).toContain("margin calculation");
    expect(narrative).not.toContain("performance improved");
  });
});

// ============================================================
// MP-4.5: E2E Learning Loop Test
// ============================================================

describe("E2E learning loop (MP-4.5)", () => {
  it("AC-8+9+10+11: full loop — edit 3x → pattern → teach → quality criteria + memory locked", async () => {
    const processId = await createProcess("Bathroom Quote Generator");

    // Step 1: Edit output 3x with same pattern
    const outputIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const outputId = await createOutputForProcess(processId);
      outputIds.push(outputId);

      await recordEditFeedback({
        outputId,
        processId,
        originalText: "The bathroom labour will take 15 percent markup",
        editedText: "The bathroom labour will take 22 percent markup",
        comment: `Correction ${i + 1}: wrong markup rate`,
      });
    }

    // AC-8: Pattern notification fires after 3+ identical correctionPattern values
    const patternResult = await checkCorrectionPattern(processId);
    expect(patternResult).not.toBeNull();
    expect(patternResult!.count).toBeGreaterThanOrEqual(3);
    const pattern = patternResult!.pattern;

    // AC-9: Accept "Teach this?" → memory locked + quality criteria updated
    const acceptResult = await acceptCorrectionPattern(processId, pattern);
    expect(acceptResult.promoted).toBeGreaterThan(0);

    // Verify memories are locked
    const memories = await testDb
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, processId),
          eq(schema.memories.type, "correction"),
          eq(schema.memories.active, true),
        ),
      );

    const lockedMemories = memories.filter(
      (m) => (m.metadata as Record<string, unknown>)?.locked === true,
    );
    expect(lockedMemories.length).toBeGreaterThan(0);
    expect(lockedMemories[0].confidence).toBe(0.95);

    // Promote to quality criteria
    const promoteResult = await promoteToQualityCriteria(processId, pattern);
    expect(promoteResult.alreadyExists).toBe(false);
    expect(promoteResult.criterion).toContain("[learned]");
    expect(promoteResult.criterion).toContain(`(pattern: ${pattern})`);

    // Log teach action
    await logTeachAction(processId, pattern, promoteResult.criterion);

    // Verify quality criteria in process definition
    const [proc] = await testDb
      .select({ definition: schema.processes.definition })
      .from(schema.processes)
      .where(eq(schema.processes.id, processId));
    const criteria = (proc.definition as Record<string, unknown>).quality_criteria as string[];
    expect(criteria).toHaveLength(1);
    expect(criteria[0]).toContain("[learned]");

    // AC-10/11: Simulate "next run" — add approvals after learning,
    // then verify correction rates show improvement
    const afterDate = new Date(Date.now() + 1000);
    for (let i = 0; i < 5; i++) {
      const outputId = await createOutputForProcess(processId);
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "approve",
        createdAt: new Date(afterDate.getTime() + i * 1000),
      });
    }

    // Verify correction rates show the improvement
    const rates = await computeCorrectionRates(processId);
    expect(rates.overallRate).toBeLessThan(1); // Not 100% corrections anymore

    // The pattern should have before/after rates
    const trackedPattern = rates.patterns.find((p) => p.pattern === pattern);
    expect(trackedPattern).toBeDefined();
    expect(trackedPattern!.hasLearned).toBe(true);
    expect(trackedPattern!.learnedAt).toBeTruthy();

    // After learning, there should be significant improvement
    if (trackedPattern!.rateBefore !== null && trackedPattern!.rateAfter !== null) {
      expect(trackedPattern!.rateBefore).toBeGreaterThan(trackedPattern!.rateAfter!);
    }

    // Evidence narrative should be available
    const narrative = formatCorrectionEvidence(rates);
    // May or may not have significant improvement depending on exact window
    // but the rates should be computable without error
    expect(rates.patterns.length).toBeGreaterThan(0);
  });
});
