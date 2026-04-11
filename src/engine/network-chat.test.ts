/**
 * Ditto — Front Door Chat Tests
 *
 * Tests for prompt construction, response parsing, session management,
 * email detection, funnel events, rate limiting, mode detection, and
 * ACTIVATE branching.
 *
 * Provenance: Brief 093, layered prompt architecture.
 * Follows people.test.ts mocking pattern.
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
      expect(prompt).toContain("Front Door Advisor");
    });

    it("builds a referred system prompt with different instructions", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("referred");
      expect(prompt).toContain("Alex");
      expect(prompt).toContain("Referred Visitor");
      expect(prompt).toContain("MAX 3 SENTENCES");
      expect(prompt).not.toContain("Front Door Advisor");
    });

    it("includes house values from cognitive core", async () => {
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

    it("requires tool-call response format with detectedMode", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("requestEmail");
      expect(prompt).toContain("detectedMode");
      expect(prompt).toContain("alex_response");
    });

    // New: Self's cognitive backbone
    it("includes cognitive core consultative protocol", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Consultative Protocol");
      expect(prompt).toContain("Reflect back");
    });

    it("includes cognitive core trade-off heuristics", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Human judgment over AI confidence");
    });

    it("includes transparency & consent section", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Transparency & Consent");
      expect(prompt).toContain("informed consent");
    });

    it("does NOT contain super connector framing", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).not.toContain("You connect people who should know each other");
      expect(prompt).not.toContain("Super-Connector");
    });

    // New: Mode detection
    it("includes connector and CoS signal lists", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Connector signals");
      expect(prompt).toContain("CoS signals");
    });

    it("includes REFLECT & PROPOSE stage", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("REFLECT & PROPOSE");
      expect(prompt).toContain("trust-building");
    });

    it("describes approval model in connector mode", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      // Connector mode explains Alex reaches out as himself with framing examples
      expect(prompt).toContain("consent");
    });

    it("includes mode switching as additive", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("additive");
    });

    // Brief 122: Temporal context
    it("includes Current Time section", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("## Current Time");
    });

    it("uses visitor timezone when provided", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door", {
        location: { city: "Melbourne", timezone: "Australia/Melbourne" },
      });
      expect(prompt).toContain("Australia/Melbourne");
    });

    // Brief 122: No time promises
    it("contains no specific time commitments", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).not.toContain("within the hour");
      expect(prompt).not.toContain("within 24 hours");
      expect(prompt).toContain("I'll get started right away");
    });

    it("includes never-commit-to-delivery-times rule", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Never commit to specific delivery times");
      expect(prompt).toContain("I'll get started right away");
    });

    // Brief 122: Judgment framework
    it("includes connector judgment question in REFLECT & PROPOSE", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Would both sides thank me for this?");
    });

    it("includes sales judgment question in REFLECT & PROPOSE", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("Does this person likely have the problem we solve?");
    });

    it("includes advisor-not-order-taker framing", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("You're an advisor, not an order-taker");
    });

    // Brief 122: Strategic framing in GATHER
    it("includes strategic framing for connector vs sales", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door");
      expect(prompt).toContain("mutual value");
      expect(prompt).toContain("commercial outcome");
    });

    // Brief 122: Stage-gated prompt also has the changes
    it("stage-gated reflect includes judgment questions", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door", undefined, "reflect");
      expect(prompt).toContain("Would both sides thank me for this?");
      expect(prompt).toContain("advisor, not an order-taker");
    });

    it("stage-gated gather includes strategic framing", async () => {
      const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
      const prompt = buildFrontDoorPrompt("front-door", undefined, "gather");
      expect(prompt).toContain("mutual value");
      expect(prompt).toContain("commercial outcome");
    });
  });

  describe("ALEX_RESPONSE_TOOL", () => {
    it("exports a valid LlmToolDefinition", async () => {
      const { ALEX_RESPONSE_TOOL } = await import("./network-chat-prompt");
      expect(ALEX_RESPONSE_TOOL.name).toBe("alex_response");
      expect(ALEX_RESPONSE_TOOL.input_schema.type).toBe("object");
      expect(ALEX_RESPONSE_TOOL.input_schema.properties).toHaveProperty("suggestions");
      expect(ALEX_RESPONSE_TOOL.input_schema.properties).toHaveProperty("requestEmail");
      expect(ALEX_RESPONSE_TOOL.input_schema.properties).toHaveProperty("done");
      expect(ALEX_RESPONSE_TOOL.input_schema.properties).toHaveProperty("detectedMode");
      expect(ALEX_RESPONSE_TOOL.input_schema.properties).toHaveProperty("searchQuery");
      expect(ALEX_RESPONSE_TOOL.input_schema.properties).toHaveProperty("resendEmail");
      expect(ALEX_RESPONSE_TOOL.input_schema.required).toEqual(["suggestions"]);
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

const mockSendActionEmail = vi.fn().mockResolvedValue(undefined);
const mockSendCosActionEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("./self-tools/network-tools", () => ({
  startIntake: (...args: unknown[]) => mockStartIntake(...args),
  sendActionEmail: (...args: unknown[]) => mockSendActionEmail(...args),
  sendCosActionEmail: (...args: unknown[]) => mockSendCosActionEmail(...args),
}));

/** Build a mock LLM response with text + alex_response tool call */
function mockAlexResponse(
  text: string,
  toolArgs: Record<string, unknown> = {},
) {
  return {
    content: [
      { type: "text", text },
      {
        type: "tool_use",
        id: `mock-alex-${Date.now()}`,
        name: "alex_response",
        input: {
          suggestions: [],
          requestEmail: false,
          done: false,
          resendEmail: false,
          detectedMode: null,
          searchQuery: null,
          ...toolArgs,
        },
      },
    ],
    tokensUsed: 50,
    costCents: 0,
    stopReason: "tool_use",
    model: "mock",
  };
}

