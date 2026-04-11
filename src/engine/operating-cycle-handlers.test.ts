/**
 * Tests for Brief 116 — Operating Cycle Shared Infrastructure
 *
 * Tests all 4 new core harness handlers and trust-gate modifications:
 * - Identity router
 * - Voice calibration
 * - Broadcast/direct classifier
 * - Outbound quality gate
 * - Trust gate: broadcast forcing + step-category overrides
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  createHarnessContext,
  type HarnessContext,
  type ProcessDefinition,
  type StepDefinition,
} from "@ditto/core";
import { identityRouterHandler } from "@ditto/core";
import { voiceCalibrationHandler } from "@ditto/core";
import { broadcastDirectClassifierHandler } from "@ditto/core";
import { outboundQualityGateHandler } from "@ditto/core";

// ============================================================
// Test helpers
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
    name: "Test Process",
    id: "test-process",
    version: 1,
    status: "active",
    description: "Test",
    trigger: { type: "manual" },
    inputs: [],
    steps: [],
    outputs: [],
    quality_criteria: [],
    feedback: { metrics: [], capture: [] },
    trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
    ...overrides,
  };
}

function makeContext(overrides: Partial<HarnessContext> = {}): HarnessContext {
  const ctx = createHarnessContext({
    processRun: { id: "run-1", processId: "proc-1", inputs: {} },
    stepDefinition: makeStep(),
    processDefinition: makeProcess(),
    trustTier: "supervised",
    stepRunId: "step-run-1",
  });
  return { ...ctx, ...overrides };
}

// ============================================================
// Identity Router
// ============================================================

describe("identity-router", () => {
  it("sets sendingIdentity from stepDefinition.sendingIdentity (AC7)", async () => {
    const ctx = makeContext({
      stepDefinition: makeStep({ sendingIdentity: "ghost" }),
      processDefinition: makeProcess({ defaultIdentity: "principal" }),
    });

    const result = await identityRouterHandler.execute(ctx);
    expect(result.sendingIdentity).toBe("ghost");
  });

  it("falls back to processDefinition.defaultIdentity (AC8)", async () => {
    const ctx = makeContext({
      stepDefinition: makeStep(),
      processDefinition: makeProcess({ defaultIdentity: "agent-of-user" }),
    });

    const result = await identityRouterHandler.execute(ctx);
    expect(result.sendingIdentity).toBe("agent-of-user");
  });

  it("canHandle returns true when step has sendingIdentity", () => {
    const ctx = makeContext({
      stepDefinition: makeStep({ sendingIdentity: "principal" }),
    });
    expect(identityRouterHandler.canHandle(ctx)).toBe(true);
  });

  it("canHandle returns true when process has defaultIdentity", () => {
    const ctx = makeContext({
      processDefinition: makeProcess({ defaultIdentity: "principal" }),
    });
    expect(identityRouterHandler.canHandle(ctx)).toBe(true);
  });

  it("canHandle returns false when neither is set", () => {
    const ctx = makeContext();
    expect(identityRouterHandler.canHandle(ctx)).toBe(false);
  });
});

// ============================================================
// Voice Calibration
// ============================================================

describe("voice-calibration", () => {
  it("calls voiceModelLoader and sets voiceModel when identity is ghost (AC9)", async () => {
    const loader = vi.fn().mockResolvedValue("Write in a casual, friendly tone...");
    const ctx = makeContext({
      sendingIdentity: "ghost",
      voiceModelLoader: loader,
    });

    const result = await voiceCalibrationHandler.execute(ctx);
    expect(loader).toHaveBeenCalled();
    expect(result.voiceModel).toBe("Write in a casual, friendly tone...");
  });

  it("is a no-op when identity is not ghost (AC10)", async () => {
    const loader = vi.fn().mockResolvedValue("some voice");
    const ctx = makeContext({
      sendingIdentity: "principal",
      voiceModelLoader: loader,
    });

    // canHandle should return false
    expect(voiceCalibrationHandler.canHandle(ctx)).toBe(false);
  });

  it("canHandle returns false when no voiceModelLoader", () => {
    const ctx = makeContext({
      sendingIdentity: "ghost",
      voiceModelLoader: null,
    });
    expect(voiceCalibrationHandler.canHandle(ctx)).toBe(false);
  });
});

// ============================================================
// Broadcast/Direct Classifier
// ============================================================

describe("broadcast-direct-classifier", () => {
  const rules: Record<string, "broadcast" | "direct"> = {
    "linkedin.post": "broadcast",
    "linkedin.dm": "direct",
    "email.single": "direct",
    "email.campaign": "broadcast",
  };

  it("classifies broadcast channel+action correctly (AC3)", async () => {
    const ctx = makeContext({
      outboundAction: { channel: "linkedin", actionType: "post" },
      audienceClassificationRules: rules,
    });

    const result = await broadcastDirectClassifierHandler.execute(ctx);
    expect(result.audienceClassification).toBe("broadcast");
  });

  it("classifies direct channel+action correctly (AC4)", async () => {
    const ctx = makeContext({
      outboundAction: { channel: "email", actionType: "single" },
      audienceClassificationRules: rules,
    });

    const result = await broadcastDirectClassifierHandler.execute(ctx);
    expect(result.audienceClassification).toBe("direct");
  });

  it("returns null for unknown channel+action", async () => {
    const ctx = makeContext({
      outboundAction: { channel: "sms", actionType: "send" },
      audienceClassificationRules: rules,
    });

    const result = await broadcastDirectClassifierHandler.execute(ctx);
    expect(result.audienceClassification).toBeNull();
  });

  it("canHandle returns false when no outboundAction", () => {
    const ctx = makeContext({ audienceClassificationRules: rules });
    expect(broadcastDirectClassifierHandler.canHandle(ctx)).toBe(false);
  });

  it("canHandle returns false when no rules configured", () => {
    const ctx = makeContext({
      outboundAction: { channel: "linkedin", actionType: "post" },
    });
    expect(broadcastDirectClassifierHandler.canHandle(ctx)).toBe(false);
  });
});

// ============================================================
// Outbound Quality Gate
// ============================================================

describe("outbound-quality-gate", () => {
  it("flags step output that matches a house value rule (AC1)", async () => {
    const ctx = makeContext({
      outboundAction: {
        channel: "linkedin",
        actionType: "dm",
        content: "BUY NOW! Limited time offer!!!",
      },
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spammy language",
          check: (content) =>
            content.includes("BUY NOW") ? "Contains spammy language" : null,
        },
      ],
    });

    const result = await outboundQualityGateHandler.execute(ctx);
    expect(result.reviewResult).toBe("flag");
    expect(result.reviewDetails.outboundQualityViolations).toContain(
      "[no-spam] Contains spammy language"
    );
  });

  it("passes step output that doesn't match any rules (AC2)", async () => {
    const ctx = makeContext({
      outboundAction: {
        channel: "linkedin",
        actionType: "dm",
        content: "Hi Sarah, I thought you might find this interesting...",
      },
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spammy language",
          check: (content) =>
            content.includes("BUY NOW") ? "Contains spammy language" : null,
        },
      ],
    });

    const result = await outboundQualityGateHandler.execute(ctx);
    expect(result.reviewResult).toBe("skip"); // unchanged from default
  });

  it("records outbound action via callback", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const ctx = makeContext({
      outboundAction: {
        channel: "email",
        actionType: "single",
        recipientId: "person-1",
        content: "Hello!",
      },
      sendingIdentity: "agent-of-user",
      recordOutboundAction: recorder,
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({
        processRunId: "run-1",
        stepRunId: "step-run-1",
        channel: "email",
        sendingIdentity: "agent-of-user",
        recipientId: "person-1",
        blocked: false,
      })
    );
  });

  it("records blocked action with reason when rule matches", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const ctx = makeContext({
      outboundAction: {
        channel: "linkedin",
        actionType: "dm",
        content: "BUY NOW!",
      },
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: (content) => content.includes("BUY NOW") ? "Spam detected" : null,
        },
      ],
      recordOutboundAction: recorder,
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({
        blocked: true,
        blockReason: "[no-spam] Spam detected",
      })
    );
  });

  it("does not short-circuit — downstream handlers still run", async () => {
    const ctx = makeContext({
      outboundAction: {
        channel: "linkedin",
        actionType: "dm",
        content: "BUY NOW!",
      },
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: () => "violation",
        },
      ],
    });

    const result = await outboundQualityGateHandler.execute(ctx);
    expect(result.shortCircuit).toBe(false);
  });

  it("canHandle returns false when no outboundAction", () => {
    const ctx = makeContext();
    expect(outboundQualityGateHandler.canHandle(ctx)).toBe(false);
  });

  it("has alwaysRun set to true", () => {
    expect(outboundQualityGateHandler.alwaysRun).toBe(true);
  });
});

// ============================================================
// Trust Gate — broadcast forcing + step-category overrides
// (using core trust gate handler directly)
// ============================================================

describe("trust-gate broadcast forcing and step-category overrides", () => {
  // Import the core trust gate for direct testing
  let trustGateHandler: typeof import("@ditto/core").trustGateHandler;

  // We need to import dynamically since the module has module-level state
  beforeAll(async () => {
    const mod = await import("@ditto/core");
    trustGateHandler = mod.trustGateHandler;
  });

  it("forces critical tier when audienceClassification is broadcast (AC5)", async () => {
    const ctx = makeContext({
      trustTier: "autonomous",
      audienceClassification: "broadcast",
      stepError: null,
    });

    const result = await trustGateHandler.execute(ctx);
    expect(result.trustAction).toBe("pause");
    expect(result.canAutoAdvance).toBe(false);
  });

  it("respects stepDefinition.trustOverride — autonomous step in supervised process (AC6)", async () => {
    const ctx = makeContext({
      trustTier: "supervised",
      stepDefinition: makeStep({ trustOverride: "autonomous" }),
      stepError: null,
    });

    const result = await trustGateHandler.execute(ctx);
    expect(result.trustAction).toBe("advance");
  });

  it("broadcast forcing takes precedence over step-category override", async () => {
    const ctx = makeContext({
      trustTier: "autonomous",
      audienceClassification: "broadcast",
      stepDefinition: makeStep({ trustOverride: "autonomous" }),
      stepError: null,
    });

    const result = await trustGateHandler.execute(ctx);
    expect(result.trustAction).toBe("pause");
    expect(result.canAutoAdvance).toBe(false);
  });

  it("rejects step-category override that tightens (critical on autonomous process)", async () => {
    const ctx = makeContext({
      trustTier: "autonomous",
      stepDefinition: makeStep({ trustOverride: "supervised" }),
      stepError: null,
    });

    const result = await trustGateHandler.execute(ctx);
    // Override ignored because supervised is more restrictive than autonomous
    expect(result.trustAction).toBe("advance");
  });

  it("direct classification does not force critical", async () => {
    const ctx = makeContext({
      trustTier: "autonomous",
      audienceClassification: "direct",
      stepError: null,
    });

    const result = await trustGateHandler.execute(ctx);
    expect(result.trustAction).toBe("advance");
  });
});

// ============================================================
// HarnessContext initialization
// ============================================================

describe("createHarnessContext — new fields (AC14)", () => {
  it("initialises all operating cycle fields to null", () => {
    const ctx = createHarnessContext({
      processRun: { id: "run-1", processId: "proc-1", inputs: {} },
      stepDefinition: makeStep(),
      processDefinition: makeProcess(),
      trustTier: "supervised",
      stepRunId: "step-run-1",
    });

    expect(ctx.sendingIdentity).toBeNull();
    expect(ctx.audienceClassification).toBeNull();
    expect(ctx.voiceModel).toBeNull();
    expect(ctx.outboundAction).toBeNull();
    expect(ctx.outboundQualityRules).toBeNull();
    expect(ctx.audienceClassificationRules).toBeNull();
    expect(ctx.voiceModelLoader).toBeNull();
    expect(ctx.recordOutboundAction).toBeNull();
  });
});

// ============================================================
// Schema type checks (AC11, AC12, AC13)
// ============================================================

describe("schema type values (AC13)", () => {
  it("memoryTypeValues includes voice_model", async () => {
    const { memoryTypeValues } = await import("@ditto/core");
    expect(memoryTypeValues).toContain("voice_model");
  });

  it("stepExecutorValues includes sub-process", async () => {
    const { stepExecutorValues } = await import("@ditto/core");
    expect(stepExecutorValues).toContain("sub-process");
  });
});
