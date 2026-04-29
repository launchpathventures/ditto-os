/**
 * Ditto — Self Tool: Demote Memory Scope (Brief 227)
 *
 * Reverses a promotion — flips a self-scope memory back to project-scope.
 *
 * Demote target rules (Brief 227 §Constraints, Designer Open Q2):
 * - When `appliedProjectIds` is non-empty (hybrid memory), the target must be
 *   one of the listed projects.
 * - When `appliedProjectIds` is NULL (fully self-scope), the target can be
 *   any currently-`active` project.
 * - The new `scopeId` is the highest-reinforcement-count source process for
 *   the target project (preserves audit trail).
 *
 * Type guard (Reviewer Critical #1): rejects `user_model` and `preference`
 * memory types — those are person-facts that never had a source process,
 * so tagging them to a project is semantically wrong (ADR-003 §1).
 *
 * Insight-180 guard: requires `stepRunId` (DITTO_TEST_MODE bypass).
 *
 * Provenance: Brief 227 §What Changes; Insight-180 step-run guard pattern;
 *   ADR-003 §1 user_model/preference exclusion; existing self-tool shape.
 */

import { db, schema } from "../../db";
import { eq, desc, and, inArray } from "drizzle-orm";
import type { DelegationResult } from "../self-delegation";

export const DEMOTE_MEMORY_SCOPE_TOOL_NAME = "demote_memory_scope";

/** Memory types that semantically never belong to a single project. */
const PROJECT_INCOMPATIBLE_TYPES = new Set(["user_model", "preference"]);

export interface DemoteMemoryScopeInput {
  /** ID of the memory to demote. */
  memoryId: string;
  /**
   * Target project to demote to. Must be in `appliedProjectIds` if the memory
   * was hybrid; otherwise must be a currently-`active` project.
   */
  targetProjectId: string;
  /** Insight-180 invocation guard. Required outside of `DITTO_TEST_MODE`. */
  stepRunId?: string;
  /**
   * Optional actor identity (user email or session id) for the activities row.
   * Reviewer IMP-2 — sets multi-user audit-trail invariants now.
   */
  actorId?: string;
}

export async function handleDemoteMemoryScope(
  input: DemoteMemoryScopeInput,
): Promise<DelegationResult> {
  // Insight-180 guard
  if (!input.stepRunId && process.env.DITTO_TEST_MODE !== "true") {
    return {
      toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output:
        "demote_memory_scope requires stepRunId — must be called from within step execution (Insight-180).",
    };
  }

  if (!input.memoryId || !input.targetProjectId) {
    return {
      toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output: "memoryId and targetProjectId are required.",
    };
  }

  const [memory] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, input.memoryId))
    .limit(1);

  if (!memory) {
    return {
      toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output: `Memory not found: ${input.memoryId}`,
    };
  }

  // Reviewer Critical #1: user_model + preference can't be project-scoped.
  // These are person-facts (ADR-003 §1) that never had a source process.
  if (PROJECT_INCOMPATIBLE_TYPES.has(memory.type)) {
    return {
      toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output: `Cannot demote memory of type '${memory.type}' to project-scope — these memory types are person-facts and never have a source process.`,
      metadata: {
        reason: "user-model-or-preference-cannot-be-project-scoped",
        memoryType: memory.type,
      },
    };
  }

  // Validate target project rules
  if (memory.scopeType === "self" && Array.isArray(memory.appliedProjectIds) && memory.appliedProjectIds.length > 0) {
    // Hybrid: target must be in the existing list
    if (!memory.appliedProjectIds.includes(input.targetProjectId)) {
      return {
        toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
        success: false,
        output: `targetProjectId must be one of the memory's appliedProjectIds: ${memory.appliedProjectIds.join(", ")}`,
      };
    }
  } else {
    // Fully self-scoped (or already process-scoped): target must be an active project
    const [project] = await db
      .select({ id: schema.projects.id, status: schema.projects.status })
      .from(schema.projects)
      .where(eq(schema.projects.id, input.targetProjectId))
      .limit(1);

    if (!project) {
      return {
        toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
        success: false,
        output: `Project not found: ${input.targetProjectId}`,
      };
    }

    if (project.status !== "active") {
      return {
        toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
        success: false,
        output: `Cannot demote to project '${input.targetProjectId}' — status is '${project.status}', not 'active'. Pick a currently-active project.`,
      };
    }
  }

  // Pick the new scopeId: highest-reinforcement-count source process belonging
  // to the target project. Falls back to ANY process in the target project if
  // no prior source process is identifiable. Preserves audit-trail intent.
  const projectMateProcesses = await db
    .select({ id: schema.processes.id })
    .from(schema.processes)
    .where(eq(schema.processes.projectId, input.targetProjectId));

  if (projectMateProcesses.length === 0) {
    return {
      toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output: `Target project '${input.targetProjectId}' has no processes — cannot demote.`,
    };
  }

  const projectMateIds = projectMateProcesses.map((p) => p.id);

  // Look for the highest-reinforcement process-scope memory whose source
  // process belongs to the TARGET project (Reviewer Crit-1 — without
  // `inArray(scopeId, projectMateIds)` the unfiltered query could surface a
  // memory from any project, then fall back to projectMateIds[0]; both cases
  // miss "highest-reinforcement WITHIN the target project").
  const [topMate] = await db
    .select({ scopeId: schema.memories.scopeId })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.active, true),
        inArray(schema.memories.scopeId, projectMateIds),
      ),
    )
    .orderBy(desc(schema.memories.reinforcementCount));

  // No prior memory in this project (e.g., demote-into-empty-project case):
  // fall back to the first project-mate process. Preserves the "anchor in a
  // real process belonging to the target" invariant.
  const newScopeId = topMate ? topMate.scopeId : projectMateIds[0];

  const previousScopeType = memory.scopeType;
  const previousAppliedProjectIds = memory.appliedProjectIds;

  await db
    .update(schema.memories)
    .set({
      scopeType: "process",
      scopeId: newScopeId,
      appliedProjectIds: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.memories.id, input.memoryId));

  await db.insert(schema.activities).values({
    action: "memory_demote",
    description: `Memory demoted to project ${input.targetProjectId}`,
    actorType: "user",
    actorId: input.actorId ?? null,
    entityType: "memory",
    entityId: input.memoryId,
    metadata: {
      previousScopeType,
      previousAppliedProjectIds,
      newScopeType: "process",
      newScopeId,
      targetProjectId: input.targetProjectId,
    },
  });

  return {
    toolName: DEMOTE_MEMORY_SCOPE_TOOL_NAME,
    success: true,
    output: `Demoted memory to project '${input.targetProjectId}'.`,
    metadata: {
      memoryId: input.memoryId,
      newScopeType: "process",
      newScopeId,
      targetProjectId: input.targetProjectId,
    },
  };
}