const mockCreateCompletion = vi.fn().mockResolvedValue(
  mockAlexResponse("Good to meet you. What are you working on?"),
);

vi.mock("./llm", async () => {
  const real = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...real,
    createCompletion: (...args: unknown[]) => mockCreateCompletion(...args),
  };
});

// Import after mocks
const { handleChatTurn } = await import("./network-chat");

describe("network-chat integration", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
    mockCreateCompletion.mockResolvedValue(
      mockAlexResponse("Good to meet you. What are you working on?"),
    );
    mockStartIntake.mockClear();
    mockSendActionEmail.mockClear();
    mockSendCosActionEmail.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // ============================================================
  // Existing tests (backward compatibility)
  // ============================================================

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
    const turn1 = await handleChatTurn(null, "I need help with sales", "front-door", "127.0.0.1");
    const turn2 = await handleChatTurn(turn1.sessionId, "tim@example.com", "front-door", "127.0.0.1");

    expect(turn2.emailCaptured).toBe(true);
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
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it("creates new session for expired sessionId", async () => {
    const expiredId = "expired-session";
    await testDb.insert(schema.chatSessions).values({
      sessionId: expiredId,
      messages: [],
      context: "front-door",
      ipHash: "hash",
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await handleChatTurn(expiredId, "Hello", "front-door", "127.0.0.1");

    expect(result.sessionId).toBeTruthy();
    expect(result.reply).toBeTruthy();
  });

  it("returns rate limit at 21st message per session", async () => {
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
    expect(mockStartIntake).toHaveBeenCalledWith("tim@example.com", "Tim", expect.any(String), undefined, "alex", undefined, expect.any(String));
  });

  it("calls startIntake with email, extracted name, and need", async () => {
    mockStartIntake.mockClear();
    const turn1 = await handleChatTurn(null, "I need help finding logistics partners", "front-door", "127.0.0.1");
    await handleChatTurn(turn1.sessionId, "test@company.com", "front-door", "127.0.0.1");

    expect(mockStartIntake).toHaveBeenCalledWith(
      "test@company.com",
      undefined,
      "I need help finding logistics partners",
      undefined,
      "alex",
      undefined,
      expect.any(String), // sessionId (Brief 126 AC4)
    );
  });

  it("intercepts bracket-tagged funnel events without calling LLM", async () => {
    const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
    const eventResult = await handleChatTurn(turn1.sessionId, "[verify_requested]", "front-door", "127.0.0.1");

    expect(eventResult.reply).toBe("");
    expect(eventResult.sessionId).toBe(turn1.sessionId);

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

  // ============================================================
  // Mode Detection Tests
  // ============================================================

  describe("mode detection", () => {
    it("returns detectedMode from LLM response", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Sounds like you need clients.", { detectedMode: "connector" }),
      );

      const result = await handleChatTurn(null, "I need more clients", "front-door", "127.0.0.1");
      expect(result.detectedMode).toBe("connector");
    });

    it("returns cos detectedMode", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Let me help with that.", { detectedMode: "cos" }),
      );

      const result = await handleChatTurn(null, "I'm drowning in tasks", "front-door", "127.0.0.1");
      expect(result.detectedMode).toBe("cos");
    });

    it("returns both detectedMode", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I can help with both.", { detectedMode: "both" }),
      );

      const result = await handleChatTurn(null, "I need clients and help organizing", "front-door", "127.0.0.1");
      expect(result.detectedMode).toBe("both");
    });

    it("returns null detectedMode when unclear", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Tell me more.", { detectedMode: null }),
      );

      const result = await handleChatTurn(null, "I'm stuck on a problem", "front-door", "127.0.0.1");
      expect(result.detectedMode).toBeNull();
    });

    it("records mode_detected funnel event", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Got it.", { detectedMode: "cos" }),
      );

      const result = await handleChatTurn(null, "I need help organizing", "front-door", "127.0.0.1");

      const events = await testDb
        .select()
        .from(schema.funnelEvents)
        .where(eq(schema.funnelEvents.sessionId, result.sessionId));

      const modeEvent = events.find((e) => e.event === "mode_detected");
      expect(modeEvent).toBeTruthy();
      const metadata = modeEvent!.metadata as Record<string, unknown>;
      expect(metadata.mode).toBe("cos");
    });

    it("does not record mode_detected when mode is null", async () => {
      const result = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");

      const events = await testDb
        .select()
        .from(schema.funnelEvents)
        .where(eq(schema.funnelEvents.sessionId, result.sessionId));

      const modeEvents = events.filter((e) => e.event === "mode_detected");
      expect(modeEvents.length).toBe(0);
    });
  });

  // ============================================================
  // ACTIVATE Branching Tests
  // ============================================================

  describe("ACTIVATE branching", () => {
    it("calls sendActionEmail for connector mode on ACTIVATE", async () => {
      const turn1 = await handleChatTurn(null, "I need clients", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

      // ACTIVATE — pass returningEmail so knownEmail is set (mimics frontend localStorage)
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I'll get started.", { done: true, detectedMode: "connector" }),
      );

      await handleChatTurn(turn1.sessionId, "sounds good", "front-door", "127.0.0.1", "test@example.com");

      expect(mockSendActionEmail).toHaveBeenCalled();
      expect(mockSendCosActionEmail).not.toHaveBeenCalled();
    });

    it("calls sendCosActionEmail for cos mode on ACTIVATE", async () => {
      // Turn 1: detect cos mode
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I can help organize that.", { detectedMode: "cos" }),
      );
      const turn1 = await handleChatTurn(null, "I need help organizing", "front-door", "127.0.0.1");

      // Turn 2: email + ACTIVATE — LLM sees [EMAIL_CAPTURED], sets done
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I'll send your first briefing.", { done: true, detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

      expect(mockSendCosActionEmail).toHaveBeenCalled();
      expect(mockSendActionEmail).not.toHaveBeenCalled();
    });

    it("calls only sendActionEmail for both mode on ACTIVATE (Brief 126: CoS chains later)", async () => {
      const turn1 = await handleChatTurn(null, "I need clients and help organizing", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I'll get started on both.", { done: true, detectedMode: "both" }),
      );

      await handleChatTurn(turn1.sessionId, "sounds good", "front-door", "127.0.0.1", "test@example.com");

      // Brief 126: "both" mode sends only the outreach action email.
      // CoS intake chains from front-door-intake report-back, not in parallel.
      expect(mockSendActionEmail).toHaveBeenCalled();
      expect(mockSendCosActionEmail).not.toHaveBeenCalled();
    });

    it("defaults to connector on ACTIVATE with null mode", async () => {
      const turn1 = await handleChatTurn(null, "I need help", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I'll get started.", { done: true }),
      );

      await handleChatTurn(turn1.sessionId, "sounds good", "front-door", "127.0.0.1", "test@example.com");

      // Defaults to connector (backward compat)
      expect(mockSendActionEmail).toHaveBeenCalled();
      expect(mockSendCosActionEmail).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Mode Switching Tests
  // ============================================================

  describe("mode switching", () => {
    it("updates detectedMode when conversation pivots", async () => {
      // Turn 1: connector signal
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Clients — got it.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need more clients", "front-door", "127.0.0.1");
      expect(turn1.detectedMode).toBe("connector");

      // Turn 2: pivot to cos
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Actually sounds like you need help organizing.", { detectedMode: "cos" }),
      );
      const turn2 = await handleChatTurn(turn1.sessionId, "actually I need help organizing my pipeline", "front-door", "127.0.0.1");
      expect(turn2.detectedMode).toBe("cos");
    });

    it("uses final mode for ACTIVATE after pivot", async () => {
      // Turn 1: connector
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Clients.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need clients", "front-door", "127.0.0.1");

      // Turn 2: pivot to cos
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Organizing.", { detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "actually I need help organizing", "front-door", "127.0.0.1");

      // Turn 3: email + ACTIVATE — LLM sees [EMAIL_CAPTURED], sets done with cos mode
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Done.", { done: true, detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

      expect(mockSendCosActionEmail).toHaveBeenCalled();
      expect(mockSendActionEmail).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  describe("edge cases", () => {
    it("new pill messages are excluded from need extraction", async () => {
      mockStartIntake.mockClear();
      const turn1 = await handleChatTurn(null, "I need help organizing my work", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "test@example.com", "front-door", "127.0.0.1");

      // The pill message should NOT be passed as the "need" to startIntake
      const call = mockStartIntake.mock.calls[0];
      expect(call[2]).not.toBe("I need help organizing my work");
    });
  });
});
