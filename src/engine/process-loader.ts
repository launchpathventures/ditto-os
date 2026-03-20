/**
 * Agent OS — Process Loader
 *
 * Reads YAML process definitions and registers them in the database.
 * Process definitions are the source of truth — the DB stores runtime state.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import { db, schema } from "../db";
import type { ProcessStatus, TrustTier } from "../db/schema";
import { eq } from "drizzle-orm";

// ============================================================
// Types
// ============================================================

export interface HumanInputField {
  name: string;
  type: "text" | "select" | "date" | "number" | "boolean";
  label?: string;
  description?: string;
  required?: boolean;
  options?: string[]; // For select type
  default?: string;
}

export interface StepDefinition {
  id: string;
  name: string;
  executor: string;
  agent_role?: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
  depends_on?: string[];
  parallel_group?: string; // Legacy grouping marker (steps share a group name)
  verification?: string[];
  commands?: string[];
  config?: Record<string, unknown>;
  harness?: string | { review: string[] };
  on_failure?: string;
  handoff_to?: string;
  handoff_at_step?: string;
  // Human step fields (ADR-010 Section 4)
  instructions?: string;
  input_fields?: HumanInputField[];
  timeout?: string; // e.g. "24h", "7d"
}

export interface ParallelGroupDefinition {
  parallel_group: string;
  depends_on?: string[];
  steps: StepDefinition[];
}

export type StepEntry = StepDefinition | ParallelGroupDefinition;

export function isParallelGroup(entry: StepEntry): entry is ParallelGroupDefinition {
  // A parallel group container has `parallel_group` and `steps` but no `id`.
  // Steps with a `parallel_group` field (old grouping marker format) have `id`.
  return "parallel_group" in entry && "steps" in entry && !("id" in entry);
}

export function isStep(entry: StepEntry): entry is StepDefinition {
  return "id" in entry;
}

export interface ProcessDefinition {
  name: string;
  id: string;
  version: number;
  status: string;
  description: string;
  trigger: {
    type: string;
    cron?: string;
    event?: string;
    description?: string;
    also?: { type: string; event?: string; description?: string };
  };
  inputs: Array<{
    name: string;
    type: string;
    source: string;
    required: boolean;
    description?: string;
  }>;
  steps: StepEntry[];
  outputs: Array<{
    name: string;
    type: string;
    destination: string;
    description?: string;
  }>;
  quality_criteria: string[];
  feedback: {
    metrics: Array<{
      name: string;
      description: string;
      target: string;
    }>;
    capture: string[];
  };
  trust: {
    initial_tier: string;
    upgrade_path: Array<{
      after: string;
      upgrade_to: string;
    }>;
    downgrade_triggers: string[];
  };
}

/**
 * Get all step IDs and group IDs from a process definition.
 * Used for dependency validation.
 */
export function getAllStepIds(definition: ProcessDefinition): Set<string> {
  const ids = new Set<string>();
  for (const entry of definition.steps) {
    if (isParallelGroup(entry)) {
      ids.add(entry.parallel_group);
      for (const step of entry.steps) {
        ids.add(step.id);
      }
    } else {
      ids.add(entry.id);
    }
  }
  return ids;
}

/**
 * Flatten all steps from a process definition (extracting steps from parallel groups).
 * Returns steps in declaration order, with parallel group steps adjacent.
 */
export function flattenSteps(definition: ProcessDefinition): StepDefinition[] {
  const flat: StepDefinition[] = [];
  for (const entry of definition.steps) {
    if (isParallelGroup(entry)) {
      for (const step of entry.steps) {
        flat.push(step);
      }
    } else {
      flat.push(entry);
    }
  }
  return flat;
}

/**
 * Validate process definition dependencies.
 * - All depends_on targets must exist as step IDs or group IDs
 * - No circular dependencies
 */
export function validateDependencies(definition: ProcessDefinition): string[] {
  const errors: string[] = [];
  const allIds = getAllStepIds(definition);

  // Check all depends_on references exist
  for (const entry of definition.steps) {
    const entryId = isParallelGroup(entry) ? entry.parallel_group : entry.id;
    const deps = isParallelGroup(entry) ? entry.depends_on : entry.depends_on;

    if (deps) {
      for (const dep of deps) {
        if (!allIds.has(dep)) {
          errors.push(`${entryId}: depends_on "${dep}" does not exist`);
        }
        if (dep === entryId) {
          errors.push(`${entryId}: depends on itself`);
        }
      }
    }
  }

  // Check for circular dependencies via topological sort attempt
  const graph = new Map<string, string[]>();
  for (const entry of definition.steps) {
    if (isParallelGroup(entry)) {
      graph.set(entry.parallel_group, entry.depends_on || []);
    } else {
      graph.set(entry.id, entry.depends_on || []);
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function hasCycle(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;

    visiting.add(node);
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (hasCycle(dep)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (hasCycle(node)) {
      errors.push(`Circular dependency detected involving "${node}"`);
      break;
    }
  }

  return errors;
}

// ============================================================
// Loading
// ============================================================

/**
 * Load a single YAML process definition from file
 */
export function loadProcessFile(filePath: string): ProcessDefinition {
  const content = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(content) as ProcessDefinition;
}

/**
 * Load all process definitions from the processes/ directory
 */
export function loadAllProcesses(
  processDir: string = path.join(process.cwd(), "processes")
): ProcessDefinition[] {
  const files = fs
    .readdirSync(processDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  return files.map((f) => loadProcessFile(path.join(processDir, f)));
}

/**
 * Sync process definitions to the database.
 * Creates new records or updates existing ones.
 * Validates dependencies on sync.
 */
export async function syncProcessesToDb(
  definitions: ProcessDefinition[]
): Promise<void> {
  for (const def of definitions) {
    // Validate dependencies
    const depErrors = validateDependencies(def);
    if (depErrors.length > 0) {
      console.error(`  Validation errors in ${def.name}:`);
      for (const err of depErrors) {
        console.error(`    - ${err}`);
      }
      throw new Error(`Process "${def.name}" has dependency errors`);
    }

    const existing = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, def.id))
      .limit(1);

    const trustTier = def.trust.initial_tier.replace(
      "-",
      "_"
    ) as TrustTier;

    if (existing.length > 0) {
      // Update existing process
      await db
        .update(schema.processes)
        .set({
          name: def.name,
          description: def.description,
          version: def.version,
          definition: def as unknown as Record<string, unknown>,
          status: def.status as ProcessStatus,
          trustTier,
          updatedAt: new Date(),
        })
        .where(eq(schema.processes.slug, def.id));

      console.log(`  Updated: ${def.name} (v${def.version})`);
    } else {
      // Create new process
      await db.insert(schema.processes).values({
        name: def.name,
        slug: def.id,
        description: def.description,
        version: def.version,
        definition: def as unknown as Record<string, unknown>,
        status: def.status as ProcessStatus,
        trustTier,
      });

      console.log(`  Created: ${def.name} (v${def.version})`);
    }
  }
}
