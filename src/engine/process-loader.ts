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
import { getIntegration } from "./integration-registry";
import { isValidDuration } from "@ditto/core";
import cron from "node-cron";

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

  /** Step-category trust override — relaxes trust within process tier bounds (Brief 116) */
  trustOverride?: string;
  /** Sending identity for outbound steps: 'principal', 'agent-of-user', 'ghost' (Brief 116) */
  sendingIdentity?: string;

  // Integration tools (Brief 025): service.tool_name format
  // Provenance: ADR-005, Insight-065 (Ditto-native tools)
  tools?: string[];

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

  // Conversation-aware step primitives (Brief 121)
  wait_for?: {
    event: "reply" | "approval";
    timeout?: string; // Default: "48h" if omitted
  };
  gate?: {
    engagement: "replied" | "silent" | "any";
    since_step?: string;
    fallback?: "skip" | "defer";
  };
  email_thread?: string;
  schedule?: {
    delay: string;
    after: "trigger" | string;
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

/** Process I/O: external source config (Brief 036) */
export interface ProcessSourceConfig {
  service: string;
  action: string;
  params: Record<string, unknown>;
  intervalMs: number;
}

/** Process I/O: output delivery config (Brief 036) */
export interface ProcessOutputDeliveryConfig {
  service: string;
  action: string;
  params: Record<string, unknown>;
}

export interface ProcessDefinition {
  name: string;
  id: string;
  version: number;
  status: string;
  description: string;
  system?: boolean; // ADR-008: system agent process
  /** Process operator — who runs this process (e.g. "alex-or-mira", "user-agent", "ditto") */
  operator?: string;
  /** Whether this is a template process (Brief 020) */
  template?: boolean;
  /** Whether this process is callable as a sub-process from a cycle (Brief 117) */
  callable_as?: string;
  /** Default sending identity for outbound steps: 'principal', 'agent-of-user', 'ghost' (Brief 116) */
  defaultIdentity?: string;
  trigger: {
    type: string;
    cron?: string;
    event?: string;
    description?: string;
    also?: { type: string; cron?: string; event?: string; description?: string };
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
  // Process I/O (Brief 036): external source and output delivery
  source?: ProcessSourceConfig;
  output_delivery?: ProcessOutputDeliveryConfig;
  /** Chain definitions — what processes to trigger after completion (Brief 098a) */
  chain?: Array<{
    trigger: string;
    interval?: string;
    delay?: string;
    event?: string;
    process: string;
    inputs: Record<string, string>;
  }>;
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
 * Validate step-level tools declarations against the integration registry.
 * Format: service.tool_name (e.g., github.search_issues).
 * Returns error messages (empty array = valid).
 */
export function validateStepTools(definition: ProcessDefinition): string[] {
  const errors: string[] = [];
  const allSteps = flattenSteps(definition);

  for (const step of allSteps) {
    if (step.tools && step.tools.length > 0) {
      for (const toolName of step.tools) {
        const dotIndex = toolName.indexOf(".");
        if (dotIndex === -1) {
          errors.push(
            `Step "${step.id}": tool "${toolName}" must use service.tool_name format`,
          );
          continue;
        }

        const service = toolName.slice(0, dotIndex);
        const action = toolName.slice(dotIndex + 1);
        const integration = getIntegration(service);
        if (!integration) {
          errors.push(
            `Step "${step.id}": tool "${toolName}" — service "${service}" not in integration registry`,
          );
          continue;
        }

        const tool = integration.tools?.find((t) => t.name === action);
        if (!tool) {
          errors.push(
            `Step "${step.id}": tool "${toolName}" — action "${action}" not found in service "${service}"`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Validate source and output_delivery service references against the integration registry.
 * Returns error messages (empty array = valid).
 * Provenance: Brief 036 AC3
 */
export function validateProcessIo(definition: ProcessDefinition): string[] {
  const errors: string[] = [];

  if (definition.source) {
    const integration = getIntegration(definition.source.service);
    if (!integration) {
      errors.push(
        `source: service "${definition.source.service}" not found in integration registry`,
      );
    }
  }

  if (definition.output_delivery) {
    const integration = getIntegration(definition.output_delivery.service);
    if (!integration) {
      errors.push(
        `output_delivery: service "${definition.output_delivery.service}" not found in integration registry`,
      );
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
 * Validate schedule primitives on steps:
 * - schedule.delay must be a valid duration string
 * - schedule.after must reference an existing step ID or "trigger"
 * Returns error messages (empty array = valid).
 * Provenance: Brief 121 AC3/AC4
 */
export function validateSchedulePrimitives(definition: ProcessDefinition): string[] {
  const errors: string[] = [];
  const allSteps = flattenSteps(definition);
  const allIds = getAllStepIds(definition);

  for (const step of allSteps) {
    if (step.schedule) {
      if (!isValidDuration(step.schedule.delay)) {
        errors.push(
          `Step "${step.id}": schedule.delay "${step.schedule.delay}" is not a valid duration (expected e.g. "4h", "3d", "2w")`,
        );
      }
      if (step.schedule.after !== "trigger" && !allIds.has(step.schedule.after)) {
        errors.push(
          `Step "${step.id}": schedule.after "${step.schedule.after}" does not reference a known step ID or "trigger"`,
        );
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
  templateDir: string = path.join(process.cwd(), "processes", "templates"),
  cycleDir: string = path.join(process.cwd(), "processes", "cycles"),
): ProcessDefinition[] {
  const processFiles = fs.existsSync(processDir)
    ? fs.readdirSync(processDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  const templateFiles = fs.existsSync(templateDir)
    ? fs.readdirSync(templateDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  const cycleFiles = fs.existsSync(cycleDir)
    ? fs.readdirSync(cycleDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  const processes = processFiles.map((f) => loadProcessFile(path.join(processDir, f)));
  const templates = templateFiles.map((f) => {
    const def = loadProcessFile(path.join(templateDir, f));
    // Templates load as draft — not active until explicitly adopted (Brief 020)
    def.status = "draft";
    return def;
  });
  const cycles = cycleFiles.map((f) => loadProcessFile(path.join(cycleDir, f)));

  return [...processes, ...templates, ...cycles];
}

/**
 * Validate sub-process executor steps: config.process_id must reference a known process slug.
 * Returns error messages (empty array = valid).
 * Provenance: Brief 117 AC9
 */
export function validateSubProcessSteps(
  definition: ProcessDefinition,
  allSlugs: Set<string>,
): string[] {
  const errors: string[] = [];
  const allSteps = flattenSteps(definition);

  for (const step of allSteps) {
    if (step.executor === "sub-process") {
      const processId = step.config?.process_id as string | undefined;
      if (!processId) {
        errors.push(
          `Step "${step.id}": executor "sub-process" requires config.process_id`,
        );
      } else if (!allSlugs.has(processId)) {
        errors.push(
          `Step "${step.id}": config.process_id "${processId}" does not reference a known process slug`,
        );
      }
    }
  }

  return errors;
}

/**
 * Sync process definitions to the database.
 * Creates new records or updates existing ones.
 * Validates dependencies on sync.
 */
export async function syncProcessesToDb(
  definitions: ProcessDefinition[]
): Promise<void> {
  // Collect all process slugs for sub-process validation (Brief 117)
  const allSlugs = new Set(definitions.map((d) => d.id));

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

    // Validate step-level tools (Brief 025: service.tool_name format)
    // Warn on errors instead of throwing — built-in tools (web-search, web-fetch)
    // don't have integration entries and would block sync otherwise.
    const stepToolErrors = validateStepTools(def);
    if (stepToolErrors.length > 0) {
      console.warn(`  Step tool warnings in ${def.name}:`);
      for (const err of stepToolErrors) {
        console.warn(`    - ${err}`);
      }
    }

    // Validate process I/O service references (Brief 036)
    const ioErrors = validateProcessIo(def);
    if (ioErrors.length > 0) {
      console.error(`  Process I/O validation errors in ${def.name}:`);
      for (const err of ioErrors) {
        console.error(`    - ${err}`);
      }
      throw new Error(`Process "${def.name}" has process I/O errors`);
    }

    // Validate schedule primitives (Brief 121)
    const scheduleErrors = validateSchedulePrimitives(def);
    if (scheduleErrors.length > 0) {
      console.error(`  Schedule primitive validation errors in ${def.name}:`);
      for (const err of scheduleErrors) {
        console.error(`    - ${err}`);
      }
      throw new Error(`Process "${def.name}" has schedule primitive errors`);
    }

    // Validate sub-process executor steps (Brief 117 AC9)
    const subProcessErrors = validateSubProcessSteps(def, allSlugs);
    if (subProcessErrors.length > 0) {
      console.error(`  Sub-process validation errors in ${def.name}:`);
      for (const err of subProcessErrors) {
        console.error(`    - ${err}`);
      }
      throw new Error(`Process "${def.name}" has sub-process reference errors`);
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
          source: (def.source ?? null) as typeof def.source,
          outputDelivery: (def.output_delivery ?? null) as typeof def.output_delivery,
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
        source: (def.source ?? null) as typeof def.source,
        outputDelivery: (def.output_delivery ?? null) as typeof def.output_delivery,
      });

      console.log(`  Created: ${def.name} (v${def.version})`);
    }

    // System agent: create/update agent record with category: system (ADR-008)
    if (def.system) {
      await ensureSystemAgentRecord(def);
    }

    // Brief 104: Register system agents referenced in step configs
    for (const step of def.steps || []) {
      if ("parallel" in step) continue; // Skip parallel groups
      const config = (step as { config?: Record<string, unknown> }).config;
      const systemAgent = config?.system_agent as string | undefined;
      if (systemAgent) {
        const stepDef = step as { name?: string; id: string };
        await ensureReferencedSystemAgent(systemAgent, stepDef.name || stepDef.id);
      }
    }
  }

  // Sync schedule triggers (Brief 076)
  await syncSchedules(definitions);
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

/**
 * Ensure a system agent record exists for a system agent referenced in a step config.
 * Creates the agent record if it doesn't exist (Brief 104: process-validator pattern).
 */
async function ensureReferencedSystemAgent(systemRole: string, stepName: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.systemRole, systemRole))
    .limit(1);

  if (!existing) {
    await db.insert(schema.agents).values({
      name: `${systemRole} Agent`,
      role: "system",
      description: `System agent for ${stepName}`,
      adapterType: "system",
      category: "system" as AgentCategory,
      systemRole,
    });
    console.log(`  System agent registered: ${systemRole} (referenced by ${stepName})`);
  }
}

/**
 * Validate a cron expression string.
 * Returns true if valid, false otherwise.
 */
export function validateCronExpression(expression: string): boolean {
  return cron.validate(expression);
}

/**
 * Sync schedule triggers from process definitions to the schedules table.
 * - Creates schedule entries for processes with trigger.type === "schedule"
 * - Updates cronExpression if changed
 * - Removes schedule entries for processes that no longer have schedule triggers
 *
 * Provenance: Brief 076
 */
async function syncSchedules(definitions: ProcessDefinition[]): Promise<void> {
  // Collect process slugs that have schedule triggers
  const scheduledSlugs = new Set<string>();

  for (const def of definitions) {
    if (def.trigger.type === "schedule") {
      if (!def.trigger.cron) {
        console.error(`  Schedule error: process "${def.name}" has trigger.type=schedule but no trigger.cron`);
        throw new Error(`Process "${def.name}" has schedule trigger but no cron expression`);
      }

      if (!validateCronExpression(def.trigger.cron)) {
        console.error(`  Schedule error: process "${def.name}" has invalid cron expression "${def.trigger.cron}"`);
        throw new Error(`Process "${def.name}" has invalid cron expression: ${def.trigger.cron}`);
      }

      scheduledSlugs.add(def.id);

      // Find the process record
      const [proc] = await db
        .select({ id: schema.processes.id })
        .from(schema.processes)
        .where(eq(schema.processes.slug, def.id))
        .limit(1);

      if (!proc) continue;

      // Upsert schedule
      const [existingSchedule] = await db
        .select()
        .from(schema.schedules)
        .where(eq(schema.schedules.processId, proc.id))
        .limit(1);

      if (existingSchedule) {
        if (existingSchedule.cronExpression !== def.trigger.cron) {
          await db
            .update(schema.schedules)
            .set({ cronExpression: def.trigger.cron })
            .where(eq(schema.schedules.id, existingSchedule.id));
          console.log(`  Schedule updated: ${def.name} (${def.trigger.cron})`);
        }
      } else {
        await db.insert(schema.schedules).values({
          processId: proc.id,
          cronExpression: def.trigger.cron,
          enabled: true,
        });
        console.log(`  Schedule created: ${def.name} (${def.trigger.cron})`);
      }
    }
  }

  // Remove schedules for processes that no longer have schedule triggers
  // Get all processes from definitions
  const allDefinedSlugs = new Set(definitions.map((d) => d.id));

  const allSchedules = await db
    .select({
      id: schema.schedules.id,
      processId: schema.schedules.processId,
    })
    .from(schema.schedules);

  for (const schedule of allSchedules) {
    // Find the process slug for this schedule
    const [proc] = await db
      .select({ slug: schema.processes.slug })
      .from(schema.processes)
      .where(eq(schema.processes.id, schedule.processId))
      .limit(1);

    if (!proc) continue;

    // If this process is in our definitions but no longer has a schedule trigger, remove the schedule
    if (allDefinedSlugs.has(proc.slug) && !scheduledSlugs.has(proc.slug)) {
      await db
        .delete(schema.schedules)
        .where(eq(schema.schedules.id, schedule.id));
      console.log(`  Schedule removed: ${proc.slug} (no longer has schedule trigger)`);
    }
  }
}
