/**
 * Tests for Brief 040 — Self Extension Tools
 *
 * Tests new Self tools: create_work_item, quick_capture, generate_process,
 * adjust_trust, get_process_detail, connect_service.
 * Also tests user-model.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mock
const { handleCreateWorkItem } = await import("./create-work-item");
const { handleQuickCapture } = await import("./quick-capture");
const { handleGenerateProcess } = await import("./generate-process");
const { handleAdjustTrust } = await import("./adjust-trust");
const { handleGetProcessDetail } = await import("./get-process-detail");
const { getUserModel, updateUserModel, getUserModelSummary } = await import("../user-model");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// create_work_item
// ============================================================

describe("create_work_item", () => {
  it("creates work item and classifies it", async () => {
    const result = await handleCreateWorkItem({
      content: "How do I connect GitHub?",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("create_work_item");

    const parsed = JSON.parse(result.output);
    expect(parsed.id).toBeDefined();
    expect(parsed.type).toBe("question"); // "How" triggers question classifier
    expect(parsed.status).toBe("intake");
  });

  it("classifies a task correctly", async () => {
    const result = await handleCreateWorkItem({
      content: "Send the Henderson quote by Friday",
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    // "by Friday" triggers outcome pattern
    expect(["task", "outcome"]).toContain(parsed.type);
  });

  it("rejects empty content", async () => {
    const result = await handleCreateWorkItem({ content: "" });
    expect(result.success).toBe(false);
  });

  it("stores goal ancestry when provided", async () => {
    const result = await handleCreateWorkItem({
      content: "Review the pricing",
      goalContext: "win-henderson-project",
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);

    // Verify in DB
    const [item] = await testDb
      .select()
      .from(schema.workItems)
      .where(require("drizzle-orm").eq(schema.workItems.id, parsed.id))
      .limit(1);

    expect(item.goalAncestry).toEqual(["win-henderson-project"]);
  });
});

// ============================================================
// quick_capture
// ============================================================

describe("quick_capture", () => {
  it("captures text as work item", async () => {
    const result = await handleQuickCapture({
      text: "Copper prices went up 20%",
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.id).toBeDefined();
    expect(parsed.message).toBe("Captured and classified.");
  });

  it("rejects empty text", async () => {
    const result = await handleQuickCapture({ text: "" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// generate_process
// ============================================================

describe("generate_process", () => {
  it("previews process YAML without saving", async () => {
    const result = await handleGenerateProcess({
      name: "Quote Generation",
      description: "Generate quotes for plumbing jobs",
      steps: [
        { id: "gather-info", name: "Gather Info", executor: "human" },
        { id: "generate-quote", name: "Generate Quote", executor: "ai-agent" },
        { id: "review", name: "Review Quote", executor: "human" },
      ],
      save: false,
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.action).toBe("preview");
    expect(parsed.slug).toBe("quote-generation");
    expect(parsed.stepCount).toBe(3);
    expect(parsed.yaml).toContain("Quote Generation");
  });

  it("saves process to DB when save=true", async () => {
    const result = await handleGenerateProcess({
      name: "Invoice Review",
      description: "Review invoices before sending",
      steps: [
        { id: "check-totals", name: "Check Totals", executor: "ai-agent" },
      ],
      save: true,
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.action).toBe("saved");
    expect(parsed.status).toBe("draft");

    // Verify in DB
    const { eq } = await import("drizzle-orm");
    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "invoice-review"))
      .limit(1);

    expect(proc).toBeDefined();
    expect(proc.name).toBe("Invoice Review");
    expect(proc.status).toBe("draft");
  });

  it("rejects duplicate slugs", async () => {
    // Save first
    await handleGenerateProcess({
      name: "My Process",
      description: "Test",
      steps: [{ id: "step-1", name: "Step", executor: "ai-agent" }],
      save: true,
    });

    // Try to save again with same name
    const result = await handleGenerateProcess({
      name: "My Process",
      description: "Duplicate",
      steps: [{ id: "step-1", name: "Step", executor: "ai-agent" }],
      save: true,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("already exists");
  });

  it("validates step definitions", async () => {
    const result = await handleGenerateProcess({
      name: "Bad Process",
      description: "Invalid",
      steps: [
        { id: "step-1", name: "Step", executor: "invalid-executor" },
      ],
      save: false,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("invalid executor");
  });
});

// ============================================================
// adjust_trust (proposal mode)
// ============================================================

describe("adjust_trust", () => {
  it("returns proposal with evidence when confirmed=false", async () => {
    // Create a process first
    await testDb.insert(schema.processes).values({
      id: "test-proc-id",
      name: "Test Process",
      slug: "test-process",
      version: 1,
      status: "active",
      description: "Test",
      trustTier: "supervised",
      definition: {},
    });

    const result = await handleAdjustTrust({
      processSlug: "test-process",
      newTier: "spot_checked",
      reason: "Good track record",
      confirmed: false,
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.action).toBe("proposal");
    expect(parsed.currentTier).toBe("supervised");
    expect(parsed.proposedTier).toBe("spot_checked");
    expect(parsed.evidence).toBeDefined();
  });

  it("applies change when confirmed=true", async () => {
    await testDb.insert(schema.processes).values({
      id: "test-proc-id-2",
      name: "Test Process 2",
      slug: "test-process-2",
      version: 1,
      status: "active",
      description: "Test",
      trustTier: "supervised",
      definition: {},
    });

    const result = await handleAdjustTrust({
      processSlug: "test-process-2",
      newTier: "spot_checked",
      reason: "Good track record",
      confirmed: true,
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.action).toBe("applied");
    expect(parsed.toTier).toBe("spot_checked");

    // Verify in DB
    const { eq } = await import("drizzle-orm");
    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "test-process-2"))
      .limit(1);

    expect(proc.trustTier).toBe("spot_checked");
  });

  it("rejects invalid tier", async () => {
    const result = await handleAdjustTrust({
      processSlug: "test",
      newTier: "invalid_tier",
      reason: "Test",
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("Invalid tier");
  });

  it("rejects non-existent process", async () => {
    const result = await handleAdjustTrust({
      processSlug: "nonexistent",
      newTier: "autonomous",
      reason: "Test",
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });
});

// ============================================================
// get_process_detail
// ============================================================

describe("get_process_detail", () => {
  it("returns process detail with trust data", async () => {
    await testDb.insert(schema.processes).values({
      id: "detail-proc-id",
      name: "Detail Process",
      slug: "detail-process",
      version: 1,
      status: "active",
      description: "Test process for detail",
      trustTier: "supervised",
      definition: {
        steps: [
          { id: "step-1", name: "First Step", executor: "ai-agent" },
          { id: "step-2", name: "Second Step", executor: "human" },
        ],
      },
    });

    const result = await handleGetProcessDetail({
      processSlug: "detail-process",
    });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.name).toBe("Detail Process");
    expect(parsed.trustTier).toBe("supervised");
    expect(parsed.trust).toBeDefined();
    expect(parsed.trust.approvalRate).toBeDefined();
    expect(parsed.trust.trend).toBeDefined();
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.recentRuns).toBeDefined();
  });

  it("returns error for non-existent process", async () => {
    const result = await handleGetProcessDetail({
      processSlug: "nonexistent",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });
});

// ============================================================
// user-model.ts
// ============================================================

describe("user-model", () => {
  it("starts empty for new user", async () => {
    const model = await getUserModel("new-user");
    expect(model.entries).toHaveLength(0);
    expect(model.completeness).toBe(0);
    expect(model.missingDimensions).toHaveLength(9);
  });

  it("stores and retrieves a dimension", async () => {
    await updateUserModel("user-1", "problems", "Quoting takes too long, staff idle while waiting");

    const model = await getUserModel("user-1");
    expect(model.entries).toHaveLength(1);
    expect(model.entries[0].dimension).toBe("problems");
    expect(model.entries[0].content).toBe("Quoting takes too long, staff idle while waiting");
    expect(model.populatedDimensions).toContain("problems");
    expect(model.missingDimensions).not.toContain("problems");
  });

  it("reinforces existing dimension", async () => {
    await updateUserModel("user-2", "tasks", "Quote for Henderson bathroom");
    await updateUserModel("user-2", "tasks", "Quote for Henderson bathroom and kitchen");

    const model = await getUserModel("user-2");
    // Should have 1 entry (updated, not duplicated)
    expect(model.entries).toHaveLength(1);
    expect(model.entries[0].content).toBe("Quote for Henderson bathroom and kitchen");
    expect(model.entries[0].confidence).toBeGreaterThan(0.5); // Reinforced
  });

  it("tracks multiple dimensions", async () => {
    await updateUserModel("user-3", "problems", "Manual quoting slow");
    await updateUserModel("user-3", "work", "Plumbing company, 12 staff");
    await updateUserModel("user-3", "goals", "Automate 80% of quoting");

    const model = await getUserModel("user-3");
    expect(model.entries).toHaveLength(3);
    expect(model.completeness).toBeCloseTo(3 / 9, 2);
    expect(model.populatedDimensions).toEqual(
      expect.arrayContaining(["problems", "work", "goals"]),
    );
  });

  it("generates summary", async () => {
    await updateUserModel("user-4", "problems", "Quoting is slow");
    await updateUserModel("user-4", "tasks", "Henderson bathroom reno");

    const summary = await getUserModelSummary("user-4");
    expect(summary).toContain("[problems]");
    expect(summary).toContain("[tasks]");
    expect(summary).toContain("22%"); // 2/9 completeness
    expect(summary).toContain("Not yet explored");
  });

  it("returns new-user message when empty", async () => {
    const summary = await getUserModelSummary("empty-user");
    expect(summary).toContain("No user model yet");
  });
});

// ============================================================
// self-delegation tool definitions
// ============================================================

describe("selfTools definitions", () => {
  it("has 32 tools (5 original + 1 Brief 052 + 7 Brief 040 + 1 Brief 074 + 3 Brief 043 + 1 Brief 044 + 3 Brief 164 + 1 Brief 068 + 1 Brief 079 + 5 Brief 118 + 2 Brief 131 + 1 Brief 134)", async () => {
    const { selfTools } = await import("../self-delegation");
    expect(selfTools).toHaveLength(32);

    const names = selfTools.map((t) => t.name);
    // Original 5
    expect(names).toContain("start_dev_role");
    expect(names).toContain("approve_review");
    expect(names).toContain("edit_review");
    expect(names).toContain("reject_review");
    expect(names).toContain("consult_role");
    // Brief 040 (6 from brief + update_user_model)
    expect(names).toContain("create_work_item");
    expect(names).toContain("generate_process");
    expect(names).toContain("quick_capture");
    expect(names).toContain("adjust_trust");
    expect(names).toContain("get_process_detail");
    expect(names).toContain("connect_service");
    expect(names).toContain("update_user_model");
    // Brief 043 — Proactive Engine
    expect(names).toContain("get_briefing");
    expect(names).toContain("detect_risks");
    expect(names).toContain("suggest_next");
    // Brief 044 — Onboarding Experience
    expect(names).toContain("adapt_process");
    // Brief 164 — Process Editing & Versioning
    expect(names).toContain("edit_process");
    expect(names).toContain("process_history");
    expect(names).toContain("rollback_process");
    // Brief 068 — Confidence Assessment
    expect(names).toContain("assess_confidence");
    // Brief 074 — Goal Pause
    expect(names).toContain("pause_goal");
    // Brief 079 — Knowledge Base
    expect(names).toContain("search_knowledge");
    // Brief 131 — Self Cognitive Orchestration
    expect(names).toContain("orchestrate_work");
    expect(names).toContain("generate_chat_link");
  });

  it("all tools have valid schemas", async () => {
    const { selfTools } = await import("../self-delegation");
    for (const tool of selfTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.properties).toBeDefined();
    }
  });
});

// ============================================================
// Brief 069: Tool output structures support block mapping
// ============================================================

describe("tool return structures for block mapping (Brief 069)", () => {
  it("get_process_detail returns JSON with trust object for RecordBlock + MetricBlock", async () => {
    await testDb.insert(schema.processes).values({
      id: "block-test-proc",
      name: "Block Test",
      slug: "block-test",
      version: 1,
      status: "active",
      description: "Test",
      trustTier: "supervised",
      definition: { steps: [{ id: "s1", name: "Step", executor: "ai-agent" }] },
    });

    const result = await handleGetProcessDetail({ processSlug: "block-test" });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    // Fields required by RecordBlock mapping
    expect(parsed.name).toBe("Block Test");
    expect(parsed.slug).toBe("block-test");
    expect(parsed.status).toBe("active");
    expect(parsed.trustTier).toBe("supervised");
    // Trust object required by MetricBlock mapping
    expect(parsed.trust).toBeDefined();
    expect(typeof parsed.trust.approvalRate).toBe("number");
    expect(parsed.trust.trend).toBeDefined();
    expect(parsed.steps).toBeDefined();
    expect(parsed.recentRuns).toBeDefined();
  });

  it("adjust_trust proposal returns JSON with trust evidence for RecordBlock", async () => {
    await testDb.insert(schema.processes).values({
      id: "trust-block-proc",
      name: "Trust Block",
      slug: "trust-block",
      version: 1,
      status: "active",
      description: "Test",
      trustTier: "supervised",
      definition: {},
    });

    const result = await handleAdjustTrust({
      processSlug: "trust-block",
      newTier: "spot_checked",
      reason: "Test",
      confirmed: false,
    });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    // Fields required by RecordBlock + ChecklistBlock + StatusCardBlock mapping
    expect(parsed.action).toBe("proposal");
    expect(parsed.processName).toBeDefined();
    expect(parsed.currentTier).toBe("supervised");
    expect(parsed.proposedTier).toBe("spot_checked");
    expect(parsed.trust).toBeDefined();
    expect(typeof parsed.trust.approvalRate).toBe("number");
  });

  it("quick_capture returns JSON with type for KnowledgeCitationBlock", async () => {
    const result = await handleQuickCapture({ text: "Check the pricing" });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    // Fields required by StatusCardBlock + KnowledgeCitationBlock mapping
    expect(parsed.id).toBeDefined();
    expect(parsed.type).toBeDefined();
    expect(["task", "note", "goal", "insight", "question"]).toContain(parsed.type);
  });
});
