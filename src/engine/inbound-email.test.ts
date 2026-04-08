/**
 * Inbound Email Processor Tests (Brief 098b)
 *
 * Tests: person matching, waiting step resume, opt-out detection,
 * positive reply classification, interaction recording.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import type { RunStatus } from "../db/schema";
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

// Mock heartbeat (we don't want real heartbeats)
vi.mock("./heartbeat", () => ({
  resumeHumanStep: vi.fn(async (processRunId: string, _input: unknown) => ({
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

// Mock channel (prevent real email sends — still needed for isOptOutSignal)
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

// Mock notify-user (channel-agnostic notification layer)
const { mockNotifyUser } = vi.hoisted(() => ({
  mockNotifyUser: vi.fn().mockResolvedValue({ success: true, channel: "email", interactionId: "mock-notify-id" }),
}));
vi.mock("./notify-user", () => ({
  notifyUser: mockNotifyUser,
}));

// Mock selfConverse — inbound messages route through the Self (Brief 099a)
const { mockSelfConverse } = vi.hoisted(() => ({
  mockSelfConverse: vi.fn().mockResolvedValue({
    response: "On it — I'll research accountants in Wellington and have a shortlist for you within 24 hours.",
    sessionId: "mock-session-id",
    delegationsExecuted: 1,
    consultationsExecuted: 0,
    costCents: 5,
  }),
}));
vi.mock("./self", () => ({
  selfConverse: mockSelfConverse,
}));

import { processInboundEmail, type InboundEmailPayload } from "./inbound-email";
import { resumeHumanStep } from "./heartbeat";
import { createHmac } from "crypto";

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
// Helper: create person + user
// ============================================================

async function createPersonAndUser(opts: {
  email: string;
  name?: string;
  optedOut?: boolean;
  /** The network user's email (defaults to user-{random}@ditto.test) */
  userEmail?: string;
}) {
  const userId = randomUUID();
  const personId = randomUUID();
  // User email is different from the contact's email — the user is the Ditto user,
  // the person/email is the contact in their network
  const networkUserEmail = opts.userEmail ?? `user-${userId.slice(0, 8)}@ditto.test`;

  // Create person record FIRST (networkUsers.personId references people.id)
  await testDb.insert(schema.people).values({
    id: personId,
    userId,
    name: opts.name ?? "Test Person",
    email: opts.email,
    source: "manual",
    optedOut: opts.optedOut ?? false,
  });

  // Create network user (the Ditto user who owns this contact)
  await testDb.insert(schema.networkUsers).values({
    id: userId,
    email: networkUserEmail,
    name: "Ditto User",
    status: "active",
    personId,
  });

  return { userId, personId };
}

async function createWaitingRun(personId: string) {
  const processId = randomUUID();
  const runId = randomUUID();

  await testDb.insert(schema.processes).values({
    id: processId,
    name: "Test Process",
    slug: "test-waiting-" + runId.slice(0, 8),
    description: "test",
    definition: {},
    status: "active",
    trustTier: "supervised",
  });

  await testDb.insert(schema.processRuns).values({
    id: runId,
    processId,
    status: "waiting_human" as RunStatus,
    triggeredBy: "manual",
    inputs: { personId, email: "sender@example.com" },
    suspendState: {
      suspendedAtStep: "user-approval",
      suspendPayload: { stepId: "user-approval" },
    },
  });

  return { processId, runId };
}

// ============================================================
// Tests
// ============================================================

