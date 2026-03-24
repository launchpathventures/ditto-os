/**
 * Tests for the Conversational Self (Brief 030) and
 * Execution Layer (Brief 031).
 *
 * AC11: Integration tests for context assembly, session lifecycle,
 * delegation tool mapping, work state summary.
 * Brief 031: Role contract loading, tool subsets, confidence parsing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Mock LLM for consultation tests (Brief 034a, Flag 4)
const mockCreateCompletion = vi.fn();
const mockExtractText = vi.fn();
vi.mock("./llm", async () => {
  const real = await vi.importActual<typeof import("./llm")>("./llm");
  return {
    ...real,
    createCompletion: (...args: unknown[]) => mockCreateCompletion(...args),
    extractText: (...args: unknown[]) => mockExtractText(...args),
  };
});

// Import after mock
const { loadWorkStateSummary, loadSelfMemories, loadSessionTurns, getOrCreateSession, appendSessionTurn, SESSION_IDLE_TIMEOUT_MS, recordSelfDecision, recordSelfCorrection, detectSelfRedirect } = await import("./self-context");
const { selfTools, executeDelegation } = await import("./self-delegation");
const { assembleSelfContext } = await import("./self");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Work State Summary (AC3)
// ============================================================

describe("loadWorkStateSummary", () => {
  it("returns zero counts when no runs exist", async () => {
    const summary = await loadWorkStateSummary();
    expect(summary.activeRuns).toBe(0);
    expect(summary.pendingReviews).toBe(0);
    expect(summary.recentCompletions).toBe(0);
    expect(summary.details).toContain("No active work");
  });

  it("counts active runs and pending reviews", async () => {
    // Create a process first
    const processId = randomUUID();
    testDb.insert(schema.processes).values({
      id: processId,
      name: "Test Process",
      slug: "test-process",
      definition: {},
    }).run();

    // Create running and waiting_review runs
    testDb.insert(schema.processRuns).values({
      id: randomUUID(),
      processId,
      status: "running",
      triggeredBy: "test",
    }).run();

    testDb.insert(schema.processRuns).values({
      id: randomUUID(),
      processId,
      status: "waiting_review",
      triggeredBy: "test",
    }).run();

    const summary = await loadWorkStateSummary();
    expect(summary.activeRuns).toBe(1);
    expect(summary.pendingReviews).toBe(1);
    expect(summary.details).toContain("Active runs: 1");
    expect(summary.details).toContain("Pending reviews: 1");
  });
});

// ============================================================
// Self-Scoped Memories (AC8)
// ============================================================

describe("loadSelfMemories", () => {
  it("returns empty string when no self memories exist", async () => {
    const result = await loadSelfMemories("creator");
    expect(result).toBe("");
  });

  it("loads self-scoped memories sorted by salience", async () => {
    // Insert self-scoped memories
    testDb.insert(schema.memories).values({
      id: randomUUID(),
      scopeType: "self",
      scopeId: "creator",
      type: "preference",
      content: "Prefers terse responses",
      source: "human",
      reinforcementCount: 5,
      confidence: 0.9,
      active: true,
    }).run();

    testDb.insert(schema.memories).values({
      id: randomUUID(),
      scopeType: "self",
      scopeId: "creator",
      type: "context",
      content: "Working on Ditto project",
      source: "system",
      reinforcementCount: 1,
      confidence: 0.5,
      active: true,
    }).run();

    // Different user — should not appear
    testDb.insert(schema.memories).values({
      id: randomUUID(),
      scopeType: "self",
      scopeId: "other-user",
      type: "preference",
      content: "Other user preference",
      source: "human",
      reinforcementCount: 1,
      confidence: 0.5,
      active: true,
    }).run();

    const result = await loadSelfMemories("creator");
    expect(result).toContain("Prefers terse responses");
    expect(result).toContain("Working on Ditto project");
    expect(result).not.toContain("Other user preference");
  });

  it("respects token budget", async () => {
    // Insert a very long memory
    testDb.insert(schema.memories).values({
      id: randomUUID(),
      scopeType: "self",
      scopeId: "creator",
      type: "context",
      content: "A".repeat(5000),
      source: "system",
      reinforcementCount: 1,
      confidence: 0.5,
      active: true,
    }).run();

    // With a tiny budget, should truncate
    const result = await loadSelfMemories("creator", 10);
    // 10 tokens * 4 chars = 40 chars budget — the 5000 char memory won't fit
    expect(result).toBe("");
  });
});

// ============================================================
// Session Lifecycle (AC4, AC5)
// ============================================================

describe("session lifecycle", () => {
  it("creates a new session on first message", async () => {
    const { sessionId, resumed, previousSummary } = await getOrCreateSession("creator", "telegram");
    expect(sessionId).toBeTruthy();
    expect(resumed).toBe(false);
    expect(previousSummary).toBeNull();

    // Verify session exists in DB
    const [session] = testDb
      .select()
      .from(schema.sessions)
      .where(require("drizzle-orm").eq(schema.sessions.id, sessionId))
      .limit(1)
      .all();
    expect(session).toBeTruthy();
    expect(session.status).toBe("active");
    expect(session.surface).toBe("telegram");
  });

  it("resumes active session if within timeout", async () => {
    // Create a session
    const { sessionId: firstId } = await getOrCreateSession("creator", "telegram");

    // Get session again — should resume
    const { sessionId: secondId, resumed } = await getOrCreateSession("creator", "telegram");
    expect(secondId).toBe(firstId);
    expect(resumed).toBe(true);
  });

  it("suspends session after timeout and creates new one", async () => {
    // Create a session
    const { sessionId: firstId } = await getOrCreateSession("creator", "telegram");

    // Manually set lastActiveAt to past the timeout
    const pastTime = new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS - 1000);
    testDb
      .update(schema.sessions)
      .set({ lastActiveAt: pastTime })
      .where(require("drizzle-orm").eq(schema.sessions.id, firstId))
      .run();

    // Get session again — should create new one
    const { sessionId: secondId, resumed, previousSummary } = await getOrCreateSession("creator", "telegram");
    expect(secondId).not.toBe(firstId);
    expect(resumed).toBe(false);
    expect(previousSummary).toBeTruthy(); // Should have a summary from the suspended session

    // Verify first session is suspended
    const [oldSession] = testDb
      .select()
      .from(schema.sessions)
      .where(require("drizzle-orm").eq(schema.sessions.id, firstId))
      .limit(1)
      .all();
    expect(oldSession.status).toBe("suspended");
  });

  it("appends turns to session", async () => {
    const { sessionId } = await getOrCreateSession("creator", "telegram");

    await appendSessionTurn(sessionId, {
      role: "user",
      content: "Hello Ditto",
      timestamp: Date.now(),
      surface: "telegram",
    });

    await appendSessionTurn(sessionId, {
      role: "assistant",
      content: "Hey. What are you working on?",
      timestamp: Date.now(),
      surface: "telegram",
    });

    const turns = await loadSessionTurns(sessionId);
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe("user");
    expect(turns[0].content).toBe("Hello Ditto");
    expect(turns[1].role).toBe("assistant");
  });
});

// ============================================================
// Session Turns Loading
// ============================================================

describe("loadSessionTurns", () => {
  it("returns empty array for non-existent session", async () => {
    const turns = await loadSessionTurns("nonexistent");
    expect(turns).toEqual([]);
  });

  it("respects token budget", async () => {
    const { sessionId } = await getOrCreateSession("creator", "telegram");

    // Add many turns
    for (let i = 0; i < 20; i++) {
      await appendSessionTurn(sessionId, {
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}: ${"x".repeat(100)}`,
        timestamp: Date.now() + i,
        surface: "telegram",
      });
    }

    // With a small budget, should return fewer turns
    const turns = await loadSessionTurns(sessionId, 100);
    expect(turns.length).toBeLessThan(20);
    expect(turns.length).toBeGreaterThan(0);
    // Should return most recent turns
    expect(turns[turns.length - 1].content).toContain("Message 19");
  });
});

// ============================================================
// Delegation Tool Definitions (AC6)
// ============================================================

describe("selfTools", () => {
  it("defines all delegation, consultation, and workspace tools", () => {
    expect(selfTools).toHaveLength(12);
    const names = selfTools.map((t) => t.name);
    // Original 5
    expect(names).toContain("start_dev_role");
    expect(names).toContain("approve_review");
    expect(names).toContain("edit_review");
    expect(names).toContain("reject_review");
    expect(names).toContain("consult_role");
    // Brief 040 — 7 new tools
    expect(names).toContain("create_work_item");
    expect(names).toContain("generate_process");
    expect(names).toContain("quick_capture");
    expect(names).toContain("adjust_trust");
    expect(names).toContain("get_process_detail");
    expect(names).toContain("connect_service");
    expect(names).toContain("update_user_model");
  });

  it("start_dev_role accepts all 7 roles", () => {
    const startTool = selfTools.find((t) => t.name === "start_dev_role")!;
    const roleEnum = (startTool.input_schema as any).properties.role.enum;
    expect(roleEnum).toContain("pm");
    expect(roleEnum).toContain("researcher");
    expect(roleEnum).toContain("designer");
    expect(roleEnum).toContain("architect");
    expect(roleEnum).toContain("builder");
    expect(roleEnum).toContain("reviewer");
    expect(roleEnum).toContain("documenter");
    expect(roleEnum).toHaveLength(7);
  });
});

// ============================================================
// Delegation Execution (AC6 — tool mapping)
// ============================================================

describe("executeDelegation", () => {
  it("rejects invalid role", async () => {
    const result = await executeDelegation("start_dev_role", { role: "hacker", task: "test" });
    expect(result.success).toBe(false);
    expect(result.output).toContain("Invalid role");
  });

  it("handles unknown tool name", async () => {
    const result = await executeDelegation("unknown_tool", {});
    expect(result.success).toBe(false);
    expect(result.output).toContain("Unknown tool");
  });

  it("maps role to correct process slug", async () => {
    // Create the standalone process
    testDb.insert(schema.processes).values({
      id: randomUUID(),
      name: "Dev PM (Standalone)",
      slug: "dev-pm-standalone",
      status: "active",
      definition: {
        name: "Dev PM (Standalone)",
        id: "dev-pm-standalone",
        steps: [{ id: "pm-execute", name: "PM Execute", executor: "cli-agent", agent_role: "pm" }],
      },
    }).run();

    // This will fail at the heartbeat stage (no real agent) but proves the mapping works
    const result = await executeDelegation("start_dev_role", { role: "pm", task: "triage next work" });
    // The function should attempt to start a process run — it will fail at execution
    // but the process slug mapping (dev-pm-standalone) is correct
    expect(result.toolName).toBe("start_dev_role");
    // Either success (if the process runs to completion somehow) or failure with process-related error
    // The key test is that it didn't fail with "Process not found" — the slug mapping works
    expect(result.output).not.toContain("Process not found: dev-pm-standalone");
  });
});

// ============================================================
// Context Assembly (AC1)
// ============================================================

describe("assembleSelfContext", () => {
  it("assembles context with cognitive framework", async () => {
    const context = await assembleSelfContext("creator", "telegram");
    expect(context.systemPrompt).toContain("Ditto");
    expect(context.sessionId).toBeTruthy();
  });

  it("includes self-scoped memories in <memories> block", async () => {
    // Insert a self-scoped memory
    testDb.insert(schema.memories).values({
      id: randomUUID(),
      scopeType: "self",
      scopeId: "creator",
      type: "preference",
      content: "Prefers direct communication",
      source: "human",
      reinforcementCount: 3,
      confidence: 0.8,
      active: true,
    }).run();

    const context = await assembleSelfContext("creator", "telegram");
    expect(context.systemPrompt).toContain("<memories>");
    expect(context.systemPrompt).toContain("Prefers direct communication");
    expect(context.systemPrompt).toContain("</memories>");
  });

  it("includes work state in <work_state> block", async () => {
    const context = await assembleSelfContext("creator", "telegram");
    expect(context.systemPrompt).toContain("<work_state>");
    expect(context.systemPrompt).toContain("</work_state>");
  });

  it("includes surface and session info in <context> block", async () => {
    const context = await assembleSelfContext("creator", "telegram");
    expect(context.systemPrompt).toContain("<context>");
    expect(context.systemPrompt).toContain("Surface: telegram");
    expect(context.systemPrompt).toContain("</context>");
  });

  it("creates a new session on first call", async () => {
    const context = await assembleSelfContext("creator", "telegram");
    expect(context.resumed).toBe(false);
    expect(context.sessionId).toBeTruthy();
  });

  it("fits within ~4K token budget", async () => {
    const context = await assembleSelfContext("creator", "telegram");
    // 4K tokens * 4 chars/token = 16K chars
    expect(context.systemPrompt.length).toBeLessThanOrEqual(16000);
  });
});

// ============================================================
// Brief 034a: Consultation Tool (AC1, AC2, AC6)
// ============================================================

describe("consult_role tool definition", () => {
  it("selfTools contains 12 tools including consult_role", () => {
    expect(selfTools).toHaveLength(12);
    const names = selfTools.map((t) => t.name);
    expect(names).toContain("consult_role");
  });

  it("consult_role accepts role enum, question, and optional context", () => {
    const consultTool = selfTools.find((t) => t.name === "consult_role")!;
    const props = (consultTool.input_schema as any).properties;
    expect(props.role.enum).toHaveLength(7);
    expect(props.question.type).toBe("string");
    expect(props.context.type).toBe("string");
    expect((consultTool.input_schema as any).required).toEqual(["role", "question"]);
  });

  it("consult_role with invalid role returns graceful error", async () => {
    const result = await executeDelegation("consult_role", {
      role: "hacker",
      question: "Is this a good idea?",
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain("Invalid role");
    expect(result.output).toContain("hacker");
  });

  it("consult_role calls createCompletion and returns role perspective", async () => {
    // Mock LLM response
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: "This approach looks sound. The scope is well-contained." }],
      costCents: 1,
      tokensUsed: 50,
      stopReason: "end_turn",
    });
    mockExtractText.mockReturnValueOnce("This approach looks sound. The scope is well-contained.");

    const result = await executeDelegation("consult_role", {
      role: "architect",
      question: "Does this design make sense?",
      context: "We're adding a metacognitive check handler",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("[architect perspective]");
    expect(result.output).toContain("This approach looks sound");
    expect(result.costCents).toBe(1);

    // Verify createCompletion was called with right shape
    expect(mockCreateCompletion).toHaveBeenCalledOnce();
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(1024);
    expect(callArgs.system).toContain("consulted briefly");
    expect(callArgs.messages[0].content).toContain("Does this design make sense?");
    expect(callArgs.messages[0].content).toContain("metacognitive check handler");

    mockCreateCompletion.mockReset();
    mockExtractText.mockReset();
  });
});

// ============================================================
// Brief 034a: Self Decision Tracking (AC9, AC13)
// ============================================================

describe("recordSelfDecision", () => {
  it("creates an activity record for delegation decision", async () => {
    await recordSelfDecision({
      decisionType: "delegation",
      details: { role: "pm", task: "triage next work" },
      costCents: 0,
    });

    const activities = testDb
      .select()
      .from(schema.activities)
      .all();
    expect(activities).toHaveLength(1);
    expect(activities[0].action).toBe("self.decision.delegation");
    expect((activities[0].metadata as any).role).toBe("pm");
  });

  it("creates an activity record for consultation decision", async () => {
    await recordSelfDecision({
      decisionType: "consultation",
      details: { role: "architect", question: "Does this make sense?", responseLength: 150 },
      costCents: 2,
    });

    const activities = testDb
      .select()
      .from(schema.activities)
      .all();
    expect(activities).toHaveLength(1);
    expect(activities[0].action).toBe("self.decision.consultation");
    expect((activities[0].metadata as any).role).toBe("architect");
    expect((activities[0].metadata as any).costCents).toBe(2);
  });

  it("creates an activity record for inline response", async () => {
    await recordSelfDecision({
      decisionType: "inline_response",
      details: { responseLength: 42 },
      costCents: 1,
    });

    const activities = testDb
      .select()
      .from(schema.activities)
      .all();
    expect(activities).toHaveLength(1);
    expect(activities[0].action).toBe("self.decision.inline_response");
  });
});

// ============================================================
// Brief 034a: Self Redirect Detection (AC11)
// ============================================================

describe("detectSelfRedirect", () => {
  it("detects negation + role keyword as redirect", () => {
    const result = detectSelfRedirect("No, I meant research on this topic");
    expect(result.isRedirect).toBe(true);
    expect(result.mentionedRole).toBe("research");
  });

  it("does not flag messages without negation", () => {
    const result = detectSelfRedirect("Let's do some research");
    expect(result.isRedirect).toBe(false);
  });

  it("does not flag negation without role keywords", () => {
    const result = detectSelfRedirect("No, that's not what I meant");
    expect(result.isRedirect).toBe(false);
  });

  it("detects 'actually' as negation keyword", () => {
    const result = detectSelfRedirect("Actually, this needs the architect");
    expect(result.isRedirect).toBe(true);
    expect(result.mentionedRole).toBe("architect");
  });

  it("detects 'instead' as negation keyword", () => {
    const result = detectSelfRedirect("Use the builder instead");
    expect(result.isRedirect).toBe(true);
    expect(result.mentionedRole).toBe("builder");
  });
});

// ============================================================
// Brief 034a: Self Correction Memories (AC11, AC12)
// ============================================================

describe("recordSelfCorrection", () => {
  it("creates a self-scoped correction memory", async () => {
    await recordSelfCorrection("creator", "pm", "architect", "design the auth system");

    const memories = testDb
      .select()
      .from(schema.memories)
      .all();
    expect(memories).toHaveLength(1);
    expect(memories[0].scopeType).toBe("self");
    expect(memories[0].scopeId).toBe("creator");
    expect(memories[0].type).toBe("correction");
    expect(memories[0].content).toContain("Self delegated to pm");
    expect(memories[0].content).toContain("human wanted architect");
    expect(memories[0].confidence).toBe(0.3);
  });

  it("reinforces existing correction memory on duplicate", async () => {
    await recordSelfCorrection("creator", "pm", "architect", "design the auth system");

    // Verify first insert worked (test-utils defaults reinforcementCount to 1)
    const first = testDb.select().from(schema.memories).all();
    expect(first).toHaveLength(1);
    const initialCount = first[0].reinforcementCount;

    await recordSelfCorrection("creator", "pm", "architect", "design the auth system");

    const memories = testDb
      .select()
      .from(schema.memories)
      .all();
    // Should still be 1 memory (deduplicated), with incremented count
    expect(memories).toHaveLength(1);
    expect(memories[0].reinforcementCount).toBe(initialCount + 1);
    expect(memories[0].confidence).toBeGreaterThan(0.3);
  });

  it("self-correction memories are loaded by loadSelfMemories", async () => {
    await recordSelfCorrection("creator", "pm", "architect", "design the auth system");

    const result = await loadSelfMemories("creator");
    expect(result).toContain("Self delegated to pm");
    expect(result).toContain("human wanted architect");
  });
});

// ============================================================
// Brief 034a: Delegation Guidance Update (AC8)
// ============================================================

describe("delegation guidance includes consultation", () => {
  it("system prompt includes consult_role guidance", async () => {
    const context = await assembleSelfContext("creator", "telegram");
    expect(context.systemPrompt).toContain("consult_role");
    expect(context.systemPrompt).toContain("Consultation");
    expect(context.systemPrompt).toContain("second opinion");
  });
});

// ============================================================
// Brief 031: Standalone YAML validation
// ============================================================

describe("standalone YAML structure (Brief 031)", () => {
  // Load YAML files to verify they have the right executor and config
  const yaml = require("yaml");
  const fs = require("fs");
  const path = require("path");
  const processDir = path.resolve(__dirname, "../../processes");

  const readOnlyRoles = ["pm", "researcher", "designer", "reviewer"];
  const readWriteRoles = ["architect", "builder", "documenter"];

  for (const role of readOnlyRoles) {
    it(`dev-${role}-standalone uses ai-agent with read-only tools`, () => {
      const content = fs.readFileSync(
        path.join(processDir, `dev-${role}-standalone.yaml`),
        "utf-8"
      );
      const def = yaml.parse(content);
      const step = def.steps[0];
      expect(step.executor).toBe("ai-agent");
      expect(step.config.tools).toBe("read-only");
      expect(step.config.role_contract).toContain(`dev-${role}.md`);
      // No repository input
      const repoInput = def.inputs?.find((i: { type: string }) => i.type === "repository");
      expect(repoInput).toBeUndefined();
    });
  }

  for (const role of readWriteRoles) {
    it(`dev-${role}-standalone uses ai-agent with read-write tools`, () => {
      const content = fs.readFileSync(
        path.join(processDir, `dev-${role}-standalone.yaml`),
        "utf-8"
      );
      const def = yaml.parse(content);
      const step = def.steps[0];
      expect(step.executor).toBe("ai-agent");
      expect(step.config.tools).toBe("read-write");
      expect(step.config.role_contract).toContain(`dev-${role}.md`);
      // No repository input
      const repoInput = def.inputs?.find((i: { type: string }) => i.type === "repository");
      expect(repoInput).toBeUndefined();
    });
  }

  it("all standalone YAMLs are version 2", () => {
    const allRoles = [...readOnlyRoles, ...readWriteRoles];
    for (const role of allRoles) {
      const content = fs.readFileSync(
        path.join(processDir, `dev-${role}-standalone.yaml`),
        "utf-8"
      );
      const def = yaml.parse(content);
      expect(def.version).toBe(2);
    }
  });
});
