/**
 * Tests for Brief 128 — Model Purpose Resolver Handler
 *
 * Tests all 9 resolution paths and priority ordering.
 */

import { describe, it, expect } from "vitest";
import {
  createHarnessContext,
  type HarnessContext,
  type ProcessDefinition,
  type StepDefinition,
} from "@ditto/core";
import { modelPurposeResolverHandler, resolveModelPurpose } from "@ditto/core";

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
// Resolution paths
// ============================================================

describe("model-purpose-resolver", () => {
  describe("Signal 1: explicit config.purpose override", () => {
    it("uses config.purpose when set to a valid ModelPurpose", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ config: { purpose: "writing" } }),
      });
      expect(resolveModelPurpose(ctx)).toBe("writing");
    });

    it("ignores invalid config.purpose values", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ config: { purpose: "invalid-purpose" } }),
      });
      // Falls through to default (analysis) since no other signals match
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  describe("Signal 2: non-LLM executors", () => {
    it("returns null for script executor", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ executor: "script" }),
      });
      expect(resolveModelPurpose(ctx)).toBeNull();
    });

    it("returns null for integration executor", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ executor: "integration" }),
      });
      expect(resolveModelPurpose(ctx)).toBeNull();
    });

    it("returns null for human executor", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ executor: "human" }),
      });
      expect(resolveModelPurpose(ctx)).toBeNull();
    });
  });

  describe("Signal 3: sendingIdentity principal", () => {
    it("resolves to writing when sendingIdentity is principal", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ sendingIdentity: "principal" }),
      });
      expect(resolveModelPurpose(ctx)).toBe("writing");
    });

    it("does not resolve to writing for agent-of-user identity", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ sendingIdentity: "agent-of-user" }),
      });
      // Falls through — no route_to, no tools, supervised tier → agent_role check → default
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  describe("Signal 4: route_to conditions", () => {
    it("resolves to classification when step has route_to", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          route_to: [{ condition: "contains 'yes'", goto: "step-2" }],
        }),
      });
      expect(resolveModelPurpose(ctx)).toBe("classification");
    });

    it("does not trigger for empty route_to", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ route_to: [] }),
      });
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  describe("Signal 5: tool + structured output", () => {
    it("resolves to extraction when tools and structured outputs present", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          tools: ["search"],
          outputs: ["person_data"],
        }),
      });
      expect(resolveModelPurpose(ctx)).toBe("extraction");
    });

    it("resolves to extraction with resolvedTools and response_format", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          config: { response_format: "json" },
        }),
        resolvedTools: {
          tools: [{ name: "fetch", description: "fetch", input_schema: { type: "object" as const, properties: {} } }],
          executeIntegrationTool: async () => "",
        },
      });
      expect(resolveModelPurpose(ctx)).toBe("extraction");
    });

    it("does not trigger with tools but no structured output", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ tools: ["search"] }),
      });
      // Falls through to default
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });

    it("matches various structured output suffixes", () => {
      for (const suffix of ["_data", "_json", "_record", "_list", "_records", "_items"]) {
        const ctx = makeContext({
          stepDefinition: makeStep({
            tools: ["lookup"],
            outputs: [`result${suffix}`],
          }),
        });
        expect(resolveModelPurpose(ctx)).toBe("extraction");
      }
    });
  });

  describe("Signal 6: trust tier autonomous downgrade", () => {
    it("downgrades analysis agent_role to classification when autonomous", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ agent_role: "research analyst" }),
        trustTier: "autonomous",
      });
      expect(resolveModelPurpose(ctx)).toBe("classification");
    });

    it("resolves to analysis for autonomous steps without analysis role", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ agent_role: "coordinator" }),
        trustTier: "autonomous",
      });
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });

    it("does not downgrade when sendingIdentity is set", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          agent_role: "research analyst",
          sendingIdentity: "ghost",
        }),
        trustTier: "autonomous",
      });
      // sendingIdentity is set (not principal), so signal 6 doesn't apply
      // Falls through to signal 7 (agent_role keywords → analysis)
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  describe("Signal 7: agent_role keyword matching", () => {
    it("resolves classification keywords", () => {
      for (const role of ["email classifier", "route handler", "triage agent", "categorize inputs"]) {
        const ctx = makeContext({
          stepDefinition: makeStep({ agent_role: role }),
        });
        expect(resolveModelPurpose(ctx)).toBe("classification");
      }
    });

    it("resolves writing keywords", () => {
      for (const role of ["draft email", "compose response", "write content"]) {
        const ctx = makeContext({
          stepDefinition: makeStep({ agent_role: role }),
        });
        expect(resolveModelPurpose(ctx)).toBe("writing");
      }
    });

    it("resolves analysis keywords", () => {
      for (const role of ["research lead", "review output", "evaluate quality"]) {
        const ctx = makeContext({
          stepDefinition: makeStep({ agent_role: role }),
        });
        expect(resolveModelPurpose(ctx)).toBe("analysis");
      }
    });
  });

  describe("Signal 8: model_hint backward compat", () => {
    it("maps fast to classification", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ config: { model_hint: "fast" } }),
      });
      expect(resolveModelPurpose(ctx)).toBe("classification");
    });

    it("maps capable to analysis", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ config: { model_hint: "capable" } }),
      });
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });

    it("maps default to analysis", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ config: { model_hint: "default" } }),
      });
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  describe("Signal 9: default", () => {
    it("defaults to analysis when no signals match", () => {
      const ctx = makeContext();
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  // ============================================================
  // conversation purpose exclusion
  // ============================================================

  describe("conversation purpose exclusion", () => {
    it("never resolves to conversation from any signal combination", () => {
      // The only way to get conversation is via explicit config.purpose
      const scenarios = [
        makeContext(),
        makeContext({ trustTier: "autonomous" }),
        makeContext({ stepDefinition: makeStep({ agent_role: "conversational agent" }) }),
        makeContext({ stepDefinition: makeStep({ sendingIdentity: "principal" }) }),
      ];
      for (const ctx of scenarios) {
        const result = resolveModelPurpose(ctx);
        if (result !== null) {
          expect(result).not.toBe("conversation");
        }
      }
    });

    it("allows conversation only via explicit config.purpose", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ config: { purpose: "conversation" } }),
      });
      expect(resolveModelPurpose(ctx)).toBe("conversation");
    });
  });

  // ============================================================
  // Priority ordering
  // ============================================================

  describe("priority ordering", () => {
    it("explicit override beats sendingIdentity", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          sendingIdentity: "principal",
          config: { purpose: "classification" },
        }),
      });
      expect(resolveModelPurpose(ctx)).toBe("classification");
    });

    it("sendingIdentity principal beats route_to", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          sendingIdentity: "principal",
          route_to: [{ condition: "test", goto: "step-2" }],
        }),
      });
      expect(resolveModelPurpose(ctx)).toBe("writing");
    });

    it("route_to beats agent_role keywords", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          agent_role: "research analyst",
          route_to: [{ condition: "test", goto: "step-2" }],
        }),
      });
      expect(resolveModelPurpose(ctx)).toBe("classification");
    });

    it("non-LLM executor beats sendingIdentity", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          executor: "script",
          sendingIdentity: "principal",
        }),
      });
      expect(resolveModelPurpose(ctx)).toBeNull();
    });

    it("explicit override beats non-LLM executor", () => {
      const ctx = makeContext({
        stepDefinition: makeStep({
          executor: "script",
          config: { purpose: "analysis" },
        }),
      });
      // config.purpose takes highest priority
      expect(resolveModelPurpose(ctx)).toBe("analysis");
    });
  });

  // ============================================================
  // Handler interface
  // ============================================================

  describe("handler interface", () => {
    it("has correct name", () => {
      expect(modelPurposeResolverHandler.name).toBe("model-purpose-resolver");
    });

    it("canHandle returns true when resolvedModelPurpose is null", () => {
      const ctx = makeContext();
      expect(modelPurposeResolverHandler.canHandle(ctx)).toBe(true);
    });

    it("canHandle returns false when resolvedModelPurpose is already set", () => {
      const ctx = makeContext();
      ctx.resolvedModelPurpose = "writing";
      expect(modelPurposeResolverHandler.canHandle(ctx)).toBe(false);
    });

    it("sets resolvedModelPurpose on context", async () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ sendingIdentity: "principal" }),
      });
      const result = await modelPurposeResolverHandler.execute(ctx);
      expect(result.resolvedModelPurpose).toBe("writing");
    });

    it("sets null for non-LLM executors", async () => {
      const ctx = makeContext({
        stepDefinition: makeStep({ executor: "script" }),
      });
      const result = await modelPurposeResolverHandler.execute(ctx);
      expect(result.resolvedModelPurpose).toBeNull();
    });
  });
});
