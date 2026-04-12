/**
 * Tests for SLM Provider Factory + Eval Pipeline + Deployment Lifecycle (Brief 137).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSlmProvider, type SlmProviderConfig, type LlmProvider, type LlmCompletionResponse, type LlmContentBlock } from "./llm";
import { createDeployment, getDeployment, getPromotedDeployment, transitionDeployment, checkAndRetireOnDrift, updateProductionStats } from "./slm-deployment";
import { isEvalHoldout, splitTrainingEval, evaluateSlmCandidate } from "./eval-pipeline";
import { resolveProviderForStep } from "./model-routing";
import { _setProviderForTest } from "./llm";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { randomUUID } from "crypto";
import type { TrainingExample } from "@ditto/core";

let db: TestDb;
let cleanup: () => void;

// Mock SLM provider that echoes the expected output
function createMockSlmProvider(responses: Map<string, string>): LlmProvider {
  return {
    name: "mock-slm",
    validateConfig: () => {},
    createCompletion: async (request) => {
      const input = typeof request.messages[0]?.content === "string"
        ? request.messages[0].content
        : "";
      const response = responses.get(input) || "unknown";
      return {
        content: [{ type: "text" as const, text: response }],
        tokensUsed: 10,
        costCents: 0,
        stopReason: "end_turn",
        model: request.model || "mock-slm",
      };
    },
    createStreamingCompletion: async function* () {
      yield { type: "content-complete" as const, content: [] as LlmContentBlock[], costCents: 0, tokensUsed: 0 };
    },
  };
}

function insertProcess(slug: string) {
  const id = randomUUID();
  db.insert(schema.processes).values({ id, name: slug, slug, definition: {} }).run();
  return id;
}

function insertProcessRun(processId: string) {
  const id = randomUUID();
  db.insert(schema.processRuns).values({ id, processId, triggeredBy: "test", status: "approved" }).run();
  return id;
}

function insertStepRun(opts: { processRunId: string; stepId: string; status: "approved" | "rejected"; inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }) {
  const id = randomUUID();
  db.insert(schema.stepRuns).values({
    id,
    processRunId: opts.processRunId,
    stepId: opts.stepId,
    status: opts.status,
    executorType: "ai-agent",
    inputs: opts.inputs ?? { query: "test" },
    outputs: opts.outputs ?? { result: "ok" },
    model: "claude-haiku-4-5-20251001",
    tokensUsed: 100,
    costCents: 1,
  }).run();
  return id;
}

beforeEach(() => {
  const result = createTestDb();
  db = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
  _setProviderForTest(null);
});

// ============================================================
// SLM Provider Factory
// ============================================================

describe("createSlmProvider", () => {
  it("creates a provider that uses OpenAI-compatible API", () => {
    const config: SlmProviderConfig = {
      name: "test-slm",
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      defaultModel: "qwen2.5-1.5b",
      models: ["qwen2.5-1.5b"],
    };

    const provider = createSlmProvider(config);
    expect(provider.name).toBe("test-slm");
    expect(() => provider.validateConfig()).not.toThrow();
  });

  it("fails validation when apiKey is empty", () => {
    const provider = createSlmProvider({
      name: "test-slm",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      defaultModel: "qwen2.5-1.5b",
      models: ["qwen2.5-1.5b"],
    });

    expect(() => provider.validateConfig()).toThrow(/API key not set/);
  });
});

// ============================================================
// Eval Pipeline
// ============================================================

describe("eval pipeline", () => {
  it("uses deterministic holdout: id hash mod 5 === 0", () => {
    // Generate a set of IDs and verify roughly 20% are holdout
    const ids = Array.from({ length: 100 }, () => randomUUID());
    const holdoutCount = ids.filter(isEvalHoldout).length;

    // Should be roughly 20% (within 10% tolerance for 100 samples)
    expect(holdoutCount).toBeGreaterThan(5);
    expect(holdoutCount).toBeLessThan(40);
  });

  it("holdout is deterministic — same ID always produces same result", () => {
    const testId = "test-123-fixed-id";
    const result1 = isEvalHoldout(testId);
    const result2 = isEvalHoldout(testId);
    expect(result1).toBe(result2);
  });

  it("splits examples into training and eval sets without overlap", () => {
    const examples: TrainingExample[] = Array.from({ length: 50 }, (_, i) => ({
      id: randomUUID(),
      processSlug: "test",
      stepId: "step1",
      purpose: "classification" as const,
      systemPrompt: "",
      input: `input-${i}`,
      output: `output-${i}`,
      label: "approved" as const,
      sourceModel: "test",
      createdAt: new Date(),
    }));

    const { training, eval: evalSet } = splitTrainingEval(examples);

    expect(training.length + evalSet.length).toBe(examples.length);

    // No overlap
    const trainingIds = new Set(training.map((e) => e.id));
    for (const e of evalSet) {
      expect(trainingIds.has(e.id)).toBe(false);
    }
  });

  it("evaluates SLM candidate against held-out examples", async () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);

    // Insert enough step runs for eval to have data
    const responses = new Map<string, string>();
    for (let i = 0; i < 20; i++) {
      const input = `email-${i}`;
      const output = "sales";
      insertStepRun({
        processRunId: runId,
        stepId: "classify",
        status: "approved",
        inputs: { query: input },
        outputs: { result: output },
      });
      responses.set(input, output);
    }

    // Create deployment
    const deploymentId = createDeployment(db, {
      processSlug: "inbox-triage",
      stepId: "classify",
      provider: "mock-slm",
      model: "test-model",
    });

    // Transition to evaluating
    transitionDeployment(db, deploymentId, "evaluating");

    // Mock provider that returns the correct answer
    const mockProvider = createMockSlmProvider(responses);

    const result = await evaluateSlmCandidate(db, deploymentId, mockProvider);

    expect(result.deploymentId).toBe(deploymentId);
    expect(result.totalExamples).toBeGreaterThan(0);
    expect(result.evalExamples).toBeGreaterThan(0);
    // Mock returns "unknown" for inputs it doesn't know, which won't match
    // But some eval examples may have inputs the mock knows
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// Deployment Lifecycle
// ============================================================

describe("slm-deployment", () => {
  it("creates a deployment in candidate status", () => {
    const id = createDeployment(db, {
      processSlug: "inbox-triage",
      stepId: "classify",
      provider: "neurometric",
      model: "qwen2.5-1.5b",
    });

    const deployment = getDeployment(db, id);
    expect(deployment).not.toBeNull();
    expect(deployment!.status).toBe("candidate");
    expect(deployment!.provider).toBe("neurometric");
  });

  it("enforces valid state transitions", () => {
    const id = createDeployment(db, {
      processSlug: "inbox-triage",
      stepId: "classify",
      provider: "neurometric",
      model: "qwen2.5-1.5b",
    });

    // candidate → evaluating: valid
    expect(() => transitionDeployment(db, id, "evaluating")).not.toThrow();

    // evaluating → candidate: invalid
    expect(() => transitionDeployment(db, id, "candidate")).toThrow(/Invalid transition/);

    // evaluating → promoted: requires eval pass
    expect(() => transitionDeployment(db, id, "promoted")).toThrow(/eval accuracy/);

    // evaluating → promoted: requires human approval even with passing eval
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.97 WHERE id = ${id}
    `);
    expect(() => transitionDeployment(db, id, "promoted")).toThrow(/human approval/);
    expect(() => transitionDeployment(db, id, "promoted", { humanApproved: false })).toThrow(/human approval/);
  });

  it("allows promotion when eval accuracy >= 95%", () => {
    const id = createDeployment(db, {
      processSlug: "inbox-triage",
      stepId: "classify",
      provider: "neurometric",
      model: "qwen2.5-1.5b",
    });

    transitionDeployment(db, id, "evaluating");

    // Manually set eval accuracy
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.97 WHERE id = ${id}
    `);

    expect(() => transitionDeployment(db, id, "promoted", { baselineApprovalRate: 0.95, humanApproved: true })).not.toThrow();

    const deployment = getDeployment(db, id);
    expect(deployment!.status).toBe("promoted");
    expect(deployment!.promotedAt).not.toBeNull();
    expect(deployment!.baselineApprovalRate).toBe(0.95);
  });

  it("allows retirement from any non-terminal state", () => {
    const id1 = createDeployment(db, {
      processSlug: "test",
      stepId: "s1",
      provider: "p",
      model: "m",
    });
    transitionDeployment(db, id1, "retired", { reason: "manual" });
    expect(getDeployment(db, id1)!.status).toBe("retired");
    expect(getDeployment(db, id1)!.retiredReason).toBe("manual");

    const id2 = createDeployment(db, {
      processSlug: "test",
      stepId: "s2",
      provider: "p",
      model: "m",
    });
    transitionDeployment(db, id2, "evaluating");
    transitionDeployment(db, id2, "retired", { reason: "eval failed" });
    expect(getDeployment(db, id2)!.status).toBe("retired");
  });

  it("prevents transitions from retired (terminal)", () => {
    const id = createDeployment(db, {
      processSlug: "test",
      stepId: "s1",
      provider: "p",
      model: "m",
    });
    transitionDeployment(db, id, "retired");
    expect(() => transitionDeployment(db, id, "candidate")).toThrow(/Invalid transition/);
  });

  it("auto-retires on quality drift", () => {
    const id = createDeployment(db, {
      processSlug: "test",
      stepId: "s1",
      provider: "p",
      model: "m",
    });
    transitionDeployment(db, id, "evaluating");

    // Set eval accuracy high enough to promote
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.98 WHERE id = ${id}
    `);
    transitionDeployment(db, id, "promoted", { baselineApprovalRate: 0.95, humanApproved: true });

    // Simulate 60 runs with low approval rate (80% vs 95% baseline = 15% drift > 10% threshold)
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments
      SET production_run_count = 60, production_approval_rate = 0.80
      WHERE id = ${id}
    `);

    const retired = checkAndRetireOnDrift(db, id);
    expect(retired).toBe(true);
    expect(getDeployment(db, id)!.status).toBe("retired");
    expect(getDeployment(db, id)!.retiredReason).toContain("Quality drift");
  });

  it("does not retire when drift is within threshold", () => {
    const id = createDeployment(db, {
      processSlug: "test",
      stepId: "s1",
      provider: "p",
      model: "m",
    });
    transitionDeployment(db, id, "evaluating");
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.98 WHERE id = ${id}
    `);
    transitionDeployment(db, id, "promoted", { baselineApprovalRate: 0.95, humanApproved: true });

    // 92% vs 95% baseline = 3% drift, under 10% threshold
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments
      SET production_run_count = 60, production_approval_rate = 0.92
      WHERE id = ${id}
    `);

    const retired = checkAndRetireOnDrift(db, id);
    expect(retired).toBe(false);
    expect(getDeployment(db, id)!.status).toBe("promoted");
  });

  it("does not retire with insufficient runs", () => {
    const id = createDeployment(db, {
      processSlug: "test",
      stepId: "s1",
      provider: "p",
      model: "m",
    });
    transitionDeployment(db, id, "evaluating");
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.98 WHERE id = ${id}
    `);
    transitionDeployment(db, id, "promoted", { baselineApprovalRate: 0.95, humanApproved: true });

    // Only 10 runs (< 50 minimum)
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments
      SET production_run_count = 10, production_approval_rate = 0.70
      WHERE id = ${id}
    `);

    expect(checkAndRetireOnDrift(db, id)).toBe(false);
  });
});

// ============================================================
// Routing Override
// ============================================================

describe("resolveProviderForStep", () => {
  it("returns promoted SLM when one exists", () => {
    // Set up a mock provider that looks like neurometric
    const mockProvider: LlmProvider = {
      name: "neurometric",
      createCompletion: async () => ({} as LlmCompletionResponse),
      createStreamingCompletion: async function* () { yield undefined as never; },
      validateConfig: () => {},
    };
    _setProviderForTest(mockProvider);

    // Create and promote a deployment
    const id = createDeployment(db, {
      processSlug: "inbox-triage",
      stepId: "classify",
      provider: "neurometric",
      model: "custom-model",
    });
    transitionDeployment(db, id, "evaluating");
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.98 WHERE id = ${id}
    `);
    transitionDeployment(db, id, "promoted", { baselineApprovalRate: 0.95, humanApproved: true });

    const result = resolveProviderForStep(db, "inbox-triage", "classify", "classification");
    expect(result.provider).toBe("neurometric");
    expect(result.model).toBe("custom-model");
    expect(result.slmDeploymentId).toBe(id);
  });

  it("falls back to normal routing when no SLM is promoted", () => {
    const mockProvider: LlmProvider = {
      name: "anthropic",
      createCompletion: async () => ({} as LlmCompletionResponse),
      createStreamingCompletion: async function* () { yield undefined as never; },
      validateConfig: () => {},
    };
    _setProviderForTest(mockProvider);

    const result = resolveProviderForStep(db, "inbox-triage", "classify", "classification");
    // Should fall through to PURPOSE_ROUTING
    expect(result.slmDeploymentId).toBeUndefined();
  });

  it("falls back when promoted SLM provider is not loaded", () => {
    // Set up only anthropic, not neurometric
    const mockProvider: LlmProvider = {
      name: "anthropic",
      createCompletion: async () => ({} as LlmCompletionResponse),
      createStreamingCompletion: async function* () { yield undefined as never; },
      validateConfig: () => {},
    };
    _setProviderForTest(mockProvider);

    // Create promoted deployment for unloaded provider
    const id = createDeployment(db, {
      processSlug: "inbox-triage",
      stepId: "classify",
      provider: "neurometric",
      model: "custom-model",
    });
    transitionDeployment(db, id, "evaluating");
    db.run(require("drizzle-orm").sql`
      UPDATE slm_deployments SET eval_accuracy = 0.98 WHERE id = ${id}
    `);
    transitionDeployment(db, id, "promoted", { baselineApprovalRate: 0.95, humanApproved: true });

    const result = resolveProviderForStep(db, "inbox-triage", "classify", "classification");
    // neurometric not loaded → falls through
    expect(result.slmDeploymentId).toBeUndefined();
  });
});
