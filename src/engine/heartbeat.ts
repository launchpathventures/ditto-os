/**
 * Ditto — Heartbeat Engine
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
import { harnessEvents } from "./events";
import { memoryAssemblyHandler } from "./harness-handlers/memory-assembly";
import { stepExecutionHandler } from "./harness-handlers/step-execution";
import { reviewPatternHandler } from "./harness-handlers/review-pattern";
import { routingHandler } from "./harness-handlers/routing";
import { trustGateHandler } from "./harness-handlers/trust-gate";
import { metacognitiveCheckHandler } from "./harness-handlers/metacognitive-check";
import { feedbackRecorderHandler } from "./harness-handlers/feedback-recorder";
import { deliverOutput } from "./process-io";

export interface HeartbeatResult {
  processRunId: string;
  stepsExecuted: number;
  status: "advanced" | "waiting_review" | "waiting_human" | "completed" | "failed";
  message: string;
}

/**
 * Build the harness pipeline with all handlers in order.
 */
function buildPipeline(): HarnessPipeline {
  const pipeline = new HarnessPipeline();
  pipeline.register(memoryAssemblyHandler);
  pipeline.register(stepExecutionHandler);
  pipeline.register(metacognitiveCheckHandler);
  pipeline.register(reviewPatternHandler);
  pipeline.register(routingHandler);
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
 * 2. If depends_on is declared, check all dependencies are approved/skipped
 * 3. Parallel groups are ready when their depends_on are all approved/skipped
 * 4. Steps within waiting_review parallel groups are skipped (group is paused)
 * 5. If routingTarget is set, only that step is eligible next (Brief 016b)
 *
 * "doneStepIds" includes both approved AND skipped steps — routing can
 * skip steps, and downstream dependencies should treat them as resolved.
 */
function findNextWork(
  definition: ProcessDefinition,
  doneStepIds: Set<string>,
  waitingStepIds: Set<string>,
  routingTarget?: string | null,
): NextWork {
  const hasDependencies = definition.steps.some(
    (entry) =>
      (isParallelGroup(entry) && entry.depends_on) ||
      (isStep(entry) && entry.depends_on)
  );

  // If routing target is set, go directly to that step (if it exists and is ready)
  if (routingTarget) {
    const allSteps = flattenSteps(definition);
    const targetStep = allSteps.find((s) => s.id === routingTarget);
    if (targetStep && !doneStepIds.has(targetStep.id) && !waitingStepIds.has(targetStep.id)) {
      return { type: "step", step: targetStep };
    }
  }

  // If no dependencies declared anywhere, use simple sequential order
  if (!hasDependencies) {
    const allSteps = flattenSteps(definition);
    const nextStep = allSteps.find(
      (s) => !doneStepIds.has(s.id) && !waitingStepIds.has(s.id)
    );
    if (!nextStep) {
      const allDone = allSteps.every((s) => doneStepIds.has(s.id));
      return allDone ? { type: "complete" } : { type: "blocked" };
    }
    return { type: "step", step: nextStep };
  }

  // Dependency-aware resolution
  for (const entry of definition.steps) {
    if (isParallelGroup(entry)) {
      const allGroupDone = entry.steps.every((s) => doneStepIds.has(s.id));
      if (allGroupDone) continue;

      const anyWaiting = entry.steps.some((s) => waitingStepIds.has(s.id));
      if (anyWaiting) continue;

      const deps = entry.depends_on || [];
      const depsReady = deps.every((dep) => isDependencyMet(dep, definition, doneStepIds));
      if (!depsReady) continue;

      const pendingSteps = entry.steps.filter((s) => !doneStepIds.has(s.id));
      if (pendingSteps.length > 0) {
        return { type: "parallel_group", groupId: entry.parallel_group, steps: pendingSteps };
      }
    } else {
      if (doneStepIds.has(entry.id) || waitingStepIds.has(entry.id)) continue;

      const deps = entry.depends_on || [];
      const depsReady = deps.every((dep) => isDependencyMet(dep, definition, doneStepIds));
      if (!depsReady) continue;

      return { type: "step", step: entry };
    }
  }

  const allSteps = flattenSteps(definition);
  const allDone = allSteps.every((s) => doneStepIds.has(s.id));
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
  routingDecision?: import("./harness-handlers/routing").RoutingDecision | null;
}

async function executeSingleStep(
  step: StepDefinition,
  processRunId: string,
  run: { processId: string; inputs: unknown; startedAt: Date | null },
  definition: ProcessDefinition,
  trustTier: TrustTier,
  parallelGroupId?: string
): Promise<StepPipelineResult> {
  // Human steps suspend immediately — create action work item, serialize state
  // Provenance: Mastra path-based suspend/resume, ADR-010 Section 4
  if (step.executor === "human") {
    const [stepRunRecord] = await db.insert(schema.stepRuns).values({
      processRunId,
      stepId: step.id,
      status: "waiting_review",
      executorType: "human",
      parallelGroupId: parallelGroupId || null,
    }).returning();

    // Build suspend payload (ADR-010: instructions, context, input_fields, timeout)
    const suspendPayload = {
      stepId: step.id,
      stepName: step.name,
      stepRunId: stepRunRecord.id,
      instructions: step.instructions || step.description || `Complete: ${step.name}`,
      inputFields: step.input_fields || [],
      timeout: step.timeout,
      context: run.inputs,
    };

    // Collect completed step results so far (for resume — skip completed steps)
    const completedResults: Record<string, unknown> = {};
    const existingRuns = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, processRunId));
    for (const sr of existingRuns) {
      if (sr.status === "approved" && sr.outputs) {
        completedResults[sr.stepId] = sr.outputs;
      }
    }

    // Serialize suspend state on the process run
    await db.update(schema.processRuns)
      .set({
        suspendState: {
          suspendedAtStep: step.id,
          suspendPayload,
          completedStepResults: completedResults,
        } as Record<string, unknown>,
      })
      .where(eq(schema.processRuns.id, processRunId));

    // Create an action work item for the human step
    const processName = definition.name;
    await db.insert(schema.workItems).values({
      type: "task",
      status: "waiting_human",
      content: step.instructions || step.description || step.name,
      source: "process_spawned",
      assignedProcess: run.processId,
      executionIds: [processRunId],
      context: {
        stepRunId: stepRunRecord.id,
        processRunId,
        processName,
        inputFields: step.input_fields || [],
        instructions: step.instructions || step.description || step.name,
      },
    });

    await logActivity("step.waiting_human", stepRunRecord.id, "step_run", {
      step: step.id,
      stepName: step.name,
      processRunId,
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

  // Emit step-start event (AC16)
  const stepStartTime = Date.now();
  harnessEvents.emit({
    type: "step-start",
    processRunId,
    stepId: step.id,
    roleName: step.agent_role || step.executor,
    processName: definition.name,
  });

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
        confidenceLevel: stepResult.confidence || null,
        model: stepResult.model || null,
        toolCalls: stepResult.toolCalls || null,
      })
      .where(eq(schema.stepRuns.id, stepRunRecord[0].id));

    await logActivity("step.completed", stepRunRecord[0].id, "step_run", {
      step: step.id,
      stepName: step.name,
      tokensUsed: stepResult.tokensUsed,
      trustAction: result.trustAction,
    });

    // Emit events (AC16)
    harnessEvents.emit({
      type: "gate-advance",
      processRunId,
      stepId: step.id,
      confidence: stepResult.confidence,
    });
    harnessEvents.emit({
      type: "step-complete",
      processRunId,
      stepId: step.id,
      summary: `${step.name} auto-advanced`,
      confidence: stepResult.confidence,
      duration: Date.now() - stepStartTime,
    });
    if (result.routingDecision?.nextStepId) {
      harnessEvents.emit({
        type: "routing-decision",
        processRunId,
        from: step.id,
        to: result.routingDecision.nextStepId,
        reasoning: result.routingDecision.reasoning,
        mode: result.routingDecision.mode,
      });
    }

    return {
      status: "advanced",
      stepId: step.id,
      stepName: step.name,
      message: `Completed step: ${step.name} (auto-advanced)`,
      routingDecision: result.routingDecision,
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
      confidenceLevel: stepResult.confidence || null,
      model: stepResult.model || null,
      toolCalls: stepResult.toolCalls || null,
    })
    .where(eq(schema.stepRuns.id, stepRunRecord[0].id));

  await logActivity("step.completed", stepRunRecord[0].id, "step_run", {
    step: step.id,
    stepName: step.name,
    trustAction: result.trustAction,
  });

  // Emit events (AC16)
  const outputSummary = Object.values(stepResult.outputs)
    .map((v) => (typeof v === "string" ? v.slice(0, 200) : JSON.stringify(v).slice(0, 200)))
    .join("; ");
  harnessEvents.emit({
    type: "gate-pause",
    processRunId,
    stepId: step.id,
    reason: `trust: ${trustTier}, action: ${result.trustAction}`,
    output: outputSummary,
  });
  harnessEvents.emit({
    type: "step-complete",
    processRunId,
    stepId: step.id,
    summary: `${step.name} paused for review`,
    confidence: stepResult.confidence,
    duration: Date.now() - stepStartTime,
  });

  return {
    status: "waiting_review",
    stepId: step.id,
    stepName: step.name,
    message: `Step "${step.name}" paused for review (trust: ${trustTier}, action: ${result.trustAction})`,
    routingDecision: result.routingDecision,
  };
}

