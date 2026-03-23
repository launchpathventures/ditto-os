/**
 * Tests for metacognitive-check.ts (Brief 034b)
 *
 * Tests: handler runs for supervised/critical tiers, skips for autonomous,
 * flags issues correctly, passes clean output, records cost, skips on step error,
 * flag survives through review-pattern handler.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarnessContext } from "../harness";
import { createHarnessContext } from "../harness";
import type { ProcessDefinition, StepDefinition } from "../process-loader";

// Mock the LLM module
const mockCreateCompletion = vi.fn();

vi.mock("../llm", async () => {
  const real = await vi.importActual<typeof import("../llm")>("../llm");
  return {
    ...real,
    createCompletion: (...args: unknown[]) => mockCreateCompletion(...args),
    getConfiguredModel: () => "test-model",
  };
});

// Import after mock
const { metacognitiveCheckHandler } = await import("./metacognitive-check");
const { reviewPatternHandler } = await import("./review-pattern");
const { parseHarnessConfig } = await import("./harness-config");

// ============================================================
// Helpers
// ============================================================

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: "test-step",
    name: "Test Step",
    executor: "ai-agent",
    ...overrides,
  };
}

function makeProcess(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    id: "test-process",
    name: "Test Process",
    description: "Test",
    steps: [],
    ...overrides,
  } as ProcessDefinition;
}

function makeContext(overrides: Partial<HarnessContext> = {}): HarnessContext {
  return {
    ...createHarnessContext({
      processRun: { id: "run-1", processId: "test-process", inputs: { task: "do something" } },
      stepDefinition: makeStep(),
      processDefinition: makeProcess(),
      trustTier: "supervised",
      stepRunId: "step-run-1",
    }),
    stepResult: { outputs: { response: "The answer is 42" }, costCents: 5, confidence: "high" },
    ...overrides,
  };
}

// ============================================================
// parseHarnessConfig tests
// ============================================================

describe("parseHarnessConfig", () => {
  it("returns defaults for no harness field", () => {
    const config = parseHarnessConfig(makeStep());
    expect(config).toEqual({ review: [], metacognitive: false });
  });

  it("parses legacy string format", () => {
    const config = parseHarnessConfig(makeStep({ harness: "maker-checker" }));
    expect(config).toEqual({ review: ["maker-checker"], metacognitive: false });
  });

  it("parses structured format with review only", () => {
    const config = parseHarnessConfig(makeStep({ harness: { review: ["spec-testing"] } }));
    expect(config).toEqual({ review: ["spec-testing"], metacognitive: false });
  });

  it("parses structured format with metacognitive: true", () => {
    const config = parseHarnessConfig(makeStep({ harness: { metacognitive: true } }));
    expect(config).toEqual({ review: [], metacognitive: true });
  });

  it("parses structured format with both review and metacognitive", () => {
    const config = parseHarnessConfig(makeStep({ harness: { review: ["maker-checker"], metacognitive: true } }));
    expect(config).toEqual({ review: ["maker-checker"], metacognitive: true });
  });
});

// ============================================================
// canHandle tests
// ============================================================

describe("metacognitiveCheckHandler.canHandle", () => {
  it("returns true for supervised tier", () => {
    const ctx = makeContext({ trustTier: "supervised" });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(true);
  });

  it("returns true for critical tier", () => {
    const ctx = makeContext({ trustTier: "critical" });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(true);
  });

  it("returns false for autonomous tier without opt-in", () => {
    const ctx = makeContext({ trustTier: "autonomous" });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(false);
  });

  it("returns false for spot_checked tier without opt-in", () => {
    const ctx = makeContext({ trustTier: "spot_checked" });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(false);
  });

  it("returns true for autonomous tier with metacognitive opt-in", () => {
    const ctx = makeContext({
      trustTier: "autonomous",
      stepDefinition: makeStep({ harness: { metacognitive: true } }),
    });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(true);
  });

  it("returns true for spot_checked tier with metacognitive opt-in", () => {
    const ctx = makeContext({
      trustTier: "spot_checked",
      stepDefinition: makeStep({ harness: { metacognitive: true } }),
    });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(true);
  });

  it("returns false when stepResult is null", () => {
    const ctx = makeContext({ stepResult: null });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(false);
  });

  it("returns false when stepError is set", () => {
    const ctx = makeContext({ stepError: new Error("boom") });
    expect(metacognitiveCheckHandler.canHandle(ctx)).toBe(false);
  });
});

// ============================================================
// execute tests
// ============================================================

describe("metacognitiveCheckHandler.execute", () => {
  beforeEach(() => {
    mockCreateCompletion.mockReset();
  });

  it("passes clean output through unchanged", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": true, "issues": []}' }],
      tokensUsed: 100,
      costCents: 1,
      stopReason: "end_turn",
    });

    const ctx = makeContext();
    const result = await metacognitiveCheckHandler.execute(ctx);

    expect(result.reviewResult).toBe("skip"); // unchanged from default
    expect(result.reviewDetails).toEqual({});
    expect(result.reviewCostCents).toBe(1);
  });

  it("flags issues and records them in reviewDetails.metacognitive", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": false, "issues": ["Assumes user has admin access without checking"]}' }],
      tokensUsed: 150,
      costCents: 2,
      stopReason: "end_turn",
    });

    const ctx = makeContext();
    const result = await metacognitiveCheckHandler.execute(ctx);

    expect(result.reviewResult).toBe("flag");
    expect(result.reviewDetails.metacognitive).toBeDefined();
    const meta = result.reviewDetails.metacognitive as { issues: string[] };
    expect(meta.issues).toContain("Assumes user has admin access without checking");
    expect(result.reviewCostCents).toBe(2);
  });

  it("flags when LLM response cannot be parsed", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot parse this as JSON" }],
      tokensUsed: 50,
      costCents: 1,
      stopReason: "end_turn",
    });

    const ctx = makeContext();
    const result = await metacognitiveCheckHandler.execute(ctx);

    expect(result.reviewResult).toBe("flag");
    expect(result.reviewDetails.metacognitive).toBeDefined();
  });

  it("handles string-type step output", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": true, "issues": []}' }],
      tokensUsed: 80,
      costCents: 1,
      stopReason: "end_turn",
    });

    const ctx = makeContext({
      stepResult: { outputs: { text: "plain string output" }, costCents: 3, confidence: "high" },
    });
    const result = await metacognitiveCheckHandler.execute(ctx);

    expect(result.reviewResult).toBe("skip");
    // Verify the output was passed to the LLM as JSON
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("plain string output");
  });

  it("accumulates cost with existing reviewCostCents", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": true, "issues": []}' }],
      tokensUsed: 100,
      costCents: 3,
      stopReason: "end_turn",
    });

    const ctx = makeContext({ reviewCostCents: 5 });
    const result = await metacognitiveCheckHandler.execute(ctx);

    expect(result.reviewCostCents).toBe(8); // 5 + 3
  });

  it("calls createCompletion with maxTokens: 512", async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": true, "issues": []}' }],
      tokensUsed: 100,
      costCents: 1,
      stopReason: "end_turn",
    });

    const ctx = makeContext();
    await metacognitiveCheckHandler.execute(ctx);

    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateCompletion.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(512);
  });
});

// ============================================================
// Integration: flag survives through review-pattern handler
// ============================================================

describe("metacognitive flag survives review-pattern", () => {
  beforeEach(() => {
    mockCreateCompletion.mockReset();
  });

  it("review-pattern preserves metacognitive flag even when its own patterns pass", async () => {
    // First call: metacognitive check flags
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": false, "issues": ["scope creep detected"]}' }],
      tokensUsed: 100,
      costCents: 2,
      stopReason: "end_turn",
    });

    const ctx = makeContext({
      stepDefinition: makeStep({ harness: { review: ["spec-testing"], metacognitive: true } }),
    });

    // Run metacognitive check
    const afterMetacog = await metacognitiveCheckHandler.execute(ctx);
    expect(afterMetacog.reviewResult).toBe("flag");
    expect(afterMetacog.reviewDetails.metacognitive).toBeDefined();

    // Second call: spec-testing passes
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"results": [{"criterion": "good", "pass": true, "reason": "ok"}], "overallPass": true}' }],
      tokensUsed: 200,
      costCents: 3,
      stopReason: "end_turn",
    });

    // Run review-pattern — it should preserve the flag
    const afterReview = await reviewPatternHandler.execute(afterMetacog);
    expect(afterReview.reviewResult).toBe("flag"); // Preserved!
    expect(afterReview.reviewDetails.metacognitive).toBeDefined(); // Merged!
    expect(afterReview.reviewDetails.layers).toBeDefined(); // Review layers also present
  });

  it("review-pattern merges reviewDetails from metacognitive check", async () => {
    // Metacognitive check: clean pass
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"clean": true, "issues": []}' }],
      tokensUsed: 100,
      costCents: 1,
      stopReason: "end_turn",
    });

    const ctx = makeContext({
      stepDefinition: makeStep({ harness: { review: ["spec-testing"], metacognitive: true } }),
      processDefinition: makeProcess({ quality_criteria: ["be accurate"] }),
    });

    // Run metacognitive check (clean)
    await metacognitiveCheckHandler.execute(ctx);

    // Spec-testing flags
    mockCreateCompletion.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"results": [{"criterion": "be accurate", "pass": false, "reason": "inaccurate"}], "overallPass": false}' }],
      tokensUsed: 200,
      costCents: 3,
      stopReason: "end_turn",
    });

    const afterReview = await reviewPatternHandler.execute(ctx);
    expect(afterReview.reviewResult).toBe("flag"); // From spec-testing
    expect(afterReview.reviewDetails.layers).toBeDefined();
  });
});
