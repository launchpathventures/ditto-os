/**
 * Tests for bundled review (Brief 103)
 *
 * Tests cover:
 * - Collecting outputs for bundled review (AC11)
 * - Per-sub-goal feedback within a bundle (AC12)
 * - Phase boundary detection (AC13)
 * - Presenting bundled reviews
 * - Clearing pending reviews
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  collectForBundledReview,
  isReviewBoundary,
  presentBundledReview,
  clearPendingReviews,
  getPendingReviewCount,
  recordBundledFeedback,
  type SubGoalOutput,
} from "./bundled-review";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  // Clear any pending reviews from previous tests
  clearPendingReviews("goal-1");
  clearPendingReviews("goal-2");
});

afterEach(() => {
  cleanup();
});

describe("bundled review", () => {
  describe("collectForBundledReview (AC11)", () => {
    it("collects sub-goal outputs for a goal", () => {
      const output: SubGoalOutput = {
        subGoalId: "sg-1",
        title: "Research",
        routing: "find",
        outputs: { result: "findings" },
        status: "completed",
      };

      collectForBundledReview("goal-1", output);
      expect(getPendingReviewCount("goal-1")).toBe(1);
    });

    it("accumulates multiple outputs", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-1",
        title: "Research",
        routing: "find",
        outputs: { result: "findings" },
        status: "completed",
      });
      collectForBundledReview("goal-1", {
        subGoalId: "sg-2",
        title: "Build",
        routing: "build",
        outputs: { result: "process created" },
        status: "completed",
      });

      expect(getPendingReviewCount("goal-1")).toBe(2);
    });

    it("deduplicates by sub-goal ID", () => {
      const output: SubGoalOutput = {
        subGoalId: "sg-1",
        title: "Research",
        routing: "find",
        outputs: { result: "findings" },
        status: "completed",
      };

      collectForBundledReview("goal-1", output);
      collectForBundledReview("goal-1", output);

      expect(getPendingReviewCount("goal-1")).toBe(1);
    });

    it("keeps goals separate", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-1",
        title: "A",
        routing: "find",
        outputs: {},
        status: "completed",
      });
      collectForBundledReview("goal-2", {
        subGoalId: "sg-2",
        title: "B",
        routing: "build",
        outputs: {},
        status: "completed",
      });

      expect(getPendingReviewCount("goal-1")).toBe(1);
      expect(getPendingReviewCount("goal-2")).toBe(1);
    });
  });

  describe("isReviewBoundary (AC13)", () => {
    it("detects when all find sub-goals in a tier are complete", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-1",
        title: "Research A",
        routing: "find",
        outputs: {},
        status: "completed",
      });
      collectForBundledReview("goal-1", {
        subGoalId: "sg-2",
        title: "Research B",
        routing: "find",
        outputs: {},
        status: "completed",
      });

      const result = isReviewBoundary(
        "goal-1",
        new Set(["sg-1", "sg-2"]),
        [
          { id: "sg-1", routing: "find", dependsOn: [] },
          { id: "sg-2", routing: "find", dependsOn: [] },
          { id: "sg-3", routing: "build", dependsOn: ["sg-1", "sg-2"] },
        ],
      );

      expect(result.ready).toBe(true);
      expect(result.phaseBoundary).toContain("find");
    });

    it("detects when all build sub-goals in a tier are complete", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-3",
        title: "Build Process",
        routing: "build",
        outputs: {},
        status: "completed",
      });

      const result = isReviewBoundary(
        "goal-1",
        new Set(["sg-1", "sg-2", "sg-3"]),
        [
          { id: "sg-1", routing: "find", dependsOn: [] },
          { id: "sg-2", routing: "find", dependsOn: [] },
          { id: "sg-3", routing: "build", dependsOn: ["sg-1", "sg-2"] },
        ],
      );

      expect(result.ready).toBe(true);
      expect(result.phaseBoundary).toContain("build");
    });

    it("not ready when tier is incomplete", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-1",
        title: "Research A",
        routing: "find",
        outputs: {},
        status: "completed",
      });

      const result = isReviewBoundary(
        "goal-1",
        new Set(["sg-1"]), // sg-2 not yet complete
        [
          { id: "sg-1", routing: "find", dependsOn: [] },
          { id: "sg-2", routing: "find", dependsOn: [] },
        ],
      );

      expect(result.ready).toBe(false);
    });

    it("not ready when no pending reviews", () => {
      const result = isReviewBoundary(
        "goal-1",
        new Set(["sg-1"]),
        [{ id: "sg-1", routing: "find", dependsOn: [] }],
      );

      expect(result.ready).toBe(false);
    });
  });

  describe("presentBundledReview", () => {
    it("returns bundle and clears pending", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-1",
        title: "Research",
        routing: "find",
        outputs: { data: "test" },
        status: "completed",
      });
      collectForBundledReview("goal-1", {
        subGoalId: "sg-2",
        title: "Build",
        routing: "build",
        outputs: { process: "new-proc" },
        status: "completed",
      });

      const bundle = presentBundledReview("goal-1", "Research phase complete");

      expect(bundle).not.toBeNull();
      expect(bundle!.items).toHaveLength(2);
      expect(bundle!.phaseBoundary).toBe("Research phase complete");
      expect(bundle!.goalId).toBe("goal-1");

      // Pending should be cleared
      expect(getPendingReviewCount("goal-1")).toBe(0);
    });

    it("returns null when no pending reviews", () => {
      const bundle = presentBundledReview("goal-1", "test");
      expect(bundle).toBeNull();
    });
  });

  describe("recordBundledFeedback (AC12)", () => {
    it("records individual feedback per sub-goal output", async () => {
      // Create a work item and process for the feedback
      await testDb.insert(schema.processes).values({
        id: "proc-1",
        name: "Test Process",
        slug: "test-process",
        definition: {} as Record<string, unknown>,
        status: "active",
        trustTier: "supervised",
      });

      const [wi] = await testDb.insert(schema.workItems).values({
        type: "task",
        status: "completed",
        content: "test",
        source: "capture",
        assignedProcess: "proc-1",
        executionIds: ["run-1"],
      }).returning();

      // Create a process run and output
      await testDb.insert(schema.processRuns).values({
        id: "run-1",
        processId: "proc-1",
        status: "approved",
        triggeredBy: "system",
      });

      await testDb.insert(schema.processOutputs).values({
        id: "out-1",
        processRunId: "run-1",
        name: "result",
        type: "text",
        content: { text: "output data" } as unknown as Record<string, unknown>,
        needsReview: true,
      });

      await recordBundledFeedback("bundle-1", "goal-1", [
        { subGoalId: wi.id, action: "approve", comment: "Looks good" },
      ]);

      // Check feedback was recorded
      const feedbackRecords = await testDb.select().from(schema.feedback);
      expect(feedbackRecords).toHaveLength(1);
      expect(feedbackRecords[0].type).toBe("approve");
      expect(feedbackRecords[0].comment).toBe("Looks good");

      // Check work item was updated to completed
      const [updatedWi] = await testDb.select().from(schema.workItems)
        .where(eq(schema.workItems.id, wi.id));
      expect(updatedWi.status).toBe("completed");

      // Check activity was logged
      const activities = await testDb.select().from(schema.activities);
      expect(activities.some(a => a.action === "bundled_review.feedback")).toBe(true);
    });
  });

  describe("clearPendingReviews", () => {
    it("clears all pending reviews for a goal", () => {
      collectForBundledReview("goal-1", {
        subGoalId: "sg-1",
        title: "A",
        routing: "find",
        outputs: {},
        status: "completed",
      });

      expect(getPendingReviewCount("goal-1")).toBe(1);
      clearPendingReviews("goal-1");
      expect(getPendingReviewCount("goal-1")).toBe(0);
    });
  });
});
