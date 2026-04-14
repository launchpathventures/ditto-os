/**
 * Tests for feedback-recorder.ts
 * AC-10: extractCorrectionPattern returns pattern from a diff with removed words
 * AC-11: checkCorrectionPattern returns null < 3 matches, returns pattern+count with 3+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";
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

// Import after mock
const {
  extractCorrectionPattern,
  checkCorrectionPattern,
  acceptCorrectionPattern,
  promoteToQualityCriteria,
} = await import("./feedback-recorder");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("extractCorrectionPattern", () => {
  it("AC-10: returns pattern from a diff with removed words", () => {
    const diff = {
      changes: [
        { value: "The margin is " },
        { removed: true, value: "15 percent markup" },
        { added: true, value: "22 percent markup" },
        { value: " on items" },
      ],
    };

    const pattern = extractCorrectionPattern(diff);
    expect(pattern).not.toBeNull();
    expect(pattern).toBe("15_percent_markup");
  });

  it("returns null when no words are removed", () => {
    const diff = {
      changes: [
        { value: "unchanged text" },
        { added: true, value: " extra words" },
      ],
    };

    const pattern = extractCorrectionPattern(diff);
    expect(pattern).toBeNull();
  });

  it("sanitizes special characters", () => {
    const diff = {
      changes: [
        { removed: true, value: "$100.50 (old price)" },
      ],
    };

    const pattern = extractCorrectionPattern(diff);
    expect(pattern).not.toBeNull();
    // Special chars stripped: $, ., (, ) removed
    expect(pattern).toMatch(/^[a-z0-9_]+$/);
  });

  it("limits to first 5 words", () => {
    const diff = {
      changes: [
        { removed: true, value: "one two three four five six seven eight" },
      ],
    };

    const pattern = extractCorrectionPattern(diff);
    expect(pattern).toBe("one_two_three_four_five");
  });
});

describe("checkCorrectionPattern", () => {
  async function insertFeedbackWithPattern(
    processId: string,
    pattern: string | null,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      // Need a process output for the foreign key
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
        content: { text: "test" },
      });
      await testDb.insert(schema.feedback).values({
        id: randomUUID(),
        outputId,
        processId,
        type: "edit",
        correctionPattern: pattern,
      });
    }
  }

  it("AC-11: returns null with fewer than 3 matches", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test",
      slug: "test-pattern-check",
      definition: {},
    });

    await insertFeedbackWithPattern(processId, "margin_calculation", 2);

    const result = await checkCorrectionPattern(processId);
    expect(result).toBeNull();
  });

  it("AC-11: returns pattern + count with 3+ matches", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test",
      slug: "test-pattern-3plus",
      definition: {},
    });

    await insertFeedbackWithPattern(processId, "margin_calculation", 4);

    const result = await checkCorrectionPattern(processId);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe("margin_calculation");
    expect(result!.count).toBe(4);
  });

  it("ignores null patterns", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test",
      slug: "test-null-patterns",
      definition: {},
    });

    await insertFeedbackWithPattern(processId, null, 5);

    const result = await checkCorrectionPattern(processId);
    expect(result).toBeNull();
  });
});

describe("acceptCorrectionPattern", () => {
  async function setupProcessWithMemories(processId: string, pattern: string, count: number) {
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test Process",
      slug: `test-accept-${randomUUID().slice(0, 8)}`,
      definition: {},
    });

    const humanReadable = pattern.replace(/_/g, " ");

    // Create feedback records with the correction pattern
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
        name: "test-output",
        type: "text",
        content: { text: "test" },
      });
      const fbId = randomUUID();
      await testDb.insert(schema.feedback).values({
        id: fbId,
        outputId,
        processId,
        type: "edit",
        correctionPattern: pattern,
      });
      // Create a correction memory linked to this feedback
      await testDb.insert(schema.memories).values({
        id: randomUUID(),
        scopeType: "process",
        scopeId: processId,
        type: "correction",
        content: `Edit (minor): ${humanReadable} corrected`,
        source: "feedback",
        sourceId: fbId,
        confidence: 0.3,
      });
    }
  }

  it("AC-12: promotes memory confidence to 0.95 with locked:true", async () => {
    const processId = randomUUID();
    await setupProcessWithMemories(processId, "bathroom_labour_hours", 3);

    const result = await acceptCorrectionPattern(processId, "bathroom_labour_hours");
    expect(result.promoted).toBeGreaterThan(0);

    // Verify memories are promoted
    const memories = await testDb
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, processId),
          eq(schema.memories.type, "correction"),
        ),
      );

    for (const m of memories) {
      expect(m.confidence).toBe(0.95);
      expect((m.metadata as Record<string, unknown>)?.locked).toBe(true);
    }
  });

  it("AC-13: idempotent — calling twice returns success without duplicating", async () => {
    const processId = randomUUID();
    await setupProcessWithMemories(processId, "margin_rate", 3);

    const first = await acceptCorrectionPattern(processId, "margin_rate");
    expect(first.promoted).toBeGreaterThan(0);

    const second = await acceptCorrectionPattern(processId, "margin_rate");
    // Second call should promote 0 (already locked)
    expect(second.promoted).toBe(0);

    // Verify no duplicate memories created
    const memories = await testDb
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, processId),
          eq(schema.memories.type, "correction"),
        ),
      );
    expect(memories.length).toBe(3);
  });
});

describe("promoteToQualityCriteria", () => {
  it("AC-14: initialises array with one entry when quality_criteria is absent", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Null Criteria Process",
      slug: `test-null-criteria-${randomUUID().slice(0, 8)}`,
      definition: {},
    });

    const result = await promoteToQualityCriteria(processId, "bathroom_labour_hours");
    expect(result.alreadyExists).toBe(false);
    expect(result.criterion).toContain("[learned]");
    expect(result.criterion).toContain("(pattern: bathroom_labour_hours)");

    // Verify in DB — quality_criteria lives inside definition JSON
    const [proc] = await testDb
      .select({ definition: schema.processes.definition })
      .from(schema.processes)
      .where(eq(schema.processes.id, processId));
    const criteria = (proc.definition as Record<string, unknown>).quality_criteria as string[];
    expect(criteria).toHaveLength(1);
    expect(criteria[0]).toContain("[learned]");
  });

  it("AC-15: appends without overwriting existing criteria", async () => {
    const processId = randomUUID();
    const existingCriteria = ["Always use formal tone", "Include pricing breakdown"];
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Existing Criteria Process",
      slug: `test-existing-criteria-${randomUUID().slice(0, 8)}`,
      definition: { quality_criteria: existingCriteria },
    });

    const result = await promoteToQualityCriteria(processId, "margin_calculation");
    expect(result.alreadyExists).toBe(false);

    const [proc] = await testDb
      .select({ definition: schema.processes.definition })
      .from(schema.processes)
      .where(eq(schema.processes.id, processId));
    const criteria = (proc.definition as Record<string, unknown>).quality_criteria as string[];
    expect(criteria).toHaveLength(3);
    expect(criteria[0]).toBe("Always use formal tone");
    expect(criteria[1]).toBe("Include pricing breakdown");
    expect(criteria[2]).toContain("[learned]");
  });

  it("AC-13: idempotent — same [learned] pattern not duplicated", async () => {
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Idempotent Criteria Process",
      slug: `test-idempotent-criteria-${randomUUID().slice(0, 8)}`,
      definition: {},
    });

    const first = await promoteToQualityCriteria(processId, "labour_rate");
    expect(first.alreadyExists).toBe(false);

    const second = await promoteToQualityCriteria(processId, "labour_rate");
    expect(second.alreadyExists).toBe(true);
    expect(second.criterion).toBe(first.criterion);

    // Verify no duplicate in DB
    const [proc] = await testDb
      .select({ definition: schema.processes.definition })
      .from(schema.processes)
      .where(eq(schema.processes.id, processId));
    const criteria = (proc.definition as Record<string, unknown>).quality_criteria as string[];
    expect(criteria).toHaveLength(1);
  });
});
