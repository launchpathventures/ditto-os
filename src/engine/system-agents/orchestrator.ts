/**
 * Orchestrator — System Agent Module (Brief 021, Brief 102, Brief 103)
 *
 * Goal-directed orchestrator with two decomposition paths:
 *
 * 1. **Fast path** (Brief 021): goal + pre-assigned process slug →
 *    1:1 map to process steps as child work items. Used when a goal
 *    has a clear single-process match.
 *
 * 2. **Goal-level path** (Brief 102): goal without process slug →
 *    LLM-powered decomposition into sub-goals tagged as find/build,
 *    with dimension map clarity assessment and action boundaries.
 *
 * 3. **Find-or-Build routing** (Brief 103): three-tier routing per
 *    sub-goal: Process Model Library → matchTaskToProcess → Build.
 *    Includes goal-level trust inheritance, output threading, and
 *    bundled reviews at phase boundaries.
 *
 * Provenance:
 * - LangGraph plan-and-execute (plan-track loop)
 * - Temporal Selectors (completion-order processing)
 * - AutoGen TerminationCondition (composable stopping)
 * - CrewAI hierarchical (manager-outside-the-pool)
 * - ADR-010 (orchestrator specification)
 * - Insight-045 (confidence as stopping condition)
 * - Brief 102 (goal-level reasoning, action boundaries)
 * - Brief 103 (find-or-build routing, goal trust, bundled reviews)
 */

import type { StepExecutionResult } from "../step-executor";
import type { DimensionMap, GoalDecompositionResult, SubGoal } from "@ditto/core";
import { db, schema } from "../../db";
import { eq, inArray } from "drizzle-orm";
import {
  flattenSteps,
  type ProcessDefinition,
} from "../process-loader";
import { startProcessRun } from "../heartbeat";
import { matchTaskToProcess, type TaskRouteMatch } from "./router";
import { decomposeGoalWithLLM } from "./goal-decomposition";
import { findProcessModel, type ProcessModelMatch } from "./process-model-lookup";
import { triggerBuild, archiveBuildInProgress, type BuildResult } from "./build-on-gap";
import { resolveSubGoalTrust, type GoalTrust } from "../goal-trust";
import { collectForBundledReview, isReviewBoundary, presentBundledReview, clearPendingReviews } from "../bundled-review";
import type { TrustTier } from "../../db/schema";
import { harnessEvents } from "../events";

// ============================================================
// Types
// ============================================================

/** Escalation type taxonomy (research Section 3.3) */
export type EscalationType = "blocked" | "error" | "aggregate_uncertainty";

export interface DecompositionTask {
  taskId: string;      // child work item ID
  stepId: string;      // process step this corresponds to
  dependsOn: string[]; // task IDs this depends on (mapped from step depends_on)
  status: string;      // tracks: pending | in_progress | completed | paused | failed
}

export interface OrchestrationResult {
  action: "decomposed" | "started" | "skipped" | "escalated";
  goalWorkItemId: string | null;
  tasks: DecompositionTask[];
  confidence: "high" | "medium" | "low";
  escalation?: {
    type: EscalationType;
    reason: string;
    tasksCompleted: number;
    tasksRemaining: number;
    openQuestions?: string[];
    options?: string[];
  };
  reasoning: string;
  /** Present when goal-level LLM decomposition was used (Brief 102) */
  goalDecompositionResult?: GoalDecompositionResult;
}

// ============================================================
// Orchestrator entry point
// ============================================================

/**
 * Execute orchestration as a system agent step.
 *
 * For goal-type work items with an assigned process:
 *   1. Load the process definition
 *   2. Decompose steps into child work items
 *   3. Return decomposition for the orchestratorHeartbeat to execute
 *
 * For task-type work items (or pass-through when no decomposition needed):
 *   Start a single process run (backward-compatible with Phase 4c)
 */
