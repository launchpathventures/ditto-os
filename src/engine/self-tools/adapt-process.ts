/**
 * Ditto — Self Tool: Adapt Process
 *
 * Runtime process adaptation — writes run-scoped definition override
 * on processRuns (not canonical processes.definition). Template stays
 * durable, run instance gets the adapted version.
 *
 * Guards:
 * - Validates adapted definition against process-loader schema
 * - Cannot remove/reorder steps that are running or waiting_review
 * - Cannot remove steps that are already approved
 * - Scoped to system processes only (system: true in DB)
 * - Optimistic locking via definitionOverrideVersion
 * - Logs every adaptation as an activity
 *
 * Provenance: ADR-020 (Runtime Process Adaptation), Insight-091, Brief 044.
 */

import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import {
  validateDependencies,
  flattenSteps,
  type ProcessDefinition,
} from "../process-loader";
import type { DelegationResult } from "../self-delegation";

interface AdaptProcessInput {
  runId: string;
  /** The adapted definition — full YAML-equivalent object, not a diff */
  adaptedDefinition: Record<string, unknown>;
  /** Why this adaptation is being made */
  reasoning: string;
  /** Expected version for optimistic locking (prevents concurrent races) */
  expectedVersion?: number;
}

export async function handleAdaptProcess(
  input: AdaptProcessInput,
): Promise<DelegationResult> {
  const { runId, adaptedDefinition, reasoning, expectedVersion } = input;

  if (!runId || !adaptedDefinition || !reasoning) {
    return {
      toolName: "adapt_process",
      success: false,
      output: "Required: runId, adaptedDefinition, reasoning.",
    };
  }

  try {
    // 1. Load the process run
    const [run] = await db
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId))
      .limit(1);

    if (!run) {
      return {
        toolName: "adapt_process",
        success: false,
        output: `Process run not found: ${runId}`,
      };
    }

    // 2. Load the process record — check system: true (AC6)
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    if (!proc) {
      return {
        toolName: "adapt_process",
        success: false,
        output: "Process not found for this run.",
      };
    }

    const procDef = proc.definition as Record<string, unknown>;
    const isSystem = procDef && procDef.system === true;
    if (!isSystem) {
      return {
        toolName: "adapt_process",
        success: false,
        output: "adapt_process is currently scoped to system processes only. This process is not a system process.",
      };
    }

    // 3. Optimistic locking check (ADR-020)
    if (expectedVersion !== undefined && run.definitionOverrideVersion !== expectedVersion) {
      return {
        toolName: "adapt_process",
        success: false,
        output: `Version conflict: expected ${expectedVersion}, current is ${run.definitionOverrideVersion}. Re-read and retry.`,
      };
    }

    // 4. Validate the adapted definition (AC3)
    const adapted = adaptedDefinition as unknown as ProcessDefinition;
    if (!adapted.steps || !Array.isArray(adapted.steps)) {
      return {
        toolName: "adapt_process",
        success: false,
        output: "Adapted definition must have a 'steps' array.",
      };
    }

    // Validate dependencies
    const depErrors = validateDependencies(adapted);
    if (depErrors.length > 0) {
      return {
        toolName: "adapt_process",
        success: false,
        output: `Validation failed:\n${depErrors.join("\n")}`,
      };
    }

    // Validate executor types
    const validExecutors = ["ai-agent", "cli-agent", "script", "rules", "human", "handoff", "integration"];
    const adaptedSteps = flattenSteps(adapted);
    for (const step of adaptedSteps) {
      if (!validExecutors.includes(step.executor)) {
        return {
          toolName: "adapt_process",
          success: false,
          output: `Invalid executor type '${step.executor}' on step '${step.id}'. Valid: ${validExecutors.join(", ")}.`,
        };
      }
    }

    // 5. Guard: cannot remove/reorder steps that are running, waiting_review, or approved (AC4)
    const existingStepRuns = await db
      .select({
        stepId: schema.stepRuns.stepId,
        status: schema.stepRuns.status,
      })
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, runId));

    const protectedStepIds = new Set<string>();
    for (const sr of existingStepRuns) {
      if (sr.status === "running" || sr.status === "waiting_review" || sr.status === "approved") {
        protectedStepIds.add(sr.stepId);
      }
    }

    const adaptedStepIds = adaptedSteps.map((s) => s.id);
    const adaptedStepIdSet = new Set(adaptedStepIds);
    for (const protectedId of protectedStepIds) {
      if (!adaptedStepIdSet.has(protectedId)) {
        return {
          toolName: "adapt_process",
          success: false,
          output: `Cannot remove step '${protectedId}' — it is currently ${existingStepRuns.find((s) => s.stepId === protectedId)?.status}. Protected steps: ${Array.from(protectedStepIds).join(", ")}.`,
        };
      }
    }

    // Guard: cannot reorder protected steps relative to each other (AC4)
    // Extract the relative ordering of protected steps in the adapted definition
    const protectedInAdapted = adaptedStepIds.filter((id) => protectedStepIds.has(id));
    const beforeDef0 = (run.definitionOverride ?? proc.definition) as Record<string, unknown>;
    const beforeSteps0 = (beforeDef0.steps as Array<Record<string, unknown>>) ?? [];
    const beforeStepIdList = beforeSteps0.map((s) => (s.id ?? s.parallel_group) as string).filter(Boolean);
    const protectedInBefore = beforeStepIdList.filter((id) => protectedStepIds.has(id));

    // Compare relative ordering — protected steps must appear in the same order
    for (let i = 0; i < protectedInBefore.length; i++) {
      if (i >= protectedInAdapted.length || protectedInBefore[i] !== protectedInAdapted[i]) {
        return {
          toolName: "adapt_process",
          success: false,
          output: `Cannot reorder protected steps. Expected order: ${protectedInBefore.join(", ")}. Got: ${protectedInAdapted.join(", ")}. Protected steps (running/waiting_review/approved) must keep their relative order.`,
        };
      }
    }

    // 6. Capture before state for activity log
    const beforeDef = run.definitionOverride ?? proc.definition;
    const beforeStepIds = (() => {
      try {
        const d = beforeDef as Record<string, unknown>;
        const steps = (d.steps as Array<Record<string, unknown>>) ?? [];
        return steps.map((s) => s.id ?? s.parallel_group).filter(Boolean);
      } catch {
        return [];
      }
    })();
    const afterStepIds = adaptedSteps.map((s) => s.id);

    // 7. Write the override (AC2) + summary (Brief 174 — preserved across
    // terminal cleanup so the activity feed / debug tooling can still show
    // "this run was adapted" after the override body itself is nulled).
    const newVersion = run.definitionOverrideVersion + 1;
    const added = afterStepIds.filter((id) => !beforeStepIds.includes(id));
    const removed = beforeStepIds.filter((id) => !afterStepIds.includes(id as string));
    const summary = `v${newVersion}: ${
      added.length > 0 ? `added ${added.join(",")}` : ""
    }${added.length > 0 && removed.length > 0 ? "; " : ""}${
      removed.length > 0 ? `removed ${removed.join(",")}` : ""
    }${added.length === 0 && removed.length === 0 ? "definition refined" : ""}${
      reasoning ? ` — ${reasoning.slice(0, 120)}` : ""
    }`;
    await db
      .update(schema.processRuns)
      .set({
        definitionOverride: adaptedDefinition,
        definitionOverrideVersion: newVersion,
        definitionOverrideSummary: summary,
      })
      .where(eq(schema.processRuns.id, runId));

    // 8. Log the adaptation as activity (AC5)
    await db.insert(schema.activities).values({
      action: "process.adaptation",
      actorType: "self",
      entityType: "process_run",
      entityId: runId,
      metadata: {
        processId: run.processId,
        processSlug: proc.slug,
        reasoning,
        version: newVersion,
        before: { stepIds: beforeStepIds },
        after: { stepIds: afterStepIds },
        added: afterStepIds.filter((id) => !beforeStepIds.includes(id)),
        removed: beforeStepIds.filter((id) => !afterStepIds.includes(id as string)),
      },
    });

    return {
      toolName: "adapt_process",
      success: true,
      output: `Adapted process run ${runId.slice(0, 8)}... (v${newVersion}). Steps: ${afterStepIds.join(", ")}. Changes take effect on next heartbeat.`,
    };
  } catch (err) {
    return {
      toolName: "adapt_process",
      success: false,
      output: `Adaptation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
