/**
 * Agent OS — Heartbeat Engine
 *
 * Borrowed from Paperclip's heartbeat model: agents wake, execute, sleep.
 * A heartbeat is a single execution cycle for a process run.
 *
 * Phase 2c: dependency resolution and parallel group execution.
 * Steps with depends_on wait until dependencies are approved.
 * Parallel groups execute all steps via Promise.all through the harness pipeline.
 * Processes without depends_on or parallel_group work exactly as before.
 *
 * Provenance: Parallel execution from Mastra packages/core/src/workflows/handlers/control-flow.ts
 */

import { db, schema } from "../db";
import type { StepExecutor, TrustTier } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type {
  ProcessDefinition,
  StepDefinition,
  StepEntry,
} from "./process-loader";
import {
  isParallelGroup,
  isStep,
  flattenSteps,
} from "./process-loader";
import {
  HarnessPipeline,
  createHarnessContext,
  type HarnessContext,
} from "./harness";
import { memoryAssemblyHandler } from "./harness-handlers/memory-assembly";
import { stepExecutionHandler } from "./harness-handlers/step-execution";
import { reviewPatternHandler } from "./harness-handlers/review-pattern";
import { trustGateHandler } from "./harness-handlers/trust-gate";
import { feedbackRecorderHandler } from "./harness-handlers/feedback-recorder";

export interface HeartbeatResult {
  processRunId: string;
  stepsExecuted: number;
  status: "advanced" | "waiting_review" | "completed" | "failed";
  message: string;
}

/**
 * Build the harness pipeline with all handlers in order.
 */
function buildPipeline(): HarnessPipeline {
  const pipeline = new HarnessPipeline();
  pipeline.register(memoryAssemblyHandler);
  pipeline.register(stepExecutionHandler);
  pipeline.register(reviewPatternHandler);
  pipeline.register(trustGateHandler);
  pipeline.register(feedbackRecorderHandler);
  return pipeline;
}

// ============================================================
// Dependency resolution
// ============================================================

type NextWork =
  | { type: "step"; step: StepDefinition }
  | { type: "parallel_group"; groupId: string; steps: StepDefinition[] }
  | { type: "complete" }
  | { type: "blocked" };

/**
 * Determine the next work item to execute.
 *
 * Resolution rules:
 * 1. If no depends_on/parallel_group, execute in YAML order (backward compatible)
 * 2. If depends_on is declared, check all dependencies are approved
 * 3. Parallel groups are ready when their depends_on are all approved
 * 4. Steps within waiting_review parallel groups are skipped (group is paused)
 */
function findNextWork(
  definition: ProcessDefinition,
  completedStepIds: Set<string>,
  waitingStepIds: Set<string>
): NextWork {
  const hasDependencies = definition.steps.some(
    (entry) =>
      (isParallelGroup(entry) && entry.depends_on) ||
      (isStep(entry) && entry.depends_on)
  );

  // If no dependencies declared anywhere, use simple sequential order
  if (!hasDependencies) {
    const allSteps = flattenSteps(definition);
    const nextStep = allSteps.find(
      (s) => !completedStepIds.has(s.id) && !waitingStepIds.has(s.id)
    );
    if (!nextStep) {
      // Check if all steps are done
      const allDone = allSteps.every((s) => completedStepIds.has(s.id));
      return allDone ? { type: "complete" } : { type: "blocked" };
    }
    return { type: "step", step: nextStep };
  }

  // Dependency-aware resolution
  for (const entry of definition.steps) {
    if (isParallelGroup(entry)) {
      // Check if all steps in group are already done
      const allGroupDone = entry.steps.every((s) => completedStepIds.has(s.id));
      if (allGroupDone) continue;

      // Check if any step is waiting for review
      const anyWaiting = entry.steps.some((s) => waitingStepIds.has(s.id));
      if (anyWaiting) continue;

      // Check if group dependencies are met
      const deps = entry.depends_on || [];
      const depsReady = deps.every((dep) => isDependencyMet(dep, definition, completedStepIds));
      if (!depsReady) continue;

      // Group is ready — return steps that haven't been completed
      const pendingSteps = entry.steps.filter((s) => !completedStepIds.has(s.id));
      if (pendingSteps.length > 0) {
        return { type: "parallel_group", groupId: entry.parallel_group, steps: pendingSteps };
      }
    } else {
      if (completedStepIds.has(entry.id) || waitingStepIds.has(entry.id)) continue;

      // Check if step dependencies are met
      const deps = entry.depends_on || [];
      const depsReady = deps.every((dep) => isDependencyMet(dep, definition, completedStepIds));
      if (!depsReady) continue;

      return { type: "step", step: entry };
    }
  }

  // Check if everything is done
  const allSteps = flattenSteps(definition);
  const allDone = allSteps.every((s) => completedStepIds.has(s.id));
  return allDone ? { type: "complete" } : { type: "blocked" };
}

