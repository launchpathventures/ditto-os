/**
 * Ditto — Front Door Chat Tests (Brief 093)
 *
 * Tests for prompt construction, response parsing, session management,
 * email detection, funnel events, and rate limiting.
 *
 * Provenance: Brief 093. Follows people.test.ts mocking pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

// ============================================================
// Prompt Tests (no DB or LLM needed)
// ============================================================

describe("network-chat-prompt", () => {
  describe("buildFrontDoorPrompt", () => {
    it("builds a front-door system prompt with Alex's identity", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Alex");
      expect(prompt).toContain("Ditto");
      expect(prompt).toContain("Australian");
      expect(prompt).toContain("MAX 3 SENTENCES");
      expect(prompt).toContain("Front Door Conversation");
    });

    it("builds a referred system prompt with different instructions", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("referred");
      expect(prompt).toContain("Alex");
      expect(prompt).toContain("Referred Visitor");
      expect(prompt).toContain("MAX 3 SENTENCES");
      expect(prompt).not.toContain("Front Door Conversation");
    });

    it("includes character extract with house values", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Candour over comfort");
      expect(prompt).toContain("No spam, ever");
      expect(prompt).toContain("Earned trust");
    });

    it("includes voice traits", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Warmth: 8/10");
      expect(prompt).toContain("Directness: 9/10");
    });

    it("requires JSON response format", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("requestEmail");
      expect(prompt).toContain("JSON");
    });
  });

  describe("parseAlexResponse", () => {
    it("parses valid JSON response", async () => {
      const { parseAlexResponse } = await import("./network-chat-prompt");
      const result = parseAlexResponse('{"reply": "Hey mate!", "requestEmail": false}');
      expect(result.reply).toBe("Hey mate!");
      expect(result.requestEmail).toBe(false);
    });

    it("parses JSON with requestEmail true", async () => {
      const { parseAlexResponse } = await import("./network-chat-prompt");
      const result = parseAlexResponse('{"reply": "Drop me your email.", "requestEmail": true}');
      expect(result.reply).toBe("Drop me your email.");
      expect(result.requestEmail).toBe(true);
    });

    it("extracts JSON from markdown code block", async () => {
      const { parseAlexResponse } = await import("./network-chat-prompt");
      const result = parseAlexResponse('```json\n{"reply": "Hello!", "requestEmail": false}\n```');
      expect(result.reply).toBe("Hello!");
      expect(result.requestEmail).toBe(false);
    });

    it("falls back to raw text when JSON is invalid", async () => {
      const { parseAlexResponse } = await import("./network-chat-prompt");
      const result = parseAlexResponse("Hey mate, good to hear from you!");
      expect(result.reply).toBe("Hey mate, good to hear from you!");
      expect(result.requestEmail).toBe(false);
    });

    it("handles empty string", async () => {
      const { parseAlexResponse } = await import("./network-chat-prompt");
      const result = parseAlexResponse("");
      expect(result.reply).toBe("");
      expect(result.requestEmail).toBe(false);
    });
  });
});

// ============================================================
// Integration Tests (with test DB, mocked LLM)
// ============================================================

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

const mockStartIntake = vi.fn().mockResolvedValue({
  success: true,
  recognised: false,
  personId: "test-person",
  personaName: "Alex",
  message: "Welcome!",
});

vi.mock("./self-tools/network-tools", () => ({
  startIntake: (...args: unknown[]) => mockStartIntake(...args),
}));

vi.mock("./llm", async () => {
  const real = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...real,
    createCompletion: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"reply": "Good to meet you. What are you working on?", "requestEmail": false}' }],
      tokensUsed: 50,
      costCents: 0,
      stopReason: "end_turn",
      model: "mock",
    }),
  };
});

// Import after mocks
const { handleChatTurn } = await import("./network-chat");

describe("network-chat integration", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("creates a new session on first message", async () => {
    const result = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");

    expect(result.sessionId).toBeTruthy();
    expect(result.reply).toBeTruthy();
    expect(typeof result.reply).toBe("string");
  });

  it("stores session in database", async () => {
    const result = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");

    const [session] = await testDb
      .select()
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.sessionId, result.sessionId));

    expect(session).toBeTruthy();
    expect(session.context).toBe("front-door");
    expect(session.messageCount).toBe(1);
  });

  it("records conversation_started funnel event", async () => {
    const result = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");

    const events = await testDb
      .select()
      .from(schema.funnelEvents)
      .where(eq(schema.funnelEvents.sessionId, result.sessionId));

    const startEvent = events.find((e) => e.event === "conversation_started");
    expect(startEvent).toBeTruthy();
    expect(startEvent!.surface).toBe("front-door");
  });

  it("detects email, triggers intake, and sets emailCaptured", async () => {
    // First message to create session
    const turn1 = await handleChatTurn(null, "I need help with sales", "front-door", "127.0.0.1");

    // Submit email — backend detects it and triggers intake as a side effect
    const turn2 = await handleChatTurn(turn1.sessionId, "tim@example.com", "front-door", "127.0.0.1");

    expect(turn2.emailCaptured).toBe(true);
    // Reply comes from LLM (mocked), not a hardcoded string
    expect(turn2.reply).toBeTruthy();
  });

  it("records email_captured funnel event", async () => {
    const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
    await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

    const events = await testDb
      .select()
      .from(schema.funnelEvents)
      .where(eq(schema.funnelEvents.sessionId, turn1.sessionId));

    const captureEvent = events.find((e) => e.event === "email_captured");
    expect(captureEvent).toBeTruthy();
  });

  it("hashes IP addresses", async () => {
    await handleChatTurn(null, "Hello", "front-door", "192.168.1.1");

    const [session] = await testDb
      .select()
      .from(schema.chatSessions);

    // Should be a hex hash, not the raw IP
    expect(session.ipHash).not.toBe("192.168.1.1");
    expect(session.ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("continues existing session", async () => {
    const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
    const turn2 = await handleChatTurn(turn1.sessionId, "I need help", "front-door", "127.0.0.1");

    expect(turn2.sessionId).toBe(turn1.sessionId);

    const [session] = await testDb
      .select()
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.sessionId, turn1.sessionId));

    expect(session.messageCount).toBe(2);
    const messages = session.messages as Array<{ role: string; content: string }>;
    // 2 user messages + 2 assistant responses = 4 total
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it("creates new session for expired sessionId", async () => {
    // Create a session with expired TTL
    const expiredId = "expired-session";
    await testDb.insert(schema.chatSessions).values({
      sessionId: expiredId,
      messages: [],
      context: "front-door",
      ipHash: "hash",
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    const result = await handleChatTurn(expiredId, "Hello", "front-door", "127.0.0.1");

    // Should create a new session (the expired one is ignored)
    expect(result.sessionId).toBeTruthy();
    expect(result.reply).toBeTruthy();
  });

  it("returns rate limit at 21st message per session", async () => {
    // Create session with 20 messages already
    const sessionId = "rate-limit-session";
    await testDb.insert(schema.chatSessions).values({
      sessionId,
      messages: [],
      context: "front-door",
      ipHash: "hash",
      messageCount: 20,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await handleChatTurn(sessionId, "One more", "front-door", "127.0.0.1");

    expect(result.requestEmail).toBe(true);
    expect(result.rateLimited).toBe(true);
    expect(result.reply).toContain("chatting a lot");
  });

  it("extracts name from conversation for intake", async () => {
    mockStartIntake.mockClear();
    const turn1 = await handleChatTurn(null, "I'm Tim and I need sales help", "front-door", "127.0.0.1");
    const turn2 = await handleChatTurn(turn1.sessionId, "tim@example.com", "front-door", "127.0.0.1");

    expect(turn2.emailCaptured).toBe(true);
    expect(mockStartIntake).toHaveBeenCalledWith("tim@example.com", "Tim", expect.any(String), undefined, "alex");
  });

  it("calls startIntake with email, extracted name, and need", async () => {
    mockStartIntake.mockClear();
    const turn1 = await handleChatTurn(null, "I need help finding logistics partners", "front-door", "127.0.0.1");
    await handleChatTurn(turn1.sessionId, "test@company.com", "front-door", "127.0.0.1");

    expect(mockStartIntake).toHaveBeenCalledWith(
      "test@company.com",
      undefined, // no name detected
      "I need help finding logistics partners",
      undefined,
      "alex",
    );
  });

  it("intercepts bracket-tagged funnel events without calling LLM", async () => {
    const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
    const eventResult = await handleChatTurn(turn1.sessionId, "[verify_requested]", "front-door", "127.0.0.1");

    expect(eventResult.reply).toBe("");
    expect(eventResult.sessionId).toBe(turn1.sessionId);

    // The event should be recorded
    const events = await testDb
      .select()
      .from(schema.funnelEvents)
      .where(eq(schema.funnelEvents.sessionId, turn1.sessionId));

    const verifyEvent = events.find((e) => e.event === "verify_requested");
    expect(verifyEvent).toBeTruthy();
  });

  it("sets emailCaptured when startIntake detects existing user", async () => {
    mockStartIntake.mockResolvedValueOnce({
      success: true,
      recognised: true,
      personId: "existing-person",
      personaName: "Alex",
      message: "Welcome back!",
    });

    const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
    const turn2 = await handleChatTurn(turn1.sessionId, "known@example.com", "front-door", "127.0.0.1");

    expect(turn2.emailCaptured).toBe(true);
    // Reply comes from LLM based on [EMAIL_CAPTURED] context
    expect(turn2.reply).toBeTruthy();
  });

  it("does not record conversation_started on subsequent messages", async () => {
    const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
    await handleChatTurn(turn1.sessionId, "More info", "front-door", "127.0.0.1");

    const events = await testDb
      .select()
      .from(schema.funnelEvents)
      .where(eq(schema.funnelEvents.sessionId, turn1.sessionId));

    const startEvents = events.filter((e) => e.event === "conversation_started");
    expect(startEvents.length).toBe(1);
  });
});
