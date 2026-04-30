/**
 * Brief 227 — `dismiss_promotion_proposal` Self tool tests (Reviewer Crit-2).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq, desc } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

const {
  handleDismissPromotionProposal,
  DISMISS_PROMOTION_PROPOSAL_TOOL_NAME,
} = await import("./dismiss-promotion-proposal");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  process.env.DITTO_TEST_MODE = "true";
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
});

describe("handleDismissPromotionProposal", () => {
  it("rejects calls without stepRunId outside of test mode", async () => {
    delete process.env.DITTO_TEST_MODE;

    const beforeCount = (await testDb.select().from(schema.activities)).length;

    const result = await handleDismissPromotionProposal({
      memoryId: "mem-x",
    });
    expect(result.success).toBe(false);
    expect(result.toolName).toBe(DISMISS_PROMOTION_PROPOSAL_TOOL_NAME);
    expect(result.output).toContain("Insight-180");

    // DB-spy: no activity row written
    const afterCount = (await testDb.select().from(schema.activities)).length;
    expect(beforeCount).toBe(afterCount);
  });

  it("rejects missing memoryId", async () => {
    const result = await handleDismissPromotionProposal({
      memoryId: "",
      stepRunId: "step-run-1",
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain("memoryId is required");
  });

  it("writes a memory_promotion_dismissed activity row", async () => {
    const result = await handleDismissPromotionProposal({
      memoryId: "mem-1",
      stepRunId: "step-run-1",
      actorId: "user@example.com",
    });
    expect(result.success).toBe(true);

    const activities = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.entityId, "mem-1"))
      .orderBy(desc(schema.activities.createdAt));

    expect(activities).toHaveLength(1);
    expect(activities[0].action).toBe("memory_promotion_dismissed");
    expect(activities[0].entityType).toBe("memory");
    expect(activities[0].actorType).toBe("user");
    expect(activities[0].actorId).toBe("user@example.com");
  });
});
