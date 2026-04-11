/**
 * Ditto — Front Door Workflow Tests
 *
 * End-to-end tests that verify the full data pipeline:
 * - Person records created in the DB
 * - Persona assigned
 * - Funnel events tracked across the full journey
 * - Session messages accumulate correctly
 * - Conversation summary assembled for ACTIVATE
 * - Process runs created in the DB with correct inputs
 * - Email functions called with correct arguments
 *
 * Unlike network-chat.test.ts which mocks startIntake entirely,
 * these tests use real startIntake (creating real person records)
 * and real startSystemAgentRun (creating real process runs).
 * Only external I/O (email sending, LLM) is mocked.
 *
 * Provenance: Front door advisor pivot, workflow robustness.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";

// ============================================================
// Test DB + mocks (only mock LLM and email channel)
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

// Mock only the email channel — everything else is real
const mockChannelSend = vi.fn().mockResolvedValue({ success: true, messageId: "mock-msg-id" });
const mockSendAndRecord = vi.fn().mockResolvedValue({ success: true, interactionId: "mock-int-id", messageId: "mock-msg-id" });
vi.mock("./channel", () => ({
  createAgentMailAdapterForPersona: () => ({
    send: (...args: unknown[]) => mockChannelSend(...args),
  }),
  sendAndRecord: (...args: unknown[]) => mockSendAndRecord(...args),
}));

// Mock LLM — we control Alex's responses
function mockAlexResponse(
  text: string,
  toolArgs: Record<string, unknown> = {},
) {
  return {
    content: [
      { type: "text", text },
      {
        type: "tool_use",
        id: `mock-alex-${Date.now()}-${Math.random()}`,
        name: "alex_response",
        input: {
          suggestions: ["Tell me more", "Not sure"],
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

const mockCreateCompletion = vi.fn();

vi.mock("./llm", async () => {
  const real = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...real,
    createCompletion: (...args: unknown[]) => mockCreateCompletion(...args),
  };
});

// Mock web search (not testing search here)
vi.mock("./web-search", () => ({
  webSearch: vi.fn().mockResolvedValue(null),
}));

// Mock completion notifier (not testing process completion emails here)
vi.mock("./completion-notifier", () => ({
  notifyProcessCompletion: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER mocks
const { handleChatTurn } = await import("./network-chat");

// ============================================================
// Helpers
// ============================================================

async function seedProcess(slug: string, name: string) {
  await testDb.insert(schema.processes).values({
    name,
    slug,
    status: "active",
    definition: { steps: [] },
    trustTier: "supervised",
  });
}

// ============================================================
// Tests
// ============================================================

describe("front-door workflow — end to end", () => {
  beforeEach(async () => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
    mockCreateCompletion.mockReset();
    mockChannelSend.mockClear();
    mockSendAndRecord.mockClear();

    // Seed the process templates so startSystemAgentRun can find them
    await seedProcess("front-door-intake", "Front Door Intake");
    await seedProcess("front-door-cos-intake", "Front Door CoS Intake");

    // Default LLM response
    mockCreateCompletion.mockResolvedValue(
      mockAlexResponse("Good to meet you. What are you working on?"),
    );
  });

  afterEach(() => {
    cleanup();
  });

  // ============================================================
  // Connector path: full journey
  // ============================================================

  describe("connector path — full journey", () => {
    it("creates person record when email is captured", async () => {
      const turn1 = await handleChatTurn(null, "I need more clients for my plumbing business", "front-door", "127.0.0.1");

      // Submit email
      const turn2 = await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");
      expect(turn2.emailCaptured).toBe(true);

      // Verify person record exists in DB
      const people = await testDb.select().from(schema.people);
      expect(people.length).toBe(1);
      expect(people[0].email).toBe("tim@launchpathventures.com");
      expect(people[0].journeyLayer).toBe("active");
      expect(people[0].visibility).toBe("internal");
    });

    it("assigns and persists Alex persona to front door visitors", async () => {
      const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Persona persisted on person record
      const people = await testDb.select().from(schema.people);
      expect(people.length).toBe(1);
      expect(people[0].personaAssignment).toBe("alex");

      // And used for the email (now via sendAndRecord)
      const emailCall = mockSendAndRecord.mock.calls[0][0];
      expect(emailCall.personaId).toBe("alex");
    });

    it("sends intro email on email capture", async () => {
      const turn1 = await handleChatTurn(null, "I need clients", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Verify intro email was sent via sendAndRecord
      expect(mockSendAndRecord).toHaveBeenCalled();
      const emailCall = mockSendAndRecord.mock.calls[0][0];
      expect(emailCall.to).toBe("tim@launchpathventures.com");
      expect(emailCall.personaId).toBe("alex");
    });

    it("extracts name from conversation and stores on person record", async () => {
      const turn1 = await handleChatTurn(null, "I'm Tim and I run a plumbing business", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      const people = await testDb.select().from(schema.people);
      expect(people[0].name).toBe("Tim");
    });

    it("uses email prefix as name when no name detected", async () => {
      const turn1 = await handleChatTurn(null, "I need more clients", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "unknown@example.com", "front-door", "127.0.0.1");

      const people = await testDb.select().from(schema.people);
      expect(people[0].name).toBe("unknown");
    });

    it("creates process run on ACTIVATE with connector mode", async () => {
      // Turn 1: conversation
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Plumbing in Christchurch — got it.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need more clients for my plumbing business in Christchurch", "front-door", "127.0.0.1");

      // Turn 2: email capture
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Turn 3: ACTIVATE
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I'll get started on this right away.", { done: true, detectedMode: "connector" }),
      );
      await handleChatTurn(turn1.sessionId, "sounds good, go ahead", "front-door", "127.0.0.1", "tim@launchpathventures.com");

      // Verify process run created in DB
      const runs = await testDb.select().from(schema.processRuns);
      expect(runs.length).toBeGreaterThanOrEqual(1);

      // Find the front-door-intake run
      const [intakeProcess] = await testDb
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, "front-door-intake"));

      const intakeRun = runs.find((r) => r.processId === intakeProcess.id);
      expect(intakeRun).toBeTruthy();
      // Run starts queued but heartbeat may advance it immediately
      expect(["queued", "running", "approved", "waiting_review", "waiting_human"]).toContain(intakeRun!.status);
      expect(intakeRun!.triggeredBy).toBe("front-door-chat");

      // Verify run inputs contain the conversation context
      const inputs = intakeRun!.inputs as Record<string, unknown>;
      expect(inputs.email).toBe("tim@launchpathventures.com");
      expect(inputs.conversationSummary).toBeTruthy();
      expect(inputs.targetType).toBeTruthy();
    });

    it("sends action email with transparency language on ACTIVATE", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Got it.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need clients", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      mockSendAndRecord.mockClear(); // Clear intro email

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("On it.", { done: true, detectedMode: "connector" }),
      );
      await handleChatTurn(turn1.sessionId, "go ahead", "front-door", "127.0.0.1", "tim@launchpathventures.com");

      // Verify action email sent via sendAndRecord with transparency language
      expect(mockSendAndRecord).toHaveBeenCalled();
      const actionEmail = mockSendAndRecord.mock.calls[0][0];
      expect(actionEmail.to).toBe("tim@launchpathventures.com");
      expect(actionEmail.body).toContain("Here's what");
    });

    it("tracks complete funnel: started → message → mode → email → activate", async () => {
      // Turn 1
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Tell me about your business.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need more clients", "front-door", "127.0.0.1");

      // Turn 2: email
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Turn 3: ACTIVATE
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Done.", { done: true, detectedMode: "connector" }),
      );
      await handleChatTurn(turn1.sessionId, "let's go", "front-door", "127.0.0.1", "tim@launchpathventures.com");

      // Verify funnel events
      const events = await testDb
        .select()
        .from(schema.funnelEvents)
        .where(eq(schema.funnelEvents.sessionId, turn1.sessionId))
        .orderBy(schema.funnelEvents.createdAt);

      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain("conversation_started");
      expect(eventNames).toContain("chat_message");
      expect(eventNames).toContain("mode_detected");
      expect(eventNames).toContain("email_captured");
    });

    it("accumulates messages correctly across turns", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("What kind of clients?"),
      );
      const turn1 = await handleChatTurn(null, "I need more clients", "front-door", "127.0.0.1");

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Property managers in Christchurch — got it."),
      );
      await handleChatTurn(turn1.sessionId, "Property managers in Christchurch", "front-door", "127.0.0.1");

      // Check session messages
      const [session] = await testDb
        .select()
        .from(schema.chatSessions)
        .where(eq(schema.chatSessions.sessionId, turn1.sessionId));

      const messages = session.messages as Array<{ role: string; content: string }>;
      // 2 user messages + 2 assistant replies = 4
      expect(messages.length).toBe(4);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("I need more clients");
      expect(messages[1].role).toBe("assistant");
      expect(messages[2].role).toBe("user");
      expect(messages[2].content).toBe("Property managers in Christchurch");
      expect(messages[3].role).toBe("assistant");
    });

    it("recognises returning person and does not create duplicate", async () => {
      // First visit: create person
      const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      const peopleBefore = await testDb.select().from(schema.people);
      expect(peopleBefore.length).toBe(1);

      // Second visit: same email
      const turn2 = await handleChatTurn(null, "I'm back", "front-door", "127.0.0.2");
      await handleChatTurn(turn2.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.2");

      // Should not create a second person
      const peopleAfter = await testDb.select().from(schema.people);
      expect(peopleAfter.length).toBe(1);
    });
  });

  // ============================================================
  // CoS path: full journey
  // ============================================================

  describe("cos path — full journey", () => {
    it("creates person and process run for CoS mode", async () => {
      // Turn 1: CoS need
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Sounds like you need help organizing.", { detectedMode: "cos" }),
      );
      const turn1 = await handleChatTurn(null, "I'm drowning in tasks and can't keep track of priorities", "front-door", "127.0.0.1");

      // Turn 2: email
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Verify person created
      const people = await testDb.select().from(schema.people);
      expect(people.length).toBe(1);

      // Turn 3: ACTIVATE
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I'll send your first briefing by Monday.", { done: true, detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "that sounds perfect", "front-door", "127.0.0.1", "tim@launchpathventures.com");

      // Verify CoS process run created
      const [cosProcess] = await testDb
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, "front-door-cos-intake"));

      const runs = await testDb
        .select()
        .from(schema.processRuns)
        .where(eq(schema.processRuns.processId, cosProcess.id));

      expect(runs.length).toBe(1);
      expect(["queued", "running", "approved", "waiting_review", "waiting_human"]).toContain(runs[0].status);

      const inputs = runs[0].inputs as Record<string, unknown>;
      expect(inputs.email).toBe("tim@launchpathventures.com");
      expect(inputs.statedPriorities).toBeTruthy();
    });

    it("sends CoS action email (not connector email) on ACTIVATE", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I can help.", { detectedMode: "cos" }),
      );
      const turn1 = await handleChatTurn(null, "I need help with priorities", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      mockSendAndRecord.mockClear();

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Your first briefing arrives Monday.", { done: true, detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "go ahead", "front-door", "127.0.0.1", "tim@launchpathventures.com");

      // Verify CoS-specific email content via sendAndRecord
      expect(mockSendAndRecord).toHaveBeenCalled();
      const email = mockSendAndRecord.mock.calls[0][0];
      expect(email.subject).toBe("Your priorities briefing starts this week");
      expect(email.body).toContain("priorities briefing");
      expect(email.body).toContain("Monday");
    });
  });

  // ============================================================
  // Both mode: full journey
  // ============================================================

  describe("both mode — full journey", () => {
    it("creates front-door-intake process run on ACTIVATE (CoS chains from report-back)", async () => {
      // Brief 126: "both" mode starts ONLY front-door-intake.
      // CoS chains from the report-back step, not started in parallel.
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("I can help with both.", { detectedMode: "both" }),
      );
      const turn1 = await handleChatTurn(null, "I need clients AND help organizing my pipeline", "front-door", "127.0.0.1");

      // Email capture — safety net forces done=true, so set correct mode
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Starting on both now.", { detectedMode: "both" }),
      );
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Only front-door-intake should have a run (CoS chains later)
      const allRuns = await testDb.select().from(schema.processRuns);

      const [intakeProc] = await testDb
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, "front-door-intake"));

      const intakeRun = allRuns.find((r) => r.processId === intakeProc.id);

      expect(intakeRun).toBeTruthy();
      expect(intakeRun!.triggeredBy).toBe("front-door-chat");
    });

    it("sends ONE action email for both mode (Brief 126)", async () => {
      // Brief 126: "both" mode sends ONE outreach-focused action email.
      // CoS intake chains from front-door-intake report-back.
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Both.", { detectedMode: "both" }),
      );
      const turn1 = await handleChatTurn(null, "I need clients and help organizing", "front-door", "127.0.0.1");

      mockSendAndRecord.mockClear();

      // Email capture — safety net forces done=true, so set correct mode
      // This turn sends both the intro email AND the action email
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("On it.", { detectedMode: "both" }),
      );
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // 2 calls: intro email + 1 action email (not 3 — no separate CoS action email)
      expect(mockSendAndRecord.mock.calls.length).toBe(2);

      // The second call is the action email — should be outreach-focused
      const subject = (mockSendAndRecord.mock.calls[1][0] as Record<string, unknown>).subject;
      expect(subject).toBe("Here's the plan");
    });
  });

  // ============================================================
  // Mode switching: data integrity
  // ============================================================

  describe("mode switching — data integrity", () => {
    it("process run matches final mode after pivot", async () => {
      // Turn 1: connector
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Clients.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need more clients", "front-door", "127.0.0.1");

      // Turn 2: pivot to cos
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Actually organizing.", { detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "actually I need help organizing my pipeline", "front-door", "127.0.0.1");

      // Email capture — safety net forces done=true, so set correct final mode (cos)
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Briefing coming.", { detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      // Only CoS process should be started, NOT connector
      const [cosProc] = await testDb
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, "front-door-cos-intake"));

      const [intakeProc] = await testDb
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, "front-door-intake"));

      const allRuns = await testDb.select().from(schema.processRuns);

      const cosRun = allRuns.find((r) => r.processId === cosProc.id);
      const intakeRun = allRuns.find((r) => r.processId === intakeProc.id);

      expect(cosRun).toBeTruthy();
      expect(intakeRun).toBeUndefined();
    });

    it("funnel tracks both mode_detected events on pivot", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Clients.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need clients", "front-door", "127.0.0.1");

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Organizing.", { detectedMode: "cos" }),
      );
      await handleChatTurn(turn1.sessionId, "actually I need help organizing", "front-door", "127.0.0.1");

      const events = await testDb
        .select()
        .from(schema.funnelEvents)
        .where(eq(schema.funnelEvents.sessionId, turn1.sessionId));

      const modeEvents = events.filter((e) => e.event === "mode_detected");
      expect(modeEvents.length).toBe(2);

      const modes = modeEvents.map((e) => (e.metadata as Record<string, unknown>).mode);
      expect(modes).toContain("connector");
      expect(modes).toContain("cos");
    });
  });

  // ============================================================
  // Session & conversation integrity
  // ============================================================

  describe("session & conversation integrity", () => {
    it("stores EMAIL_CAPTURED marker in messages for LLM context", async () => {
      const turn1 = await handleChatTurn(null, "I need help", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      const [session] = await testDb
        .select()
        .from(schema.chatSessions)
        .where(eq(schema.chatSessions.sessionId, turn1.sessionId));

      const messages = session.messages as Array<{ role: string; content: string }>;
      const emailMsg = messages.find((m) => m.content.includes("[EMAIL_CAPTURED]"));
      expect(emailMsg).toBeTruthy();
      expect(emailMsg!.content).toContain("tim@launchpathventures.com");
    });

    it("conversation summary excludes system markers", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Got it.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I need clients for my plumbing business", "front-door", "127.0.0.1");

      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Starting now.", { done: true, detectedMode: "connector" }),
      );
      await handleChatTurn(turn1.sessionId, "go ahead", "front-door", "127.0.0.1", "tim@launchpathventures.com");

      // Check that process run inputs have a clean conversation summary
      const runs = await testDb.select().from(schema.processRuns);
      const run = runs[0];
      const inputs = run.inputs as Record<string, unknown>;
      const summary = inputs.conversationSummary as string;

      // Should contain user messages but not system markers
      expect(summary).toContain("plumbing business");
      expect(summary).not.toContain("[EMAIL_CAPTURED]");
      expect(summary).not.toContain("[SEARCH_RESULTS");
    });

    it("message count increments correctly across multi-turn conversation", async () => {
      const turn1 = await handleChatTurn(null, "Hello", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "I need clients", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "In Christchurch", "front-door", "127.0.0.1");
      await handleChatTurn(turn1.sessionId, "tim@launchpathventures.com", "front-door", "127.0.0.1");

      const [session] = await testDb
        .select()
        .from(schema.chatSessions)
        .where(eq(schema.chatSessions.sessionId, turn1.sessionId));

      expect(session.messageCount).toBe(4);
    });
  });

  // ============================================================
  // Referred visitor path
  // ============================================================

  describe("referred visitor path", () => {
    it("creates session with referred context", async () => {
      const result = await handleChatTurn(null, "I got an intro from Alex and loved it", "referred", "127.0.0.1");

      const [session] = await testDb
        .select()
        .from(schema.chatSessions)
        .where(eq(schema.chatSessions.sessionId, result.sessionId));

      expect(session.context).toBe("referred");
    });

    it("creates person and process run for referred visitor", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Great to hear from you.", { detectedMode: "connector" }),
      );
      const turn1 = await handleChatTurn(null, "I want my own advisor", "referred", "127.0.0.1");

      await handleChatTurn(turn1.sessionId, "sarah@example.com", "referred", "127.0.0.1");

      // Person created
      const people = await testDb.select().from(schema.people);
      expect(people.length).toBe(1);
      expect(people[0].email).toBe("sarah@example.com");

      // ACTIVATE
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("On it.", { done: true, detectedMode: "connector" }),
      );
      await handleChatTurn(turn1.sessionId, "let's go", "referred", "127.0.0.1", "sarah@example.com");

      // Process run created
      const runs = await testDb.select().from(schema.processRuns);
      expect(runs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // Search enrichment flow
  // ============================================================

  describe("search enrichment", () => {
    it("handles search query in LLM response and feeds results back", async () => {
      // First response includes a searchQuery
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Let me look into property managers in Christchurch.", {
          detectedMode: "connector",
          searchQuery: "property management companies Christchurch New Zealand",
        }),
      );

      // The web search mock returns results (re-mock for this test)
      const { webSearch } = await import("./web-search");
      (webSearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "1. ABC Property Management - Christchurch\n2. XYZ Realty - Christchurch",
      );

      // Second LLM call (after search results are fed back)
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Found some good targets — ABC Property Management and XYZ Realty look like strong fits.", {
          detectedMode: "connector",
        }),
      );

      const result = await handleChatTurn(null, "I need to reach property managers in Christchurch", "front-door", "127.0.0.1");

      // The reply should be the enriched response (second LLM call)
      expect(result.reply).toContain("ABC Property Management");
      expect(result.detectedMode).toBe("connector");

      // LLM was called twice — initial + follow-up with search results
      expect(mockCreateCompletion).toHaveBeenCalledTimes(2);
    });

    it("falls back to first reply when search returns no results", async () => {
      mockCreateCompletion.mockResolvedValueOnce(
        mockAlexResponse("Let me look into that.", {
          detectedMode: "connector",
          searchQuery: "obscure niche businesses",
        }),
      );

      // Search returns null (no results)
      const { webSearch } = await import("./web-search");
      (webSearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const result = await handleChatTurn(null, "I need to find obscure niche businesses", "front-door", "127.0.0.1");

      // Should use original reply since search returned nothing
      expect(result.reply).toContain("Let me look into that");
      // LLM called only once (no follow-up since search was empty)
      expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // Rate limiting & edge cases
  // ============================================================

  describe("rate limiting", () => {
    it("blocks at session message limit and requests email", async () => {
      // Create session at the limit
      const sessionId = "rate-limit-test";
      await testDb.insert(schema.chatSessions).values({
        sessionId,
        messages: [],
        context: "front-door",
        ipHash: "hash",
        messageCount: 20,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await handleChatTurn(sessionId, "one more", "front-door", "127.0.0.1");

      expect(result.rateLimited).toBe(true);
      expect(result.requestEmail).toBe(true);
      // LLM should NOT have been called
      expect(mockCreateCompletion).not.toHaveBeenCalled();
    });
  });
});