/**
 * Check if a dependency is met.
 * A dependency can be a step ID or a parallel group ID.
 * A parallel group is met when ALL its steps are approved.
 */
function isDependencyMet(
  depId: string,
  definition: ProcessDefinition,
  completedStepIds: Set<string>
): boolean {
  // Check if it's a parallel group
  for (const entry of definition.steps) {
    if (isParallelGroup(entry) && entry.parallel_group === depId) {
      return entry.steps.every((s) => completedStepIds.has(s.id));
    }
  }
  // It's a step ID
  return completedStepIds.has(depId);
}

// ============================================================
// Step execution (single step through pipeline)
// ============================================================

interface StepPipelineResult {
  status: "advanced" | "waiting_review" | "failed";
  stepId: string;
  stepName: string;
  message: string;
}

async function executeSingleStep(
  step: StepDefinition,
  processRunId: string,
  run: { processId: string; inputs: unknown; startedAt: Date | null },
  definition: ProcessDefinition,
  trustTier: TrustTier,
  parallelGroupId?: string
): Promise<StepPipelineResult> {
  // Human steps pause immediately — no pipeline
  if (step.executor === "human") {
    await db.insert(schema.stepRuns).values({
      processRunId,
      stepId: step.id,
      status: "waiting_review",
      executorType: "human",
      parallelGroupId: parallelGroupId || null,
    });

    return {
      status: "waiting_review",
      stepId: step.id,
      stepName: step.name,
      message: `Waiting for human: ${step.name}`,
    };
  }

  // Create step run record
  const stepRunRecord = await db
    .insert(schema.stepRuns)
    .values({
      processRunId,
      stepId: step.id,
      status: "running",
      executorType: step.executor as StepExecutor,
      startedAt: new Date(),
      parallelGroupId: parallelGroupId || null,
    })
    .returning();

  // Run through harness pipeline
  const pipeline = buildPipeline();
  const harnessContext = createHarnessContext({
    processRun: {
      id: processRunId,
      processId: run.processId,
      inputs: run.inputs as Record<string, unknown>,
    },
    stepDefinition: step,
    processDefinition: definition,
    trustTier,
    stepRunId: stepRunRecord[0].id,
  });

  const result = await pipeline.run(harnessContext);

  // Handle failure
  if (result.stepError) {
    await db
      .update(schema.stepRuns)
      .set({
        status: "failed",
        error: result.stepError.message,
        completedAt: new Date(),
      })
      .where(eq(schema.stepRuns.id, stepRunRecord[0].id));

    await logActivity("step.failed", stepRunRecord[0].id, "step_run", {
      step: step.id,
      error: result.stepError.message,
    });

    return {
      status: "failed",
      stepId: step.id,
      stepName: step.name,
      message: `Step "${step.name}" failed: ${result.stepError.message}`,
    };
  }

  if (!result.stepResult) {
    throw new Error(`Pipeline returned no stepResult and no stepError for step "${step.id}"`);
  }
  const stepResult = result.stepResult;

  // Store outputs
  if (stepResult.outputs && Object.keys(stepResult.outputs).length > 0) {
    for (const [name, content] of Object.entries(stepResult.outputs)) {
      const matchingOutput = definition.outputs.find((o) => o.name === name);
      const needsReview =
        result.trustAction === "pause" ||
        result.trustAction === "sample_pause";
      await db.insert(schema.processOutputs).values({
        processRunId,
        stepRunId: stepRunRecord[0].id,
        name,
        type: matchingOutput?.type || "text",
        content: content as Record<string, unknown>,
        needsReview,
        confidenceScore: stepResult.confidence,
      });
    }
  }

  if (
    result.trustAction === "advance" ||
    result.trustAction === "sample_advance"
  ) {
    await db
      .update(schema.stepRuns)
      .set({
        status: "approved",
        outputs: stepResult.outputs,
        completedAt: new Date(),
        tokensUsed: stepResult.tokensUsed || 0,
        costCents: stepResult.costCents || 0,
      })
      .where(eq(schema.stepRuns.id, stepRunRecord[0].id));

    await logActivity("step.completed", stepRunRecord[0].id, "step_run", {
      step: step.id,
      stepName: step.name,
      tokensUsed: stepResult.tokensUsed,
      trustAction: result.trustAction,
    });

    return {
      status: "advanced",
      stepId: step.id,
      stepName: step.name,
      message: `Completed step: ${step.name} (auto-advanced)`,
    };
  }

  // Pause for review
  await db
    .update(schema.stepRuns)
    .set({
      status: "waiting_review",
      outputs: stepResult.outputs,
      completedAt: new Date(),
      tokensUsed: stepResult.tokensUsed || 0,
      costCents: stepResult.costCents || 0,
    })
    .where(eq(schema.stepRuns.id, stepRunRecord[0].id));

  await logActivity("step.completed", stepRunRecord[0].id, "step_run", {
    step: step.id,
    stepName: step.name,
    trustAction: result.trustAction,
  });

  return {
    status: "waiting_review",
    stepId: step.id,
    stepName: step.name,
    message: `Step "${step.name}" paused for review (trust: ${trustTier}, action: ${result.trustAction})`,
  };
}

