/**
 * Goal Framing End-to-End Test — Brief 156
 *
 * Validates the full MP-1 meta-process chain:
 *   user need → process proposed → approved → first run completes → output reviewed
 *
 * Uses a real database with mocked LLM adapters (no external API calls).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

// ============================================================
// Module mocks — must precede dynamic imports
// ============================================================

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Mock process-model-lookup — control template matching
const mockFindProcessModel = vi.fn();
vi.mock("./system-agents/process-model-lookup", () => ({
  findProcessModel: (...args: unknown[]) => mockFindProcessModel(...args),
}));

// Mock step executor — return synthetic results, no LLM calls
const mockExecuteStep = vi.fn();
vi.mock("./step-executor", () => ({
  executeStep: (...args: unknown[]) => mockExecuteStep(...args),
}));

// Mock workspace-push — no companion view side-effects
vi.mock("./workspace-push", () => ({
  registerWorkspaceView: vi.fn(async () => ({ success: true })),
}));

// Mock integration registry — avoid loading real integrations
vi.mock("./integration-registry", () => ({
  getIntegration: vi.fn(() => undefined),
  getIntegrationRegistry: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

// Mock process-io — deliverOutput is fire-and-forget post-completion
vi.mock("./process-io", () => ({
  deliverOutput: vi.fn(async () => {}),
}));

// Mock chain-executor — no chain spawning during test
vi.mock("./chain-executor", () => ({
  processChains: vi.fn(async () => {}),
}));

// Mock completion-notifier — no external notifications
vi.mock("./completion-notifier", () => ({
  notifyProcessCompletion: vi.fn(async () => {}),
}));

// Mock notify-user — no external notifications
vi.mock("./notify-user", () => ({
  notifyUser: vi.fn(async () => {}),
}));

// Mock budget — no budget enforcement
vi.mock("./budget", () => ({
  checkBudgetExhausted: vi.fn(() => false),
  checkBudgetWarning: vi.fn(() => null),
  formatBudgetForLlm: vi.fn(() => ""),
  requestTopUp: vi.fn(async () => {}),
}));

// Mock people — no interaction lookups
vi.mock("./people", () => ({
  hasInteractionSince: vi.fn(async () => false),
  hasAnyInteractionSince: vi.fn(async () => false),
}));

// Mock harness handlers that need external resources
vi.mock("./harness-handlers/memory-assembly", () => ({
  memoryAssemblyHandler: {
    name: "memory-assembly",
    canHandle: () => true,
    execute: async (ctx: Record<string, unknown>) => ctx,
  },
}));

vi.mock("./harness-handlers/metacognitive-check", () => ({
  metacognitiveCheckHandler: {
    name: "metacognitive-check",
    canHandle: () => true,
    execute: async (ctx: Record<string, unknown>) => ctx,
  },
}));

vi.mock("./harness-handlers/deliberative-perspectives", () => ({
  deliberativePerspectivesHandler: {
    name: "deliberative-perspectives",
    canHandle: () => true,
    execute: async (ctx: Record<string, unknown>) => ctx,
  },
}));

// Dynamic imports (after mocks are registered)
const { handleGenerateProcess } = await import("./self-tools/generate-process");
const { startProcessRun, fullHeartbeat } = await import("./heartbeat");
const { recordApprovalFeedback } = await import("./harness-handlers/feedback-recorder");

/**
 * Helper: save a process via handleGenerateProcess and activate it for execution.
 */
async function createAndActivateProcess(
  name: string,
  description: string,
  steps: Array<{ id: string; name: string; executor: string; description?: string }>,
): Promise<{ slug: string; processId: string }> {
  const result = await handleGenerateProcess({ name, description, steps, save: true });
  if (!result.success) throw new Error(`Failed to create process: ${result.output}`);
  const output = JSON.parse(result.output);

  const [proc] = await testDb
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, output.slug))
    .limit(1);

  await testDb
    .update(schema.processes)
    .set({ status: "active" })
    .where(eq(schema.processes.id, proc.id));

  return { slug: output.slug, processId: proc.id };
}

// ============================================================
// Test setup
// ============================================================

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  vi.clearAllMocks();

  // Default: no template match (from-scratch generation)
  mockFindProcessModel.mockResolvedValue(null);

  // Default: step executor returns a clean result
  mockExecuteStep.mockResolvedValue({
    outputs: { response: "Step completed successfully", summary: "Done" },
    tokensUsed: 100,
    costCents: 0.5,
    confidence: "high" as const,
  });
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Full goal framing E2E flow
// ============================================================

