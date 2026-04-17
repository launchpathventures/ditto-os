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
import type { StepExecutor, TrustTier, RunStatus } from "../db/schema";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { parseDuration } from "@ditto/core";
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
import { deliberativePerspectivesHandler } from "./harness-handlers/deliberative-perspectives";
import {
  identityRouterHandler,
  voiceCalibrationHandler,
  broadcastDirectClassifierHandler,
  outboundQualityGateHandler,
  modelPurposeResolverHandler,
} from "@ditto/core";
import { hasInteractionSince, hasAnyInteractionSince } from "./people";
import { deliverOutput } from "./process-io";
import { processChains } from "./chain-executor";
import { notifyProcessCompletion } from "./completion-notifier";
import { checkBudgetExhausted, checkBudgetWarning, formatBudgetForLlm, requestTopUp } from "./budget";
import { markRunTerminal, markRunWaiting } from "./run-state-transitions";
import { notifyUser } from "./notify-user";

/**
 * Trust tier restrictiveness order (most restrictive first).
 * Chain-spawned runs use the MORE restrictive of parent and target.
 * Provenance: Brief 098a AC9
 */
const TRUST_TIER_ORDER: TrustTier[] = ["critical", "supervised", "spot_checked", "autonomous"];

function moreRestrictiveTrust(a: TrustTier, b: TrustTier): TrustTier {
  const aIdx = TRUST_TIER_ORDER.indexOf(a);
  const bIdx = TRUST_TIER_ORDER.indexOf(b);
  return aIdx <= bIdx ? a : b;
}

export interface HeartbeatResult {
  processRunId: string;
  stepsExecuted: number;
  status: "advanced" | "waiting_review" | "waiting_human" | "completed" | "failed";
  message: string;
}

/**
 * Shared harness pipeline — built once at module scope.
 * All handlers are stateless (receive context, return context), so reuse is safe.
 */
const sharedPipeline = (() => {
  const pipeline = new HarnessPipeline();
  // Pre-execution
  pipeline.register(memoryAssemblyHandler);          // 1. product layer
  pipeline.register(identityRouterHandler);           // 2. core — Brief 116 (sets sendingIdentity)
  pipeline.register(voiceCalibrationHandler);         // 3. core — Brief 116 (needs sendingIdentity)
  pipeline.register(modelPurposeResolverHandler);     // 4. core — Brief 128 (reads stepDef signals → ModelPurpose)
  // Execution
  pipeline.register(stepExecutionHandler);            // 5. core
  // Post-execution
  pipeline.register(metacognitiveCheckHandler);       // 6. product layer
  pipeline.register(broadcastDirectClassifierHandler); // 7. core — Brief 116
  pipeline.register(outboundQualityGateHandler);      // 8. core — Brief 116
  pipeline.register(reviewPatternHandler);            // 9. product layer
  pipeline.register(deliberativePerspectivesHandler); // 10. product layer (ADR-028)
  // Decision
  pipeline.register(routingHandler);                  // 11. core
  pipeline.register(trustGateHandler);                // 12. product layer (modified — Brief 116)
  pipeline.register(feedbackRecorderHandler);         // 13. product layer
  return pipeline;
})();

// ============================================================
// Escalation Message Templates (Brief 162, MP-7.1)
// ============================================================

/**
 * Failure type taxonomy for escalation messages.
 * Each type gets a human-readable template that reads like a teammate asking for help.
 */
export type EscalationFailureType =
  | "confidence_low"
  | "external_error"
  | "timeout"
  | "dependency_blocked"
  | "max_retries"
  | "unknown";

/**
 * Classify a step failure into a typed escalation category.
 * Uses error message patterns and step metadata to determine the type.
 */
export function classifyFailureType(
  error: string,
  step: { executor?: string; retry_on_failure?: unknown; depends_on?: string[] },
): EscalationFailureType {
  const lower = error.toLowerCase();

  if (lower.includes("confidence") || lower.includes("uncertain") || lower.includes("low confidence")) {
    return "confidence_low";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline exceeded")) {
    return "timeout";
  }
  if (lower.includes("blocked") || lower.includes("dependency") || lower.includes("waiting on") ||
      (step.depends_on && step.depends_on.length > 0 && lower.includes("not ready"))) {
    return "dependency_blocked";
  }
  if (lower.includes("max retries") || lower.includes("exhausted retries") || lower.includes("retry limit")) {
    return "max_retries";
  }
  if (lower.includes("api") || lower.includes("network") || lower.includes("connection") ||
      lower.includes("status code") || lower.includes("econnrefused") || lower.includes("fetch failed") ||
      step.executor === "integration") {
    return "external_error";
  }

  return "unknown";
}

/**
 * Format a human-readable escalation message from a step failure.
 * Reads like a teammate: "I'm stuck on X because Y. How would you handle it?"
 *
 * Returns both the human-readable message and the classified failure type.
 */
export function formatEscalationMessage(
  stepName: string,
  rawError: string,
  step: { executor?: string; retry_on_failure?: unknown; depends_on?: string[] },
  context?: { processName?: string; retryCount?: number; maxRetries?: number },
): { message: string; failureType: EscalationFailureType } {
  const failureType = classifyFailureType(rawError, step);

  const templates: Record<EscalationFailureType, string> = {
    confidence_low:
      `I'm not confident about "${stepName}" — my output didn't meet the quality bar. ` +
      `Could you review what I produced and let me know how to adjust?`,

    external_error:
      `I'm stuck on "${stepName}" — an external service returned an error: ${truncateError(rawError)}. ` +
      `Is this a temporary issue, or should I try a different approach?`,

    timeout:
      `"${stepName}" took too long and timed out. ` +
      `Should I try again, or is there a simpler way to get this done?`,

    dependency_blocked:
      `I can't proceed with "${stepName}" because it depends on work that isn't ready yet. ` +
      `Can you help unblock the upstream step?`,

    max_retries:
      `I've tried "${stepName}" ${context?.maxRetries ?? "multiple"} times and keep hitting the same issue: ${truncateError(rawError)}. ` +
      `How would you handle this?`,

    unknown:
      `I ran into a problem with "${stepName}": ${truncateError(rawError)}. ` +
      `How would you like me to proceed?`,
  };

  let message = templates[failureType];

  // Add process context if available
  if (context?.processName) {
    message = `[${context.processName}] ${message}`;
  }

  return { message, failureType };
}

