/**
 * Tests for system agent infrastructure (Brief 014a + 014b)
 *
 * Tests cover:
 * - System agent registry resolution (014a + 014b)
 * - Trust-evaluator system agent execution (014a)
 * - Intake-classifier keyword classification (014b)
 * - Router response parsing (014b)
 * - Orchestrator pass-through (014b)
 * - System agent process sync (agent record creation)
 * - Step executor system agent dispatch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ProcessDefinition } from "../process-loader";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Mock Anthropic SDK (required by claude adapter import chain)
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("System agent registry", () => {
  it("resolves trust-evaluator handler", async () => {
    const { resolveSystemAgent } = await import("./index");
    const handler = resolveSystemAgent("trust-evaluator");
    expect(handler).toBeTypeOf("function");
  });

  it("throws for unknown system agent", async () => {
    const { resolveSystemAgent } = await import("./index");
    expect(() => resolveSystemAgent("nonexistent")).toThrow("Unknown system agent: nonexistent");
  });
});

describe("Trust-evaluator system agent", () => {
  it("returns high confidence evaluation result", async () => {
    const { executeTrustEvaluator } = await import("./trust-evaluator");

    // Create a process for trust evaluation
    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-process",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    const result = await executeTrustEvaluator({ processId: proc.id });

    expect(result.confidence).toBe("high");
    expect(result.outputs["evaluation-result"]).toBeDefined();
    const evalResult = result.outputs["evaluation-result"] as { action: string };
    expect(evalResult.action).toBeDefined();
  });

  it("throws when processId is missing", async () => {
    const { executeTrustEvaluator } = await import("./trust-evaluator");
    await expect(executeTrustEvaluator({})).rejects.toThrow("processId");
  });
});

describe("System agent process sync", () => {
  it("creates agent record with category: system on sync", async () => {
    const { syncProcessesToDb } = await import("../process-loader");

    const systemDef = {
      ...makeTestProcessDefinition({ name: "Trust Evaluation", id: "trust-evaluation" }),
      system: true,
    } as ProcessDefinition;

    await syncProcessesToDb([systemDef]);

    // Check that an agent record was created with category: system
    const agents = await testDb
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.systemRole, "trust-evaluation"));

    expect(agents).toHaveLength(1);
    expect(agents[0].category).toBe("system");
    expect(agents[0].systemRole).toBe("trust-evaluation");
    expect(agents[0].role).toBe("system");
  });

  it("does not create agent record for non-system processes", async () => {
    const { syncProcessesToDb } = await import("../process-loader");

    const domainDef = makeTestProcessDefinition({ name: "Domain Process", id: "domain-process" }) as ProcessDefinition;

    await syncProcessesToDb([domainDef]);

    const agents = await testDb.select().from(schema.agents);
    expect(agents).toHaveLength(0);
  });

  it("updates existing system agent record on re-sync", async () => {
    const { syncProcessesToDb } = await import("../process-loader");

    const systemDef = {
      ...makeTestProcessDefinition({ name: "Trust Evaluation", id: "trust-evaluation" }),
      system: true,
      description: "Version 1",
    } as ProcessDefinition;

    await syncProcessesToDb([systemDef]);

    // Re-sync with updated description
    const updatedDef = { ...systemDef, description: "Version 2" } as ProcessDefinition;
    await syncProcessesToDb([updatedDef]);

    const agents = await testDb
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.systemRole, "trust-evaluation"));

    expect(agents).toHaveLength(1);
    expect(agents[0].description).toBe("Version 2");
  });
});

describe("Step executor system agent dispatch", () => {
  it("dispatches to system agent handler for script executor with systemAgent config", async () => {
    const { executeStep } = await import("../step-executor");

    // Create a process for trust evaluation target
    const [proc] = await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-process",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    }).returning();

    const step = {
      id: "evaluate-trust",
      name: "Evaluate Trust State",
      executor: "script",
      config: { systemAgent: "trust-evaluator" },
    };

    const result = await executeStep(
      step as any,
      { processId: proc.id },
      makeTestProcessDefinition() as any,
    );

    expect(result.confidence).toBe("high");
    expect(result.outputs["evaluation-result"]).toBeDefined();
  });
});

// ============================================================
// Brief 014b: Intake-classifier tests
// ============================================================

describe("Intake-classifier system agent", () => {
  it("classifies questions by question words", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    expect(classifyWorkItem("Why are our quotes taking so long?").type).toBe("question");
    expect(classifyWorkItem("What is the status of the Henderson job?").type).toBe("question");
    expect(classifyWorkItem("How do we handle overtime?").type).toBe("question");
  });

  it("classifies questions by trailing ?", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    expect(classifyWorkItem("Henderson job status?").type).toBe("question");
  });

  it("classifies tasks by action verbs", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    const result = classifyWorkItem("Send Henderson a follow-up email");
    expect(result.type).toBe("task");
    expect(result.confidence).toBe("medium");
  });

  it("classifies goals by aspirational language", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    expect(classifyWorkItem("Achieve quote turnaround under 24 hours").type).toBe("goal");
    expect(classifyWorkItem("Improve customer response time").type).toBe("goal");
  });

  it("classifies insights by realization language", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    expect(classifyWorkItem("Learned that bathroom labour is always underestimated").type).toBe("insight");
    expect(classifyWorkItem("Noticed the pricing template is outdated").type).toBe("insight");
  });

  it("classifies outcomes by deadline language", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    expect(classifyWorkItem("Pricing analysis by Friday").type).toBe("outcome");
    expect(classifyWorkItem("Complete audit before end of month").type).toBe("outcome");
  });

  it("defaults to task with low confidence when no keyword match", async () => {
    const { classifyWorkItem } = await import("./intake-classifier");

    const result = classifyWorkItem("Henderson thing");
    expect(result.type).toBe("task");
    expect(result.confidence).toBe("low");
  });

  it("executes as system agent handler", async () => {
    const { executeIntakeClassifier } = await import("./intake-classifier");

    const result = await executeIntakeClassifier({ content: "Henderson wants a bathroom quote" });
    expect(result.confidence).toBeDefined();
    const classification = result.outputs["classification-result"] as { type: string };
    expect(classification.type).toBe("task"); // "wants" is an action verb
  });

  it("throws when content is missing", async () => {
    const { executeIntakeClassifier } = await import("./intake-classifier");
    await expect(executeIntakeClassifier({})).rejects.toThrow("content");
  });
});

// ============================================================
// Brief 014b: Registry resolves new agents
// ============================================================

describe("System agent registry (014b additions)", () => {
  it("resolves intake-classifier handler", async () => {
    const { resolveSystemAgent } = await import("./index");
    expect(resolveSystemAgent("intake-classifier")).toBeTypeOf("function");
  });

  it("resolves router handler", async () => {
    const { resolveSystemAgent } = await import("./index");
    expect(resolveSystemAgent("router")).toBeTypeOf("function");
  });

  it("resolves orchestrator handler", async () => {
    const { resolveSystemAgent } = await import("./index");
    expect(resolveSystemAgent("orchestrator")).toBeTypeOf("function");
  });
});

// ============================================================
// Brief 014b: Orchestrator tests
// ============================================================

describe("Orchestrator system agent", () => {
  it("escalates when no process slug provided", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const result = await executeOrchestrator({ content: "test" });
    expect(result.confidence).toBe("low");
    const orchestration = result.outputs["orchestration-result"] as { action: string };
    expect(orchestration.action).toBe("escalated");
  });

  it("starts a process run for valid process slug (task pass-through)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    // Create a process to orchestrate
    await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-process",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const result = await executeOrchestrator({
      processSlug: "test-process",
      workItemId: randomUUID(),
      content: "test work item",
      workItemType: "task",
    });

    const orchestration = result.outputs["orchestration-result"] as { action: string };
    expect(orchestration.action).toBe("started");
    expect(result.confidence).toBe("high");
  });

  it("escalates for non-existent process slug (task pass-through)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const result = await executeOrchestrator({
      processSlug: "nonexistent-process",
      workItemId: randomUUID(),
      content: "test",
      workItemType: "task",
    });

    const orchestration = result.outputs["orchestration-result"] as { action: string };
    expect(orchestration.action).toBe("escalated");
    expect(result.confidence).toBe("low");
  });
});