export async function executeOrchestrator(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const processSlug = inputs.processSlug as string | undefined;
  const workItemId = inputs.workItemId as string;
  const workItemContent = inputs.content as string;
  const workItemType = inputs.workItemType as string | undefined;
  const goalTrustOverrides = inputs.goalTrustOverrides as Record<string, TrustTier> | undefined;
  const dimensionMap = inputs.dimensionMap as DimensionMap | undefined;
  const industrySignals = inputs.industrySignals as string[] | undefined;
  const enableWebSearch = inputs.enableWebSearch as boolean | undefined;

  const isGoalType = workItemType === "goal" || workItemType === "outcome";

  // ── Goal-level decomposition path (Brief 102 + Brief 103) ──
  // Activates when: goal/outcome type AND no pre-assigned process slug
  // Brief 103: after decomposition, routes sub-goals via find-or-build
  if (isGoalType && !processSlug) {
    // Brief 155 MP-1.4: emit decomposition start
    harnessEvents.emit({
      type: "orchestrator-decomposition-start",
      goalWorkItemId: workItemId,
      goalContent: workItemContent,
    });

    const result = await decomposeGoalLLM(
      workItemId,
      workItemContent,
      dimensionMap,
      industrySignals,
      enableWebSearch,
    );

    const orchestration = result.outputs["orchestration-result"] as OrchestrationResult;
    if (orchestration.action === "decomposed" && workItemId && orchestration.goalDecompositionResult?.ready) {
      // Brief 155 MP-1.4: emit subtask-identified for each decomposed task
      for (let i = 0; i < orchestration.tasks.length; i++) {
        const task = orchestration.tasks[i];
        const subGoals = orchestration.goalDecompositionResult.decomposition?.subGoals;
        const sg = subGoals?.find((s) => s.id === task.taskId);
        harnessEvents.emit({
          type: "orchestrator-subtask-identified",
          goalWorkItemId: workItemId,
          subtaskId: task.taskId,
          subtaskDescription: sg?.description ?? task.stepId,
          index: i + 1,
          total: orchestration.tasks.length,
        });
      }

      const subGoals = orchestration.goalDecompositionResult.decomposition?.subGoals;
      // Brief 103: three-tier routing for LLM-decomposed sub-goals
      await routeDecomposedTasks(workItemId, orchestration.tasks, subGoals, industrySignals);

      // Brief 155 MP-1.4: emit decomposition complete
      harnessEvents.emit({
        type: "orchestrator-decomposition-complete",
        goalWorkItemId: workItemId,
        totalTasks: orchestration.tasks.length,
        reasoning: orchestration.reasoning,
      });

      // Auto-trigger goalHeartbeatLoop (non-blocking)
      const { goalHeartbeatLoop } = await import("../heartbeat");
      setImmediate(() => {
        goalHeartbeatLoop(workItemId, goalTrustOverrides).catch((err) => {
          console.error(`Goal heartbeat loop failed for ${workItemId}:`, err);
        });
      });
    } else {
      // Brief 155: emit failure so the UI clears the progress bar
      harnessEvents.emit({
        type: "orchestrator-decomposition-failed",
        goalWorkItemId: workItemId,
        reason: orchestration.reasoning,
      });
    }

    return result;
  }

  // ── No process slug for non-goal types → escalate ──
  if (!processSlug) {
    return makeResult({
      action: "escalated",
      goalWorkItemId: workItemId || null,
      tasks: [],
      confidence: "low",
      escalation: {
        type: "blocked",
        reason: "No process assigned — cannot orchestrate without a target process",
        tasksCompleted: 0,
        tasksRemaining: 0,
        options: ["Define a process", "Assign manually"],
      },
      reasoning: "No process slug provided",
    });
  }

  // ── Fast path (Brief 021): goal + process slug → step decomposition ──
  if (isGoalType) {
    // Brief 155 MP-1.4: emit decomposition start
    harnessEvents.emit({
      type: "orchestrator-decomposition-start",
      goalWorkItemId: workItemId,
      goalContent: workItemContent,
    });

    const result = await decomposeGoal(processSlug, workItemId, workItemContent);

    const orchestration = result.outputs["orchestration-result"] as OrchestrationResult;
    if (orchestration.action === "decomposed" && workItemId) {
      // Brief 155 MP-1.4: emit subtask-identified for each decomposed task
      for (let i = 0; i < orchestration.tasks.length; i++) {
        const task = orchestration.tasks[i];
        harnessEvents.emit({
          type: "orchestrator-subtask-identified",
          goalWorkItemId: workItemId,
          subtaskId: task.taskId,
          subtaskDescription: task.stepId,
          index: i + 1,
          total: orchestration.tasks.length,
        });
      }

      // Auto-route decomposed tasks to processes (Brief 074 → Brief 103 three-tier)
      await routeDecomposedTasks(workItemId, orchestration.tasks);

      // Brief 155 MP-1.4: emit decomposition complete
      harnessEvents.emit({
        type: "orchestrator-decomposition-complete",
        goalWorkItemId: workItemId,
        totalTasks: orchestration.tasks.length,
        reasoning: orchestration.reasoning,
      });

      // Auto-trigger goalHeartbeatLoop (non-blocking)
      // Import lazily to avoid circular dependency
      const { goalHeartbeatLoop } = await import("../heartbeat");
      setImmediate(() => {
        goalHeartbeatLoop(workItemId, goalTrustOverrides).catch((err) => {
          console.error(`Goal heartbeat loop failed for ${workItemId}:`, err);
        });
      });
    } else {
      // Brief 155: emit failure so the UI clears the progress bar
      harnessEvents.emit({
        type: "orchestrator-decomposition-failed",
        goalWorkItemId: workItemId,
        reason: orchestration.reasoning,
      });
    }

    return result;
  }

  // ── Pass-through (backward-compatible with Phase 4c) ──
  return passThroughOrchestration(processSlug, workItemId, workItemContent);
}

