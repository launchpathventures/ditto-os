/**
 * Ditto — Process Loader
 *
 * Reads YAML process definitions and registers them in the database.
 * Process definitions are the source of truth — the DB stores runtime state.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import { db, schema } from "../db";
import type { ProcessStatus, TrustTier, AgentCategory } from "../db/schema";
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
  harness?: string | { review?: string[]; metacognitive?: boolean };
  on_failure?: string;
  handoff_to?: string;
  handoff_at_step?: string;
  // Human step fields (ADR-010 Section 4)
  instructions?: string;
  input_fields?: HumanInputField[];
  timeout?: string; // e.g. "24h", "7d"

  // Conditional routing (Brief 016b)
  // Provenance: Inngest AgentKit three-mode routing, LangGraph conditional edges
  route_to?: Array<{ condition: string; goto: string }>;
  default_next?: string;

  // Retry middleware (Brief 016b)
  // Provenance: Aider lint-fix loop, Open SWE error recovery middleware
  retry_on_failure?: {
    max_retries: number;
    retry_condition?: string;
    feedback_inject?: boolean;
  };
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
  system?: boolean; // ADR-008: system agent process
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

/** Valid model hint values for step config */
const VALID_MODEL_HINTS = ["fast", "capable", "default"];

/**
 * Validate model_hint values on ai-agent steps.
 * Other executor types ignore model_hint silently.
 * Returns error messages (empty array = valid).
 */
export function validateModelHints(definition: ProcessDefinition): string[] {
  const errors: string[] = [];
  const allSteps = flattenSteps(definition);

  for (const step of allSteps) {
    if (step.executor === "ai-agent" && step.config?.model_hint) {
      const hint = step.config.model_hint as string;
      if (!VALID_MODEL_HINTS.includes(hint)) {
        errors.push(
          `Step "${step.id}": invalid model_hint "${hint}". Valid: ${VALID_MODEL_HINTS.join(", ")}`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate integration steps have required config.service field.
 * Returns error messages (empty array = valid).
 */
export function validateIntegrationSteps(definition: ProcessDefinition): string[] {
  const errors: string[] = [];
  const allSteps = flattenSteps(definition);

  for (const step of allSteps) {
    if (step.executor === "integration") {
      if (!step.config?.service) {
        errors.push(`Integration step "${step.id}" missing required config.service field`);
      }
    }
  }

  return errors;
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
  processDir: string = path.join(process.cwd(), "processes"),
  templateDir: string = path.join(process.cwd(), "templates"),
): ProcessDefinition[] {
  const processFiles = fs.existsSync(processDir)
    ? fs.readdirSync(processDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  const templateFiles = fs.existsSync(templateDir)
    ? fs.readdirSync(templateDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  const processes = processFiles.map((f) => loadProcessFile(path.join(processDir, f)));
  const templates = templateFiles.map((f) => {
    const def = loadProcessFile(path.join(templateDir, f));
    // Templates load as draft — not active until explicitly adopted (Brief 020)
    def.status = "draft";
    return def;
  });

  return [...processes, ...templates];
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

    // Validate integration steps (AC-10: config.service required)
    const integrationErrors = validateIntegrationSteps(def);
    if (integrationErrors.length > 0) {
      console.error(`  Integration validation errors in ${def.name}:`);
      for (const err of integrationErrors) {
        console.error(`    - ${err}`);
      }
      throw new Error(`Process "${def.name}" has integration step errors`);
    }

    // Validate model hints (Brief 033: only valid hints on ai-agent steps)
    const modelHintErrors = validateModelHints(def);
    if (modelHintErrors.length > 0) {
      console.error(`  Model hint validation errors in ${def.name}:`);
      for (const err of modelHintErrors) {
        console.error(`    - ${err}`);
      }
      throw new Error(`Process "${def.name}" has model hint errors`);
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

    // System agent: create/update agent record with category: system (ADR-008)
    if (def.system) {
      await ensureSystemAgentRecord(def);
    }
  }
}

/**
 * Ensure a system agent record exists for a system process.
 * Creates or updates the agent with category: system and the process slug as systemRole.
 */
async function ensureSystemAgentRecord(def: ProcessDefinition): Promise<void> {
  const systemRole = def.id;

  const [existing] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.systemRole, systemRole))
    .limit(1);

  if (existing) {
    await db
      .update(schema.agents)
      .set({
        name: `${def.name} Agent`,
        description: def.description,
        updatedAt: new Date(),
      })
      .where(eq(schema.agents.id, existing.id));
    console.log(`  System agent updated: ${def.name}`);
  } else {
    await db.insert(schema.agents).values({
      name: `${def.name} Agent`,
      role: "system",
      description: def.description,
      adapterType: "system",
      category: "system" as AgentCategory,
      systemRole,
    });
    console.log(`  System agent created: ${def.name}`);
  }
}
