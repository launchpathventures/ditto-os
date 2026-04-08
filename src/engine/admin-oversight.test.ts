/**
 * Admin Oversight Tests (Brief 108)
 *
 * Tests: pause/resume lifecycle, feedback storage and retrieval,
 * dashboard data assembly, notifyAdmin trigger on downgrade.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

// We need to mock the db module before importing the module under test
let testDb: TestDb;
let cleanup: () => void;
let dbPath: string;

// Mock the db module
vi.mock("../db", () => ({
  get db() { return testDb; },
  schema,
}));

// Mock channel.ts sendAndRecord
vi.mock("./channel", () => ({
  sendAndRecord: vi.fn().mockResolvedValue({
    success: true,
    interactionId: "mock-interaction-id",
    messageId: "mock-message-id",
  }),
}));

// Import after mocks
import {
  pauseUserProcesses,
  resumeUserProcesses,
  addAdminFeedback,
  getAdminFeedbackForUser,
  getAdminDashboardData,
  getUserDetail,
  isUserPaused,
  sendAsAlex,
} from "./admin-oversight";

import { notifyAdmin, notifyAdminOfDowngrade } from "./notify-admin";

describe("admin-oversight", () => {
  let userId: string;

  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
    dbPath = result.dbPath;

    // Seed a network user
    userId = "test-user-id";
    testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "user@example.com",
      name: "Test User",
      status: "active",
    }).run();

    // Seed a person record for the user
    testDb.insert(schema.people).values({
      id: "test-person-id",
      userId,
      name: "Test User",
      email: "user@example.com",
      source: "manual",
    }).run();

    // Link person to user
    testDb.update(schema.networkUsers)
      .set({ personId: "test-person-id" })
      .where(eq(schema.networkUsers.id, userId))
      .run();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ============================================================
  // Pause/Resume lifecycle (AC3, AC4)
  // ============================================================

  describe("pause/resume lifecycle", () => {
    it("should pause a user and set pausedAt", async () => {
      expect(await isUserPaused(userId)).toBe(false);

      await pauseUserProcesses(userId, "admin-1");

      expect(await isUserPaused(userId)).toBe(true);

      // Check audit trail
      const activities = testDb
        .select()
        .from(schema.activities)
        .where(eq(schema.activities.action, "admin.pause_user"))
        .all();
      expect(activities).toHaveLength(1);
      expect(activities[0].actorType).toBe("admin");
      expect(activities[0].actorId).toBe("admin-1");
      expect(activities[0].entityId).toBe(userId);
    });

    it("should resume a paused user and clear pausedAt", async () => {
      await pauseUserProcesses(userId, "admin-1");
      expect(await isUserPaused(userId)).toBe(true);

      await resumeUserProcesses(userId, "admin-1");
      expect(await isUserPaused(userId)).toBe(false);

      // Check audit trail has both entries
      const activities = testDb
        .select()
        .from(schema.activities)
        .all();
      const pauseActs = activities.filter((a) => a.action === "admin.pause_user");
      const resumeActs = activities.filter((a) => a.action === "admin.resume_user");
      expect(pauseActs).toHaveLength(1);
      expect(resumeActs).toHaveLength(1);
    });
  });

  // ============================================================
  // Feedback storage (AC5)
  // ============================================================

  describe("feedback storage and retrieval", () => {
    it("should store and retrieve admin feedback", async () => {
      const feedbackId = await addAdminFeedback(
        userId,
        "Rob is a painter, not a plumber",
        "admin-1",
      );
      expect(feedbackId).toBeTruthy();

      const feedback = await getAdminFeedbackForUser(userId);
      expect(feedback).toHaveLength(1);
      expect(feedback[0].feedback).toBe("Rob is a painter, not a plumber");

      // Check audit trail
      const activities = testDb
        .select()
        .from(schema.activities)
        .where(eq(schema.activities.action, "admin.add_feedback"))
        .all();
      expect(activities).toHaveLength(1);
      expect(activities[0].actorId).toBe("admin-1");
    });

    it("should store multiple feedback entries ordered by recency", async () => {
      await addAdminFeedback(userId, "First feedback", "admin-1");
      // Small delay to ensure different createdAt timestamps
      await new Promise((r) => setTimeout(r, 10));
      await addAdminFeedback(userId, "Second feedback", "admin-2");

      const feedback = await getAdminFeedbackForUser(userId);
      expect(feedback).toHaveLength(2);
      // Most recent first
      expect(feedback[0].feedback).toBe("Second feedback");
      expect(feedback[1].feedback).toBe("First feedback");
    });
  });

  // ============================================================
  // Dashboard data assembly (AC1)
  // ============================================================

  describe("dashboard data assembly", () => {
    it("should return all users with health indicators", async () => {
      const users = await getAdminDashboardData();
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe("user@example.com");
      expect(users[0].health).toBe("green");
      expect(users[0].pausedAt).toBeNull();
    });

    it("should show red health for paused users", async () => {
      await pauseUserProcesses(userId, "admin-1");

      const users = await getAdminDashboardData();
      expect(users[0].health).toBe("red");
      expect(users[0].pausedAt).not.toBeNull();
    });
  });

  // ============================================================
  // User detail (AC2)
  // ============================================================

  describe("user detail", () => {
    it("should return user detail with processes and quality metrics", async () => {
      // Seed a process
      testDb.insert(schema.processes).values({
        id: "proc-1",
        name: "Test Process",
        slug: "test-process",
        status: "active",
        definition: {},
      }).run();

      const detail = await getUserDetail(userId);
      expect(detail).not.toBeNull();
      expect(detail!.email).toBe("user@example.com");
      expect(detail!.processes).toHaveLength(1);
      expect(detail!.processes[0].name).toBe("Test Process");
    });

    it("should return null for non-existent user", async () => {
      const detail = await getUserDetail("non-existent");
      expect(detail).toBeNull();
    });

    it("should include admin feedback in detail", async () => {
      await addAdminFeedback(userId, "Feedback for detail view", "admin-1");

      const detail = await getUserDetail(userId);
      expect(detail!.adminFeedback).toHaveLength(1);
      expect(detail!.adminFeedback[0].feedback).toBe("Feedback for detail view");
    });
  });

  // ============================================================
  // Act as Alex (AC6)
  // ============================================================

  describe("act as Alex", () => {
    it("should send email and log activity", async () => {
      const result = await sendAsAlex({
        to: "recipient@example.com",
        subject: "Follow up",
        body: "Just checking in",
        personId: "test-person-id",
        userId,
        adminId: "admin-1",
      });

      expect(result.success).toBe(true);

      // Check audit trail
      const activities = testDb
        .select()
        .from(schema.activities)
        .where(eq(schema.activities.action, "admin.act_as_alex"))
        .all();
      expect(activities).toHaveLength(1);
      expect(activities[0].actorType).toBe("admin");
    });
  });

  // ============================================================
  // notifyAdmin (AC7)
  // ============================================================

  describe("notifyAdmin", () => {
    it("should skip when ADMIN_EMAIL is not set", async () => {
      delete process.env.ADMIN_EMAIL;
      const result = await notifyAdmin({
        subject: "Test",
        body: "Test body",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("ADMIN_EMAIL not configured");
    });

    it("should send notification when ADMIN_EMAIL is set", async () => {
      process.env.ADMIN_EMAIL = "admin@ditto.com";
      const result = await notifyAdmin({
        subject: "Test notification",
        body: "This is a test",
      });
      expect(result.success).toBe(true);
      delete process.env.ADMIN_EMAIL;
    });

    it("should format downgrade notification with trigger details", async () => {
      process.env.ADMIN_EMAIL = "admin@ditto.com";
      const result = await notifyAdminOfDowngrade({
        userName: "Test User",
        processName: "outreach-quality-review",
        fromTier: "autonomous",
        toTier: "supervised",
        reason: "Correction rate spike",
        triggers: [
          { name: "Correction rate spike (last 10)", threshold: "> 30%", actual: "40%" },
        ],
      });
      expect(result.success).toBe(true);
      delete process.env.ADMIN_EMAIL;
    });
  });
});