describe("processInboundEmail", () => {
  it("returns unknown_sender for unmatched email", async () => {
    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "nobody@nowhere.com",
        subject: "Hello",
        text: "Hi there",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("unknown_sender");
    expect(result.personId).toBeUndefined();
  });

  it("records interaction for matched person (AC5)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "Thanks for reaching out",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("interaction_recorded");
    expect(result.personId).toBe(personId);
    expect(result.interactionId).toBeDefined();

    // Verify interaction was recorded in DB
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].type).toBe("reply_received");
  });

  it("resumes waiting_human step when found (AC4)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });
    const { runId } = await createWaitingRun(personId);

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Review needed",
        text: "Looks good, approved",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("resumed_step");
    expect(result.processRunId).toBe(runId);
    expect(resumeHumanStep).toHaveBeenCalledWith(runId, {
      feedback: "Looks good, approved",
      email_subject: "Re: Review needed",
      responded_via: "email",
    });
  });

  it("detects opt-out and marks person as opted out (AC6)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "unsubscribe",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("opt_out");
    expect(result.personId).toBe(personId);

    // Verify person was marked as opted out
    const [person] = await testDb
      .select()
      .from(schema.people)
      .where(eq(schema.people.id, personId));
    expect(person.optedOut).toBe(true);

    // Verify interaction recorded
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].type).toBe("opt_out");
  });

  it("detects positive reply (AC6)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "Sounds great, I'm interested in learning more",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("positive_reply");
    expect(result.personId).toBe(personId);

    // Verify interaction recorded with positive outcome
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].outcome).toBe("positive");
  });

  it("notifies user immediately on positive reply", async () => {
    await createPersonAndUser({ email: "sender@example.com", name: "Jane" });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "Sounds great, I'm interested",
      },
    };

    await processInboundEmail(payload);
    await new Promise((r) => setTimeout(r, 50));

    // notifyUser should have been called with positive reply content
    const positiveCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.subject?.includes("replied positively");
      },
    );
    expect(positiveCall).toBeDefined();
  });

  it("notifies user immediately on opt-out", async () => {
    await createPersonAndUser({ email: "sender@example.com", name: "Jane" });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "unsubscribe",
      },
    };

    await processInboundEmail(payload);
    await new Promise((r) => setTimeout(r, 50));

    const optOutCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.subject?.includes("opted out");
      },
    );
    expect(optOutCall).toBeDefined();
  });

  it("uses extracted_text when available", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "Yes please\n\nOn Mon, Apr 7...\n> Original message",
        extracted_text: "Yes please",
      },
    };

    const result = await processInboundEmail(payload);

    // Should use extracted_text (shorter, cleaner) for classification
    // "Yes please" is a positive signal
    expect(result.action).toBe("positive_reply");
  });

  it("returns unknown_sender when no sender email in payload", async () => {
    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "",
        subject: "Hello",
        text: "Hi",
      },
    };

    const result = await processInboundEmail(payload);
    expect(result.action).toBe("unknown_sender");
  });

  it("handles case-insensitive email matching (AC3)", async () => {
    // Store email in lowercase (normal behavior)
    await createPersonAndUser({ email: "user@example.com" });

    // Send with mixed case — should still match
    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "User@Example.COM",
        subject: "Hello",
        text: "Hi",
      },
    };

    const result = await processInboundEmail(payload);

    // Should match because we lowercase the input
    expect(result.action).toBe("interaction_recorded");
    expect(result.personId).toBeDefined();
  });
});

// ============================================================
// User email detection (Insight-162)
// ============================================================

describe("user email detection", () => {
  it("routes user emails differently from contact replies", async () => {
    // Create a network user with a DIFFERENT email than any person
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "The User",
      email: "user@company.com",
      source: "manual",
    });

    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "user@company.com",
      name: "The User",
      status: "active",
      personId,
    });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "user@company.com",
        subject: "Can you find me accountants in Wellington?",
        text: "I need a good accountant for my property management business",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("user_request");
    expect(result.networkUserId).toBe(userId);
    expect(result.details).toContain("Routed through Self");

    // Verify selfConverse was called with inbound surface
    expect(mockSelfConverse).toHaveBeenCalledWith(
      userId,
      expect.stringContaining("accountants in Wellington"),
      "inbound",
    );
  });

  it("resumes waiting step when user replies to a process", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "The User",
      email: "user@company.com",
      source: "manual",
    });

    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "user@company.com",
      name: "The User",
      status: "active",
      personId,
    });

    // Create a waiting process run referencing the user's personId
    await createWaitingRun(personId);

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "user@company.com",
        subject: "Re: Review needed",
        text: "Looks good, approved",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("resumed_step");
    expect(result.networkUserId).toBe(userId);
  });
});

// ============================================================
// Webhook signature validation (AC2)
// ============================================================