// ============================================================
// Heartbeat
// ============================================================

/**
 * Execute a single heartbeat for a process run.
 * Resolves dependencies, handles parallel groups, executes through harness pipeline.
 */
export async function heartbeat(processRunId: string): Promise<HeartbeatResult> {
  // 1. Load the process run
  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, processRunId))
    .limit(1);

  if (!run) {
    return { processRunId, stepsExecuted: 0, status: "failed", message: "Process run not found" };
  }

  if (run.status !== "queued" && run.status !== "running") {
    return { processRunId, stepsExecuted: 0, status: "failed", message: `Process run is ${run.status}, not executable` };
  }

  // 2. Load the process definition
  const [process] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  if (!process) {
    return { processRunId, stepsExecuted: 0, status: "failed", message: "Process definition not found" };
  }

  const definition = process.definition as unknown as ProcessDefinition;

  // 3. Get current step states
  const existingStepRuns = await db
    .select()
    .from(schema.stepRuns)
    .where(eq(schema.stepRuns.processRunId, processRunId));

  const completedStepIds = new Set(
    existingStepRuns.filter((s) => s.status === "approved").map((s) => s.stepId)
  );
  const waitingStepIds = new Set(
    existingStepRuns
      .filter((s) => s.status === "waiting_review" || s.status === "running")
      .map((s) => s.stepId)
  );

  // 4. Find next work
  const nextWork = findNextWork(definition, completedStepIds, waitingStepIds);

  if (nextWork.type === "complete") {
    await db
      .update(schema.processRuns)
      .set({ status: "approved", completedAt: new Date() })
      .where(eq(schema.processRuns.id, processRunId));

    await logActivity("process.run.completed", processRunId, "process_run");

    return { processRunId, stepsExecuted: 0, status: "completed", message: "All steps complete" };
  }

  if (nextWork.type === "blocked") {
    return { processRunId, stepsExecuted: 0, status: "waiting_review", message: "Blocked — waiting for dependencies" };
  }

  // 5. Mark run as running
  await db
    .update(schema.processRuns)
    .set({
      status: "running",
      currentStepId: nextWork.type === "step" ? nextWork.step.id : nextWork.groupId,
      startedAt: run.startedAt || new Date(),
    })
    .where(eq(schema.processRuns.id, processRunId));

  const trustTier = process.trustTier as TrustTier;

  // 6. Execute
  if (nextWork.type === "step") {
    const result = await executeSingleStep(
      nextWork.step, processRunId, run, definition, trustTier
    );

    if (result.status === "failed") {
      await db.update(schema.processRuns)
        .set({ status: "failed" })
        .where(eq(schema.processRuns.id, processRunId));
      return { processRunId, stepsExecuted: 1, status: "failed", message: result.message };
    }

    if (result.status === "waiting_review") {
      await db.update(schema.processRuns)
        .set({ status: "waiting_review" })
        .where(eq(schema.processRuns.id, processRunId));
      await logActivity("process.run.waiting_review", processRunId, "process_run", {
        step: result.stepId, stepName: result.stepName,
      });
      return { processRunId, stepsExecuted: 1, status: "waiting_review", message: result.message };
    }

    return { processRunId, stepsExecuted: 1, status: "advanced", message: result.message };
  }

  // Parallel group execution (Mastra Promise.all pattern)
  const { groupId, steps } = nextWork;
  const results = await Promise.all(
    steps.map((step) =>
      executeSingleStep(step, processRunId, run, definition, trustTier, groupId)
    )
  );

  const stepsExecuted = results.length;
  const anyFailed = results.find((r) => r.status === "failed");
  const anyWaiting = results.find((r) => r.status === "waiting_review");

  if (anyFailed) {
    // Group fails if any step fails
    await db.update(schema.processRuns)
      .set({ status: "failed" })
      .where(eq(schema.processRuns.id, processRunId));
    return {
      processRunId,
      stepsExecuted,
      status: "failed",
      message: `Parallel group "${groupId}" failed: ${anyFailed.message}`,
    };
  }

  if (anyWaiting) {
    await db.update(schema.processRuns)
      .set({ status: "waiting_review", currentStepId: groupId })
      .where(eq(schema.processRuns.id, processRunId));
    await logActivity("process.run.waiting_review", processRunId, "process_run", {
      parallelGroup: groupId,
      waitingSteps: results.filter((r) => r.status === "waiting_review").map((r) => r.stepId),
    });
    return {
      processRunId,
      stepsExecuted,
      status: "waiting_review",
      message: `Parallel group "${groupId}" paused — some steps waiting for review`,
    };
  }

  // All steps in group advanced
  return {
    processRunId,
    stepsExecuted,
    status: "advanced",
    message: `Parallel group "${groupId}" complete (${stepsExecuted} steps)`,
  };
}

