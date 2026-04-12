/**
 * Tests for deliberative-perspectives handler (Brief 136, ADR-028)
 *
 * Tests: canHandle conditions, lens composer generation, parallel execution,
 * partial failure, peer review anonymization, cost aggregation, critical
 * signal flagging, existing flag preservation, budget degradation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarnessContext } from "../harness";
import { createHarnessContext } from "../harness";
import type { ProcessDefinition, StepDefinition } from "../process-loader";

// ============================================================
// Mocks
// ============================================================

const mockCreateCompletion = vi.fn();
const mockResolveModel = vi.fn().mockReturnValue("test-fast-model");

vi.mock("../llm", async () => {
  const real = await vi.importActual<typeof import("../llm")>("../llm");
  return {
    ...real,
    createCompletion: (...args: unknown[]) => mockCreateCompletion(...args),
    getConfiguredModel: () => "test-model",
    extractText: real.extractText,
  };
});

vi.mock("../model-routing", () => ({
  resolveModel: (...args: unknown[]) => mockResolveModel(...args),
}));

// Import after mocks
const { deliberativePerspectivesHandler, parsePerspectivesConfig } = await import("./deliberative-perspectives");
const { parseLensResponse } = await import("./lens-composer");

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
    description: "A test process",
    steps: [],
    quality_criteria: ["Output must be accurate", "Tone must be professional"],
    ...overrides,
  } as ProcessDefinition;
}

function makeContext(overrides: Partial<HarnessContext> = {}): HarnessContext {
  return {
    ...createHarnessContext({
      processRun: { id: "run-1", processId: "test-process", inputs: { task: "evaluate pricing" } },
      stepDefinition: makeStep(),
      processDefinition: makeProcess(),
      trustTier: "supervised",
      stepRunId: "step-run-1",
    }),
    stepResult: { outputs: { response: "The recommended price is $14,200" }, costCents: 5, confidence: "medium" },
    ...overrides,
  };
}

function makeLlmResponse(content: string, costCents = 2) {
  return {
    content: [{ type: "text" as const, text: content }],
    costCents,
    model: "test-fast-model",
    tokensUsed: { input: 100, output: 50 },
  };
}

// ============================================================
// parsePerspectivesConfig tests
// ============================================================

describe("parsePerspectivesConfig", () => {
  it("returns disabled config by default", () => {
    const config = parsePerspectivesConfig(makeStep(), makeProcess());
    expect(config.enabled).toBe(false);
  });

  it("parses enabled config from config.perspectives", () => {
    const step = makeStep({
      config: {
        perspectives: {
          enabled: true,
          trigger: "always",
          peer_review: true,
          max_lenses: 3,
        },
      },
    });
    const config = parsePerspectivesConfig(step, makeProcess());
    expect(config.enabled).toBe(true);
    expect(config.trigger).toBe("always");
    expect(config.peerReview).toBe(true);
    expect(config.maxLenses).toBe(3);
  });

  it("parses peer_review: false", () => {
    const step = makeStep({
      config: {
        perspectives: { enabled: true, peer_review: false },
      },
    });
    const config = parsePerspectivesConfig(step, makeProcess());
    expect(config.peerReview).toBe(false);
  });

  it("falls back to process-level config", () => {
    const step = makeStep();
    const process = { ...makeProcess(), config: { perspectives: { enabled: true, trigger: "high-stakes" } } };
    const config = parsePerspectivesConfig(step, process);
    expect(config.enabled).toBe(true);
    expect(config.trigger).toBe("high-stakes");
  });

  it("parses composer_hints", () => {
    const step = makeStep({
      config: {
        perspectives: {
          enabled: true,
          composer_hints: ["financial compliance", "tone sensitive"],
        },
      },
    });
    const config = parsePerspectivesConfig(step, makeProcess());
    expect(config.composerHints).toEqual(["financial compliance", "tone sensitive"]);
  });
});

// ============================================================
// parseLensResponse tests
// ============================================================

describe("parseLensResponse", () => {
  it("parses valid lens JSON", () => {
    const response = JSON.stringify({
      lenses: [
        {
          id: "risk-check",
          cognitiveFunction: "Risk assessment",
          systemPrompt: "Evaluate risks...",
          evaluationQuestions: ["What could go wrong?"],
          memoryCategories: ["failure_pattern"],
        },
      ],
    });
    const lenses = parseLensResponse(response, 4);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].id).toBe("risk-check");
    expect(lenses[0].memoryCategories).toEqual(["failure_pattern"]);
  });

  it("caps at maxLenses", () => {
    const response = JSON.stringify({
      lenses: Array.from({ length: 6 }, (_, i) => ({
        id: `lens-${i}`,
        cognitiveFunction: `Function ${i}`,
        systemPrompt: `Prompt ${i}`,
        evaluationQuestions: [],
      })),
    });
    const lenses = parseLensResponse(response, 3);
    expect(lenses).toHaveLength(3);
  });

  it("returns default lenses on parse failure", () => {
    const lenses = parseLensResponse("invalid json", 4);
    expect(lenses).toHaveLength(2);
    expect(lenses[0].id).toBe("risk-assessor");
  });

  it("returns default lenses on empty array", () => {
    const lenses = parseLensResponse(JSON.stringify({ lenses: [] }), 4);
    expect(lenses).toHaveLength(2);
  });

  it("skips lenses missing required fields", () => {
    const response = JSON.stringify({
      lenses: [
        { id: "valid", cognitiveFunction: "Test", systemPrompt: "Test prompt" },
        { id: "invalid-no-function" },
      ],
    });
    const lenses = parseLensResponse(response, 4);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].id).toBe("valid");
  });
});

// ============================================================
// canHandle tests
// ============================================================

describe("deliberativePerspectivesHandler.canHandle", () => {
  it("returns false when perspectives not enabled", () => {
    const ctx = makeContext();
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(false);
  });

  it("returns false when step has no result", () => {
    const ctx = makeContext({
      stepResult: null,
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always" } },
      }),
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(false);
  });

  it("returns false when step errored", () => {
    const ctx = makeContext({
      stepError: new Error("boom"),
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always" } },
      }),
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(false);
  });

  it("returns true with always trigger and enabled config", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always" } },
      }),
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(true);
  });

  it("returns true with low-confidence trigger when confidence is medium", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "low-confidence" } },
      }),
      stepResult: { outputs: { text: "test" }, costCents: 5, confidence: "medium" },
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(true);
  });

  it("returns false with low-confidence trigger when confidence is high", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "low-confidence" } },
      }),
      stepResult: { outputs: { text: "test" }, costCents: 5, confidence: "high" },
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(false);
  });

  it("returns true with high-stakes trigger when outbound actions exist", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "high-stakes" } },
      }),
      stagedOutboundActions: [
        { toolName: "email.send", args: {}, draftId: "draft-1", content: "Hello" },
      ],
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(true);
  });

  it("returns false with high-stakes trigger when no outbound signals", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "high-stakes" } },
      }),
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(false);
  });
});

// ============================================================
// execute tests
// ============================================================

describe("deliberativePerspectivesHandler.execute", () => {
  beforeEach(() => {
    mockCreateCompletion.mockReset();
    mockResolveModel.mockReturnValue("test-fast-model");
  });

  it("runs full pipeline: compose → generate → peer review → aggregate", async () => {
    // Stage 0: Lens Composer response
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        {
          id: "risk-check",
          cognitiveFunction: "Risk assessment",
          systemPrompt: "Evaluate risks in this pricing output",
          evaluationQuestions: ["What pricing assumptions are unverified?"],
          memoryCategories: ["failure_pattern"],
        },
        {
          id: "feasibility",
          cognitiveFunction: "Feasibility analysis",
          systemPrompt: "Assess whether this price is actionable",
          evaluationQuestions: ["Can the customer verify this quote?"],
        },
      ],
    }), 1);

    // Stage 1: Lens generation responses (2 lenses)
    const lens1Response = makeLlmResponse(JSON.stringify({
      assessment: "The pricing assumes standard materials but doesn't account for supply chain issues.",
      signals: [
        { type: "risk", summary: "Material costs may be outdated", severity: "significant", evidence: "No supplier verification" },
      ],
      confidence: "medium",
    }), 3);

    const lens2Response = makeLlmResponse(JSON.stringify({
      assessment: "The quote is actionable. Customer can review line items.",
      signals: [
        { type: "feasibility", summary: "Quote structure is clear and itemized", severity: "minor" },
      ],
      confidence: "high",
    }), 3);

    // Stage 2: Peer review responses
    const peerReview1 = makeLlmResponse(JSON.stringify({
      revisedAssessment: "Material costs are a real risk. Perspective B's clarity point is valid but doesn't address accuracy.",
      signals: [
        { type: "risk", summary: "Material costs may be outdated", severity: "significant", evidence: "No supplier verification" },
      ],
      confidence: "medium",
      changesFromInitial: "Maintained risk assessment, acknowledged feasibility perspective",
    }), 2);

    const peerReview2 = makeLlmResponse(JSON.stringify({
      revisedAssessment: "Quote is actionable but Perspective A's material cost concern should be flagged to the reviewer.",
      signals: [
        { type: "feasibility", summary: "Quote is actionable but needs cost verification", severity: "significant" },
      ],
      confidence: "medium",
      changesFromInitial: "Elevated severity based on Perspective A's cost concern",
    }), 2);

    // Set up mock to return responses in order
    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)   // Stage 0
      .mockResolvedValueOnce(lens1Response)       // Stage 1 lens 1
      .mockResolvedValueOnce(lens2Response)       // Stage 1 lens 2
      .mockResolvedValueOnce(peerReview1)         // Stage 2 peer review 1
      .mockResolvedValueOnce(peerReview2);        // Stage 2 peer review 2

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always" } },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    // Verify perspectives stored in reviewDetails
    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    expect(perspectives).toBeDefined();
    expect(perspectives.skipped).toBeUndefined();

    const lenses = perspectives.lenses as Array<Record<string, unknown>>;
    expect(lenses).toHaveLength(2);
    expect(lenses[0].lensId).toBe("risk-check");
    expect(lenses[1].lensId).toBe("feasibility");

    // Verify peer review changes are captured
    expect(lenses[0].peerReviewChanges).toBeTruthy();
    expect(lenses[1].peerReviewChanges).toBeTruthy();

    // Verify cost tracking
    expect(perspectives.totalCostCents).toBe(11); // 1+3+3+2+2
    expect(result.reviewCostCents).toBe(11);

    // Verify model routing uses fast
    expect(mockResolveModel).toHaveBeenCalledWith("fast");
  });

  it("skips peer review when peer_review: false", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "lens-1", cognitiveFunction: "Test", systemPrompt: "Test", evaluationQuestions: [] },
        { id: "lens-2", cognitiveFunction: "Test2", systemPrompt: "Test2", evaluationQuestions: [] },
      ],
    }), 1);

    const lensResponse = makeLlmResponse(JSON.stringify({
      assessment: "Looks good",
      signals: [],
      confidence: "high",
    }), 2);

    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)
      .mockResolvedValueOnce(lensResponse)
      .mockResolvedValueOnce(lensResponse);

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always", peer_review: false } },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    // 3 calls total: composer + 2 lenses (no peer review)
    expect(mockCreateCompletion).toHaveBeenCalledTimes(3);

    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    expect(perspectives.peerReviewEnabled).toBe(false);
  });

  it("flags when critical signal is found", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "critic", cognitiveFunction: "Critical check", systemPrompt: "Check critically", evaluationQuestions: [] },
      ],
    }), 1);

    const criticalResponse = makeLlmResponse(JSON.stringify({
      assessment: "This price is dangerously low — below cost.",
      signals: [
        { type: "risk", summary: "Price below cost of materials", severity: "critical", evidence: "Material cost $15K, quoted $14.2K" },
      ],
      confidence: "high",
    }), 3);

    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)
      .mockResolvedValueOnce(criticalResponse);

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always", peer_review: false } },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    expect(result.reviewResult).toBe("flag");
    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    expect(perspectives.hasCritical).toBe(true);
  });

  it("preserves existing flag — does not weaken to pass", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "lens-1", cognitiveFunction: "Test", systemPrompt: "Test", evaluationQuestions: [] },
      ],
    }), 1);

    const passResponse = makeLlmResponse(JSON.stringify({
      assessment: "All good",
      signals: [
        { type: "quality", summary: "Output meets criteria", severity: "minor" },
      ],
      confidence: "high",
    }), 2);

    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)
      .mockResolvedValueOnce(passResponse);

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always", peer_review: false } },
      }),
      reviewResult: "flag", // Already flagged by metacognitive check
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    // The existing flag must be preserved
    expect(result.reviewResult).toBe("flag");
  });

  it("handles partial lens failure gracefully", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "lens-1", cognitiveFunction: "Working", systemPrompt: "Works", evaluationQuestions: [] },
        { id: "lens-2", cognitiveFunction: "Failing", systemPrompt: "Fails", evaluationQuestions: [] },
      ],
    }), 1);

    const successResponse = makeLlmResponse(JSON.stringify({
      assessment: "Output is good",
      signals: [],
      confidence: "high",
    }), 2);

    // First lens succeeds, second rejects
    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)
      .mockResolvedValueOnce(successResponse)
      .mockRejectedValueOnce(new Error("LLM timeout"));

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always", peer_review: false } },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    // Should have 1 perspective (the one that succeeded)
    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    const lenses = perspectives.lenses as Array<Record<string, unknown>>;
    expect(lenses).toHaveLength(1);
    expect(lenses[0].lensId).toBe("lens-1");
  });

  it("degrades by skipping perspectives when budget too low", async () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: {
          perspectives: {
            enabled: true,
            trigger: "always",
            max_lenses: 4,
            peer_review: true,
            max_cost_cents: 1, // Very low budget — should skip entirely
          },
        },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    expect(perspectives.skipped).toBe(true);
    expect(perspectives.reason).toBe("budget_exceeded");
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("degrades by disabling peer review when budget is moderate", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "lens-1", cognitiveFunction: "Test", systemPrompt: "Test", evaluationQuestions: [] },
      ],
    }), 1);

    const lensResponse = makeLlmResponse(JSON.stringify({
      assessment: "OK",
      signals: [],
      confidence: "high",
    }), 2);

    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)
      .mockResolvedValueOnce(lensResponse);

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: {
          perspectives: {
            enabled: true,
            trigger: "always",
            max_lenses: 4,
            peer_review: true,
            max_cost_cents: 15, // Moderate — enough for compose+lenses, not peer review
          },
        },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    expect(perspectives.peerReviewEnabled).toBe(false);
  });

  it("accumulates cost from all stages", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "lens-1", cognitiveFunction: "Test", systemPrompt: "Test", evaluationQuestions: [] },
      ],
    }), 5);

    const lensResponse = makeLlmResponse(JSON.stringify({
      assessment: "OK",
      signals: [],
      confidence: "high",
    }), 10);

    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)
      .mockResolvedValueOnce(lensResponse);

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always", peer_review: false } },
      }),
      reviewCostCents: 7, // Existing cost from prior handlers
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    // 7 existing + 5 composer + 10 lens = 22
    expect(result.reviewCostCents).toBe(22);
  });

  it("skips gracefully when composer LLM call fails", async () => {
    mockCreateCompletion.mockRejectedValueOnce(new Error("LLM service unavailable"));

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always" } },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    expect(perspectives.skipped).toBe(true);
    expect(perspectives.reason).toBe("composer_failed");
    // Should not throw — graceful degradation
  });

  it("runs peer review with malformed JSON — keeps original perspectives", async () => {
    const composerResponse = makeLlmResponse(JSON.stringify({
      lenses: [
        { id: "lens-1", cognitiveFunction: "Test 1", systemPrompt: "Test 1", evaluationQuestions: [] },
        { id: "lens-2", cognitiveFunction: "Test 2", systemPrompt: "Test 2", evaluationQuestions: [] },
      ],
    }), 1);

    const lensResponse = makeLlmResponse(JSON.stringify({
      assessment: "Original assessment",
      signals: [{ type: "risk", summary: "A risk", severity: "minor" }],
      confidence: "high",
    }), 2);

    // Peer review returns malformed JSON
    const malformedPeerReview = makeLlmResponse("This is not valid JSON at all {{{", 1);

    mockCreateCompletion
      .mockResolvedValueOnce(composerResponse)   // Stage 0
      .mockResolvedValueOnce(lensResponse)        // Stage 1 lens 1
      .mockResolvedValueOnce(lensResponse)        // Stage 1 lens 2
      .mockResolvedValueOnce(malformedPeerReview) // Stage 2 peer review 1 (malformed)
      .mockResolvedValueOnce(malformedPeerReview); // Stage 2 peer review 2 (malformed)

    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "always", peer_review: true } },
      }),
    });

    const result = await deliberativePerspectivesHandler.execute(ctx);

    const perspectives = result.reviewDetails.perspectives as Record<string, unknown>;
    const lenses = perspectives.lenses as Array<Record<string, unknown>>;
    expect(lenses).toHaveLength(2);
    // Original assessments should be preserved when peer review fails to parse
    expect(lenses[0].assessment).toBe("Original assessment");
    expect(lenses[1].assessment).toBe("Original assessment");
  });
});

// ============================================================
// canHandle: high-stakes sendingIdentity branch
// ============================================================

describe("deliberativePerspectivesHandler.canHandle (high-stakes identity)", () => {
  it("returns true with high-stakes when sendingIdentity is ghost", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "high-stakes" } },
      }),
      sendingIdentity: "ghost",
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(true);
  });

  it("returns true with high-stakes when sendingIdentity is principal", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "high-stakes" } },
      }),
      sendingIdentity: "principal",
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(true);
  });

  it("returns false with high-stakes when sendingIdentity is agent-of-user (not high stakes)", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({
        config: { perspectives: { enabled: true, trigger: "high-stakes" } },
      }),
      sendingIdentity: "agent-of-user",
    });
    expect(deliberativePerspectivesHandler.canHandle(ctx)).toBe(false);
  });
});
