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

// Mock workspace-provisioner (Brief 153)
const { mockProvisionWorkspace } = vi.hoisted(() => ({
  mockProvisionWorkspace: vi.fn().mockResolvedValue({
    workspaceUrl: "https://ditto-ws-test.up.railway.app",
    serviceId: "svc_1",
    machineId: "svc_1",
    volumeId: "vol_1",
    tokenId: "tok_1",
    status: "created",
  }),
}));
vi.mock("./workspace-provisioner", () => ({
  provisionWorkspace: mockProvisionWorkspace,
  createRailwayClient: vi.fn(() => ({})),
}));

// Mock workspace-welcome (Brief 153)
const { mockSendWorkspaceWelcome } = vi.hoisted(() => ({
  mockSendWorkspaceWelcome: vi.fn().mockResolvedValue({ success: true, magicLinkUrl: "https://test.com/login/auth?token=abc" }),
}));
vi.mock("./workspace-welcome", () => ({
  sendWorkspaceWelcome: mockSendWorkspaceWelcome,
}));

import { processInboundEmail, isWorkspaceAcceptanceSignal, type InboundEmailPayload } from "./inbound-email";
import { resumeHumanStep } from "./heartbeat";
import { createHmac } from "crypto";
import { Webhook } from "svix";

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
      eventType: "message.received",
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
      eventType: "message.received",
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
      eventType: "message.received",
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
      timedOut: false,
    });
  });

  it("detects opt-out and marks person as opted out (AC6)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
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
      eventType: "message.received",
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
      eventType: "message.received",
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
        return arg.subject?.includes("replied") && arg.subject?.includes("positive");
      },
    );
    expect(positiveCall).toBeDefined();
  });

  it("notifies user immediately on opt-out", async () => {
    await createPersonAndUser({ email: "sender@example.com", name: "Jane" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
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

  it("uses extractedText when available", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "Yes please\n\nOn Mon, Apr 7...\n> Original message",
        extractedText: "Yes please",
      },
    };

    const result = await processInboundEmail(payload);

    // Should use extractedText (shorter, cleaner) for classification
    // "Yes please" is a positive signal
    expect(result.action).toBe("positive_reply");
  });

  it("returns unknown_sender when no sender email in payload", async () => {
    const payload: InboundEmailPayload = {
      eventType: "message.received",
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
      eventType: "message.received",
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
// Reply Classification Expansion (Brief 146)
// ============================================================

describe("expanded reply classification (Brief 146)", () => {
  it("classifies question replies with outcome 'question' and routes to fast-path (Brief 161)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "What's your pricing? How much does it cost?",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("question_fast_path");
    expect(result.personId).toBe(personId);

    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].outcome).toBe("question");
    expect((interactions[0].metadata as Record<string, unknown>)?.classification).toBe("question");
  });

  it("classifies deferral replies with outcome 'deferred'", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "Not right now, maybe later. Circle back next month.",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("interaction_recorded");

    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].outcome).toBe("deferred");
  });

  it("classifies auto-reply and skips recording (no side effects)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Out of Office: Re: Introduction",
        text: "I am currently out of the office and will return on April 20.",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("auto_reply_ignored");
    expect(result.personId).toBe(personId);
    // No interactionId — nothing was recorded
    expect(result.interactionId).toBeUndefined();

    // Verify NO interaction was recorded
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(0);
  });

  it("positive check takes priority over question (ordering)", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "Sounds great, when works for you?",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("positive_reply");

    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions[0].outcome).toBe("positive");
  });

  it("opt-out takes priority over auto-reply", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Automatic reply",
        text: "unsubscribe",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("opt_out");
  });

  it("short standalone questions are classified as question", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    // Short message ending with ? — classified as question (standalone noun question)
    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "OK?",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("question_fast_path");

    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions[0].outcome).toBe("question");
  });

  it("long messages with ? but no interrogative word are general", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    // Long message with ? but no interrogative word — should be general
    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Hello",
        text: "I saw your note about the project timeline shifting again? I think the team will figure it out eventually, no big deal on my end.",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("interaction_recorded");

    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions[0].outcome).toBe("neutral");
  });

  it("deferral detection catches temporal signals", async () => {
    const { personId } = await createPersonAndUser({ email: "sender@example.com" });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "sender@example.com",
        subject: "Re: Introduction",
        text: "Not a good time right now. Please reach out again in January.",
      },
    };

    const result = await processInboundEmail(payload);

    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions[0].outcome).toBe("deferred");
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
      eventType: "message.received",
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

    // Verify selfConverse was called with inbound surface + escalation options (Brief 131)
    expect(mockSelfConverse).toHaveBeenCalledWith(
      userId,
      expect.stringContaining("accountants in Wellington"),
      "inbound",
      undefined,
      { chatEscalationAvailable: true, userEmail: "user@company.com" },
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
      eventType: "message.received",
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

describe("webhook signature validation (Svix)", () => {
  // Svix test secret — must start with whsec_ followed by base64
  const secret = "whsec_" + Buffer.from("test-secret-key-1234567890ab").toString("base64");

  function signSvix(payload: string): { "svix-id": string; "svix-timestamp": string; "svix-signature": string } {
    const msgId = "msg_" + randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `${msgId}.${timestamp}.${payload}`;
    const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
    const sig = createHmac("sha256", secretBytes).update(toSign).digest("base64");
    return {
      "svix-id": msgId,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${sig}`,
    };
  }

  it("accepts valid Svix signature", () => {
    const payload = '{"event_type":"message.received"}';
    const headers = signSvix(payload);
    const wh = new Webhook(secret);
    // Should not throw
    expect(() => wh.verify(payload, headers)).not.toThrow();
  });

  it("rejects wrong secret", () => {
    const payload = '{"event_type":"message.received"}';
    const headers = signSvix(payload);
    const wrongSecret = "whsec_" + Buffer.from("wrong-secret-key-1234567890ab").toString("base64");
    const wh = new Webhook(wrongSecret);
    expect(() => wh.verify(payload, headers)).toThrow();
  });

  it("rejects missing signature headers", () => {
    const payload = '{"event_type":"message.received"}';
    const wh = new Webhook(secret);
    expect(() => wh.verify(payload, { "svix-id": "", "svix-timestamp": "", "svix-signature": "" })).toThrow();
  });

  it("rejects tampered payload", () => {
    const originalPayload = '{"event_type":"message.received"}';
    const headers = signSvix(originalPayload);
    const tamperedPayload = '{"event_type":"message.received","injected":true}';
    const wh = new Webhook(secret);
    expect(() => wh.verify(tamperedPayload, headers)).toThrow();
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
      eventType: "message.received",
      message: {
        from: "user@biz.com",
        subject: "Find me accountants",
        text: "I need accountants in Wellington",
      },
    };

    await processInboundEmail(payload);

    // Self should have been called with "inbound" surface + escalation options (Brief 131)
    expect(mockSelfConverse).toHaveBeenCalledWith(
      userId,
      expect.stringContaining("accountants in Wellington"),
      "inbound",
      undefined,
      { chatEscalationAvailable: true, userEmail: "user@biz.com" },
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
      eventType: "message.received",
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
      eventType: "message.received",
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
      eventType: "message.received",
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
      eventType: "message.received",
      message: {
        from: "wiring@test.com",
        subject: "Urgent: new hire",
        text: "Need to hire a project manager ASAP",
        messageId: "msg-123",
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
      eventType: "message.received",
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

// ============================================================
// Workspace Acceptance Detection (Brief 153)
// ============================================================

describe("isWorkspaceAcceptanceSignal", () => {
  it("detects affirmative signals", () => {
    expect(isWorkspaceAcceptanceSignal("yes")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("Yes")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("YES")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("yeah")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("sure")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("please")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("sounds good")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("let's go")).toBe(true);
    expect(isWorkspaceAcceptanceSignal("set it up")).toBe(true);
  });

  it("rejects non-affirmative signals", () => {
    expect(isWorkspaceAcceptanceSignal("no")).toBe(false);
    expect(isWorkspaceAcceptanceSignal("not yet")).toBe(false);
    expect(isWorkspaceAcceptanceSignal("maybe later")).toBe(false);
    expect(isWorkspaceAcceptanceSignal("yes but can you also...")).toBe(false);
    expect(isWorkspaceAcceptanceSignal("I said yes to the proposal")).toBe(false);
  });
});

describe("workspace acceptance in processInboundEmail", () => {
  beforeEach(() => {
    // Set env vars needed by triggerWorkspaceProvisioning
    process.env.RAILWAY_API_TOKEN = "test-token";
    process.env.RAILWAY_PROJECT_ID = "proj_test_1";
    process.env.NETWORK_BASE_URL = "https://ditto-network.test";
  });

  afterEach(() => {
    delete process.env.RAILWAY_API_TOKEN;
    delete process.env.RAILWAY_PROJECT_ID;
    delete process.env.NETWORK_BASE_URL;
  });

  it("triggers provisioning when user replies 'yes' to suggestion thread", async () => {
    const { userId, personId } = await createPersonAndUser({
      email: "contact@example.com",
      userEmail: "user@example.com",
    });

    // Set the suggestion thread on the user
    await testDb
      .update(schema.networkUsers)
      .set({ suggestionThreadId: "thread-suggestion-123" })
      .where(eq(schema.networkUsers.id, userId));

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "user@example.com",
        text: "yes",
        extractedText: "yes",
        subject: "Re: Your status update",
        threadId: "thread-suggestion-123",
        messageId: "msg-reply-1",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result).toBeDefined();
    expect(result!.action).toBe("workspace_acceptance");
    expect(result!.details).toBe("Workspace provisioning triggered");

    // Verify immediate ack was sent
    const ackCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.body?.includes("setting up your workspace now");
      },
    );
    expect(ackCall).toBeDefined();
  });

  it("does NOT trigger provisioning for 'yes' in non-suggestion thread", async () => {
    await createPersonAndUser({
      email: "contact@example.com",
      userEmail: "user@example.com",
    });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "user@example.com",
        text: "yes",
        extractedText: "yes",
        subject: "Re: Some other thread",
        threadId: "thread-other-456",
        messageId: "msg-reply-2",
      },
    };

    const result = await processInboundEmail(payload);

    // Should fall through to Self, not workspace acceptance
    expect(result).toBeDefined();
    expect(result!.action).not.toBe("workspace_acceptance");
  });

  it("sends existing workspace URL for user who already has workspace", async () => {
    const { userId, personId } = await createPersonAndUser({
      email: "contact@example.com",
      userEmail: "user@example.com",
    });

    // Create a managed workspace
    const wsId = randomUUID();
    await testDb.insert(schema.managedWorkspaces).values({
      id: wsId,
      userId,
      machineId: "svc_1",
      volumeId: "vol_1",
      workspaceUrl: "https://existing-workspace.up.railway.app",
      region: "railway",
      imageRef: "ghcr.io/ditto/workspace:latest",
      status: "healthy",
      tokenId: "tok_1",
    });

    // Update user to workspace status
    await testDb
      .update(schema.networkUsers)
      .set({
        status: "workspace",
        workspaceId: wsId,
        suggestionThreadId: "thread-suggestion-789",
      })
      .where(eq(schema.networkUsers.id, userId));

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "user@example.com",
        text: "yes",
        extractedText: "yes",
        subject: "Re: Your status update",
        threadId: "thread-suggestion-789",
        messageId: "msg-reply-3",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result).toBeDefined();
    expect(result!.action).toBe("workspace_acceptance");
    expect(result!.details).toBe("User already has workspace — sent existing URL");

    // Verify the existing URL was sent
    const urlCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.body?.includes("existing-workspace.up.railway.app");
      },
    );
    expect(urlCall).toBeDefined();
  });

  it("sends failure notification when provisioning fails", async () => {
    const { userId, personId } = await createPersonAndUser({
      email: "contact@example.com",
      userEmail: "user-fail@example.com",
    });

    await testDb
      .update(schema.networkUsers)
      .set({ suggestionThreadId: "thread-fail-123" })
      .where(eq(schema.networkUsers.id, userId));

    // Make provisioning fail
    mockProvisionWorkspace.mockRejectedValueOnce(new Error("Railway API timeout"));

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "user-fail@example.com",
        text: "yes please",
        extractedText: "yes please",
        subject: "Re: Your status update",
        threadId: "thread-fail-123",
        messageId: "msg-reply-fail",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result).toBeDefined();
    expect(result!.action).toBe("workspace_acceptance");
    expect(result!.details).toBe("Workspace provisioning triggered");

    // Wait for the async provisioning to fail and send notification
    // The provisioning is fire-and-forget, so we need a small delay
    await new Promise((r) => setTimeout(r, 100));

    const failCall = mockNotifyUser.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, string>;
        return arg.body?.includes("Hit a snag");
      },
    );
    expect(failCall).toBeDefined();
  });
});

// ============================================================
// Brief 161: Email Thread Context + Question Fast-Path
// ============================================================

describe("question fast-path (Brief 161 — MP-6.5)", () => {
  it("routes question replies to Self and returns question_fast_path action", async () => {
    const { personId, userId } = await createPersonAndUser({
      email: "asker@example.com",
      name: "Asker Person",
    });

    mockSelfConverse.mockResolvedValueOnce({
      response: "Great question! Our pricing starts at $99/month.",
      sessionId: "mock-session-id",
      delegationsExecuted: 0,
      consultationsExecuted: 0,
      costCents: 3,
    });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "asker@example.com",
        subject: "Re: Introduction",
        text: "What's your pricing? How much does it cost?",
        messageId: "msg-q-1",
        threadId: "thread-q-1",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("question_fast_path");
    expect(result.personId).toBe(personId);
    expect(result.interactionId).toBeDefined();

    // Self should have been called with contact context
    expect(mockSelfConverse).toHaveBeenCalledWith(
      userId,
      expect.stringContaining("Asker Person"),
      "inbound",
      undefined,
      expect.objectContaining({}),
    );

    // Verify interaction recorded with question outcome
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].outcome).toBe("question");
  });

  it("records interaction even when Self fails on question fast-path", async () => {
    const { personId } = await createPersonAndUser({
      email: "asker-fail@example.com",
      name: "Fail Asker",
    });

    mockSelfConverse.mockRejectedValueOnce(new Error("LLM timeout"));

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "asker-fail@example.com",
        subject: "Re: Hello",
        text: "What do you charge?",
        messageId: "msg-q-fail",
      },
    };

    const result = await processInboundEmail(payload);

    // Should still return question_fast_path (interaction was recorded)
    expect(result.action).toBe("question_fast_path");
    expect(result.personId).toBe(personId);

    // Interaction should still be recorded
    const interactions = await testDb
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, personId));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].outcome).toBe("question");
  });

  it("includes thread context in Self call when threadId is present", async () => {
    const { personId, userId } = await createPersonAndUser({
      email: "thread-asker@example.com",
      name: "Thread Asker",
    });

    // Create an outreach interaction in the thread
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "outreach_sent",
      channel: "email",
      mode: "connecting",
      subject: "Let's connect",
      summary: "Initial outreach about our services",
      metadata: {
        threadId: "thread-ctx-1",
        emailBody: "Hi Thread Asker, I wanted to reach out about our consulting services...",
      },
    });

    mockSelfConverse.mockResolvedValueOnce({
      response: "Our consulting starts at $150/hr.",
      sessionId: "mock-session-id",
      delegationsExecuted: 0,
      consultationsExecuted: 0,
      costCents: 3,
    });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "thread-asker@example.com",
        subject: "Re: Let's connect",
        text: "How much do you charge per hour?",
        messageId: "msg-ctx-1",
        threadId: "thread-ctx-1",
      },
    };

    const result = await processInboundEmail(payload);

    expect(result.action).toBe("question_fast_path");

    // Self should have been called with thread context
    const selfCall = mockSelfConverse.mock.calls[0];
    const selfOptions = selfCall[4];
    expect(selfOptions).toBeDefined();
    expect(selfOptions.threadContext).toBeDefined();
    expect(selfOptions.threadContext.originalSubject).toBe("Let's connect");
    expect(selfOptions.threadContext.originalBody).toContain("consulting services");
  });
});

describe("thread context token budget (Brief 161 — AC4)", () => {
  it("truncates long original body to fit budget", async () => {
    const { personId, userId } = await createPersonAndUser({
      email: "long-thread@example.com",
      name: "Long Thread",
    });

    // Create an outreach with a very long body
    const longBody = "A".repeat(10000);
    await testDb.insert(schema.interactions).values({
      personId,
      userId,
      type: "outreach_sent",
      channel: "email",
      mode: "connecting",
      subject: "Intro",
      summary: "Long outreach",
      metadata: {
        threadId: "thread-long-1",
        emailBody: longBody,
      },
    });

    mockSelfConverse.mockResolvedValueOnce({
      response: "Short answer.",
      sessionId: "mock-session-id",
      delegationsExecuted: 0,
      consultationsExecuted: 0,
      costCents: 1,
    });

    const payload: InboundEmailPayload = {
      eventType: "message.received",
      message: {
        from: "long-thread@example.com",
        subject: "Re: Intro",
        text: "What's your timeline?",
        messageId: "msg-long-1",
        threadId: "thread-long-1",
      },
    };

    await processInboundEmail(payload);

    // Thread context should be truncated — original body should be much shorter than 10000
    const selfCall = mockSelfConverse.mock.calls[0];
    const selfOptions = selfCall[4];
    expect(selfOptions.threadContext).toBeDefined();
    expect(selfOptions.threadContext.originalBody.length).toBeLessThan(5000);
    expect(selfOptions.threadContext.originalBody).toContain("…");
  });
});