// ============================================================
// Goal decomposition
// ============================================================

/**
 * Decompose a goal into child work items using the process step list.
 * Each step in the process becomes a child task with dependencies
 * mirroring the YAML depends_on declarations.
 */
async function decomposeGoal(
  processSlug: string,
  goalWorkItemId: string,
  goalContent: string,
): Promise<StepExecutionResult> {
  // Load the process definition
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    return makeResult({
      action: "escalated",
      goalWorkItemId,
      tasks: [],
      confidence: "low",
      escalation: {
        type: "blocked",
        reason: `Process "${processSlug}" not found — cannot decompose goal`,
        tasksCompleted: 0,
        tasksRemaining: 0,
        options: ["Define the process", "Route to a different process"],
      },
      reasoning: `Process ${processSlug} not found`,
    });
  }

  const definition = proc.definition as unknown as ProcessDefinition;
  const steps = flattenSteps(definition);

  if (steps.length === 0) {
    return makeResult({
      action: "escalated",
      goalWorkItemId,
      tasks: [],
      confidence: "low",
      escalation: {
        type: "blocked",
        reason: "Process has no steps — cannot decompose",
        tasksCompleted: 0,
        tasksRemaining: 0,
      },
      reasoning: "Empty process definition",
    });
  }

  // Build step ID → task ID mapping for dependency resolution
  const stepToTaskId = new Map<string, string>();
  const tasks: DecompositionTask[] = [];
  const childWorkItemIds: string[] = [];

  // Create child work items for each step
  for (const step of steps) {
    const [childItem] = await db
      .insert(schema.workItems)
      .values({
        type: "task",
        status: "intake",
        content: `${step.name}: ${step.description || goalContent}`,
        source: "system_generated",
        goalAncestry: [goalWorkItemId],
        spawnedFrom: goalWorkItemId,
        assignedProcess: proc.id,
        context: {
          stepId: step.id,
          processSlug,
          parentGoal: goalContent,
          isConditional: !!(step.route_to && step.route_to.length > 0),
        },
      })
      .returning();

    stepToTaskId.set(step.id, childItem.id);
    childWorkItemIds.push(childItem.id);
  }

  // Build decomposition with resolved dependencies
  for (const step of steps) {
    const taskId = stepToTaskId.get(step.id)!;
    const dependsOn: string[] = [];

    if (step.depends_on) {
      for (const depStepId of step.depends_on) {
        const depTaskId = stepToTaskId.get(depStepId);
        if (depTaskId) {
          dependsOn.push(depTaskId);
        }
      }
    }

    tasks.push({
      taskId,
      stepId: step.id,
      dependsOn,
      status: "pending",
    });
  }

  // Update the parent goal work item with decomposition and spawned items
  await db
    .update(schema.workItems)
    .set({
      status: "in_progress",
      spawnedItems: childWorkItemIds,
      decomposition: tasks,
      updatedAt: new Date(),
    })
    .where(eq(schema.workItems.id, goalWorkItemId));

  return makeResult({
    action: "decomposed",
    goalWorkItemId,
    tasks,
    confidence: "high",
    reasoning: `Decomposed goal into ${tasks.length} tasks from process "${definition.name}"`,
  });
}

