/**
 * Tests for Model Routing Intelligence (Brief 033).
 *
 * Covers: hint resolution, provider-specific mapping,
 * model_hint validation in process loader,
 * recommendation generation from accumulated data.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveModel,
  generateModelRecommendations,
  VALID_HINTS,
  resolveProviderForPurpose,
  resolveHintToPurpose,
  MODEL_PURPOSES,
  type ModelRecommendation,
} from "./model-routing";
import { _setProviderForTest } from "./llm";
import { validateModelHints, type ProcessDefinition } from "./process-loader";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../test-utils";
import * as schema from "../db/schema";

// ============================================================
// Hint Resolution
// ============================================================

describe("resolveModel", () => {
  afterEach(() => {
    _setProviderForTest(null);
  });

  it("returns deployment default when hint is undefined", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    expect(resolveModel(undefined)).toBe("claude-sonnet-4-6");
  });

  it("returns deployment default when hint is 'default'", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    expect(resolveModel("default")).toBe("claude-sonnet-4-6");
  });

  it("resolves 'fast' to Haiku for Anthropic provider", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    expect(resolveModel("fast")).toBe("claude-haiku-4-5-20251001");
  });

  it("resolves 'capable' to Opus for Anthropic provider", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    expect(resolveModel("capable")).toBe("claude-opus-4-6");
  });

  it("resolves 'fast' to gpt-4o-mini for OpenAI provider", () => {
    _setProviderForTest({ name: "openai", createCompletion: async () => ({} as never), validateConfig: () => {} }, "gpt-4o");
    expect(resolveModel("fast")).toBe("gpt-4o-mini");
  });

  it("resolves 'capable' to gpt-4o for OpenAI provider", () => {
    _setProviderForTest({ name: "openai", createCompletion: async () => ({} as never), validateConfig: () => {} }, "gpt-4o");
    expect(resolveModel("capable")).toBe("gpt-4o");
  });

  it("falls back to default for Ollama (no model families)", () => {
    _setProviderForTest({ name: "ollama", createCompletion: async () => ({} as never), validateConfig: () => {} }, "llama3.3");
    expect(resolveModel("fast")).toBe("llama3.3");
    expect(resolveModel("capable")).toBe("llama3.3");
  });

  it("falls back to default for unknown hint", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    expect(resolveModel("turbo")).toBe("claude-sonnet-4-6");
  });
});

// ============================================================
// Model Hint Validation (process-loader)
// ============================================================

describe("validateModelHints", () => {
  it("accepts valid hints on ai-agent steps", () => {
    const def = makeTestProcessDefinition({
      steps: [
        { id: "s1", name: "PM", executor: "ai-agent", config: { model_hint: "fast" } },
        { id: "s2", name: "Builder", executor: "ai-agent", config: { model_hint: "capable" } },
        { id: "s3", name: "Default", executor: "ai-agent", config: { model_hint: "default" } },
      ],
    }) as unknown as ProcessDefinition;

    expect(validateModelHints(def)).toEqual([]);
  });

  it("rejects invalid hint on ai-agent step", () => {
    const def = makeTestProcessDefinition({
      steps: [
        { id: "s1", name: "Bad", executor: "ai-agent", config: { model_hint: "turbo" } },
      ],
    }) as unknown as ProcessDefinition;

    const errors = validateModelHints(def);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"turbo"');
    expect(errors[0]).toContain("fast");
    expect(errors[0]).toContain("capable");
  });

  it("ignores model_hint on non-ai-agent executor types", () => {
    const def = makeTestProcessDefinition({
      steps: [
        { id: "s1", name: "Script", executor: "script", config: { model_hint: "turbo" } },
        { id: "s2", name: "Human", executor: "human", config: { model_hint: "invalid" } },
      ],
    }) as unknown as ProcessDefinition;

    expect(validateModelHints(def)).toEqual([]);
  });

  it("passes when no model_hint is set (backward compatible)", () => {
    const def = makeTestProcessDefinition({
      steps: [
        { id: "s1", name: "No hint", executor: "ai-agent", config: { tools: "read-only" } },
        { id: "s2", name: "No config", executor: "ai-agent" },
      ],
    }) as unknown as ProcessDefinition;

    expect(validateModelHints(def)).toEqual([]);
  });
});

// ============================================================
// VALID_HINTS export
// ============================================================

describe("VALID_HINTS", () => {
  it("exports the three valid hint values", () => {
    expect(VALID_HINTS).toEqual(["fast", "capable", "default"]);
  });
});

// ============================================================
// Recommendation Generation
// ============================================================

describe("generateModelRecommendations", () => {
  let testDb: TestDb;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("returns empty array when no data exists", async () => {
    const recommendations = await generateModelRecommendations(testDb);
    expect(recommendations).toEqual([]);
  });

  it("returns empty array when data is below threshold", async () => {
    // Insert a process and a run
    const processId = "proc-1";
    testDb.insert(schema.processes).values({
      id: processId,
      name: "Test",
      slug: "test-proc",
      definition: {},
      status: "active",
    }).run();

    const runId = "run-1";
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      triggeredBy: "test",
      status: "running",
    }).run();

    // Insert only 5 step runs (below 20 threshold)
    for (let i = 0; i < 5; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-${i}`,
        processRunId: runId,
        stepId: "step-1",
        executorType: "ai-agent",
        status: "approved",
        model: "claude-sonnet-4-6",
        costCents: 10,
      }).run();
    }

    const recommendations = await generateModelRecommendations(testDb);
    expect(recommendations).toEqual([]);
  });

  it("recommends cheaper model when quality is comparable", async () => {
    const processId = "proc-1";
    testDb.insert(schema.processes).values({
      id: processId,
      name: "Dev Pipeline",
      slug: "dev-pipeline",
      definition: {},
      status: "active",
    }).run();

    const runId = "run-1";
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      triggeredBy: "test",
      status: "running",
    }).run();

    const baseTime = Date.now();

    // 20 older runs with cheap model, 90% approval
    for (let i = 0; i < 20; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-chp-${i}`,
        processRunId: runId,
        stepId: "pm-execute",
        executorType: "ai-agent",
        status: i < 18 ? "approved" : "rejected", // 90% approval
        model: "claude-haiku-4-5-20251001",
        costCents: 3,
        createdAt: new Date(baseTime + i), // older timestamps
      }).run();
    }

    // 25 newer runs with expensive model, 92% approval
    // These are most recent, so opus is the "current" model
    for (let i = 0; i < 25; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-exp-${i}`,
        processRunId: runId,
        stepId: "pm-execute",
        executorType: "ai-agent",
        status: i < 23 ? "approved" : "rejected", // 92% approval
        model: "claude-opus-4-6",
        costCents: 50,
        createdAt: new Date(baseTime + 100 + i), // newer timestamps
      }).run();
    }

    const recommendations = await generateModelRecommendations(testDb);
    expect(recommendations.length).toBeGreaterThanOrEqual(1);

    const rec = recommendations[0];
    expect(rec.processSlug).toBe("dev-pipeline");
    expect(rec.stepId).toBe("pm-execute");
    expect(rec.currentModel).toBe("claude-opus-4-6");
    expect(rec.suggestedModel).toBe("claude-haiku-4-5-20251001");
    expect(rec.rationale).toContain("lower cost");
  });

  it("recommends upgrade when current model has low quality", async () => {
    const processId = "proc-2";
    testDb.insert(schema.processes).values({
      id: processId,
      name: "Build Pipeline",
      slug: "build-pipeline",
      definition: {},
      status: "active",
    }).run();

    const runId = "run-2";
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      triggeredBy: "test",
      status: "running",
    }).run();

    const baseTime = Date.now();

    // 20 older runs with capable model, 90% approval
    for (let i = 0; i < 20; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-cap-${i}`,
        processRunId: runId,
        stepId: "build-execute",
        executorType: "ai-agent",
        status: i < 18 ? "approved" : "rejected", // 90% approval
        model: "claude-opus-4-6",
        costCents: 50,
        createdAt: new Date(baseTime + i),
      }).run();
    }

    // 25 newer runs with cheap model, 60% approval (low quality — current model)
    for (let i = 0; i < 25; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-low-${i}`,
        processRunId: runId,
        stepId: "build-execute",
        executorType: "ai-agent",
        status: i < 15 ? "approved" : "rejected", // 60% approval
        model: "claude-haiku-4-5-20251001",
        costCents: 3,
        createdAt: new Date(baseTime + 100 + i),
      }).run();
    }

    const recommendations = await generateModelRecommendations(testDb);
    expect(recommendations.length).toBeGreaterThanOrEqual(1);

    const upgradeRec = recommendations.find((r) => r.rationale.includes("upgrading"));
    expect(upgradeRec).toBeDefined();
    expect(upgradeRec!.currentModel).toBe("claude-haiku-4-5-20251001");
    expect(upgradeRec!.suggestedModel).toBe("claude-opus-4-6");
  });

  it("does not recommend when only one model has been used", async () => {
    const processId = "proc-3";
    testDb.insert(schema.processes).values({
      id: processId,
      name: "Single Model",
      slug: "single-model",
      definition: {},
      status: "active",
    }).run();

    const runId = "run-3";
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      triggeredBy: "test",
      status: "running",
    }).run();

    // 25 runs with one model only
    for (let i = 0; i < 25; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-single-${i}`,
        processRunId: runId,
        stepId: "step-1",
        executorType: "ai-agent",
        status: "approved",
        model: "claude-sonnet-4-6",
        costCents: 10,
      }).run();
    }

    const recommendations = await generateModelRecommendations(testDb);
    expect(recommendations).toEqual([]);
  });

  it("recommendation includes all required fields", async () => {
    const processId = "proc-4";
    testDb.insert(schema.processes).values({
      id: processId,
      name: "Complete Rec",
      slug: "complete-rec",
      definition: {},
      status: "active",
    }).run();

    const runId = "run-4";
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      triggeredBy: "test",
      status: "running",
    }).run();

    const baseTime = Date.now();

    // Older: haiku runs (cheaper alternative with same quality)
    for (let i = 0; i < 20; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-b-${i}`,
        processRunId: runId,
        stepId: "s1",
        executorType: "ai-agent",
        status: "approved",
        model: "claude-haiku-4-5-20251001",
        costCents: 3,
        createdAt: new Date(baseTime + i),
      }).run();
    }
    // Newer: opus runs (current expensive model)
    for (let i = 0; i < 25; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-a-${i}`,
        processRunId: runId,
        stepId: "s1",
        executorType: "ai-agent",
        status: "approved",
        model: "claude-opus-4-6",
        costCents: 50,
        createdAt: new Date(baseTime + 100 + i),
      }).run();
    }

    const recs = await generateModelRecommendations(testDb);
    expect(recs.length).toBeGreaterThanOrEqual(1);

    const rec = recs[0];
    // AC10: recommendations include all required fields
    expect(rec).toHaveProperty("processSlug");
    expect(rec).toHaveProperty("stepId");
    expect(rec).toHaveProperty("currentModel");
    expect(rec).toHaveProperty("suggestedModel");
    expect(rec).toHaveProperty("currentApprovalRate");
    expect(rec).toHaveProperty("suggestedApprovalRate");
    expect(rec).toHaveProperty("currentAvgCostCents");
    expect(rec).toHaveProperty("suggestedAvgCostCents");
    expect(rec).toHaveProperty("rationale");
    expect(typeof rec.rationale).toBe("string");
    expect(rec.rationale.length).toBeGreaterThan(0);
  });

  it("excludes step runs without model recorded", async () => {
    const processId = "proc-5";
    testDb.insert(schema.processes).values({
      id: processId,
      name: "No Model",
      slug: "no-model",
      definition: {},
      status: "active",
    }).run();

    const runId = "run-5";
    testDb.insert(schema.processRuns).values({
      id: runId,
      processId,
      triggeredBy: "test",
      status: "running",
    }).run();

    // 25 runs WITHOUT model (model is null)
    for (let i = 0; i < 25; i++) {
      testDb.insert(schema.stepRuns).values({
        id: `sr-nomodel-${i}`,
        processRunId: runId,
        stepId: "step-1",
        executorType: "ai-agent",
        status: "approved",
        costCents: 10,
        // model not set — defaults to null
      }).run();
    }

    const recommendations = await generateModelRecommendations(testDb);
    expect(recommendations).toEqual([]);
  });
});

// ============================================================
// Purpose-based routing (Brief 096, ADR-026)
// ============================================================

describe("resolveProviderForPurpose", () => {
  afterEach(() => {
    _setProviderForTest(null);
  });

  it("returns anthropic + sonnet for conversation when anthropic is loaded", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    const result = resolveProviderForPurpose("conversation");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  it("returns anthropic + haiku for classification when anthropic is loaded", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    const result = resolveProviderForPurpose("classification");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to first loaded provider when preference provider is not loaded", () => {
    // Load openai as the only provider
    _setProviderForTest({ name: "openai", createCompletion: async () => ({} as never), validateConfig: () => {} }, "gpt-4o");
    const result = resolveProviderForPurpose("conversation");
    // Anthropic is first in the preference list but not loaded, so falls through to OpenAI
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  it("returns fast model for extraction purpose", () => {
    _setProviderForTest({ name: "anthropic", createCompletion: async () => ({} as never), validateConfig: () => {} }, "claude-sonnet-4-6");
    const result = resolveProviderForPurpose("extraction");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("resolveHintToPurpose", () => {
  it("maps 'fast' to 'classification'", () => {
    expect(resolveHintToPurpose("fast")).toBe("classification");
  });

  it("maps 'capable' to 'analysis'", () => {
    expect(resolveHintToPurpose("capable")).toBe("analysis");
  });

  it("maps 'default' to 'analysis'", () => {
    expect(resolveHintToPurpose("default")).toBe("analysis");
  });

  it("maps undefined to 'analysis'", () => {
    expect(resolveHintToPurpose(undefined)).toBe("analysis");
  });

  it("maps unknown hint to 'analysis' (graceful fallback)", () => {
    expect(resolveHintToPurpose("unknown")).toBe("analysis");
  });
});

describe("MODEL_PURPOSES", () => {
  it("exports all five purpose classes", () => {
    expect(MODEL_PURPOSES).toEqual(["conversation", "writing", "analysis", "classification", "extraction"]);
  });
});