/**
 * Run a full heartbeat cycle — execute all available steps until
 * hitting a pause (human gate or trust gate) or completion.
 */
export async function fullHeartbeat(processRunId: string): Promise<HeartbeatResult> {
  let totalSteps = 0;
  let lastResult: HeartbeatResult;

  do {
    lastResult = await heartbeat(processRunId);
    totalSteps += lastResult.stepsExecuted;
  } while (lastResult.status === "advanced");

  return {
    ...lastResult,
    stepsExecuted: totalSteps,
  };
}

/**
 * Start a new process run
 */
export async function startProcessRun(
  processSlug: string,
  inputs: Record<string, unknown> = {},
  triggeredBy: string = "manual"
): Promise<string> {
  const [process] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!process) {
    throw new Error(`Process not found: ${processSlug}`);
  }

  const [run] = await db
    .insert(schema.processRuns)
    .values({
      processId: process.id,
      status: "queued",
      triggeredBy,
      inputs,
    })
    .returning();

  await logActivity("process.run.created", run.id, "process_run", {
    processSlug,
    triggeredBy,
  });

  console.log(`Started process run: ${process.name} (${run.id})`);
  return run.id;
}

// Helper to log activities
async function logActivity(
  action: string,
  entityId: string,
  entityType: string,
  metadata: Record<string, unknown> = {}
) {
  await db.insert(schema.activities).values({
    action,
    actorType: "system",
    entityType,
    entityId,
    metadata,
  });
}
