/**
 * Ditto — Self Tool: Promote Memory Scope (Brief 227)
 *
 * Promotes a memory's scope from project-local to multi-project or fully self-scoped.
 *
 * - `scope: "all"` — full self-scope (memory applies everywhere). Sets
 *   `scopeType='self'`, `appliedProjectIds=NULL`.
 * - `scope: { projectIds: [...] }` — hybrid scope (memory applies only to the
 *   listed projects). Sets `scopeType='self'`, `appliedProjectIds=<list>`.
 *
 * The reverse direction (back to single-project scope) lives in
 * `demote-memory-scope.ts`.
 *
 * Insight-180 guard: requires `stepRunId` — proves the call originates from
 * within harness pipeline step execution. Bypassed in `DITTO_TEST_MODE` so
 * unit tests can exercise the handler directly.
 *
 * Provenance: Brief 227 §What Changes; Insight-180 step-run guard pattern;
 *   existing self-tool shape (`adjust-trust.ts`, `start-project-onboarding.ts`).
 */

import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import type { DelegationResult } from "../self-delegation";

export const PROMOTE_MEMORY_SCOPE_TOOL_NAME = "promote_memory_scope";

export interface PromoteMemoryScopeInput {
  /** ID of the memory to promote. */
  memoryId: string;
  /**
   * Target scope. `"all"` promotes to full self-scope (applies everywhere).
   * `{ projectIds: [...] }` promotes to a hybrid multi-project scope —
   * memory applies only to the listed projects.
   */
  scope: "all" | { projectIds: string[] };
  /**
   * Insight-180 invocation guard. Required outside of `DITTO_TEST_MODE`.
   */
  stepRunId?: string;
  /**
   * Optional actor identity (user email or session id) for the activities row.
   * Reviewer IMP-2 — `actorType: "user"` without an actorId is opaque; this
   * sets the multi-user invariants now rather than retrofitting later.
   */
  actorId?: string;
}

export async function handlePromoteMemoryScope(
  input: PromoteMemoryScopeInput,
): Promise<DelegationResult> {
  // Insight-180 guard — reject calls outside of harness pipeline step execution.
  // Test mode bypass mirrors the publishPost() pattern (channel.ts).
  if (!input.stepRunId && process.env.DITTO_TEST_MODE !== "true") {
    return {
      toolName: PROMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output:
        "promote_memory_scope requires stepRunId — must be called from within step execution (Insight-180).",
    };
  }

  if (!input.memoryId) {
    return {
      toolName: PROMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output: "memoryId is required.",
    };
  }

  // Validate scope shape
  if (input.scope !== "all") {
    if (
      !input.scope ||
      !Array.isArray(input.scope.projectIds) ||
      input.scope.projectIds.length === 0
    ) {
      return {
        toolName: PROMOTE_MEMORY_SCOPE_TOOL_NAME,
        success: false,
        output:
          'scope must be "all" or { projectIds: [<non-empty list>] }.',
      };
    }
    // Defence-in-depth: reject empty-string elements that would land in
    // appliedProjectIds as phantom project ids no run can match.
    if (input.scope.projectIds.some((id) => typeof id !== "string" || id.length === 0)) {
      return {
        toolName: PROMOTE_MEMORY_SCOPE_TOOL_NAME,
        success: false,
        output: "scope.projectIds must contain only non-empty strings.",
      };
    }
  }

  const [memory] = await db
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.id, input.memoryId))
    .limit(1);

  if (!memory) {
    return {
      toolName: PROMOTE_MEMORY_SCOPE_TOOL_NAME,
      success: false,
      output: `Memory not found: ${input.memoryId}`,
    };
  }

  const previousScopeType = memory.scopeType;
  const previousScopeId = memory.scopeId;
  const previousAppliedProjectIds = memory.appliedProjectIds;
  const newAppliedProjectIds: string[] | null =
    input.scope === "all" ? null : input.scope.projectIds;

  await db
    .update(schema.memories)
    .set({
      scopeType: "self",
      appliedProjectIds: newAppliedProjectIds,
      updatedAt: new Date(),
    })
    .where(eq(schema.memories.id, input.memoryId));

  await db.insert(schema.activities).values({
    action: "memory_promote",
    description:
      input.scope === "all"
        ? `Memory promoted to all projects`
        : `Memory promoted to ${newAppliedProjectIds!.length} project(s)`,
    actorType: "user",
    actorId: input.actorId ?? null,
    entityType: "memory",
    entityId: input.memoryId,
    metadata: {
      previousScopeType,
      previousScopeId,
      previousAppliedProjectIds,
      newScopeType: "self",
      newAppliedProjectIds,
      scope: input.scope,
    },
  });

  return {
    toolName: PROMOTE_MEMORY_SCOPE_TOOL_NAME,
    success: true,
    output:
      input.scope === "all"
        ? `Promoted memory to all projects.`
        : `Promoted memory to ${newAppliedProjectIds!.length} project(s).`,
    metadata: {
      memoryId: input.memoryId,
      newScopeType: "self",
      newAppliedProjectIds,
    },
  };
}
