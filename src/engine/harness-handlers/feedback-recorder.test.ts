/**
 * Tests for feedback-recorder.ts
 * AC-10: extractCorrectionPattern returns pattern from a diff with removed words
 * AC-11: checkCorrectionPattern returns null < 3 matches, returns pattern+count with 3+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
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