// ============================================================
// Routing helpers
// ============================================================

/**
 * When a step routes to a specific target, mark sibling steps
 * (those that depend on the same parent and aren't the target or
 * descendants of the target) as "skipped".
 *
 * Only skips steps that share the same depends_on as the target
 * and aren't already done. This prevents skipping unrelated steps.
 */
async function applyRoutingSkips(
  processRunId: string,
  fromStepId: string,
  targetStepId: string,
  definition: ProcessDefinition,
  doneStepIds: Set<string>,
): Promise<void> {
  const allSteps = flattenSteps(definition);

  // Find siblings: steps that depend on the same parent as target
  // (or steps that depend on fromStepId but aren't the target)
  const stepsToSkip = allSteps.filter((step) => {
    if (step.id === targetStepId) return false;
    if (step.id === fromStepId) return false;
    if (doneStepIds.has(step.id)) return false;

    // Skip steps that depend on fromStepId but aren't the routing target
    if (step.depends_on?.includes(fromStepId)) {
      return true;
    }
    return false;
  });

  for (const step of stepsToSkip) {
    console.log(`    Routing skip: ${step.id} (routed to ${targetStepId} instead)`);
    await db.insert(schema.stepRuns).values({
      processRunId,
      stepId: step.id,
      status: "skipped",
      executorType: step.executor as StepExecutor,
    });
    doneStepIds.add(step.id);
  }
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

  if (run.status === "waiting_human") {
    return { processRunId, stepsExecuted: 0, status: "waiting_human", message: "Waiting for human step completion" };
  }

  if (run.status !== "queued" && run.status !== "running" && run.status !== "waiting_review") {
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

  // Use run-scoped definition override if present (ADR-020, Brief 044)
  // Re-read at each step boundary — Self may adapt the definition mid-run.
  const definition = (run.definitionOverride
    ? run.definitionOverride
    : process.definition) as unknown as ProcessDefinition;

  // 3. Get current step states
  const existingStepRuns = await db
    .select()
    .from(schema.stepRuns)
    .where(eq(schema.stepRuns.processRunId, processRunId));

  // doneStepIds includes both approved AND skipped (routing can skip steps)
  const doneStepIds = new Set(
    existingStepRuns
      .filter((s) => s.status === "approved" || s.status === "skipped")
      .map((s) => s.stepId)
  );
  const waitingStepIds = new Set(
    existingStepRuns
      .filter((s) => s.status === "waiting_review" || s.status === "running")
      .map((s) => s.stepId)
  );

  // 4. Find next work
  const nextWork = findNextWork(definition, doneStepIds, waitingStepIds);

  if (nextWork.type === "complete") {
    await db
      .update(schema.processRuns)
      .set({ status: "approved", completedAt: new Date() })
      .where(eq(schema.processRuns.id, processRunId));

    await logActivity("process.run.completed", processRunId, "process_run");

    harnessEvents.emit({
      type: "run-complete",
      processRunId,
      processName: definition.name,
      stepsExecuted: existingStepRuns.filter((s) => s.status === "approved").length,
    });

    // Output delivery: fire after run completes and trust gate has passed (Brief 036 AC7)
    try {
      await deliverOutput(processRunId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Output delivery failed for run ${processRunId.slice(0, 8)}: ${message}`);
      await logActivity("output.delivery.failed", processRunId, "process_run", {
        error: message,
      });
    }

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
      // Check retry_on_failure before failing the run
      const retryConfig = nextWork.step.retry_on_failure;
      if (retryConfig) {
        const retryCount = existingStepRuns.filter(
          (s) => s.stepId === nextWork.step.id && s.status === "failed"
        ).length;

        if (retryCount < retryConfig.max_retries) {
          console.log(`    Retry ${retryCount + 1}/${retryConfig.max_retries} for step "${nextWork.step.name}"`);
          harnessEvents.emit({
            type: "retry",
            processRunId,
            stepId: nextWork.step.id,
            attempt: retryCount + 1,
            maxRetries: retryConfig.max_retries,
          });
          // Re-queue — next heartbeat will re-execute this step
          await db.update(schema.processRuns)
            .set({ status: "running" })
            .where(eq(schema.processRuns.id, processRunId));
          return { processRunId, stepsExecuted: 1, status: "advanced", message: `Retrying step: ${nextWork.step.name} (attempt ${retryCount + 1})` };
        }

        // AC10: Max retries exceeded — set confidence to "low" and pause via trust gate
        // rather than hard-failing. The human gets to review the failure.
        console.log(`    Max retries (${retryConfig.max_retries}) exceeded for step "${nextWork.step.name}" — pausing with low confidence`);
        const lastFailedRun = existingStepRuns.find(
          (s) => s.stepId === nextWork.step.id && s.status === "failed"
        );
        await db.update(schema.stepRuns)
          .set({
            status: "waiting_review",
            confidenceLevel: "low",
          })
          .where(eq(schema.stepRuns.id, lastFailedRun!.id));

        await db.update(schema.processRuns)
          .set({ status: "waiting_review" })
          .where(eq(schema.processRuns.id, processRunId));

        harnessEvents.emit({
          type: "gate-pause",
          processRunId,
          stepId: nextWork.step.id,
          reason: `max retries (${retryConfig.max_retries}) exceeded`,
          output: result.message,
        });

        return { processRunId, stepsExecuted: 1, status: "waiting_review", message: `Step "${nextWork.step.name}" exhausted retries — paused for review` };
      }

      await db.update(schema.processRuns)
        .set({ status: "failed" })
        .where(eq(schema.processRuns.id, processRunId));

      harnessEvents.emit({
        type: "run-failed",
        processRunId,
        processName: definition.name,
        error: result.message,
      });

      return { processRunId, stepsExecuted: 1, status: "failed", message: result.message };
    }

    // Handle routing: if step has a routing decision, skip non-target siblings
    if (result.routingDecision?.nextStepId) {
      const targetStepId = result.routingDecision.nextStepId;
      await applyRoutingSkips(processRunId, nextWork.step.id, targetStepId, definition, doneStepIds);
    }

    if (result.status === "waiting_review") {
      // Human steps set run to waiting_human; AI steps set to waiting_review
      const isHumanStep = nextWork.step.executor === "human";
      const runStatus = isHumanStep ? "waiting_human" : "waiting_review";
      await db.update(schema.processRuns)
        .set({ status: runStatus })
        .where(eq(schema.processRuns.id, processRunId));
      await logActivity(
        isHumanStep ? "process.run.waiting_human" : "process.run.waiting_review",
        processRunId,
        "process_run",
        { step: result.stepId, stepName: result.stepName },
      );
      return {
        processRunId,
        stepsExecuted: 1,
        status: isHumanStep ? "waiting_human" : "waiting_review",
        message: result.message,
      };
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
  // Stops on: waiting_review, waiting_human, completed, failed

  return {
    ...lastResult,
    stepsExecuted: totalSteps,
  };
}

/**
 * Resume a process run after a human step is completed.
 * Injects human input into the suspended step, marks it approved,
 * clears suspend state, and continues execution.
 *
 * Provenance: Mastra path-based suspend/resume + Trigger.dev waitpoint token pattern.
 */
export async function resumeHumanStep(
  processRunId: string,
  humanInput: Record<string, unknown>,
): Promise<HeartbeatResult> {
  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, processRunId))
    .limit(1);

  if (!run) {
    return { processRunId, stepsExecuted: 0, status: "failed", message: "Process run not found" };
  }

  if (run.status !== "waiting_human") {
    return { processRunId, stepsExecuted: 0, status: "failed", message: `Process run is ${run.status}, not waiting for human` };
  }

  const suspendState = run.suspendState as Record<string, unknown> | null;
  if (!suspendState || !suspendState.suspendedAtStep) {
    return { processRunId, stepsExecuted: 0, status: "failed", message: "No suspend state found" };
  }

  const suspendedStepId = suspendState.suspendedAtStep as string;
  const suspendPayload = suspendState.suspendPayload as Record<string, unknown>;

  // Mark the suspended step run as approved with human input as outputs
  await db.update(schema.stepRuns)
    .set({
      status: "approved",
      outputs: humanInput,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.stepRuns.processRunId, processRunId),
        eq(schema.stepRuns.stepId, suspendedStepId),
      )
    );

  // Mark the corresponding work item as completed
  // Use source + status + assignedProcess for targeted lookup (avoids scanning all waiting items)
  const workItemCandidates = await db
    .select()
    .from(schema.workItems)
    .where(
      and(
        eq(schema.workItems.status, "waiting_human"),
        eq(schema.workItems.source, "process_spawned"),
        eq(schema.workItems.assignedProcess, run.processId),
      )
    )
    .limit(10);

  for (const wi of workItemCandidates) {
    const ctx = wi.context as Record<string, unknown> | null;
    if (ctx && ctx.processRunId === processRunId) {
      await db.update(schema.workItems)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.workItems.id, wi.id));
      break;
    }
  }

  // Clear suspend state and set run back to running
  await db.update(schema.processRuns)
    .set({
      status: "running",
      suspendState: null,
    })
    .where(eq(schema.processRuns.id, processRunId));

  await logActivity("process.run.resumed", processRunId, "process_run", {
    stepId: suspendedStepId,
    humanInput,
  });

  // Continue execution from where we left off
  return fullHeartbeat(processRunId);
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

/**
 * Start and execute a system agent process run programmatically.
 * Creates a process run for the named system agent process and runs
 * the full heartbeat cycle. Used by the feedback-recorder to trigger
 * trust evaluation, and by capture (014b) for intake/routing.
 *
 * Returns null if the system agent process doesn't exist (graceful degradation).
 */
export async function startSystemAgentRun(
  processSlug: string,
  inputs: Record<string, unknown>,
  triggeredBy: string = "system",
): Promise<HeartbeatResult | null> {
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    // Graceful degradation: if the system agent process doesn't exist yet
    // (e.g., before first sync), return null instead of throwing
    return null;
  }

  const [run] = await db
    .insert(schema.processRuns)
    .values({
      processId: proc.id,
      status: "queued",
      triggeredBy,
      inputs,
    })
    .returning();

  await logActivity("process.run.created", run.id, "process_run", {
    processSlug,
    triggeredBy,
    systemAgent: true,
  });

  return fullHeartbeat(run.id);
}

// ============================================================
// Orchestrator Heartbeat (Brief 021)
// Wrapper that iterates over spawned tasks for a goal work item,
// calling fullHeartbeat() on each unblocked one.
// Does NOT modify the inner heartbeat loop — existing linear execution unchanged.
//
// Provenance: Temporal Selectors (completion-order processing),
//             LangGraph plan-and-execute (plan-track loop)
// ============================================================

export interface OrchestratorHeartbeatResult {
  goalWorkItemId: string;
  tasksCompleted: number;
  tasksPaused: number;
  tasksRemaining: number;
  tasksRouteAround: number;
  confidence: "high" | "medium" | "low";
  status: "advancing" | "completed" | "paused" | "escalated";
  escalation?: {
    type: "blocked" | "error" | "aggregate_uncertainty";
    reason: string;
    openQuestions?: string[];
  };
}

/**
 * Execute a heartbeat cycle for a goal work item.
 * Iterates over spawned child tasks, running fullHeartbeat() on each
 * unblocked one. Routes around paused tasks to independent work.
 */
export async function orchestratorHeartbeat(
  goalWorkItemId: string,
): Promise<OrchestratorHeartbeatResult> {
  // Load the goal work item
  const [goalItem] = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.id, goalWorkItemId))
    .limit(1);

  if (!goalItem) {
    return {
      goalWorkItemId,
      tasksCompleted: 0,
      tasksPaused: 0,
      tasksRemaining: 0,
      tasksRouteAround: 0,
      confidence: "low",
      status: "escalated",
      escalation: {
        type: "error",
        reason: "Goal work item not found",
      },
    };
  }

  const decomposition = goalItem.decomposition as Array<{
    taskId: string;
    stepId: string;
    dependsOn: string[];
    status: string;
  }> | null;

  if (!decomposition || decomposition.length === 0) {
    return {
      goalWorkItemId,
      tasksCompleted: 0,
      tasksPaused: 0,
      tasksRemaining: 0,
      tasksRouteAround: 0,
      confidence: "low",
      status: "escalated",
      escalation: {
        type: "blocked",
        reason: "Goal has no decomposition — orchestrator needs to decompose first",
      },
    };
  }

  // Load all child work items to get current status
  const childIds = decomposition.map((t) => t.taskId);
  const childItems = await db
    .select()
    .from(schema.workItems)
    .where(inArray(schema.workItems.id, childIds));

  const childStatusMap = new Map<string, string>();
  for (const child of childItems) {
    childStatusMap.set(child.id, child.status);
  }

  // Categorize tasks
  const completedTaskIds = new Set<string>();
  const pausedTaskIds = new Set<string>();
  const failedTaskIds = new Set<string>();

  for (const task of decomposition) {
    const status = childStatusMap.get(task.taskId) || "intake";
    if (status === "completed") completedTaskIds.add(task.taskId);
    else if (status === "waiting_human" || status === "routed") pausedTaskIds.add(task.taskId);
    else if (status === "failed") failedTaskIds.add(task.taskId);
  }

  // Check completion
  if (completedTaskIds.size === decomposition.length) {
    // All tasks complete — goal achieved
    await db.update(schema.workItems)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.workItems.id, goalWorkItemId));

    // Update orchestrator confidence on the process run if one exists
    const executionId = goalItem.executionIds?.[0];
    if (executionId) {
      await db.update(schema.processRuns)
        .set({ orchestratorConfidence: "high" })
        .where(eq(schema.processRuns.id, executionId));
    }

    return {
      goalWorkItemId,
      tasksCompleted: completedTaskIds.size,
      tasksPaused: 0,
      tasksRemaining: 0,
      tasksRouteAround: 0,
      confidence: "high",
      status: "completed",
    };
  }

  // Find unblocked tasks: dependencies met and not yet complete/paused/failed
  let tasksRouteAround = 0;
  let tasksAdvanced = 0;

  for (const task of decomposition) {
    if (completedTaskIds.has(task.taskId) || pausedTaskIds.has(task.taskId) || failedTaskIds.has(task.taskId)) {
      continue;
    }

    // Check dependencies
    const depsReady = task.dependsOn.every(
      (depId) => completedTaskIds.has(depId),
    );

    if (!depsReady) {
      // Check if blocked by a paused task — this is a route-around situation
      const blockedByPaused = task.dependsOn.some((depId) => pausedTaskIds.has(depId));
      if (blockedByPaused) {
        tasksRouteAround++;
        await logActivity("orchestrator.route-around", goalWorkItemId, "work_item", {
          skippedTask: task.taskId,
          stepId: task.stepId,
          blockedBy: task.dependsOn.filter((d) => pausedTaskIds.has(d)),
          reasoning: "Dependency paused at trust gate — routing around to independent work",
        });
      }
      continue;
    }

    // This task is unblocked — start a process run for it
    const childItem = childItems.find((c) => c.id === task.taskId);
    if (!childItem) continue;

    const ctx = childItem.context as Record<string, unknown> | null;
    const processSlug = (ctx?.processSlug as string) || "";

    if (!processSlug) continue;

    try {
      // Start process run for this task
      const processRunId = await startProcessRun(
        processSlug,
        {
          workItemId: task.taskId,
          content: childItem.content,
          stepId: task.stepId,
          triggeredByOrchestrator: true,
        },
        "system:orchestrator",
      );

      // Update child work item status
      await db.update(schema.workItems)
        .set({
          status: "in_progress",
          executionIds: [processRunId],
          updatedAt: new Date(),
        })
        .where(eq(schema.workItems.id, task.taskId));

      // Run the heartbeat for this task's process run
      const heartbeatResult = await fullHeartbeat(processRunId);

      // Update task status based on heartbeat result
      if (heartbeatResult.status === "completed") {
        completedTaskIds.add(task.taskId);
        await db.update(schema.workItems)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.workItems.id, task.taskId));
      } else if (heartbeatResult.status === "waiting_review" || heartbeatResult.status === "waiting_human") {
        pausedTaskIds.add(task.taskId);
      }

      tasksAdvanced++;
    } catch (error) {
      failedTaskIds.add(task.taskId);
      await db.update(schema.workItems)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(schema.workItems.id, task.taskId));
    }
  }

  // Update decomposition status on parent
  const updatedDecomposition = decomposition.map((task) => ({
    ...task,
    status: completedTaskIds.has(task.taskId) ? "completed"
      : pausedTaskIds.has(task.taskId) ? "paused"
      : failedTaskIds.has(task.taskId) ? "failed"
      : "pending",
  }));

  await db.update(schema.workItems)
    .set({ decomposition: updatedDecomposition, updatedAt: new Date() })
    .where(eq(schema.workItems.id, goalWorkItemId));

  // Determine confidence and status
  const tasksRemaining = decomposition.length - completedTaskIds.size;
  const allRemainingBlocked = tasksAdvanced === 0 && tasksRemaining > 0;

  if (allRemainingBlocked) {
    // Type 4: aggregate uncertainty — no progress possible
    const confidence = "low" as const;

    await logActivity("orchestrator.stopped", goalWorkItemId, "work_item", {
      tasksCompleted: completedTaskIds.size,
      tasksPaused: pausedTaskIds.size,
      tasksFailed: failedTaskIds.size,
      tasksRemaining,
      reason: "All remaining tasks are blocked or paused",
    });

    return {
      goalWorkItemId,
      tasksCompleted: completedTaskIds.size,
      tasksPaused: pausedTaskIds.size,
      tasksRemaining,
      tasksRouteAround,
      confidence,
      status: "escalated",
      escalation: {
        type: "aggregate_uncertainty",
        reason: "All remaining tasks are blocked — waiting for human decisions on paused items",
        openQuestions: [...pausedTaskIds].map((id) => {
          const task = decomposition.find((t) => t.taskId === id);
          return `Task "${task?.stepId}" is paused`;
        }),
      },
    };
  }

  return {
    goalWorkItemId,
    tasksCompleted: completedTaskIds.size,
    tasksPaused: pausedTaskIds.size,
    tasksRemaining,
    tasksRouteAround,
    confidence: tasksRemaining > completedTaskIds.size ? "medium" : "high",
    status: tasksAdvanced > 0 ? "advancing" : "paused",
  };
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