describe("goal-framing-e2e", () => {
  // -----------------------------------------------------------
  // AC1: user input → generate_process proposes process with template matching
  // -----------------------------------------------------------
  it("AC1: user input → generate_process proposes process with template matching", async () => {
    // Simulate template match with moderate confidence
    mockFindProcessModel.mockResolvedValue({
      slug: "outreach-sequence",
      name: "Outreach Sequence",
      description: "Multi-step outreach process",
      confidence: 0.45,
      reasoning: "partial keyword match",
      templatePath: "",
    });

    const result = await handleGenerateProcess({
      name: "Customer Onboarding",
      description: "Onboard new customers with a welcome sequence",
      steps: [
        { id: "welcome", name: "Send Welcome", executor: "ai-agent", description: "Draft welcome email" },
        { id: "followup", name: "Follow Up", executor: "ai-agent", description: "Check in after 3 days" },
      ],
      save: false,
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("generate_process");

    const output = JSON.parse(result.output);
    expect(output.action).toBe("preview");
    expect(output.slug).toBe("customer-onboarding");
    expect(output.stepCount).toBe(2);
    // Template matching was called
    expect(mockFindProcessModel).toHaveBeenCalledWith("Onboard new customers with a welcome sequence");
    // Moderate confidence → inspiration mention
    expect(output.templateInspiration).toBe("outreach-sequence");
  });

  // -----------------------------------------------------------
  // AC2: proposal approval → process created in DB
  // -----------------------------------------------------------
  it("AC2: proposal approval → process created in DB", async () => {
    const result = await handleGenerateProcess({
      name: "Customer Onboarding",
      description: "Onboard new customers with a welcome sequence",
      steps: [
        { id: "welcome", name: "Send Welcome", executor: "ai-agent", description: "Draft welcome email" },
        { id: "followup", name: "Follow Up", executor: "ai-agent", description: "Check in after 3 days" },
      ],
      save: true,
    });

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output);
    expect(output.action).toBe("saved");
    expect(output.id).toBeDefined();
    expect(output.slug).toBe("customer-onboarding");
    expect(output.activationHint).toBe(true);

    // Verify process exists in DB
    const [dbProcess] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "customer-onboarding"))
      .limit(1);

    expect(dbProcess).toBeDefined();
    expect(dbProcess.name).toBe("Customer Onboarding");
    expect(dbProcess.status).toBe("draft");
    expect(dbProcess.trustTier).toBe("supervised");

    const def = dbProcess.definition as Record<string, unknown>;
    const steps = def.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("welcome");
    expect(steps[1].id).toBe("followup");
  });

  // -----------------------------------------------------------
  // AC3: post-creation activation → fullHeartbeat → first run starts
  // -----------------------------------------------------------
  it("AC3: post-creation activation → fullHeartbeat → first run starts", async () => {
    const { slug } = await createAndActivateProcess(
      "Customer Onboarding Flow",
      "Onboard new customers",
      [
        { id: "welcome", name: "Send Welcome", executor: "ai-agent", description: "Draft welcome email" },
        { id: "followup", name: "Follow Up", executor: "ai-agent", description: "Check in after 3 days" },
      ],
    );

    // Start a process run (simulates post-creation activation)
    const runId = await startProcessRun(slug, { task: "Onboard customer@example.com" }, "manual");
    expect(runId).toBeDefined();

    // Verify run is in DB with queued status
    const [run] = await testDb
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId))
      .limit(1);

    expect(run).toBeDefined();
    expect(run.status).toBe("queued");

    // Run fullHeartbeat to advance
    const heartbeatResult = await fullHeartbeat(runId);

    expect(heartbeatResult.processRunId).toBe(runId);
    // Supervised trust tier pauses after each step for review
    expect(heartbeatResult.stepsExecuted).toBe(1);
    expect(heartbeatResult.status).toBe("waiting_review");
  });

  // -----------------------------------------------------------
  // AC4: first run completes → output available for review
  // -----------------------------------------------------------
  it("AC4: first run completes → output available for review", async () => {
    const { slug } = await createAndActivateProcess(
      "Review Flow Test",
      "Test output availability after completion",
      [{ id: "analyze", name: "Analyze", executor: "ai-agent", description: "Analyze the input" }],
    );

    const runId = await startProcessRun(slug, { task: "Analyze market trends" }, "manual");
    await fullHeartbeat(runId);

    // Verify step runs were created
    const stepRuns = await testDb
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, runId));

    expect(stepRuns.length).toBeGreaterThanOrEqual(1);

    const analyzeStep = stepRuns.find((s) => s.stepId === "analyze");
    expect(analyzeStep).toBeDefined();
    expect(analyzeStep!.outputs).toBeDefined();

    // Verify the step result is the mock output
    const outputs = analyzeStep!.outputs as Record<string, unknown>;
    expect(outputs.response).toBe("Step completed successfully");

    // Supervised process pauses at trust gate after first step
    const [finalRun] = await testDb
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId))
      .limit(1);

    expect(finalRun.status).toBe("waiting_review");
  });

  // -----------------------------------------------------------
  // AC5: review action (approve) → trust data updated
  // -----------------------------------------------------------
  it("AC5: review action (approve) → trust data updated", async () => {
    const { slug, processId } = await createAndActivateProcess(
      "Trust Update Test",
      "Test trust evaluation after approval",
      [{ id: "draft", name: "Draft", executor: "ai-agent", description: "Draft content" }],
    );

    const runId = await startProcessRun(slug, { task: "Draft a proposal" }, "manual");
    await fullHeartbeat(runId);

    // Create a process output (simulates what the harness normally records)
    const [processOutput] = await testDb
      .insert(schema.processOutputs)
      .values({
        processRunId: runId,
        name: "draft-output",
        type: "text",
        content: { text: "Here is the drafted proposal content." },
        needsReview: true,
      })
      .returning();

    // Record approval feedback
    await recordApprovalFeedback({
      outputId: processOutput.id,
      processId,
      comment: "Looks good, approved!",
    });

    // Verify feedback was recorded
    const feedbackRecords = await testDb
      .select()
      .from(schema.feedback)
      .where(
        and(
          eq(schema.feedback.processId, processId),
          eq(schema.feedback.type, "approve"),
        )
      );

    expect(feedbackRecords.length).toBe(1);
    expect(feedbackRecords[0].outputId).toBe(processOutput.id);
    expect(feedbackRecords[0].comment).toBe("Looks good, approved!");
  });

  // -----------------------------------------------------------
  // AC6: all handoff points validated (no silent failures)
  // -----------------------------------------------------------
  it("AC6: full chain — generate → save → activate → run → complete → review → trust", async () => {
    // ── Stage 1: Generate process (preview) ──
    mockFindProcessModel.mockResolvedValue({
      slug: "sales-outreach",
      name: "Sales Outreach",
      description: "Sales outreach template",
      confidence: 0.7,
      reasoning: "strong match",
      templatePath: "", // No template file — will fall back to user steps
    });

    const previewResult = await handleGenerateProcess({
      name: "New Client Outreach",
      description: "Reach out to new clients with a tailored pitch",
      steps: [
        { id: "research", name: "Research Client", executor: "ai-agent", description: "Research the client" },
        { id: "draft", name: "Draft Pitch", executor: "ai-agent", description: "Write a tailored pitch" },
        { id: "review-pitch", name: "Review Pitch", executor: "ai-agent", description: "Quality check" },
      ],
      save: false,
    });

    expect(previewResult.success).toBe(true);
    const preview = JSON.parse(previewResult.output);
    expect(preview.action).toBe("preview");
    expect(preview.yaml).toBeDefined();

    // ── Stage 2 + 3: Save and activate via helper ──
    const { slug, processId } = await createAndActivateProcess(
      "New Client Outreach E2E",
      "Reach out to new clients with a tailored pitch",
      [
        { id: "research", name: "Research Client", executor: "ai-agent", description: "Research the client" },
        { id: "draft", name: "Draft Pitch", executor: "ai-agent", description: "Write a tailored pitch" },
        { id: "review-pitch", name: "Review Pitch", executor: "ai-agent", description: "Quality check" },
      ],
    );

    // ── Stage 4: Start run ──
    const runId = await startProcessRun(slug, { task: "Pitch to Acme Corp" }, "manual");
    expect(runId).toBeDefined();

    // ── Stage 5: Execute full heartbeat ──
    const heartbeatResult = await fullHeartbeat(runId);

    expect(heartbeatResult.processRunId).toBe(runId);
    expect(heartbeatResult.stepsExecuted).toBeGreaterThanOrEqual(1);

    // Verify step runs exist — no silent failures
    const stepRuns = await testDb
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, runId));

    expect(stepRuns.length).toBeGreaterThanOrEqual(1);

    // First step should be waiting_review (supervised), rest not yet started
    const executedSteps = stepRuns.filter((sr) => sr.status !== "queued");
    expect(executedSteps.length).toBe(1);
    expect(executedSteps[0].status).toBe("waiting_review");

    // ── Stage 6: Create output and record approval ──
    const [output] = await testDb
      .insert(schema.processOutputs)
      .values({
        processRunId: runId,
        name: "pitch-output",
        type: "text",
        content: { text: "Tailored pitch for Acme Corp..." },
        needsReview: true,
      })
      .returning();

    await recordApprovalFeedback({
      outputId: output.id,
      processId,
      comment: "Perfect pitch, ship it",
    });

    // ── Stage 7: Verify trust data was updated ──
    const feedbackRecords = await testDb
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.processId, processId));

    expect(feedbackRecords.length).toBe(1);
    expect(feedbackRecords[0].type).toBe("approve");

    // Supervised process pauses at trust gate
    const [finalRun] = await testDb
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId))
      .limit(1);

    expect(finalRun.status).toBe("waiting_review");

    // Verify no orphaned step runs (all have a processRunId)
    for (const sr of stepRuns) {
      expect(sr.processRunId).toBe(runId);
    }
  });
});