// ============================================================
// Pass-through (backward-compatible with Phase 4c)
// ============================================================

async function passThroughOrchestration(
  processSlug: string,
  workItemId: string,
  content: string,
): Promise<StepExecutionResult> {
  try {
    const processRunId = await startProcessRun(
      processSlug,
      { workItemId, content, triggeredByOrchestrator: true },
      "system:orchestrator",
    );

    return makeResult({
      action: "started",
      goalWorkItemId: workItemId || null,
      tasks: [],
      confidence: "high",
      reasoning: `Started process run for ${processSlug}`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return makeResult({
      action: "escalated",
      goalWorkItemId: workItemId || null,
      tasks: [],
      confidence: "low",
      escalation: {
        type: "error",
        reason: `Failed to start process: ${errMsg}`,
        tasksCompleted: 0,
        tasksRemaining: 1,
      },
      reasoning: `Failed to start process ${processSlug}: ${errMsg}`,
    });
  }
}

// ============================================================
// Find-or-Build Sub-Goal Routing (Brief 103)
// ============================================================

export type RoutingPath = "model" | "find" | "build" | "escalated";

export interface SubGoalRoutingResult {
  subGoalId: string;
  path: RoutingPath;
  processSlug: string | null;
  processId: string | null;
  confidence: number;
  reasoning: string;
  costCents: number;
}

/**
 * Route a single sub-goal using three-tier routing (AC1):
 *   1. Check Process Model Library (templates/) → adopt path (cheap)
 *   2. Check matchTaskToProcess (existing processes) → find path (free)
 *   3. Trigger Build meta-process → build path (expensive)
 *
 * All routing decisions logged to activity log with cost (AC17).
 */
export async function routeSubGoal(
  subGoalId: string,
  subGoalDescription: string,
  subGoalRouting: "find" | "build",
  goalWorkItemId: string,
  opts?: {
    industryKeywords?: string[];
    buildDepth?: number;
  },
): Promise<SubGoalRoutingResult> {
  const CONFIDENCE_THRESHOLD = 0.6;

  // ── Tier 1: Process Model Library (AC2, AC3 — Brief 104: DB-backed) ──
  const modelMatch = await findProcessModel(subGoalDescription, {
    industryKeywords: opts?.industryKeywords,
  });

  if (modelMatch && modelMatch.confidence >= CONFIDENCE_THRESHOLD) {
    // Check if the template process exists in DB
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, modelMatch.slug))
      .limit(1);

    if (proc) {
      const result: SubGoalRoutingResult = {
        subGoalId,
        path: "model",
        processSlug: modelMatch.slug,
        processId: proc.id,
        confidence: modelMatch.confidence,
        reasoning: `Process Model Library match: ${modelMatch.reasoning}`,
        costCents: 0, // model match is free
      };
      await logRoutingDecision(goalWorkItemId, subGoalId, result);
      return result;
    }
  }

  // ── Tier 2: matchTaskToProcess — existing processes (AC4) ──
  const processMatch = await matchTaskToProcess(subGoalDescription);

  if (processMatch.processSlug && processMatch.confidence >= CONFIDENCE_THRESHOLD) {
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processMatch.processSlug))
      .limit(1);

    if (proc) {
      const result: SubGoalRoutingResult = {
        subGoalId,
        path: "find",
        processSlug: processMatch.processSlug,
        processId: proc.id,
        confidence: processMatch.confidence,
        reasoning: `Existing process match: ${processMatch.reasoning}`,
        costCents: 0, // find is free
      };
      await logRoutingDecision(goalWorkItemId, subGoalId, result);
      return result;
    }
  }

  // ── Tier 3: Build meta-process (AC5) ──
  // Only trigger build if the sub-goal was tagged as "build" by decomposition,
  // OR if find/model both failed
  const buildResult = await triggerBuild({
    subGoalId,
    subGoalDescription,
    goalId: goalWorkItemId,
    buildDepth: opts?.buildDepth ?? 0,
    industryKeywords: opts?.industryKeywords,
    validateFirstRun: true,
  });

  if (buildResult.success && buildResult.processSlug) {
    const result: SubGoalRoutingResult = {
      subGoalId,
      path: "build",
      processSlug: buildResult.processSlug,
      processId: buildResult.processId,
      confidence: 0.7, // Generated process starts at moderate confidence
      reasoning: buildResult.reasoning,
      costCents: buildResult.costCents,
    };
    await logRoutingDecision(goalWorkItemId, subGoalId, result);
    return result;
  }

  // Build failed — escalate to user (AC7)
  const result: SubGoalRoutingResult = {
    subGoalId,
    path: "escalated",
    processSlug: buildResult.processSlug,
    processId: buildResult.processId,
    confidence: 0,
    reasoning: `All routing tiers failed. Build result: ${buildResult.reasoning}`,
    costCents: buildResult.costCents,
  };
  await logRoutingDecision(goalWorkItemId, subGoalId, result);
  return result;
}

