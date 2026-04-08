/**
 * Relationship Pulse Tests (Brief 099b)
 *
 * Tests: user model density classification, status-composer coordination,
 * recency check, proactive composition pattern, pulse integration.
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

// Mock notify-user
const { mockNotifyUser } = vi.hoisted(() => ({
  mockNotifyUser: vi.fn().mockResolvedValue({ success: true, channel: "email", interactionId: "mock-notify-id" }),
}));
vi.mock("./notify-user", () => ({
  notifyUser: mockNotifyUser,
}));

// Mock LLM — the proactive composition uses createCompletion directly
const { mockCreateCompletion } = vi.hoisted(() => ({
  mockCreateCompletion: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "SUBJECT: Quick update on your research\nBODY:\nHi there,\n\nI found 3 results. Does this match what you had in mind?" }],
    tokensUsed: 100,
    costCents: 0.1,
    stopReason: "end_turn",
  }),
}));
vi.mock("./llm", () => ({
  createCompletion: mockCreateCompletion,
  extractText: (content: Array<{ type: string; text?: string }>) =>
    content.filter((b) => b.type === "text").map((b) => b.text).join(""),
}));

// Mock cognitive-core
vi.mock("./cognitive-core", () => ({
  getCognitiveCore: () => "Mock cognitive core framework",
}));

// Mock channel (transitively needed)
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

import { classifyDensity, runRelationshipPulse, type ComplexitySignals } from "./relationship-pulse";
import type { StatusCheckResult } from "./status-composer";
import { eq } from "drizzle-orm";

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

function emptyStatusResult(): StatusCheckResult {
  return { checked: 0, sent: 0, skipped: 0, details: [] };
}

function statusResultWithSent(userIds: string[]): StatusCheckResult {
  return {
    checked: userIds.length,
    sent: userIds.length,
    skipped: 0,
    details: userIds.map((userId) => ({ userId, action: "sent" as const })),
  };
}

async function createTestUser(opts: {
  id?: string;
  email?: string;
  name?: string;
  status?: string;
  createdAt?: Date;
} = {}) {
  const userId = opts.id ?? randomUUID();
  const personId = randomUUID();

  // Create person first (FK constraint)
  await testDb.insert(schema.people).values({
    id: personId,
    userId,
    name: opts.name ?? "Test User",
    email: opts.email ?? `user-${userId.slice(0, 8)}@example.com`,
    source: "manual",
  });

  // Create network user
  await testDb.insert(schema.networkUsers).values({
    id: userId,
    email: opts.email ?? `user-${userId.slice(0, 8)}@example.com`,
    name: opts.name ?? "Test User",
    status: (opts.status ?? "active") as "active" | "workspace" | "churned",
    personId,
    createdAt: opts.createdAt ?? new Date(),
  });

  return { userId, personId };
}

// ============================================================
// classifyDensity
// ============================================================

describe("classifyDensity", () => {
  it("returns sparse for 0-2 distinct memory types", () => {
    expect(classifyDensity(0)).toBe("sparse");
    expect(classifyDensity(1)).toBe("sparse");
    expect(classifyDensity(2)).toBe("sparse");
  });

  it("returns partial for 3-5 distinct memory types", () => {
    expect(classifyDensity(3)).toBe("partial");
    expect(classifyDensity(4)).toBe("partial");
    expect(classifyDensity(5)).toBe("partial");
  });

  it("returns rich for 6+ distinct memory types", () => {
    expect(classifyDensity(6)).toBe("rich");
    expect(classifyDensity(10)).toBe("rich");
  });
});

// ============================================================
// runRelationshipPulse — status-composer coordination (AC9)
// ============================================================

describe("runRelationshipPulse — status coordination", () => {
  it("skips users who received status this tick (AC9)", async () => {
    const { userId } = await createTestUser();

    // Status was sent to this user
    const statusResult = statusResultWithSent([userId]);

    const result = await runRelationshipPulse(statusResult);

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.details[0].action).toBe("skipped_status_sent");
    expect(mockNotifyUser).not.toHaveBeenCalled();
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });
});

// ============================================================
// runRelationshipPulse — proactive outreach
// ============================================================

describe("runRelationshipPulse — outreach", () => {
  it("sends proactive outreach when LLM composes a message", async () => {
    await createTestUser({ email: "alice@example.com", name: "Alice" });

    const result = await runRelationshipPulse(emptyStatusResult());

    expect(result.checked).toBe(1);
    expect(result.outreachSent).toBe(1);
    expect(mockCreateCompletion).toHaveBeenCalledOnce();
    expect(mockNotifyUser).toHaveBeenCalledOnce();

    // Verify notifyUser was called with the composed message
    const notifyCall = mockNotifyUser.mock.calls[0][0];
    expect(notifyCall.subject).toBe("Quick update on your research");
    expect(notifyCall.body).toContain("I found 3 results");
  });

  it("skips when LLM decides SILENT", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: "SILENT" }],
      tokensUsed: 50,
      costCents: 0.05,
      stopReason: "end_turn",
    });

    await createTestUser();

    const result = await runRelationshipPulse(emptyStatusResult());

    expect(result.checked).toBe(1);
    expect(result.outreachSent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.details[0].action).toBe("skipped_llm_silent");
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });

  it("skips users without personId", async () => {
    // Create a user without a person record
    await testDb.insert(schema.networkUsers).values({
      id: randomUUID(),
      email: "noperson@example.com",
      status: "active",
    });

    const result = await runRelationshipPulse(emptyStatusResult());

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.details[0].action).toBe("skipped_no_person");
  });

  it("skips if outreach was sent too recently (< 24h)", async () => {
    const { userId, personId } = await createTestUser();

    // Record a recent outreach interaction
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "follow_up",
      channel: "email",
      mode: "connecting",
      summary: "Recent outreach",
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    });

    const result = await runRelationshipPulse(emptyStatusResult());

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.details[0].action).toBe("skipped_too_recent");
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("proceeds if last outreach was > 24h ago", async () => {
    const { userId, personId } = await createTestUser();

    // Record an old outreach interaction
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "follow_up",
      channel: "email",
      mode: "connecting",
      summary: "Old outreach",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
    });

    const result = await runRelationshipPulse(emptyStatusResult());

    expect(result.checked).toBe(1);
    expect(result.outreachSent).toBe(1);
    expect(mockCreateCompletion).toHaveBeenCalledOnce();
  });
});

// ============================================================
// runRelationshipPulse — uses createCompletion, NOT selfConverse (AC3)
// ============================================================

describe("runRelationshipPulse — composition pattern", () => {
  it("uses createCompletion directly, not selfConverse (AC3)", async () => {
    await createTestUser();

    await runRelationshipPulse(emptyStatusResult());

    // Verify createCompletion was called with cognitive core in system prompt
    expect(mockCreateCompletion).toHaveBeenCalledOnce();
    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).toContain("Mock cognitive core framework");
    expect(call.purpose).toBe("conversation");
  });

  it("includes user model density in system prompt (AC2)", async () => {
    const { userId } = await createTestUser();

    // Add some memories to make model partially dense
    for (const type of ["correction", "preference", "context"] as const) {
      await testDb.insert(schema.memories).values({
        scopeType: "self",
        scopeId: userId,
        type,
        content: `Test ${type} memory`,
        source: "system",
      });
    }

    await runRelationshipPulse(emptyStatusResult());

    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).toContain("partial");
    expect(call.system).toContain("3 distinct memory types");
  });

  it("prohibits empty check-ins in system prompt (AC4)", async () => {
    await createTestUser();

    await runRelationshipPulse(emptyStatusResult());

    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).toContain("NEVER send empty check-ins");
  });

  it("marks early relationship in system prompt for first 7 days (AC5)", async () => {
    await createTestUser({ createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }); // 3 days ago

    await runRelationshipPulse(emptyStatusResult());

    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).toContain("EARLY RELATIONSHIP");
  });

  it("marks established relationship after 7 days (AC5)", async () => {
    await createTestUser({ createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }); // 14 days ago

    await runRelationshipPulse(emptyStatusResult());

    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).toContain("Established relationship");
  });
});

// ============================================================
// 099c: Workspace graduation — complexity signals
// ============================================================

describe("runRelationshipPulse — workspace graduation (099c)", () => {
  it("includes workspace suggestion when 2+ complexity signals present and workspaceSuggestedAt is null (AC2)", async () => {
    const { userId, personId } = await createTestUser();

    // Create a process record for FK constraint
    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test Process",
      slug: "test-process",
      definition: {},
    });

    // Create enough active processes (3 = signal) and reviews (2 = signal)
    for (let i = 0; i < 3; i++) {
      const runId = randomUUID();
      await testDb.insert(schema.processRuns).values({
        id: runId,
        processId,
        status: "running",
        inputs: {},
        triggeredBy: "test",
        trustTierOverride: "autonomous",
      });
      // Link run to user via interaction
      await testDb.insert(schema.interactions).values({
        personId,
        userId,
        type: "outreach_sent",
        channel: "email",
        mode: "connecting",
        summary: `Process ${i}`,
        processRunId: runId,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // old enough
      });
    }

    for (let i = 0; i < 2; i++) {
      const runId = randomUUID();
      await testDb.insert(schema.processRuns).values({
        id: runId,
        processId,
        status: "waiting_review",
        inputs: {},
        triggeredBy: "test",
        trustTierOverride: "autonomous",
      });
      await testDb.insert(schema.interactions).values({
        personId,
        userId,
        type: "outreach_sent",
        channel: "email",
        mode: "connecting",
        summary: `Review ${i}`,
        processRunId: runId,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
    }

    await runRelationshipPulse(emptyStatusResult());

    // Verify workspace suggestion was included in prompt
    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).toContain("Workspace Suggestion");
  });

  it("sets workspaceSuggestedAt after suggesting workspace (AC4)", async () => {
    const { userId, personId } = await createTestUser();

    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test Process",
      slug: "test-process-ws",
      definition: {},
    });

    // Set wantsVisibility flag (1 signal) + create 3 active processes (1 signal) = 2 signals
    await testDb.update(schema.networkUsers)
      .set({ wantsVisibility: true })
      .where(eq(schema.networkUsers.id, userId));

    for (let i = 0; i < 3; i++) {
      const runId = randomUUID();
      await testDb.insert(schema.processRuns).values({
        id: runId,
        processId,
        status: "running",
        inputs: {},
        triggeredBy: "test",
        trustTierOverride: "autonomous",
      });
      await testDb.insert(schema.interactions).values({
        personId,
        userId,
        type: "outreach_sent",
        channel: "email",
        mode: "connecting",
        summary: `Process ${i}`,
        processRunId: runId,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
    }

    await runRelationshipPulse(emptyStatusResult());

    // Check workspaceSuggestedAt was set
    const [updated] = await testDb
      .select({ workspaceSuggestedAt: schema.networkUsers.workspaceSuggestedAt })
      .from(schema.networkUsers)
      .where(eq(schema.networkUsers.id, userId));

    expect(updated.workspaceSuggestedAt).not.toBeNull();
  });

  it("does NOT suggest workspace if workspaceSuggestedAt is already set (AC4 — one-time)", async () => {
    const { userId, personId } = await createTestUser();

    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test Process",
      slug: "test-process-no-suggest",
      definition: {},
    });

    // Set workspaceSuggestedAt (already suggested)
    await testDb.update(schema.networkUsers)
      .set({
        wantsVisibility: true,
        workspaceSuggestedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      })
      .where(eq(schema.networkUsers.id, userId));

    // Create enough signals
    for (let i = 0; i < 3; i++) {
      const runId = randomUUID();
      await testDb.insert(schema.processRuns).values({
        id: runId,
        processId,
        status: "running",
        inputs: {},
        triggeredBy: "test",
        trustTierOverride: "autonomous",
      });
      await testDb.insert(schema.interactions).values({
        personId,
        userId,
        type: "outreach_sent",
        channel: "email",
        mode: "connecting",
        summary: `Process ${i}`,
        processRunId: runId,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
    }

    await runRelationshipPulse(emptyStatusResult());

    // Should NOT include workspace suggestion
    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).not.toContain("Workspace Suggestion");
  });

  it("does NOT suggest workspace to users already on workspace status", async () => {
    const { userId, personId } = await createTestUser({ status: "workspace" });

    const processId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: processId,
      name: "Test Process",
      slug: "test-process-ws-status",
      definition: {},
    });

    // Set wantsVisibility flag + active processes = 2 signals
    await testDb.update(schema.networkUsers)
      .set({ wantsVisibility: true })
      .where(eq(schema.networkUsers.id, userId));

    for (let i = 0; i < 3; i++) {
      const runId = randomUUID();
      await testDb.insert(schema.processRuns).values({
        id: runId,
        processId,
        status: "running",
        inputs: {},
        triggeredBy: "test",
        trustTierOverride: "autonomous",
      });
      await testDb.insert(schema.interactions).values({
        personId,
        userId,
        type: "outreach_sent",
        channel: "email",
        mode: "connecting",
        summary: `Process ${i}`,
        processRunId: runId,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
    }

    await runRelationshipPulse(emptyStatusResult());

    const call = mockCreateCompletion.mock.calls[0][0];
    expect(call.system).not.toContain("Workspace Suggestion");
  });

  it("includes workspace users in pulse (099c extends to all non-churned users)", async () => {
    await createTestUser({ status: "workspace", email: "ws@example.com" });

    const result = await runRelationshipPulse(emptyStatusResult());

    expect(result.checked).toBe(1);
    expect(result.outreachSent).toBe(1);
  });
});
