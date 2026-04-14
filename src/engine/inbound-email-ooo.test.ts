/**
 * Inbound Email OOO Detection Tests (Brief 146)
 *
 * Isolated test suite for auto-reply (out-of-office) detection.
 * Tests subject-line patterns, body patterns, and negative cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
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
  resumeHumanStep: vi.fn(async (processRunId: string) => ({
    processRunId,
    stepsExecuted: 1,
    status: "advanced",
    message: "Resumed from email",
  })),
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

// Mock channel
vi.mock("./channel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./channel")>();
  return {
    ...actual,
    sendAndRecord: vi.fn(async () => ({
      success: true,
      interactionId: "mock-interaction-id",
      messageId: "mock-message-id",
    })),
  };
});

// Mock notify-user
const { mockNotifyUser } = vi.hoisted(() => ({
  mockNotifyUser: vi.fn().mockResolvedValue({ success: true, channel: "email", interactionId: "mock-notify-id" }),
}));
vi.mock("./notify-user", () => ({
  notifyUser: mockNotifyUser,
}));

// Mock selfConverse
const { mockSelfConverse } = vi.hoisted(() => ({
  mockSelfConverse: vi.fn().mockResolvedValue({
    response: "Mock response",
    sessionId: "mock-session-id",
    delegationsExecuted: 0,
    consultationsExecuted: 0,
    costCents: 0,
  }),
}));
vi.mock("./self", () => ({
  selfConverse: mockSelfConverse,
}));

import { processInboundEmail, type InboundEmailPayload } from "./inbound-email";

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

async function createPersonAndUser(opts: { email: string }) {
  const userId = randomUUID();
  const personId = randomUUID();

  await testDb.insert(schema.people).values({
    id: personId,
    userId,
    name: "Test Person",
    email: opts.email,
    source: "manual",
    optedOut: false,
  });

  await testDb.insert(schema.networkUsers).values({
    id: userId,
    email: `user-${userId.slice(0, 8)}@ditto.test`,
    name: "Ditto User",
    status: "active",
    personId,
  });

  return { userId, personId };
}

describe("OOO / auto-reply detection (Brief 146)", () => {
  // Subject-line patterns
  it("detects 'Out of Office' in subject", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Out of Office: Re: Introduction",
        text: "Thank you for your email.",
      },
    });

    expect(result.action).toBe("auto_reply_ignored");
    expect(result.personId).toBe(personId);

    // Verify no interaction recorded
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(0);
  });

  it("detects 'Automatic reply' in subject", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Automatic reply: Re: Quick question",
        text: "I will be out of the office until next week.",
      },
    });

    expect(result.action).toBe("auto_reply_ignored");
  });

  it("detects 'Auto:' prefix in subject", async () => {
    await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Auto: Re: Meeting request",
        text: "This is an automated response.",
      },
    });

    expect(result.action).toBe("auto_reply_ignored");
  });

  // Body patterns
  it("detects 'I am currently out of the office' in body", async () => {
    await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "Hi, I am currently out of the office and will have limited access to email. I will respond when I return.",
      },
    });

    expect(result.action).toBe("auto_reply_ignored");
  });

  it("detects 'I will be back on' in body", async () => {
    await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Intro",
        text: "Thanks for your message. I will be back on Monday April 21st.",
      },
    });

    expect(result.action).toBe("auto_reply_ignored");
  });

  it("detects 'limited access to email' in body", async () => {
    await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Follow up",
        text: "I currently have limited access to email and will respond as soon as possible.",
      },
    });

    expect(result.action).toBe("auto_reply_ignored");
  });

  // Negative cases — real replies that should NOT match
  it("does NOT classify real reply mentioning being away conversationally", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "I was out of town last week but I'm back now. Let's chat!",
      },
    });

    // "Let's chat" is not a positive signal in our list, and the text doesn't match
    // body patterns exactly ("I was out of town" != "I am currently out of the office")
    // Should be general, not auto_reply
    expect(result.action).not.toBe("auto_reply_ignored");
  });

  it("does NOT classify real reply with subject containing 'office' conversationally", async () => {
    await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: New office space",
        text: "The new office looks great. When can we schedule a tour?",
      },
    });

    // "New office space" doesn't match "Out of Office" pattern
    expect(result.action).not.toBe("auto_reply_ignored");
  });

  it("opt-out takes priority over auto-reply detection", async () => {
    await createPersonAndUser({ email: "sender@example.com" });

    const result = await processInboundEmail({
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Out of Office",
        text: "Please remove me from your list. Unsubscribe.",
      },
    });

    expect(result.action).toBe("opt_out");
  });
});