/** Truncate raw error to a readable length */
function truncateError(error: string, maxLen = 200): string {
  if (error.length <= maxLen) return error;
  return error.slice(0, maxLen) + "…";
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
// Step primitive pre-checks (Brief 121)
// ============================================================

/**
 * Evaluate the `schedule` primitive on a step.
 * Computes the absolute executeAt time based on delay + after reference.
 * Returns null if the step should execute now, or a Date if it's deferred.
 */
async function evaluateSchedule(
  step: StepDefinition,
  processRunId: string,
  runStartedAt: Date | null,
): Promise<Date | null> {
  if (!step.schedule) return null;

  const delayMs = parseDuration(step.schedule.delay);
  let anchorTime: Date;

  if (step.schedule.after === "trigger") {
    anchorTime = runStartedAt || new Date();
  } else {
    // Find the completed step run for the referenced step
    const [refStepRun] = await db
      .select({ completedAt: schema.stepRuns.completedAt })
      .from(schema.stepRuns)
      .where(
        and(
          eq(schema.stepRuns.processRunId, processRunId),
          eq(schema.stepRuns.stepId, step.schedule.after),
          eq(schema.stepRuns.status, "approved"),
        ),
      )
      .limit(1);

    if (!refStepRun?.completedAt) {
      // Referenced step not completed — use far-future sentinel so the step stays blocked
      // until the reference step finishes. Re-evaluated on the next heartbeat after that.
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year sentinel
    }
    anchorTime = refStepRun.completedAt;
  }

  const executeAt = new Date(anchorTime.getTime() + delayMs);
  return executeAt.getTime() > Date.now() ? executeAt : null;
}

/**
 * Evaluate the `gate` primitive on a step.
 * Returns "execute" if the step should proceed, "skip" if it should be skipped,
 * or "defer" if it should be retried next cycle.
 */
async function evaluateGate(
  step: StepDefinition,
  processRunId: string,
  run: { inputs: unknown },
): Promise<"execute" | "skip" | "defer"> {
  if (!step.gate) return "execute";

  const personId = ((run.inputs as Record<string, unknown>)?.personId ||
    (run.inputs as Record<string, unknown>)?.person_id) as string | undefined;

  if (!personId) {
    // No person context — can't evaluate engagement, execute normally
    return "execute";
  }

  // Determine the "since" timestamp from since_step
  let since: Date;
  if (step.gate.since_step) {
    const [refStepRun] = await db
      .select({ completedAt: schema.stepRuns.completedAt })
      .from(schema.stepRuns)
      .where(
        and(
          eq(schema.stepRuns.processRunId, processRunId),
          eq(schema.stepRuns.stepId, step.gate.since_step),
          eq(schema.stepRuns.status, "approved"),
        ),
      )
      .limit(1);

    since = refStepRun?.completedAt || new Date(0);
  } else {
    since = new Date(0); // No reference — check all time
  }

  const hasReplied = await hasInteractionSince(personId, "reply_received", since);

  let conditionMet: boolean;
  switch (step.gate.engagement) {
    case "replied":
      conditionMet = hasReplied;
      break;
    case "silent":
      conditionMet = !hasReplied;
      break;
    case "any":
      // "any" = person has ANY interaction (reply, outreach_sent, meeting, etc.) since the reference step
      conditionMet = await hasAnyInteractionSince(personId, since);
      break;
    default:
      conditionMet = true;
  }

  if (!conditionMet) {
    return step.gate.fallback || "skip";
  }

  return "execute";
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
  /** Classified failure type for escalation templating (Brief 162, MP-7.1) */
  failureType?: EscalationFailureType;
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

  // Sub-process executor: invoke a child process through the harness (Brief 117)
  if (step.executor === "sub-process") {
    const targetSlug = step.config?.process_id as string | undefined;
    if (!targetSlug) {
      return {
        status: "failed",
        stepId: step.id,
        stepName: step.name,
        message: `Sub-process step "${step.id}" missing config.process_id`,
      };
    }

    const [stepRunRecord] = await db.insert(schema.stepRuns).values({
      processRunId,
      stepId: step.id,
      status: "running",
      executorType: "sub-process" as StepExecutor,
      startedAt: new Date(),
      parallelGroupId: parallelGroupId || null,
    }).returning();

    harnessEvents.emit({
      type: "step-start",
      processRunId,
      stepId: step.id,
      roleName: `sub-process:${targetSlug}`,
      processName: definition.name,
    });

    try {
      // Merge parent run inputs with step-specific inputs
      const parentInputs = (run.inputs as Record<string, unknown>) || {};
      const childInputs = { ...parentInputs, parentCycleRunId: processRunId };

      // Start the child process run
      const childRunId = await startProcessRun(
        targetSlug,
        childInputs,
        `cycle:${definition.id}`,
        { parentTrustTier: trustTier },
      );

      // Set parentCycleRunId on the child run
      await db.update(schema.processRuns)
        .set({ parentCycleRunId: processRunId })
        .where(eq(schema.processRuns.id, childRunId));

      // Execute the child run through the full harness pipeline
      const childResult = await fullHeartbeat(childRunId);

      // Collect child run outputs as step result
      const childOutputs = await db
        .select()
        .from(schema.processOutputs)
        .where(eq(schema.processOutputs.processRunId, childRunId));

      const outputMap: Record<string, unknown> = {};
      for (const output of childOutputs) {
        outputMap[output.name] = output.content;
      }

      if (childResult.status === "failed") {
        await db.update(schema.stepRuns)
          .set({
            status: "failed",
            error: childResult.message,
            completedAt: new Date(),
          })
          .where(eq(schema.stepRuns.id, stepRunRecord.id));

        // MP-7.1: Human-readable escalation for sub-process failures
        const subEscalation = formatEscalationMessage(
          step.name,
          childResult.message,
          step,
          { processName: definition.name },
        );
        return {
          status: "failed",
          stepId: step.id,
          stepName: step.name,
          message: subEscalation.message,
          failureType: subEscalation.failureType,
        };
      }

      if (childResult.status === "waiting_review" || childResult.status === "waiting_human") {
        await db.update(schema.stepRuns)
          .set({
            status: "waiting_review",
            outputs: outputMap,
            completedAt: new Date(),
          })
          .where(eq(schema.stepRuns.id, stepRunRecord.id));

        return {
          status: "waiting_review",
          stepId: step.id,
          stepName: step.name,
          message: `Sub-process "${targetSlug}" paused: ${childResult.message}`,
        };
      }

      // Child completed successfully
      await db.update(schema.stepRuns)
        .set({
          status: "approved",
          outputs: outputMap,
          completedAt: new Date(),
        })
        .where(eq(schema.stepRuns.id, stepRunRecord.id));

      await logActivity("step.completed", stepRunRecord.id, "step_run", {
        step: step.id,
        stepName: step.name,
        subProcess: targetSlug,
        childRunId,
      });

      return {
        status: "advanced",
        stepId: step.id,
        stepName: step.name,
        message: `Sub-process "${targetSlug}" completed (${childResult.stepsExecuted} steps)`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(schema.stepRuns)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
        .where(eq(schema.stepRuns.id, stepRunRecord.id));

      // MP-7.1: Human-readable escalation for sub-process errors
      const subErrEscalation = formatEscalationMessage(
        step.name,
        message,
        step,
        { processName: definition.name },
      );
      return {
        status: "failed",
        stepId: step.id,
        stepName: step.name,
        message: subErrEscalation.message,
        failureType: subErrEscalation.failureType,
      };
    }
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

  // email_thread: inject inReplyToMessageId from runMetadata (Brief 121)
  let enrichedInputs = run.inputs as Record<string, unknown>;
  if (step.email_thread) {
    const [currentRun] = await db
      .select({ runMetadata: schema.processRuns.runMetadata })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, processRunId))
      .limit(1);

    const metadata = (currentRun?.runMetadata as Record<string, unknown>) || {};
    const emailThreads = (metadata.emailThreads as Record<string, string>) || {};
    const threadMessageId = emailThreads[step.email_thread];

    if (threadMessageId) {
      enrichedInputs = { ...enrichedInputs, inReplyToMessageId: threadMessageId };
      // Also update the step run inputs
      await db.update(schema.stepRuns)
        .set({ inputs: { inReplyToMessageId: threadMessageId } })
        .where(eq(schema.stepRuns.id, stepRunRecord[0].id));
    }
  }

  // Run through harness pipeline (module-scoped, handlers are stateless)
  const harnessContext = createHarnessContext({
    processRun: {
      id: processRunId,
      processId: run.processId,
      inputs: enrichedInputs,
    },
    stepDefinition: step,
    processDefinition: definition,
    trustTier,
    stepRunId: stepRunRecord[0].id,
  });

  // Brief 172: Pre-dispatch budget guard. Block outbound actions when the
  // goal's budget is already exhausted, so nothing ships on an over-budget
  // goal even though content rules passed. Looks up the goal work item by
  // matching this run's ID inside `workItems.executionIds` (JSON array).
  harnessContext.checkBudgetBeforeDispatch = async () => {
    try {
      // Filter to goals whose executionIds JSON array contains this run id.
      // SQLite's json_each + EXISTS would be cleaner, but drizzle's sqlite
      // dialect lacks a first-class helper; the LIKE on the stringified
      // JSON is exact because run IDs are quoted UUIDs.
      const idPattern = `%"${processRunId}"%`;
      const candidateItems = await db
        .select({
          id: schema.workItems.id,
          executionIds: schema.workItems.executionIds,
        })
        .from(schema.workItems)
        .where(
          and(
            eq(schema.workItems.type, "goal"),
            sql`${schema.workItems.executionIds} LIKE ${idPattern}`,
          ),
        );
      const goalItem = candidateItems.find(
        (wi) =>
          Array.isArray(wi.executionIds) &&
          (wi.executionIds as string[]).includes(processRunId),
      );
      if (!goalItem) {
        // Brief 179 P0-3: fail closed on orphan runs. The only runs
        // legitimately without a goal work item are operating-cycle runs
        // (network agent) — those are expected to be goal-less by design.
        // Every other orphan is an anomaly: a run whose goal was deleted,
        // WIP state divergence, or a test fixture that didn't wire things
        // up. Blocking by default is the safety-critical choice (OWASP
        // "fail closed" principle).
        const [runMeta] = await db
          .select({ cycleType: schema.processRuns.cycleType })
          .from(schema.processRuns)
          .where(eq(schema.processRuns.id, processRunId))
          .limit(1);
        if (runMeta?.cycleType) {
          return { blocked: false };
        }
        console.warn(
          `[heartbeat] budget pre-dispatch: orphan run ${processRunId} (no goal found, no cycleType) — blocking dispatch by default`,
        );
        return {
          blocked: true,
          reason:
            "orphan run — no goal work item found, budget guard rejecting by default",
        };
      }
      const exhausted = await checkBudgetExhausted(goalItem.id);
      if (exhausted) {
        return {
          blocked: true,
          reason: `budget exhausted for goal (${formatBudgetForLlm(exhausted)})`,
        };
      }
      return { blocked: false };
    } catch (err) {
      console.warn(
        `[heartbeat] budget pre-dispatch check failed for run ${processRunId}:`,
        err,
      );
      return { blocked: false };
    }
  };

  // Brief 151 AC6: Wire dispatchStagedAction so approved staged outbound
  // actions (crm.send_email etc.) actually dispatch via sendAndRecord
  harnessContext.dispatchStagedAction = async (staged) => {
    const { sendAndRecord } = await import("./channel");
    const args = staged.args;
    const result = await sendAndRecord({
      to: args.to as string,
      subject: args.subject as string | undefined,
      body: args.body as string,
      personaId: (args.personaId as "alex" | "mira") ?? "alex",
      mode: (args.mode as "selling" | "connecting" | "nurture") ?? "nurture",
      personId: args.personId as string,
      userId: (args.userId as string) ?? "founder",
      processRunId: (args.processRunId as string) ?? processRunId,
      includeOptOut: (args.includeOptOut as boolean) ?? true,
      stepRunId: stepRunRecord[0].id,
      platform: args.platform as import("./channel").SocialPlatform | undefined,
      unipileAccountId: args.unipileAccountId as string | undefined,
    });
    console.log(`[harness] Dispatched staged ${staged.toolName} to ${args.to}: ${result.success ? "sent" : result.error}`);
    return JSON.stringify(result);
  };

  const result = await sharedPipeline.run(harnessContext);

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

    // MP-7.1: Human-readable escalation message
    const escalation = formatEscalationMessage(
      step.name,
      result.stepError.message,
      step,
      { processName: definition.name },
    );

    return {
      status: "failed",
      stepId: step.id,
      stepName: step.name,
      message: escalation.message,
      failureType: escalation.failureType,
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

    // email_thread: store messageId from step output on runMetadata (Brief 121)
    // Uses dedicated runMetadata column — survives suspend/resume, no collision with suspendState.
    if (step.email_thread && stepResult.outputs) {
      const messageId = (stepResult.outputs as Record<string, unknown>).messageId as string | undefined;
      if (messageId) {
        const [currentRun] = await db
          .select({ runMetadata: schema.processRuns.runMetadata })
          .from(schema.processRuns)
          .where(eq(schema.processRuns.id, processRunId))
          .limit(1);

        const metadata = (currentRun?.runMetadata as Record<string, unknown>) || {};
        const emailThreads = (metadata.emailThreads as Record<string, string>) || {};
        emailThreads[step.email_thread] = messageId;

        await db.update(schema.processRuns)
          .set({ runMetadata: { ...metadata, emailThreads } })
          .where(eq(schema.processRuns.id, processRunId));
      }
    }

    // wait_for: suspend after execution (Brief 121)
    if (step.wait_for) {
      const timeoutStr = step.wait_for.timeout || "48h"; // Default: 48h if omitted
      const timeoutMs = parseDuration(timeoutStr);
      const timeoutAt = new Date(Date.now() + timeoutMs);

      // Update step to waiting_human status with suspend info
      await db.update(schema.stepRuns)
        .set({
          status: "waiting_human",
          outputs: {
            ...(stepResult.outputs || {}),
            _waitFor: {
              event: step.wait_for.event,
              timeoutAt: timeoutAt.toISOString(),
            },
          },
        })
        .where(eq(schema.stepRuns.id, stepRunRecord[0].id));

      // Serialize suspend state on the process run + set timeoutAt for indexed queries
      await db.update(schema.processRuns)
        .set({
          suspendState: {
            suspendedAtStep: step.id,
            suspendPayload: {
              stepId: step.id,
              stepName: step.name,
              stepRunId: stepRunRecord[0].id,
              waitFor: step.wait_for,
            },
          },
          timeoutAt,
        })
        .where(eq(schema.processRuns.id, processRunId));

      await logActivity("step.wait_for.suspended", stepRunRecord[0].id, "step_run", {
        step: step.id,
        stepName: step.name,
        event: step.wait_for.event,
        timeoutAt: timeoutAt.toISOString(),
      });

      return {
        status: "waiting_review",
        stepId: step.id,
        stepName: step.name,
        message: `Step "${step.name}" waiting for ${step.wait_for.event} (timeout: ${timeoutStr})`,
      };
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

  if (run.status === "paused") {
    return { processRunId, stepsExecuted: 0, status: "waiting_human", message: "Cycle paused" };
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
  // Check deferred steps: queued steps with deferredUntil in the future are waiting.
  // Steps past their deferredUntil are cleared via UPDATE (atomic, preserves step run ID).
  const now = new Date();
  const deferredStepIds = new Set<string>();
  for (const sr of existingStepRuns) {
    if (sr.status === "queued" && sr.deferredUntil) {
      if (sr.deferredUntil > now) {
        deferredStepIds.add(sr.stepId);
      } else {
        // Step is ready — clear deferral atomically (preserves ID for audit trail)
        await db.update(schema.stepRuns)
          .set({ deferredUntil: null })
          .where(eq(schema.stepRuns.id, sr.id));
      }
    }
  }
  const waitingStepIds = new Set([
    ...existingStepRuns
      .filter((s) => s.status === "waiting_review" || s.status === "running" || s.status === "waiting_human")
      .map((s) => s.stepId),
    ...deferredStepIds,
  ]);

  // 4. Find next work
  const nextWork = findNextWork(definition, doneStepIds, waitingStepIds);

  if (nextWork.type === "complete") {
    // Brief 179: markRunTerminal nulls definitionOverride (Brief 174),
    // clears the stale-escalation ladder (Brief 178 P1), and drops the
    // waitingStateSince anchor (Brief 179 P0).
    await markRunTerminal(processRunId, "approved", { completedAt: new Date() });

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

    // Chain execution: process chain definitions after completion (Brief 098a AC4)
    try {
      await processChains(processRunId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Chain processing failed for run ${processRunId.slice(0, 8)}: ${message}`);
      await logActivity("chain.processing.failed", processRunId, "process_run", {
        error: message,
      });
    }

    // Completion notification: email user immediately if no outputDelivery configured
    // Fire-and-forget — notification failure never affects completion
    notifyProcessCompletion(processRunId).catch((error) => {
      console.error(`Completion notification failed for run ${processRunId.slice(0, 8)}:`, error);
    });

    // Cycle auto-restart (Brief 118): if this is a continuous cycle, create a new run
    // after the BRIEF phase completes. The new run inherits the cycle config with any
    // updates from the LEARN phase output.
    if (run.cycleType && run.cycleConfig) {
      const cycleConfig = run.cycleConfig as Record<string, unknown>;
      if (cycleConfig.continuous === true) {
        try {
          // Guard: check no other active run of this cycleType exists
          // (user may have manually activated one while the previous was finishing)
          const terminalForCheck: RunStatus[] = ["approved", "rejected", "failed", "cancelled", "skipped"];
          const [existingActive] = await db
            .select({ id: schema.processRuns.id })
            .from(schema.processRuns)
            .where(
              and(
                eq(schema.processRuns.cycleType, run.cycleType!),
                notInArray(schema.processRuns.status, terminalForCheck),
              ),
            )
            .limit(1);

          if (existingActive) {
            console.log(`Cycle auto-restart skipped: ${run.cycleType} already has active run ${existingActive.id.slice(0, 8)}`);
          } else {
            // Collect LEARN phase outputs to feed into the next cycle
            const learnOutputs = existingStepRuns
              .filter((s) => s.stepId === "learn" && s.status === "approved" && s.outputs)
              .map((s) => s.outputs as Record<string, unknown>);

            // Brief 151 AC5: Inject recent outreach history so the next cycle's
            // SENSE/ASSESS steps can see what was already done in this run
            let recentOutreach: Array<{ personId: string; personName: string | null; channel: string; sentAt: Date; subject: string | null }> = [];
            try {
              const outreachRows = await db
                .select({
                  personId: schema.interactions.personId,
                  personName: schema.people.name,
                  channel: schema.interactions.channel,
                  sentAt: schema.interactions.createdAt,
                  subject: schema.interactions.subject,
                })
                .from(schema.interactions)
                .leftJoin(schema.people, eq(schema.interactions.personId, schema.people.id))
                .where(
                  and(
                    eq(schema.interactions.processRunId, processRunId),
                    eq(schema.interactions.type, "outreach_sent"),
                  ),
                );
              recentOutreach = outreachRows;
              if (recentOutreach.length > 0) {
                console.log(`[cycle] Injecting ${recentOutreach.length} recent outreach interactions into next cycle`);
              }
            } catch {
              // Non-critical — don't block auto-restart if outreach query fails
            }

            const updatedInputs = {
              ...(run.inputs as Record<string, unknown>),
              previousCycleRunId: processRunId,
              learnOutputs: learnOutputs.length > 0 ? learnOutputs[0] : null,
              recentOutreach,
            };

            const newRunId = await startProcessRun(
              process.slug,
              updatedInputs,
              "cycle:auto-restart",
              { cycleType: run.cycleType!, cycleConfig },
            );

            await logActivity("cycle.auto-restart", newRunId, "process_run", {
              previousRunId: processRunId,
              cycleType: run.cycleType,
            });

            // Fire-and-forget: kick off the new cycle iteration
            fullHeartbeat(newRunId).catch((err) => {
              console.error(`Cycle auto-restart heartbeat failed for ${newRunId.slice(0, 8)}:`, err);
            });

            console.log(`Cycle auto-restart: ${run.cycleType} → new run ${newRunId.slice(0, 8)}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Cycle auto-restart failed for ${processRunId.slice(0, 8)}: ${message}`);
          await logActivity("cycle.auto-restart.failed", processRunId, "process_run", {
            error: message,
            cycleType: run.cycleType,
          }).catch(() => {}); // Don't let logging failure mask the original error
        }
      }
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

  // AC9 (Brief 098a): Chain-spawned runs use the more restrictive tier
  const baseTier = process.trustTier as TrustTier;
  const trustTier = run.trustTierOverride
    ? moreRestrictiveTrust(run.trustTierOverride as TrustTier, baseTier)
    : baseTier;

  // 6. Pre-execution primitive checks (Brief 121)
  if (nextWork.type === "step") {
    // Schedule primitive: check if step is deferred
    const deferUntil = await evaluateSchedule(nextWork.step, processRunId, run.startedAt);
    if (deferUntil) {
      // Record/update the deferred step — upsert pattern preserves step run ID
      const existing = existingStepRuns.find((s) => s.stepId === nextWork.step.id);
      if (existing) {
        await db.update(schema.stepRuns)
          .set({ deferredUntil: deferUntil })
          .where(eq(schema.stepRuns.id, existing.id));
      } else {
        await db.insert(schema.stepRuns).values({
          processRunId,
          stepId: nextWork.step.id,
          status: "queued",
          executorType: nextWork.step.executor as StepExecutor,
          deferredUntil: deferUntil,
        });
      }
      await logActivity("step.deferred", processRunId, "process_run", {
        step: nextWork.step.id,
        deferredUntil: deferUntil.toISOString(),
        reason: `schedule: ${nextWork.step.schedule?.delay} after ${nextWork.step.schedule?.after}`,
      });
      return { processRunId, stepsExecuted: 0, status: "waiting_review", message: `Step "${nextWork.step.name}" deferred until ${deferUntil.toISOString()}` };
    }

    // Gate primitive: check engagement condition
    const gateResult = await evaluateGate(nextWork.step, processRunId, run);
    if (gateResult === "skip") {
      await db.insert(schema.stepRuns).values({
        processRunId,
        stepId: nextWork.step.id,
        status: "skipped",
        executorType: nextWork.step.executor as StepExecutor,
      });
      await logActivity("step.gate.skipped", processRunId, "step_run", {
        step: nextWork.step.id,
        stepName: nextWork.step.name,
        gate: nextWork.step.gate,
      });
      // Step is skipped — continue to next heartbeat iteration
      return { processRunId, stepsExecuted: 1, status: "advanced", message: `Step "${nextWork.step.name}" skipped by gate (engagement: ${nextWork.step.gate?.engagement})` };
    }
    if (gateResult === "defer") {
      await logActivity("step.gate.deferred", processRunId, "step_run", {
        step: nextWork.step.id,
        stepName: nextWork.step.name,
        gate: nextWork.step.gate,
      });
      return { processRunId, stepsExecuted: 0, status: "waiting_review", message: `Step "${nextWork.step.name}" deferred by gate (engagement: ${nextWork.step.gate?.engagement})` };
    }
  }

  // 7. Execute
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

        // Brief 179: anchor the escalation clock at waiting-state entry.
        await markRunWaiting(processRunId, "waiting_review");

        // MP-7.1: Human-readable escalation for max retries
        const retryEscalation = formatEscalationMessage(
          nextWork.step.name,
          result.message,
          nextWork.step,
          { processName: definition.name, retryCount: retryCount, maxRetries: retryConfig.max_retries },
        );

        harnessEvents.emit({
          type: "gate-pause",
          processRunId,
          stepId: nextWork.step.id,
          reason: `max retries (${retryConfig.max_retries}) exceeded`,
          output: retryEscalation.message,
        });

        return { processRunId, stepsExecuted: 1, status: "waiting_review", message: retryEscalation.message };
      }

      // Brief 179: centralised terminal bookkeeping.
      await markRunTerminal(processRunId, "failed");

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
      // Human steps and wait_for steps set run to waiting_human; AI review steps set to waiting_review
      const isHumanStep = nextWork.step.executor === "human";
      const isWaitingForEvent = nextWork.step.wait_for != null;
      const runStatus = (isHumanStep || isWaitingForEvent) ? "waiting_human" : "waiting_review";
      // Brief 179: anchor the escalation clock at waiting-state entry.
      await markRunWaiting(processRunId, runStatus);
      await logActivity(
        (isHumanStep || isWaitingForEvent) ? "process.run.waiting_human" : "process.run.waiting_review",
        processRunId,
        "process_run",
        { step: result.stepId, stepName: result.stepName },
      );
      return {
        processRunId,
        stepsExecuted: 1,
        status: (isHumanStep || isWaitingForEvent) ? "waiting_human" : "waiting_review",
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
    // Brief 179: centralised terminal bookkeeping.
    await markRunTerminal(processRunId, "failed");
    return {
      processRunId,
      stepsExecuted,
      status: "failed",
      message: `Parallel group "${groupId}" failed: ${anyFailed.message}`,
    };
  }

  if (anyWaiting) {
    // Brief 179: anchor the escalation clock at waiting-state entry.
    await markRunWaiting(processRunId, "waiting_review", { currentStepId: groupId });
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

  // MP-7.2: Capture escalation guidance as memory if present
  // Human input with a guidance/comment field when resolving an escalation
  const guidanceText = (humanInput.guidance ?? humanInput.comment ?? humanInput.instructions) as string | undefined;
  if (guidanceText && typeof guidanceText === "string" && guidanceText.trim().length > 0) {
    try {
      const { createGuidanceMemory } = await import("./harness-handlers/feedback-recorder");
      // Derive failure pattern from the suspend payload's error context
      const escalationError = (suspendPayload?.error ?? suspendPayload?.reason ?? "") as string;
      const stepMeta = { executor: suspendPayload?.executor as string | undefined };
      const failureType = classifyFailureType(escalationError, stepMeta);
      const failurePattern = `${failureType}:${suspendedStepId}`;

      await createGuidanceMemory(
        run.processId,
        guidanceText,
        failurePattern,
        suspendedStepId,
        escalationError || undefined,
      );
    } catch (err) {
      // Non-blocking — guidance capture failing shouldn't block resume
      console.error("[heartbeat] Guidance memory capture failed (non-blocking):", err instanceof Error ? err.message : String(err));
    }
  }

  // Clear suspend state and set run back to running.
  // emailThreads live in runMetadata (not suspendState), so clearing suspendState is safe.
  // Brief 179 P1: clear waitingStateSince + reset stale-escalation ladder on
  // resume, so if this same run later re-enters waiting we start the clock fresh
  // and re-fire the ladder from tier 0.
  await db.update(schema.processRuns)
    .set({
      status: "running",
      suspendState: null,
      timeoutAt: null,
      waitingStateSince: null,
      staleEscalationTier: 0,
      staleEscalationLastActionAt: null,
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
  triggeredBy: string = "manual",
  options?: { parentTrustTier?: TrustTier; cycleType?: string; cycleConfig?: Record<string, unknown> },
): Promise<string> {
  const [process] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!process) {
    throw new Error(`Process not found: ${processSlug}`);
  }

  // AC9: If chain-spawned, compute the effective trust tier (more restrictive of parent and target)
  let trustTierOverride: TrustTier | undefined;
  if (options?.parentTrustTier) {
    const targetTier = process.trustTier as TrustTier;
    const effectiveTier = moreRestrictiveTrust(options.parentTrustTier, targetTier);
    if (effectiveTier !== targetTier) {
      trustTierOverride = effectiveTier;
      console.log(
        `[chain] Trust inheritance: ${processSlug} constrained from ${targetTier} to ${effectiveTier} (parent was ${options.parentTrustTier})`,
      );
    }
  }

  const [run] = await db
    .insert(schema.processRuns)
    .values({
      processId: process.id,
      status: "queued",
      triggeredBy,
      inputs,
      trustTierOverride: trustTierOverride ?? null,
      cycleType: options?.cycleType ?? null,
      cycleConfig: options?.cycleConfig ?? null,
    })
    .returning();

  await logActivity("process.run.created", run.id, "process_run", {
    processSlug,
    triggeredBy,
    parentTrustTier: options?.parentTrustTier,
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
  trustOverrides?: Record<string, import("../db/schema").TrustTier>,
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
          ...(trustOverrides ? { goalTrustOverrides: trustOverrides } : {}),
        },
        "system:orchestrator",
      );

      // Apply goal-level trust overrides to child run via session trust.
      // Session trust can only relax (supervised → spot_checked), so for
      // tightening overrides we store them in run inputs for the trust-gate
      // handler to check. Currently the trust-gate handler does not read
      // goalTrustOverrides from inputs — this is flagged for the Architect.
      if (trustOverrides && Object.keys(trustOverrides).length > 0) {
        await logActivity("orchestrator.trust-override", processRunId, "process_run", {
          goalWorkItemId,
          overrides: trustOverrides,
          note: "Goal-level trust overrides applied to child run inputs",
        });
      }

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

// ============================================================
// Goal Heartbeat Loop (Brief 074)
// Continuously orchestrates a goal until all tasks complete,
// all are paused/failed, or goal is explicitly paused.
//
// Provenance: Temporal workflow engine (dependency-aware task chaining)
// ============================================================

export interface GoalHeartbeatLoopResult {
  goalWorkItemId: string;
  status: "completed" | "paused" | "failed" | "partial";
  tasksCompleted: number;
  tasksPaused: number;
  tasksFailed: number;
  tasksPending: number;
}

/** Active goal loops — prevents duplicate invocations (F074-2 fix) */
const activeGoalLoops = new Set<string>();

/**
 * Continuously call orchestratorHeartbeat() until the goal completes,
 * all tasks are paused/failed, or no progress can be made.
 *
 * Uses setImmediate between iterations to avoid blocking.
 * Trust overrides flow to child process runs (can only LOWER trust).
 * Duplicate invocations for the same goal are rejected (F074-2).
 */
export async function goalHeartbeatLoop(
  goalWorkItemId: string,
  trustOverrides?: Record<string, import("../db/schema").TrustTier>,
): Promise<GoalHeartbeatLoopResult> {
  // Prevent duplicate invocations for the same goal
  if (activeGoalLoops.has(goalWorkItemId)) {
    return {
      goalWorkItemId,
      status: "partial",
      tasksCompleted: 0,
      tasksPaused: 0,
      tasksFailed: 0,
      tasksPending: 0,
    };
  }
  activeGoalLoops.add(goalWorkItemId);

  try {
    let iterations = 0;
    const MAX_ITERATIONS = 100; // safety cap

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Check if goal is paused (goal-level pause)
      const [goalItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, goalWorkItemId))
        .limit(1);

      if (!goalItem) {
        return {
          goalWorkItemId,
          status: "failed",
          tasksCompleted: 0,
          tasksPaused: 0,
          tasksFailed: 0,
          tasksPending: 0,
        };
      }

      // If goal was paused externally, stop
      if (goalItem.status === "waiting_human") {
        const counts = getTaskCounts(goalItem);
        return {
          goalWorkItemId,
          status: "paused",
          ...counts,
        };
      }

      // Budget check (Brief 107 AC8): if budget is exhausted, pause goal
      const budgetExhausted = await checkBudgetExhausted(goalWorkItemId);
      if (budgetExhausted) {
        await db
          .update(schema.workItems)
          .set({ status: "waiting_human", updatedAt: new Date() })
          .where(eq(schema.workItems.id, goalWorkItemId));

        await logActivity("goal.budget_exhausted", goalWorkItemId, "work_item", {
          budgetStatus: formatBudgetForLlm(budgetExhausted),
        });

        // AC9: Send exhaustion notification via notifyUser (fire-and-forget)
        requestTopUp(goalWorkItemId).then(async (topUp) => {
          if (!topUp) return;
          // Look up the budget's userId to find their network user + person records
          const [budget] = await db
            .select({ userId: schema.budgets.userId })
            .from(schema.budgets)
            .where(eq(schema.budgets.goalWorkItemId, goalWorkItemId))
            .limit(1);
          if (!budget) return;
          const [networkUser] = await db
            .select({ id: schema.networkUsers.id, personId: schema.networkUsers.personId })
            .from(schema.networkUsers)
            .where(eq(schema.networkUsers.id, budget.userId))
            .limit(1);
          if (!networkUser?.personId) return;
          notifyUser({
            userId: networkUser.id,
            personId: networkUser.personId,
            subject: topUp.subject,
            body: topUp.body,
            personaId: "alex",
            reviewPageUrl: topUp.checkoutUrl,
          }).catch((err) => {
            console.error(`[heartbeat] Budget exhaustion notification failed:`, err);
          });
        }).catch((err) => {
          console.error(`[heartbeat] requestTopUp failed:`, err);
        });

        const counts = getTaskCounts(goalItem);
        return {
          goalWorkItemId,
          status: "paused",
          ...counts,
        };
      }

      // Budget warning (Brief 107 AC10): log when at 90% but continue
      const budgetWarning = await checkBudgetWarning(goalWorkItemId);
      if (budgetWarning) {
        await logActivity("goal.budget_warning", goalWorkItemId, "work_item", {
          budgetStatus: formatBudgetForLlm(budgetWarning),
          percentUsed: budgetWarning.percentUsed,
        });
      }

      // Run one orchestrator heartbeat iteration
      const result = await orchestratorHeartbeat(goalWorkItemId, trustOverrides);

      if (result.status === "completed") {
        await logActivity("goal.completed", goalWorkItemId, "work_item", {
          tasksCompleted: result.tasksCompleted,
          iterations,
        });
        return {
          goalWorkItemId,
          status: "completed",
          tasksCompleted: result.tasksCompleted,
          tasksPaused: 0,
          tasksFailed: 0,
          tasksPending: 0,
        };
      }

      if (result.status === "escalated" || result.status === "paused") {
        // No more progress possible — all remaining tasks blocked or paused
        await logActivity("goal.paused", goalWorkItemId, "work_item", {
          tasksCompleted: result.tasksCompleted,
          tasksPaused: result.tasksPaused,
          tasksRemaining: result.tasksRemaining,
          reason: result.escalation?.reason || "All tasks paused or blocked",
          iterations,
        });
        return {
          goalWorkItemId,
          status: "paused",
          tasksCompleted: result.tasksCompleted,
          tasksPaused: result.tasksPaused,
          tasksFailed: 0,
          tasksPending: result.tasksRemaining - result.tasksPaused,
        };
      }

      // "advancing" — made progress, check if more work is available
      // Use setImmediate to avoid blocking the event loop
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    // Safety cap reached
    const [goalItem] = await db
      .select()
      .from(schema.workItems)
      .where(eq(schema.workItems.id, goalWorkItemId))
      .limit(1);

    const counts = goalItem ? getTaskCounts(goalItem) : {
      tasksCompleted: 0,
      tasksPaused: 0,
      tasksFailed: 0,
      tasksPending: 0,
    };

    return {
      goalWorkItemId,
      status: "partial",
      ...counts,
    };
  } finally {
    activeGoalLoops.delete(goalWorkItemId);
  }
}

/**
 * Resume a goal after an approval. Re-enters the goal heartbeat loop
 * to check for newly unblocked tasks.
 */
export async function resumeGoal(
  goalWorkItemId: string,
  trustOverrides?: Record<string, import("../db/schema").TrustTier>,
): Promise<GoalHeartbeatLoopResult> {
  // Mark goal as back in progress if it was paused
  const [goalItem] = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.id, goalWorkItemId))
    .limit(1);

  if (!goalItem) {
    return {
      goalWorkItemId,
      status: "failed",
      tasksCompleted: 0,
      tasksPaused: 0,
      tasksFailed: 0,
      tasksPending: 0,
    };
  }

  if (goalItem.status === "waiting_human" || goalItem.status === "routed") {
    await db
      .update(schema.workItems)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(schema.workItems.id, goalWorkItemId));
  }

  await logActivity("goal.resumed", goalWorkItemId, "work_item");

  return goalHeartbeatLoop(goalWorkItemId, trustOverrides);
}

/**
 * Pause a goal — halts all active child runs and prevents new ones from starting.
 */
export async function pauseGoal(goalWorkItemId: string): Promise<void> {
  const [goalItem] = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.id, goalWorkItemId))
    .limit(1);

  if (!goalItem) return;

  // Mark goal as paused
  await db
    .update(schema.workItems)
    .set({ status: "waiting_human", updatedAt: new Date() })
    .where(eq(schema.workItems.id, goalWorkItemId));

  // Halt all active child runs
  const decomposition = goalItem.decomposition as Array<{
    taskId: string;
    stepId: string;
    dependsOn: string[];
    status: string;
  }> | null;

  if (decomposition) {
    const childIds = decomposition.map((t) => t.taskId);
    const childItems = await db
      .select()
      .from(schema.workItems)
      .where(inArray(schema.workItems.id, childIds));

    for (const child of childItems) {
      if (child.status === "in_progress" || child.status === "routed") {
        // Pause the child work item
        await db
          .update(schema.workItems)
          .set({ status: "waiting_human", updatedAt: new Date() })
          .where(eq(schema.workItems.id, child.id));

        // Pause any active process runs for this child
        const executionIds = (child.executionIds as string[]) || [];
        for (const runId of executionIds) {
          // Brief 179: centralised terminal bookkeeping.
          await markRunTerminal(runId, "cancelled");
        }
      }
    }
  }

  await logActivity("goal.paused_by_user", goalWorkItemId, "work_item", {
    reason: "Goal paused by user request",
  });
}

/** Extract task counts from a goal work item's decomposition. */
function getTaskCounts(goalItem: typeof schema.workItems.$inferSelect): {
  tasksCompleted: number;
  tasksPaused: number;
  tasksFailed: number;
  tasksPending: number;
} {
  const decomposition = goalItem.decomposition as Array<{
    taskId: string;
    stepId: string;
    dependsOn: string[];
    status: string;
  }> | null;

  if (!decomposition) {
    return { tasksCompleted: 0, tasksPaused: 0, tasksFailed: 0, tasksPending: 0 };
  }

  let completed = 0, paused = 0, failed = 0, pending = 0;
  for (const task of decomposition) {
    switch (task.status) {
      case "completed": completed++; break;
      case "paused": paused++; break;
      case "failed": failed++; break;
      default: pending++; break;
    }
  }
  return { tasksCompleted: completed, tasksPaused: paused, tasksFailed: failed, tasksPending: pending };
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
