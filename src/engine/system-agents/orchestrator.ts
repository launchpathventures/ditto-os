/**
 * Orchestrator — System Agent Module (Brief 021)
 *
 * Goal-directed orchestrator that decomposes goals into tasks using
 * process step lists as blueprints, spawns child work items with
 * dependencies, and manages work-queue scheduling.
 *
 * Decomposition strategy: the assigned process definition's steps
 * become the task list. Dependencies mirror depends_on in YAML.
 * Conditional steps (route_to) are included but may be skipped at runtime.
 *
 * Provenance:
 * - LangGraph plan-and-execute (plan-track loop)
 * - Temporal Selectors (completion-order processing)
 * - AutoGen TerminationCondition (composable stopping)
 * - CrewAI hierarchical (manager-outside-the-pool)
 * - ADR-010 (orchestrator specification)
 * - Insight-045 (confidence as stopping condition)
 */

import type { StepExecutionResult } from "../step-executor";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import {
  flattenSteps,
  type ProcessDefinition,
} from "../process-loader";
import { startProcessRun } from "../heartbeat";

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
  const processSlug = inputs.processSlug as string;
  const workItemId = inputs.workItemId as string;
  const workItemContent = inputs.content as string;
  const workItemType = inputs.workItemType as string | undefined;

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

  // For goals: decompose into tasks
  if (workItemType === "goal" || workItemType === "outcome") {
    return decomposeGoal(processSlug, workItemId, workItemContent);
  }

  // For tasks/questions: pass-through (backward-compatible)
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
// Helper
// ============================================================

function makeResult(result: OrchestrationResult): StepExecutionResult {
  return {
    outputs: { "orchestration-result": result },
    confidence: result.confidence,
    logs: [result.reasoning],
  };
}
