/**
 * Tests for LLM-powered goal decomposition (Brief 102)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import type { DimensionMap, GoalDecompositionResult } from "@ditto/core";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Mock LLM to return structured decomposition
const mockCreateCompletion = vi.fn();
vi.mock("../llm", () => ({
  createCompletion: (...args: unknown[]) => mockCreateCompletion(...args),
  extractText: (content: Array<{ type: string; text?: string }>) => {
    const textBlock = content.find((b: { type: string }) => b.type === "text");
    return textBlock && "text" in textBlock ? (textBlock as { text: string }).text : "";
  },
}));

// Mock web search
vi.mock("../web-search", () => ({
  webSearch: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;

  // Default LLM response: valid decomposition
  mockCreateCompletion.mockResolvedValue({
    content: [{
      type: "text",
      text: JSON.stringify({
        subGoals: [
          {
            title: "Research market landscape",
            description: "Understand the competitive landscape and identify opportunities",
            dependsOn: [],
            estimatedComplexity: "medium",
          },
          {
            title: "Define service offerings",
            description: "Create a clear service menu based on market research",
            dependsOn: [0],
            estimatedComplexity: "medium",
          },
          {
            title: "Build client acquisition pipeline",
            description: "Set up lead generation and outreach processes",
            dependsOn: [1],
            estimatedComplexity: "high",
          },
          {
            title: "Establish delivery framework",
            description: "Create standard delivery processes for consulting engagements",
            dependsOn: [1],
            estimatedComplexity: "high",
          },
        ],
        assumptions: [
          "The user has domain expertise in their consulting area",
          "An initial client pipeline of contacts exists",
          "Budget is available for marketing and tools",
        ],
        confidence: "medium",
        reasoning: "Decomposed into four phases: research, define, acquire, deliver. Research must come first to inform service design.",
      }),
    }],
    tokensUsed: 500,
    costCents: 2,
    stopReason: "end_turn",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Goal decomposition — decomposeGoalWithLLM", () => {
  it("produces GoalDecomposition with sub-goals, dependencies, and assumptions (AC1)", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    // Add some processes to the inventory
    await testDb.insert(schema.processes).values({
      name: "Person Research",
      slug: "person-research",
      description: "Research a person's background",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "Build consulting business" },
        { dimension: "assets", level: "partial", evidence: "Has domain expertise" },
        { dimension: "constraints", level: "partial", evidence: "$10k/month target" },
        { dimension: "context", level: "partial", evidence: "Professional services" },
        { dimension: "infrastructure", level: "unknown", evidence: "" },
        { dimension: "risk_tolerance", level: "unknown", evidence: "" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-1",
      goalDescription: "Build a freelance consulting business delivering $10k/month",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    expect(result.ready).toBe(true);
    if (!result.ready) return;

    const decomp = result.decomposition;
    expect(decomp.subGoals.length).toBeGreaterThanOrEqual(3);
    expect(decomp.subGoals.length).toBeLessThanOrEqual(8);
    expect(decomp.assumptions.length).toBeGreaterThan(0);
    expect(decomp.confidence).toBe("medium");
    expect(decomp.reasoning.length).toBeGreaterThan(0);
    expect(decomp.goalId).toBe("goal-1");
  });

  it("tags each sub-goal as find or build (AC2)", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    // Add a process that matches "research"
    await testDb.insert(schema.processes).values({
      name: "Market Research",
      slug: "market-research",
      description: "Research market landscape and competitive analysis",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "partial", evidence: "test" },
        { dimension: "constraints", level: "partial", evidence: "test" },
        { dimension: "context", level: "partial", evidence: "test" },
        { dimension: "infrastructure", level: "partial", evidence: "test" },
        { dimension: "risk_tolerance", level: "partial", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-2",
      goalDescription: "Build a consulting business",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    expect(result.ready).toBe(true);
    if (!result.ready) return;

    // Each sub-goal should have a routing tag
    for (const sg of result.decomposition.subGoals) {
      expect(["find", "build"]).toContain(sg.routing);
    }

    // "Research market landscape" should be tagged "find" (matches market-research process)
    const researchGoal = result.decomposition.subGoals.find(
      sg => sg.title.toLowerCase().includes("research"),
    );
    expect(researchGoal?.routing).toBe("find");
  });

  it("returns clarity-needed when outcome is vague (AC4, AC5)", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    const vagueMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "vague", evidence: "Wants something better" },
        { dimension: "assets", level: "unknown", evidence: "" },
        { dimension: "constraints", level: "unknown", evidence: "" },
        { dimension: "context", level: "unknown", evidence: "" },
        { dimension: "infrastructure", level: "unknown", evidence: "" },
        { dimension: "risk_tolerance", level: "unknown", evidence: "" },
      ],
      overallClarity: "vague",
      readyToDecompose: false,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-3",
      goalDescription: "I want better onboarding",
      dimensionMap: vagueMap,
      enableWebSearch: false,
    });

    expect(result.ready).toBe(false);
    if (result.ready) return;

    expect(result.questions.length).toBeGreaterThan(0);
    // Should include outcome question since it's vague
    const outcomeQ = result.questions.find(q => q.dimension === "outcome");
    expect(outcomeQ).toBeDefined();
    expect(outcomeQ!.question.length).toBeGreaterThan(0);
  });

  it("includes assumptions as explicit strings (AC7)", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "partial", evidence: "test" },
        { dimension: "constraints", level: "partial", evidence: "test" },
        { dimension: "context", level: "partial", evidence: "test" },
        { dimension: "infrastructure", level: "partial", evidence: "test" },
        { dimension: "risk_tolerance", level: "partial", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-4",
      goalDescription: "Build a consulting business",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    expect(result.ready).toBe(true);
    if (!result.ready) return;

    // Assumptions should be strings, not objects
    for (const assumption of result.decomposition.assumptions) {
      expect(typeof assumption).toBe("string");
      expect(assumption.length).toBeGreaterThan(0);
    }
  });

  it("respects dependency ordering between sub-goals (AC1 detail)", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "partial", evidence: "test" },
        { dimension: "constraints", level: "partial", evidence: "test" },
        { dimension: "context", level: "partial", evidence: "test" },
        { dimension: "infrastructure", level: "partial", evidence: "test" },
        { dimension: "risk_tolerance", level: "partial", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-5",
      goalDescription: "Build a consulting business",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    expect(result.ready).toBe(true);
    if (!result.ready) return;

    const subGoals = result.decomposition.subGoals;

    // First sub-goal should have no dependencies
    expect(subGoals[0].dependsOn).toEqual([]);

    // Second sub-goal should depend on first
    expect(subGoals[1].dependsOn).toContain(subGoals[0].id);

    // Dependencies should reference valid sub-goal IDs
    const allIds = new Set(subGoals.map(sg => sg.id));
    for (const sg of subGoals) {
      for (const depId of sg.dependsOn) {
        expect(allIds.has(depId)).toBe(true);
      }
    }
  });

  it("tracks web search usage count (AC14)", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "partial", evidence: "test" },
        { dimension: "constraints", level: "partial", evidence: "test" },
        { dimension: "context", level: "partial", evidence: "test" },
        { dimension: "infrastructure", level: "partial", evidence: "test" },
        { dimension: "risk_tolerance", level: "partial", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-6",
      goalDescription: "Build a consulting business",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    expect(result.ready).toBe(true);
    if (!result.ready) return;

    // Web search disabled — should be 0
    expect(result.decomposition.webSearchesUsed).toBe(0);
  });

  it("falls back gracefully when LLM returns unparseable response", async () => {
    const { decomposeGoalWithLLM } = await import("./goal-decomposition");

    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not JSON at all" }],
      tokensUsed: 100,
      costCents: 1,
      stopReason: "end_turn",
    });

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "partial", evidence: "test" },
        { dimension: "constraints", level: "partial", evidence: "test" },
        { dimension: "context", level: "partial", evidence: "test" },
        { dimension: "infrastructure", level: "partial", evidence: "test" },
        { dimension: "risk_tolerance", level: "partial", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await decomposeGoalWithLLM({
      goalId: "goal-7",
      goalDescription: "Build a consulting business",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    // Should still succeed with a fallback single sub-goal
    expect(result.ready).toBe(true);
    if (!result.ready) return;

    expect(result.decomposition.subGoals).toHaveLength(1);
    expect(result.decomposition.confidence).toBe("low");
    expect(result.decomposition.assumptions).toContain(
      "LLM decomposition failed — falling back to single sub-goal",
    );
  });
});

describe("Goal decomposition — orchestrator integration", () => {
  it("existing 1:1 decomposition path works unchanged with process slug (AC9)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const processDef = makeTestProcessDefinition({
      name: "Test Pipeline",
      id: "test-pipeline",
      steps: [
        { id: "step-1", name: "Research", executor: "script", commands: ["echo research"] },
        { id: "step-2", name: "Build", executor: "script", depends_on: ["step-1"], commands: ["echo build"] },
      ],
    });

    await testDb.insert(schema.processes).values({
      name: "Test Pipeline",
      slug: "test-pipeline",
      definition: processDef as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "Build the feature",
      source: "capture",
    }).returning();

    // Fast path: goal WITH process slug
    const result = await executeOrchestrator({
      processSlug: "test-pipeline",
      workItemId: goalItem.id,
      content: "Build the feature",
      workItemType: "goal",
    });

    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      tasks: Array<{ taskId: string; stepId: string }>;
    };

    // Should use the existing step-based decomposition, not LLM
    expect(orchestration.action).toBe("decomposed");
    expect(orchestration.tasks).toHaveLength(2);
    expect(orchestration.tasks[0].stepId).toBe("step-1");
    expect(orchestration.tasks[1].stepId).toBe("step-2");
  });

  it("uses LLM decomposition when goal has no process slug (AC9)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "Build a freelance consulting business delivering $10k/month",
      source: "capture",
    }).returning();

    const clearMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "$10k/month consulting" },
        { dimension: "assets", level: "partial", evidence: "Has expertise" },
        { dimension: "constraints", level: "partial", evidence: "6 month timeline" },
        { dimension: "context", level: "partial", evidence: "Professional services" },
        { dimension: "infrastructure", level: "unknown", evidence: "" },
        { dimension: "risk_tolerance", level: "unknown", evidence: "" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    const result = await executeOrchestrator({
      workItemId: goalItem.id,
      content: "Build a freelance consulting business delivering $10k/month",
      workItemType: "goal",
      dimensionMap: clearMap,
      enableWebSearch: false,
    });

    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      goalDecompositionResult?: { ready: boolean };
    };

    expect(orchestration.action).toBe("decomposed");
    expect(orchestration.goalDecompositionResult).toBeDefined();
    expect(orchestration.goalDecompositionResult!.ready).toBe(true);
  });

  it("escalates with clarity questions when outcome is vague (AC5)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const vagueMap: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "vague", evidence: "Wants improvement" },
        { dimension: "assets", level: "unknown", evidence: "" },
        { dimension: "constraints", level: "unknown", evidence: "" },
        { dimension: "context", level: "unknown", evidence: "" },
        { dimension: "infrastructure", level: "unknown", evidence: "" },
        { dimension: "risk_tolerance", level: "unknown", evidence: "" },
      ],
      overallClarity: "vague",
      readyToDecompose: false,
    };

    const result = await executeOrchestrator({
      workItemId: "test-goal",
      content: "I want better onboarding",
      workItemType: "goal",
      dimensionMap: vagueMap,
    });

    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      escalation?: { openQuestions?: string[] };
    };

    expect(orchestration.action).toBe("escalated");
    expect(orchestration.escalation?.openQuestions).toBeDefined();
    expect(orchestration.escalation!.openQuestions!.length).toBeGreaterThan(0);
  });
});
