/**
 * Tests for Knowledge Extractor system agents (Brief 060)
 *
 * Tests cover:
 * - Registry resolution of all 4 knowledge extractor handlers
 * - Related finder: SQL-based deduplication (AC7)
 * - Overlap assessment: high/moderate/low/none classification
 * - Knowledge assembler: create/reinforce/supersede logic (AC8)
 * - Solution memory creation at confidence 0.5 (AC11)
 * - Confidence decay after 50 runs without retrieval (AC12)
 * - Supersession of stale solutions (AC13)
 * - Significance threshold logic (AC5)
 * - Trust-tier-aware scaling (AC6)
 * - Memory assembly solution knowledge budget (AC9-10)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";
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

// Mock Anthropic SDK (required by import chain)
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

// Mock LLM for context-analyzer and solution-extractor
vi.mock("../llm", () => ({
  createCompletion: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: '{"category":"quality_correction","tags":["test"],"severity":"moderate"}' }],
    tokensUsed: 100,
    costCents: 1,
    stopReason: "end_turn",
    model: "mock-model",
  }),
  extractText: vi.fn((content: Array<{ type: string; text?: string }>) => {
    return content.map((c) => c.text || "").join("");
  }),
  getConfiguredModel: vi.fn().mockReturnValue("mock-model"),
}));

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("Knowledge extractor registry", () => {
  it("resolves all 4 knowledge extractor handlers", async () => {
    const { resolveSystemAgent } = await import("./index");
    expect(resolveSystemAgent("knowledge-context-analyzer")).toBeTypeOf("function");
    expect(resolveSystemAgent("knowledge-solution-extractor")).toBeTypeOf("function");
    expect(resolveSystemAgent("knowledge-related-finder")).toBeTypeOf("function");
    expect(resolveSystemAgent("knowledge-assembler")).toBeTypeOf("function");
  });
});

describe("Related finder (AC7: SQL deduplication)", () => {
  it("finds existing solution memories for a process", async () => {
    const { executeRelatedFinder } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-related",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // Insert solution memories
    await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: proc.id,
      type: "solution",
      content: "Labour estimates need 1.5x multiplier for tight access",
      metadata: { category: "calculation_logic", tags: ["labour", "tight-access"], sourceRunId: "run-1" },
      source: "system",
      confidence: 0.6,
    });

    const result = await executeRelatedFinder({ processId: proc.id });
    const solutions = result.outputs["related-solutions"] as Array<{ memoryId: string; category: string }>;

    expect(solutions).toHaveLength(1);
    expect(solutions[0].category).toBe("calculation_logic");
    expect(result.confidence).toBe("high");
  });

  it("returns empty array when no solution memories exist", async () => {
    const { executeRelatedFinder } = await import("./knowledge-extractor");

    const result = await executeRelatedFinder({ processId: "nonexistent" });
    const solutions = result.outputs["related-solutions"] as unknown[];
    expect(solutions).toHaveLength(0);
  });
});

describe("Overlap assessment", () => {
  it("returns high overlap for same category + high tag overlap", async () => {
    const { assessOverlap } = await import("./knowledge-extractor");

    const existing = [{
      memoryId: "m1",
      category: "calculation_logic",
      tags: ["labour", "tight-access", "bathroom"],
      content: "test",
      confidence: 0.6,
      reinforcementCount: 2,
      overlapLevel: "none" as const,
      tagOverlapCount: 0,
    }];

    const result = assessOverlap("calculation_logic", ["labour", "tight-access"], existing);
    expect(result[0].overlapLevel).toBe("high");
  });

  it("returns moderate overlap for same category + partial tag overlap", async () => {
    const { assessOverlap } = await import("./knowledge-extractor");

    const existing = [{
      memoryId: "m1",
      category: "quality_correction",
      tags: ["tone", "formal", "email"],
      content: "test",
      confidence: 0.5,
      reinforcementCount: 1,
      overlapLevel: "none" as const,
      tagOverlapCount: 0,
    }];

    // 1 overlap ("tone") out of 3 maxTags = 0.33 → moderate (≥0.3 and <0.6)
    const result = assessOverlap("quality_correction", ["tone", "informal"], existing);
    expect(result[0].overlapLevel).toBe("moderate");
  });

  it("returns low overlap for same category but no tag overlap", async () => {
    const { assessOverlap } = await import("./knowledge-extractor");

    const existing = [{
      memoryId: "m1",
      category: "data_accuracy",
      tags: ["pricing", "materials"],
      content: "test",
      confidence: 0.5,
      reinforcementCount: 1,
      overlapLevel: "none" as const,
      tagOverlapCount: 0,
    }];

    const result = assessOverlap("data_accuracy", ["scheduling", "dates"], existing);
    expect(result[0].overlapLevel).toBe("low");
  });

  it("returns none for different category", async () => {
    const { assessOverlap } = await import("./knowledge-extractor");

    const existing = [{
      memoryId: "m1",
      category: "format_structure",
      tags: ["layout"],
      content: "test",
      confidence: 0.5,
      reinforcementCount: 1,
      overlapLevel: "none" as const,
      tagOverlapCount: 0,
    }];

    const result = assessOverlap("calculation_logic", ["pricing"], existing);
    expect(result[0].overlapLevel).toBe("none");
  });
});

describe("Knowledge assembler", () => {
  it("creates new solution memory at confidence 0.5 (AC8, AC11)", async () => {
    const { executeKnowledgeAssembler } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-assemble",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    const result = await executeKnowledgeAssembler({
      processId: proc.id,
      processRunId: "run-1",
      feedbackId: "fb-1",
      "context-analysis": { category: "quality_correction", tags: ["tone"], severity: "moderate" },
      "solution-extraction": {
        rootCause: "Used informal tone",
        failedApproaches: null,
        solution: "Match client's formal register",
        prevention: "Check recipient formality preference before drafting",
      },
      "related-solutions": [],
    });

    expect(result.outputs["knowledge-result"]).toMatchObject({
      action: "created",
      category: "quality_correction",
    });

    // Verify memory was created
    const memories = await testDb.select().from(schema.memories).where(
      and(eq(schema.memories.type, "solution"), eq(schema.memories.scopeId, proc.id)),
    );
    expect(memories).toHaveLength(1);
    expect(memories[0].confidence).toBe(0.5);
    expect(memories[0].content).toContain("Match client's formal register");
  });

  it("reinforces existing memory on high overlap (AC8)", async () => {
    const { executeKnowledgeAssembler } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-reinforce",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // Pre-existing solution memory
    const [existing] = await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: proc.id,
      type: "solution",
      content: "Use formal tone for client emails",
      metadata: { category: "quality_correction", tags: ["tone", "formal"], sourceRunId: "run-0" },
      source: "system",
      confidence: 0.5,
      reinforcementCount: 1,
    }).returning();

    const result = await executeKnowledgeAssembler({
      processId: proc.id,
      processRunId: "run-1",
      feedbackId: "fb-1",
      "context-analysis": { category: "quality_correction", tags: ["tone", "formal"], severity: "moderate" },
      "solution-extraction": {
        rootCause: "Used informal tone again",
        solution: "Match client's formal register",
        prevention: null,
        failedApproaches: null,
      },
      "related-solutions": [{
        memoryId: existing.id,
        category: "quality_correction",
        tags: ["tone", "formal"],
        content: existing.content,
        confidence: 0.5,
        reinforcementCount: 1,
        overlapLevel: "none" as const,
        tagOverlapCount: 0,
      }],
    });

    expect(result.outputs["knowledge-result"]).toMatchObject({ action: "reinforced" });

    // Verify reinforcement
    const [updated] = await testDb.select().from(schema.memories).where(eq(schema.memories.id, existing.id));
    expect(updated.reinforcementCount).toBe(2);
    expect(updated.confidence).toBe(0.6); // 0.5 + 0.1
  });
});

describe("Significance threshold (AC5)", () => {
  it("returns true for rejections", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-sig-reject",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    const result = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "reject",
      trustTier: "supervised",
    });
    expect(result).toBe(true);
  });

  it("returns true for moderate+ edit severity", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-sig-edit",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    const result = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "edit",
      editSeverity: "correction",
      trustTier: "supervised",
    });
    expect(result).toBe(true);
  });

  it("returns true for first 10 runs regardless of severity", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-sig-early",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // No completed runs → first 10 → significant
    const result = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "edit",
      editSeverity: "formatting", // normally not significant
      trustTier: "supervised",
    });
    expect(result).toBe(true);
  });

  it("returns false for formatting edits after 10+ runs with no patterns", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-sig-nosig",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // Insert 15 approved runs
    for (let i = 0; i < 15; i++) {
      await testDb.insert(schema.processRuns).values({
        processId: proc.id,
        status: "approved",
        triggeredBy: "test",
      });
    }

    const result = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "edit",
      editSeverity: "formatting",
      trustTier: "supervised",
    });
    expect(result).toBe(false);
  });
});

describe("Trust-tier scaling (AC6)", () => {
  it("supervised: always extracts on significant correction", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-tier-supervised",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    const result = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "reject",
      trustTier: "supervised",
    });
    expect(result).toBe(true);
  });

  it("autonomous: only extracts on rejection (degradation)", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-tier-auto",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "autonomous",
    }).returning();

    // Rejection = degradation → should extract
    const rejectResult = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "reject",
      trustTier: "autonomous",
    });
    expect(rejectResult).toBe(true);

    // Edit = not degradation in autonomous tier → should not extract
    const editResult = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "edit",
      editSeverity: "revision",
      trustTier: "autonomous",
    });
    expect(editResult).toBe(false);
  });
});

describe("Confidence decay (AC12)", () => {
  it("decays confidence after 50 runs without retrieval", async () => {
    const { decaySolutionConfidence } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-decay",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // Insert 55 approved runs
    for (let i = 0; i < 55; i++) {
      await testDb.insert(schema.processRuns).values({
        processId: proc.id,
        status: "approved",
        triggeredBy: "test",
      });
    }

    // Insert solution memory with lastRetrievedAtRun = 0
    await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: proc.id,
      type: "solution",
      content: "Test solution",
      metadata: { category: "quality_correction", tags: [], sourceRunId: "run-0", lastRetrievedAtRun: 0 },
      source: "system",
      confidence: 0.5,
    });

    const result = await decaySolutionConfidence(proc.id);
    expect(result.decayed).toBe(1);
    expect(result.pruned).toBe(0);

    // Verify confidence decreased
    const [mem] = await testDb.select().from(schema.memories).where(
      and(eq(schema.memories.type, "solution"), eq(schema.memories.scopeId, proc.id)),
    );
    expect(mem.confidence).toBe(0.4); // 0.5 - 0.1
  });

  it("prunes memory when confidence drops below 0.2", async () => {
    const { decaySolutionConfidence } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-prune",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    for (let i = 0; i < 55; i++) {
      await testDb.insert(schema.processRuns).values({
        processId: proc.id,
        status: "approved",
        triggeredBy: "test",
      });
    }

    // Insert solution with very low confidence
    await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: proc.id,
      type: "solution",
      content: "Stale solution",
      metadata: { category: "quality_correction", tags: [], sourceRunId: "run-0", lastRetrievedAtRun: 0 },
      source: "system",
      confidence: 0.2, // 0.2 - 0.1 = 0.1 < 0.2 → prune
    });

    const result = await decaySolutionConfidence(proc.id);
    expect(result.pruned).toBe(1);

    // Verify memory is now inactive
    const [mem] = await testDb.select().from(schema.memories).where(
      and(eq(schema.memories.type, "solution"), eq(schema.memories.scopeId, proc.id)),
    );
    expect(mem.active).toBe(false);
  });
});

describe("Supersession (AC13)", () => {
  it("deactivates older low-confidence solutions with same category + high tag overlap", async () => {
    const { executeKnowledgeAssembler } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-supersede",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // Insert an old, low-confidence solution
    const [oldSolution] = await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: proc.id,
      type: "solution",
      content: "Old bathroom estimate guidance",
      metadata: { category: "calculation_logic", tags: ["labour", "bathroom"], sourceRunId: "run-0" },
      source: "system",
      confidence: 0.3, // Below 0.5 → eligible for supersession
    }).returning();

    // Create new solution with same category + high tag overlap
    await executeKnowledgeAssembler({
      processId: proc.id,
      processRunId: "run-2",
      feedbackId: "fb-2",
      "context-analysis": { category: "calculation_logic", tags: ["labour", "bathroom", "tight-access"], severity: "high" },
      "solution-extraction": {
        rootCause: "Standard rates don't account for tight access",
        solution: "Use 1.5x multiplier for bathroom work",
        prevention: "Check access conditions before estimating",
        failedApproaches: null,
      },
      "related-solutions": [],
    });

    // Old solution should be deactivated
    const [old] = await testDb.select().from(schema.memories).where(eq(schema.memories.id, oldSolution.id));
    expect(old.active).toBe(false);
  });
});

describe("Solution categories", () => {
  it("exports constrained category list", async () => {
    const { SOLUTION_CATEGORIES } = await import("./knowledge-extractor");
    expect(SOLUTION_CATEGORIES).toContain("quality_correction");
    expect(SOLUTION_CATEGORIES).toContain("data_accuracy");
    expect(SOLUTION_CATEGORIES).toContain("format_structure");
    expect(SOLUTION_CATEGORIES).toContain("calculation_logic");
    expect(SOLUTION_CATEGORIES).toContain("process_gap");
    expect(SOLUTION_CATEGORIES).toHaveLength(5);
  });
});

describe("Memory assembly solution budget (AC9-10)", () => {
  it("exports SOLUTION_KNOWLEDGE_TOKEN_BUDGET = 1000", async () => {
    const { SOLUTION_KNOWLEDGE_TOKEN_BUDGET } = await import("../harness-handlers/memory-assembly");
    expect(SOLUTION_KNOWLEDGE_TOKEN_BUDGET).toBe(1000);
  });
});

describe("Significance threshold: retry_on_failure (AC5)", () => {
  it("returns true when retryTriggered is true", async () => {
    const { checkSignificanceThreshold } = await import("./knowledge-extractor");

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test",
      slug: "test-sig-retry",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    // Insert >10 runs so "first 10 runs" condition doesn't trigger
    for (let i = 0; i < 15; i++) {
      await testDb.insert(schema.processRuns).values({
        processId: proc.id,
        status: "approved",
        triggeredBy: "test",
      });
    }

    // Formatting severity + no retry = not significant
    const withoutRetry = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "edit",
      editSeverity: "formatting",
      trustTier: "supervised",
      retryTriggered: false,
    });
    expect(withoutRetry).toBe(false);

    // Formatting severity + retry = significant
    const withRetry = await checkSignificanceThreshold({
      processId: proc.id,
      feedbackType: "edit",
      editSeverity: "formatting",
      trustTier: "supervised",
      retryTriggered: true,
    });
    expect(withRetry).toBe(true);
  });
});

describe("Context analysis parsing (edge cases)", () => {
  it("handles malformed JSON gracefully", async () => {
    const llm = await import("../llm");
    const { executeContextAnalyzer } = await import("./knowledge-extractor");

    // Mock returns malformed JSON
    vi.mocked(llm.extractText).mockReturnValueOnce("not json at all");

    const result = await executeContextAnalyzer({
      diff: "some diff",
      originalOutput: "some output",
      feedbackType: "edit",
    });

    // Should fall back to defaults
    const analysis = result.outputs["context-analysis"] as { category: string; tags: string[]; severity: string };
    expect(analysis.category).toBe("quality_correction");
    expect(analysis.tags).toEqual([]);
    expect(analysis.severity).toBe("moderate");
  });

  it("handles unknown category by defaulting", async () => {
    const llm = await import("../llm");
    const { executeContextAnalyzer } = await import("./knowledge-extractor");

    vi.mocked(llm.extractText).mockReturnValueOnce('{"category":"invented_category","tags":["a"],"severity":"high"}');

    const result = await executeContextAnalyzer({
      diff: "some diff",
      originalOutput: "some output",
      feedbackType: "edit",
    });

    const analysis = result.outputs["context-analysis"] as { category: string };
    expect(analysis.category).toBe("quality_correction"); // default
  });

  it("clamps tags to max 8 and sanitizes", async () => {
    const llm = await import("../llm");
    const { executeContextAnalyzer } = await import("./knowledge-extractor");

    vi.mocked(llm.extractText).mockReturnValueOnce(
      '{"category":"data_accuracy","tags":["a","b","c","d","e","f","g","h","i","j"],"severity":"low"}'
    );

    const result = await executeContextAnalyzer({
      diff: "some diff",
      originalOutput: "some output",
      feedbackType: "edit",
    });

    const analysis = result.outputs["context-analysis"] as { tags: string[] };
    expect(analysis.tags.length).toBeLessThanOrEqual(8);
  });
});

describe("Solution extraction parsing (edge cases)", () => {
  it("handles malformed JSON gracefully", async () => {
    const llm = await import("../llm");
    const { executeSolutionExtractor } = await import("./knowledge-extractor");

    vi.mocked(llm.extractText).mockReturnValueOnce("{{broken");

    const result = await executeSolutionExtractor({
      diff: "some diff",
      originalOutput: "some output",
      feedbackType: "edit",
    });

    const extraction = result.outputs["solution-extraction"] as Record<string, unknown>;
    expect(extraction.rootCause).toBeNull();
    expect(extraction.prevention).toBeNull();
  });

  it("handles empty fields as null", async () => {
    const llm = await import("../llm");
    const { executeSolutionExtractor } = await import("./knowledge-extractor");

    vi.mocked(llm.extractText).mockReturnValueOnce('{"rootCause":"","failedApproaches":"","solution":"","prevention":""}');

    const result = await executeSolutionExtractor({
      diff: "some diff",
      originalOutput: "some output",
      feedbackType: "edit",
    });

    const extraction = result.outputs["solution-extraction"] as Record<string, unknown>;
    expect(extraction.rootCause).toBeNull();
    expect(extraction.prevention).toBeNull();
  });
});