/**
 * Route all decomposed sub-goals using find-or-build routing.
 * Replaces the Brief 074 routeDecomposedTasks with three-tier routing.
 */
async function routeDecomposedTasks(
  goalWorkItemId: string,
  tasks: DecompositionTask[],
  subGoals?: SubGoal[],
  industryKeywords?: string[],
): Promise<void> {
  for (const task of tasks) {
    const [childItem] = await db
      .select()
      .from(schema.workItems)
      .where(eq(schema.workItems.id, task.taskId))
      .limit(1);

    if (!childItem) continue;

    // Determine routing hint from decomposition
    const subGoal = subGoals?.find((sg) => sg.id === task.taskId);
    const routingHint = subGoal?.routing || "find";

    const routingResult = await routeSubGoal(
      task.taskId,
      childItem.content,
      routingHint,
      goalWorkItemId,
      { industryKeywords, buildDepth: 0 },
    );

    // Brief 155 MP-1.4: emit subtask-dispatched after routing
    harnessEvents.emit({
      type: "orchestrator-subtask-dispatched",
      goalWorkItemId,
      subtaskId: task.taskId,
      routingPath: routingResult.path,
      processSlug: routingResult.processSlug,
    });

    if (routingResult.processId && routingResult.path !== "escalated") {
      await db
        .update(schema.workItems)
        .set({
          assignedProcess: routingResult.processId,
          status: "routed",
          context: {
            ...(childItem.context as Record<string, unknown> || {}),
            processSlug: routingResult.processSlug,
            routingPath: routingResult.path,
            routingConfidence: routingResult.confidence,
            routingReasoning: routingResult.reasoning,
            routingCostCents: routingResult.costCents,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.workItems.id, task.taskId));
    } else {
      await db
        .update(schema.workItems)
        .set({
          status: "waiting_human",
          context: {
            ...(childItem.context as Record<string, unknown> || {}),
            routingEscalation: true,
            routingPath: routingResult.path,
            routingConfidence: routingResult.confidence,
            routingReasoning: routingResult.reasoning,
            routingCostCents: routingResult.costCents,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.workItems.id, task.taskId));
    }
  }
}

/** Log a routing decision to the activity log with cost observability (AC17). */
async function logRoutingDecision(
  goalWorkItemId: string,
  subGoalId: string,
  result: SubGoalRoutingResult,
): Promise<void> {
  await db.insert(schema.activities).values({
    action: `orchestrator.routing.${result.path}`,
    actorType: "system",
    entityType: "work_item",
    entityId: subGoalId,
    metadata: {
      goalWorkItemId,
      path: result.path,
      processSlug: result.processSlug,
      confidence: result.confidence,
      reasoning: result.reasoning,
      costCents: result.costCents,
      costCategory: result.path === "find" ? "free"
        : result.path === "model" ? "cheap"
        : result.path === "build" ? "expensive"
        : "none",
    },
  });
}

// ============================================================
// Goal cancellation (Brief 103 AC16)
// ============================================================

/**
 * Cancel a goal: pause all in-progress sub-goals, archive
 * build-in-progress processes, preserve completed outputs.
 */
export async function cancelGoal(goalWorkItemId: string): Promise<void> {
  const [goalItem] = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.id, goalWorkItemId))
    .limit(1);

  if (!goalItem) return;

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
      // Pause in-progress sub-goals (not delete)
      if (child.status === "in_progress" || child.status === "routed" || child.status === "intake") {
        await db
          .update(schema.workItems)
          .set({ status: "waiting_human", updatedAt: new Date() })
          .where(eq(schema.workItems.id, child.id));

        // Cancel active process runs
        const executionIds = (child.executionIds as string[]) || [];
        for (const runId of executionIds) {
          await db
            .update(schema.processRuns)
            .set({ status: "cancelled" })
            .where(eq(schema.processRuns.id, runId));
        }
      }
      // Completed sub-goals and their outputs are preserved
    }
  }

  // Archive build-in-progress processes
  await archiveBuildInProgress(goalWorkItemId);

  // Clear pending bundled reviews
  clearPendingReviews(goalWorkItemId);

  // Mark goal as cancelled. Schema has no "paused" status — using "waiting_human"
  // to allow the goal to be resumed via resumeGoal(). The activity log records
  // the "goal.cancelled" action for disambiguation.
  await db
    .update(schema.workItems)
    .set({ status: "waiting_human", updatedAt: new Date() })
    .where(eq(schema.workItems.id, goalWorkItemId));

  await db.insert(schema.activities).values({
    action: "goal.cancelled",
    actorType: "human",
    entityType: "work_item",
    entityId: goalWorkItemId,
    metadata: { reason: "User cancelled goal" },
  });
}

