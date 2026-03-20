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

const { computeTrustState } = await import("./trust");

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