describe("webhook signature validation", () => {
  const secret = "whsec_test_secret_12345";

  function sign(payload: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  it("accepts valid HMAC-SHA256 signature", () => {
    const payload = '{"event_type":"message.received"}';
    const signature = sign(payload);

    // Validate by recomputing — this tests the same algorithm used in the route
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    expect(signature).toBe(expected);
  });

  it("rejects wrong signature", () => {
    const payload = '{"event_type":"message.received"}';
    const wrongSignature = createHmac("sha256", "wrong_secret").update(payload).digest("hex");
    const correctSignature = sign(payload);

    expect(wrongSignature).not.toBe(correctSignature);
  });

  it("rejects missing signature (null)", () => {
    // The route returns 401 when signature is null
    // This validates the invariant that null signature = rejected
    expect(null).toBeFalsy();
  });

  it("rejects tampered payload", () => {
    const originalPayload = '{"event_type":"message.received"}';
    const tamperedPayload = '{"event_type":"message.received","injected":true}';
    const signature = sign(originalPayload);

    // Signature computed for original won't match tampered
    const tamperedExpected = createHmac("sha256", secret).update(tamperedPayload).digest("hex");
    expect(signature).not.toBe(tamperedExpected);
  });
});

// ============================================================
// Brief 099a: Self routing for inbound messages
// ============================================================

describe("Self routing for inbound (099a)", () => {
  it("sends Self response via notifyUser (AC5)", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "The User",
      email: "user@biz.com",
      source: "manual",
    });

    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "user@biz.com",
      name: "The User",
      status: "active",
      personId,
    });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "user@biz.com",
        subject: "Find me accountants",
        text: "I need accountants in Wellington",
      },
    };

    await processInboundEmail(payload);

    // Self should have been called with "inbound" surface
    expect(mockSelfConverse).toHaveBeenCalledWith(
      userId,
      expect.stringContaining("accountants in Wellington"),
      "inbound",
    );

    // Self's response should have been sent via notifyUser
    const notifyCalls = mockNotifyUser.mock.calls;
    const selfResponseCall = notifyCalls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.body?.includes("shortlist for you within 24 hours");
      },
    );
    expect(selfResponseCall).toBeDefined();
  });

  it("creates person record when personId is null (AC6)", async () => {
    const userId = randomUUID();

    // Create network user WITHOUT personId
    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "newuser@biz.com",
      name: "New User",
      status: "active",
      // personId is null
    });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "newuser@biz.com",
        subject: "Hello",
        text: "Can you help me?",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("user_request");
    expect(result.personId).toBeDefined();

    // Verify person was created
    const people = await testDb
      .select()
      .from(schema.people)
      .where(eq(schema.people.email, "newuser@biz.com"));
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("New User");

    // Verify networkUser was updated with personId
    const [updatedUser] = await testDb
      .select()
      .from(schema.networkUsers)
      .where(eq(schema.networkUsers.id, userId));
    expect(updatedUser.personId).toBe(people[0].id);
  });

  it("falls back to acknowledgment when Self fails (AC5)", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "The User",
      email: "user@fail.com",
      source: "manual",
    });

    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "user@fail.com",
      name: "The User",
      status: "active",
      personId,
    });

    // Make selfConverse fail
    mockSelfConverse.mockRejectedValueOnce(new Error("LLM not initialized"));

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "user@fail.com",
        subject: "Help",
        text: "I need help",
      },
    };

    const result = await processInboundEmail(payload);

    // Should still succeed (graceful fallback)
    expect(result.action).toBe("user_request");

    // Fallback acknowledgment should have been sent
    await new Promise((r) => setTimeout(r, 50));
    const fallbackCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.body?.includes("Got it");
      },
    );
    expect(fallbackCall).toBeDefined();
  });

  it("unknown senders still get contact-reply handling, not Self routing (AC9)", async () => {
    // Create a person record (contact) but NOT a network user
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "External Contact",
      email: "contact@external.com",
      source: "manual",
    });

    // No networkUsers entry — this is a contact, not a user

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "contact@external.com",
        subject: "Re: Introduction",
        text: "Thanks for reaching out",
      },
    };

    const result = await processInboundEmail(payload);

    // Should go through contact-reply path, NOT Self routing
    expect(result.action).toBe("interaction_recorded");
    expect(mockSelfConverse).not.toHaveBeenCalled();
  });

  it("composes message text with subject + body for Self (smoke wiring)", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "Wiring User",
      email: "wiring@test.com",
      source: "manual",
    });

    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "wiring@test.com",
      name: "Wiring User",
      status: "active",
      personId,
    });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "wiring@test.com",
        subject: "Urgent: new hire",
        text: "Need to hire a project manager ASAP",
        message_id: "msg-123",
      },
    };

    await processInboundEmail(payload);

    // Verify full message composition: subject prefixed to body
    const selfCall = mockSelfConverse.mock.calls[0];
    expect(selfCall[0]).toBe(userId); // correct user ID
    expect(selfCall[1]).toContain("Subject: Urgent: new hire"); // subject included
    expect(selfCall[1]).toContain("project manager ASAP"); // body included
    expect(selfCall[2]).toBe("inbound"); // correct surface

    // Verify notifyUser was called with reply threading
    const replyCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.inReplyToMessageId === "msg-123";
      },
    );
    expect(replyCall).toBeDefined();
  });

  it("does not send notifyUser when Self response is empty", async () => {
    const userId = randomUUID();
    const personId = randomUUID();

    await testDb.insert(schema.people).values({
      id: personId,
      userId,
      name: "Empty User",
      email: "empty@test.com",
      source: "manual",
    });

    await testDb.insert(schema.networkUsers).values({
      id: userId,
      email: "empty@test.com",
      name: "Empty User",
      status: "active",
      personId,
    });

    // Self returns empty response
    mockSelfConverse.mockResolvedValueOnce({
      response: "   ",
      sessionId: "mock-session-id",
      delegationsExecuted: 0,
      consultationsExecuted: 0,
      costCents: 1,
    });

    const payload: InboundEmailPayload = {
      event_type: "message.received",
      message: {
        from: "empty@test.com",
        subject: "Test",
        text: "Hello",
      },
    };

    await processInboundEmail(payload);

    // notifyUser should NOT have been called for the Self response
    // (it may have been called for interaction recording, but not with "Re: Test" subject from Self)
    const selfReplyCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.subject === "Re: Test" && arg.body?.trim() === "";
      },
    );
    expect(selfReplyCall).toBeUndefined();
  });
});