// ============================================================
// Goal-level LLM decomposition (Brief 102)
// ============================================================

/**
 * Decompose a goal into sub-goals using LLM reasoning.
 * Used when no process slug is pre-assigned — the orchestrator
 * needs to reason about what sub-goals are needed.
 */
async function decomposeGoalLLM(
  goalWorkItemId: string,
  goalContent: string,
  dimensionMap?: DimensionMap,
  industrySignals?: string[],
  enableWebSearch?: boolean,
): Promise<StepExecutionResult> {
  try {
    const result: GoalDecompositionResult = await decomposeGoalWithLLM({
      goalId: goalWorkItemId,
      goalDescription: goalContent,
      dimensionMap,
      industrySignals,
      enableWebSearch,
    });

    if (!result.ready) {
      // Clarity insufficient — return questions for the Self to ask
      return makeResult({
        action: "escalated",
        goalWorkItemId,
        tasks: [],
        confidence: "low",
        escalation: {
          type: "blocked",
          reason: "Goal clarity insufficient for decomposition",
          tasksCompleted: 0,
          tasksRemaining: 0,
          openQuestions: result.questions.map(q => `[${q.dimension}] ${q.question}`),
        },
        reasoning: result.reasoning,
        goalDecompositionResult: result,
      });
    }

    // Decomposition succeeded — store on work item
    const decomposition = result.decomposition;
    const tasks: DecompositionTask[] = decomposition.subGoals.map(sg => ({
      taskId: sg.id,
      stepId: sg.id, // sub-goals use their own ID (no process step mapping)
      dependsOn: sg.dependsOn,
      status: "pending",
    }));

    if (goalWorkItemId) {
      await db
        .update(schema.workItems)
        .set({
          status: "in_progress",
          decomposition: tasks,
          context: {
            goalDecomposition: decomposition,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.workItems.id, goalWorkItemId));
    }

    return makeResult({
      action: "decomposed",
      goalWorkItemId,
      tasks,
      confidence: decomposition.confidence,
      reasoning: decomposition.reasoning,
      goalDecompositionResult: result,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return makeResult({
      action: "escalated",
      goalWorkItemId,
      tasks: [],
      confidence: "low",
      escalation: {
        type: "error",
        reason: `Goal-level decomposition failed: ${errMsg}`,
        tasksCompleted: 0,
        tasksRemaining: 0,
      },
      reasoning: `LLM decomposition failed: ${errMsg}`,
    });
  }
}

// ============================================================
// Helper
// ============================================================

function makeResult(result: OrchestrationResult): StepExecutionResult {
  return {
    outputs: { "orchestration-result": result },
    confidence: result.confidence,
    logs: [result.reasoning],
  };
}
