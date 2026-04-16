/**
 * Ditto — Self Tool: Edit Process (Brief 164, MP-9.1)
 *
 * Permanent process definition edits. Stores the previous version
 * in process_versions before overwriting, increments version counter,
 * and logs the edit as an activity.
 *
 * Scope: "all future runs" path. For "just this run", the Self routes
 * to adapt_process instead.
 *
 * Guards:
 * - Validates updated definition against process-loader validators
 * - Stores previous definition snapshot before overwriting
 * - Running processes unaffected (they already have their definition)
 * - Logs every edit as an activity
 *
 * Provenance: generate-process.ts (creation), adapt-process.ts (run-scoped),
 *   Brief 164 (permanent editing + versioning).
 */

import { db, schema } from "../../db";
import { eq, desc } from "drizzle-orm";
import type { ProcessDefinition } from "../process-loader";
import {
  validateDependencies,
  validateIntegrationSteps,
  validateStepTools,
  validateModelHints,
} from "../process-loader";
import type { DelegationResult } from "../self-delegation";

interface EditProcessInput {
  /** Process slug to edit */
  processSlug: string;
  /** Updated process definition (full replacement) */
  updatedDefinition: Record<string, unknown>;
  /** Human-readable summary of the changes */
  changeSummary: string;
}

export async function handleEditProcess(
  input: EditProcessInput,
): Promise<DelegationResult> {
  const { processSlug, updatedDefinition, changeSummary } = input;

  if (!processSlug || !updatedDefinition || !changeSummary) {
    return {
      toolName: "edit_process",
      success: false,
      output: "Required: processSlug, updatedDefinition, changeSummary.",
    };
  }

  try {
    // 1. Load the process
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      return {
        toolName: "edit_process",
        success: false,
        output: `Process not found: "${processSlug}".`,
      };
    }

    // 2. Validate the updated definition
    const validationErrors: string[] = [];
    const asDef = updatedDefinition as unknown as ProcessDefinition;

    if (!asDef.steps || !Array.isArray(asDef.steps)) {
      validationErrors.push("Updated definition must have a 'steps' array.");
    } else {
      const validExecutors = ["ai-agent", "cli-agent", "script", "rules", "human", "handoff", "integration"];
      for (let i = 0; i < asDef.steps.length; i++) {
        const step = asDef.steps[i] as unknown as Record<string, unknown>;
        if (!step.id) validationErrors.push(`Step ${i}: missing id`);
        if (!step.name) validationErrors.push(`Step ${i}: missing name`);
        if (!step.executor) validationErrors.push(`Step ${i}: missing executor`);
        if (step.executor && !validExecutors.includes(step.executor as string)) {
          validationErrors.push(`Step ${i}: invalid executor "${step.executor}"`);
        }
      }

      // Run process-loader validators for deeper checks
      validationErrors.push(...validateDependencies(asDef));
      validationErrors.push(...validateIntegrationSteps(asDef));
      validationErrors.push(...validateStepTools(asDef));
      validationErrors.push(...validateModelHints(asDef));
    }

    if (validationErrors.length > 0) {
      return {
        toolName: "edit_process",
        success: false,
        output: `Validation errors:\n${validationErrors.join("\n")}`,
      };
    }

    // 3. Snapshot the current version into process_versions (MP-9.2)
    await db.insert(schema.processVersions).values({
      processId: proc.id,
      version: proc.version,
      definition: proc.definition,
      changeSummary: `Snapshot before edit: ${changeSummary}`,
      editedBy: "self",
    });

    // 4. Increment version and update the process
    const newVersion = proc.version + 1;

    // Merge version into the definition object
    const definitionWithVersion = {
      ...updatedDefinition,
      version: newVersion,
    };

    await db
      .update(schema.processes)
      .set({
        definition: definitionWithVersion,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(schema.processes.id, proc.id));

    // 5. Log the edit as an activity
    const oldSteps = ((proc.definition as Record<string, unknown>).steps as Array<Record<string, unknown>>) ?? [];
    const newSteps = (updatedDefinition.steps as Array<Record<string, unknown>>) ?? [];
    const oldStepIds = oldSteps.map((s) => s.id as string).filter(Boolean);
    const newStepIds = newSteps.map((s) => s.id as string).filter(Boolean);

    await db.insert(schema.activities).values({
      action: "process.edited",
      actorType: "self",
      entityType: "process",
      entityId: proc.id,
      metadata: {
        processSlug,
        changeSummary,
        previousVersion: proc.version,
        newVersion,
        before: { stepIds: oldStepIds },
        after: { stepIds: newStepIds },
        added: newStepIds.filter((id) => !oldStepIds.includes(id)),
        removed: oldStepIds.filter((id) => !newStepIds.includes(id)),
      },
    });

    return {
      toolName: "edit_process",
      success: true,
      output: `Updated ${proc.name} v${proc.version} → v${newVersion}: ${changeSummary}. Previous version stored — rollback available via process_history.`,
    };
  } catch (err) {
    return {
      toolName: "edit_process",
      success: false,
      output: `Edit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Process History — list version history for a process (MP-9.2)
 */
export async function handleProcessHistory(
  input: { processSlug: string },
): Promise<DelegationResult> {
  const { processSlug } = input;

  if (!processSlug) {
    return {
      toolName: "process_history",
      success: false,
      output: "Required: processSlug.",
    };
  }

  try {
    // Load the process
    const [proc] = await db
      .select({ id: schema.processes.id, name: schema.processes.name, version: schema.processes.version })
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      return {
        toolName: "process_history",
        success: false,
        output: `Process not found: "${processSlug}".`,
      };
    }

    // Load all versions
    const versions = await db
      .select({
        version: schema.processVersions.version,
        changeSummary: schema.processVersions.changeSummary,
        editedBy: schema.processVersions.editedBy,
        createdAt: schema.processVersions.createdAt,
      })
      .from(schema.processVersions)
      .where(eq(schema.processVersions.processId, proc.id))
      .orderBy(desc(schema.processVersions.version));

    const history = versions.map((v) => ({
      version: v.version,
      changeSummary: v.changeSummary,
      editedBy: v.editedBy,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    }));

    return {
      toolName: "process_history",
      success: true,
      output: JSON.stringify({
        processSlug,
        processName: proc.name,
        currentVersion: proc.version,
        history,
        message: history.length === 0
          ? `${proc.name} is at v${proc.version} with no prior versions recorded.`
          : `${proc.name} is at v${proc.version} with ${history.length} prior version(s). Use rollback_process to restore any prior version.`,
      }),
    };
  } catch (err) {
    return {
      toolName: "process_history",
      success: false,
      output: `Failed to load history: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Rollback Process — restore a prior version as current (MP-9.2)
 */
export async function handleRollbackProcess(
  input: { processSlug: string; targetVersion: number },
): Promise<DelegationResult> {
  const { processSlug, targetVersion } = input;

  if (!processSlug || targetVersion === undefined) {
    return {
      toolName: "rollback_process",
      success: false,
      output: "Required: processSlug, targetVersion.",
    };
  }

  try {
    // Load the process
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      return {
        toolName: "rollback_process",
        success: false,
        output: `Process not found: "${processSlug}".`,
      };
    }

    if (targetVersion >= proc.version) {
      return {
        toolName: "rollback_process",
        success: false,
        output: `Target version ${targetVersion} must be less than current version ${proc.version}.`,
      };
    }

    // Find the target version snapshot
    const allVersions = await db
      .select()
      .from(schema.processVersions)
      .where(eq(schema.processVersions.processId, proc.id));

    const target = allVersions.find((v) => v.version === targetVersion);

    if (!target) {
      const available = allVersions.map((v) => v.version).sort((a, b) => a - b);
      return {
        toolName: "rollback_process",
        success: false,
        output: `Version ${targetVersion} not found in history. Available versions: ${available.join(", ")}.`,
      };
    }

    // Snapshot the current version before rollback
    await db.insert(schema.processVersions).values({
      processId: proc.id,
      version: proc.version,
      definition: proc.definition,
      changeSummary: `Snapshot before rollback to v${targetVersion}`,
      editedBy: "self",
    });

    // Restore the target version's definition with incremented version
    const newVersion = proc.version + 1;
    const restoredDefinition = {
      ...(target.definition as Record<string, unknown>),
      version: newVersion,
    };

    await db
      .update(schema.processes)
      .set({
        definition: restoredDefinition,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(schema.processes.id, proc.id));

    // Log the rollback
    await db.insert(schema.activities).values({
      action: "process.rollback",
      actorType: "self",
      entityType: "process",
      entityId: proc.id,
      metadata: {
        processSlug,
        rolledBackFrom: proc.version,
        restoredVersion: targetVersion,
        newVersion,
      },
    });

    return {
      toolName: "rollback_process",
      success: true,
      output: `Rolled back ${proc.name} to v${targetVersion} content (now v${newVersion}). Previous v${proc.version} stored in history.`,
    };
  } catch (err) {
    return {
      toolName: "rollback_process",
      success: false,
      output: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
