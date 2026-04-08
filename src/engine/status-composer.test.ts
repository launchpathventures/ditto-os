/**
 * Status Composer Tests (Brief 098b)
 *
 * Tests: silence-is-a-feature logic, status data gathering,
 * email composition, threshold checks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

// Mock the db module
vi.mock("../db", async () => {
  const actualSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: actualSchema,
  };
});

// Mock heartbeat
vi.mock("./heartbeat", () => ({
  startProcessRun: vi.fn(async () => "mock-run-id"),
  fullHeartbeat: vi.fn(async () => ({
    processRunId: "mock-run-id",
    stepsExecuted: 1,
    status: "completed",
    message: "mock",
  })),
}));

// Mock integration registry
vi.mock("./integration-registry", () => ({
  getIntegration: vi.fn(() => undefined),
  getIntegrationRegistry: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

// Mock notify-user (channel-agnostic notification layer)
const { mockNotifyUser } = vi.hoisted(() => ({
  mockNotifyUser: vi.fn().mockResolvedValue({ success: true, channel: "email", interactionId: "mock-notify-id" }),
}));
vi.mock("./notify-user", () => ({
  notifyUser: mockNotifyUser,
}));

// Mock channel (still needed transitively)
vi.mock("./channel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./channel")>();
  return {
    ...actual,
    sendAndRecord: vi.fn(async () => ({
      success: true,
      interactionId: "mock-interaction-id",
      messageId: "mock-message-id",
    })),
    createAgentMailAdapterForPersona: vi.fn(() => null),
  };
});

// Mock workspace-readiness — control readiness result per test
const { mockCheckWorkspaceReadiness } = vi.hoisted(() => ({
  mockCheckWorkspaceReadiness: vi.fn().mockResolvedValue({ ready: false, reason: "thresholds_not_met" }),
}));
vi.mock("./workspace-readiness", () => ({
  checkWorkspaceReadiness: mockCheckWorkspaceReadiness,
}));

// Mock suggestion-dismissals
const { mockIsDismissed } = vi.hoisted(() => ({
  mockIsDismissed: vi.fn().mockResolvedValue(false),
}));
vi.mock("./suggestion-dismissals", () => ({
  isDismissed: mockIsDismissed,
}));

import { shouldSendStatus, composeStatusEmail, runStatusComposition } from "./status-composer";
import type { StatusData } from "./status-composer";

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Helper
// ============================================================

function makeStatusData(overrides: Partial<StatusData> = {}): StatusData {
  return {
    userId: "user-1",
    userEmail: "user@example.com",
    userName: "Test User",
    personId: "person-1",
    newInteractions: 0,
    completedRuns: 0,
    pendingApprovals: 0,
    activeRuns: 0,
    highlights: [],
    ...overrides,
  };
}

// ============================================================
// shouldSendStatus — silence logic (AC9)
// ============================================================

describe("shouldSendStatus", () => {
  it("sends when there is activity and no previous status", () => {
    const data = makeStatusData({
      newInteractions: 3,
      highlights: ["3 new replies received"],
    });

    const result = shouldSendStatus(data, null);

    expect(result.send).toBe(true);
  });

  it("skips when there is no activity", () => {
    const data = makeStatusData();

    const result = shouldSendStatus(data, null);

    expect(result.send).toBe(false);
    expect(result.reason).toBe("skipped_no_activity");
  });

  it("skips when last status was too recent (< 3 days) even with activity", () => {
    const data = makeStatusData({ newInteractions: 5, highlights: ["activity"] });
    const lastStatusAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    const result = shouldSendStatus(data, lastStatusAt);

    expect(result.send).toBe(false);
    expect(result.reason).toBe("skipped_too_recent");
  });

  it("reports no_activity before too_recent when both apply", () => {
    const data = makeStatusData(); // no activity
    const lastStatusAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    const result = shouldSendStatus(data, lastStatusAt);

    // Activity check comes first — more informative reason
    expect(result.send).toBe(false);
    expect(result.reason).toBe("skipped_no_activity");
  });

  it("sends when last status was > 3 days ago and there is activity", () => {
    const data = makeStatusData({
      newInteractions: 2,
      completedRuns: 1,
      highlights: ["2 replies", "1 process completed"],
    });
    const lastStatusAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago

    const result = shouldSendStatus(data, lastStatusAt);

    expect(result.send).toBe(true);
  });

  it("counts pending approvals as activity", () => {
    const data = makeStatusData({
      pendingApprovals: 2,
      highlights: ["2 pending approvals"],
    });

    const result = shouldSendStatus(data, null);

    expect(result.send).toBe(true);
  });

  it("counts completed runs as activity", () => {
    const data = makeStatusData({
      completedRuns: 1,
      highlights: ["1 process completed"],
    });

    const result = shouldSendStatus(data, null);

    expect(result.send).toBe(true);
  });
});

// ============================================================
// composeStatusEmail
// ============================================================

describe("composeStatusEmail", () => {
  it("composes email with highlights", () => {
    const data = makeStatusData({
      userName: "Alice",
      newInteractions: 3,
      completedRuns: 1,
      pendingApprovals: 2,
      activeRuns: 1,
      highlights: [
        "3 new replies received",
        "1 process completed",
        "2 pending approvals",
      ],
    });

    const { subject, body } = composeStatusEmail(data);

    expect(subject).toContain("3 new replies received");
    expect(body).toContain("Hi Alice");
    expect(body).toContain("3 new replies received");
    expect(body).toContain("1 process completed");
    expect(body).toContain("2 pending approvals");
    expect(body).toContain("2 items waiting for your review");
    expect(body).toContain("1 process is currently active");
  });

  it("uses 'there' when no name", () => {
    const data = makeStatusData({ userName: undefined, highlights: ["test"] });
    const { body } = composeStatusEmail(data);
    expect(body).toContain("Hi there");
  });
});

// ============================================================
// runStatusComposition — integration
// ============================================================

describe("runStatusComposition", () => {
  it("sends status to active user with activity", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    // Create person FIRST (FK constraint)
    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "Test Person",
      email: "contact@example.com",
      source: "manual",
    });

    // Create network user
    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "user@example.com",
      name: "Test User",
      status: "active",
      personId,
    });

    // Create a recent interaction
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "reply_received",
      channel: "email",
      mode: "connecting",
      summary: "Test reply",
    });

    const result = await runStatusComposition();

    expect(result.checked).toBe(1);
    expect(result.sent).toBe(1);
    expect(mockNotifyUser).toHaveBeenCalledOnce();
  });

  it("skips user with no activity (silence is a feature)", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    // Create person FIRST (FK constraint)
    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "Quiet Person",
      email: "quiet@example.com",
      source: "manual",
    });

    // Create network user with no interactions
    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "quiet@example.com",
      name: "Quiet User",
      status: "active",
      personId,
    });

    const result = await runStatusComposition();

    expect(result.checked).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });

  it("skips user without personId", async () => {
    await testDb.insert(schema.networkUsers).values({
      id: randomUUID(),
      email: "noperson@example.com",
      status: "active",
      // no personId
    });

    const result = await runStatusComposition();

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

// ============================================================
// Multi-cycle no-nag regression test (Brief 110, Reviewer FLAG 6+11)
// ============================================================

describe("workspace suggestion — multi-cycle no-nag guarantee", () => {
  it("does not repeat workspace suggestion across consecutive status cycles", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    // Create person + user
    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "Nag Test Person",
      email: "nag@example.com",
      source: "manual",
    });
    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "nag@example.com",
      name: "Nag Test",
      status: "active",
      personId,
    });

    // Create activity so status emails actually send
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "reply_received",
      channel: "email",
      mode: "connecting",
      summary: "Test reply",
    });

    // Workspace readiness returns ready=true
    mockCheckWorkspaceReadiness.mockResolvedValue({
      ready: true,
      reason: "3 active processes running",
    });

    // === Cycle 1: should include workspace suggestion ===
    const result1 = await runStatusComposition();
    expect(result1.sent).toBe(1);

    // Verify suggestion was included in first email
    const firstCall = mockNotifyUser.mock.calls[0][0];
    expect(firstCall.body).toContain("By the way");
    expect(firstCall.body).toContain("3 active processes");

    // Verify workspaceSuggestedAt was set
    const [userAfterCycle1] = await testDb
      .select({ workspaceSuggestedAt: schema.networkUsers.workspaceSuggestedAt })
      .from(schema.networkUsers)
      .where(require("drizzle-orm").eq(schema.networkUsers.id, userId));
    expect(userAfterCycle1.workspaceSuggestedAt).not.toBeNull();

    // Reset mocks for cycle 2
    mockNotifyUser.mockClear();

    // Record a new interaction so silence threshold is met again
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "outreach_sent",
      channel: "email",
      mode: "selling",
      summary: "Follow up sent",
    });

    // Record a follow_up interaction 4 days ago to simulate the previous
    // status email (must be >3 days old so silence threshold passes)
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "follow_up",
      channel: "email",
      mode: "nurture",
      summary: "Status email sent",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    });

    // === Cycle 2: should NOT include workspace suggestion ===
    // Readiness is still true, but workspaceSuggestedAt blocks it
    const result2 = await runStatusComposition();
    expect(result2.sent).toBe(1);

    // Verify suggestion was NOT included in second email
    const secondCall = mockNotifyUser.mock.calls[0][0];
    expect(secondCall.body).not.toContain("By the way");
    expect(secondCall.body).not.toContain("workspace");
  });

  it("allows suggestion again after 30-day cooldown expires", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    // Create person + user with workspaceSuggestedAt 31 days ago
    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "Cooldown Person",
      email: "cooldown@example.com",
      source: "manual",
    });
    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "cooldown@example.com",
      name: "Cooldown User",
      status: "active",
      personId,
      workspaceSuggestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
    });

    // Create activity
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "reply_received",
      channel: "email",
      mode: "connecting",
      summary: "New reply",
    });

    // Workspace readiness returns ready
    mockCheckWorkspaceReadiness.mockResolvedValue({
      ready: true,
      reason: "4 active processes running",
    });

    const result = await runStatusComposition();
    expect(result.sent).toBe(1);

    // Should include suggestion again — cooldown expired
    const call = mockNotifyUser.mock.calls[0][0];
    expect(call.body).toContain("By the way");
    expect(call.body).toContain("4 active processes");
  });
});
