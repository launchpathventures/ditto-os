/**
 * Ditto — Chain Executor (Brief 098a)
 *
 * Reads chain definitions from a completed process run, creates
 * delayed runs, schedule records, or logs event handlers.
 * Variable substitution from process outputs ({personId} → actual value).
 *
 * Product layer — not core. Variable substitution, YAML trigger normalization,
 * and DB writes are Ditto-specific.
 *
 * Provenance: Brief 098a, BullMQ delayed job pattern (adapted for SQLite),
 * Inngest event fan-out (DB-backed).
 */

import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import type { ChainDefinition } from "./harness";

/**
 * Normalize a YAML trigger name to a canonical type.
 * - If delay field is present → "delay"
 * - If interval field is present → "schedule"
 * - Otherwise → "event"
 */
function normalizeChainTrigger(chain: ChainDefinition): "schedule" | "delay" | "event" {
  if (chain.delay) return "delay";
  if (chain.interval) return "schedule";
  if (chain.trigger === "schedule") return "schedule";
  if (chain.trigger === "delay") return "delay";
  return "event";
}

/**
 * Parse a duration string (e.g. "5d", "7d", "24h", "30m") into milliseconds.
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(d|h|m|s)$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected: Nd, Nh, Nm, Ns`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "d": return value * 24 * 60 * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "m": return value * 60 * 1000;
    case "s": return value * 1000;
    default: throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Convert a duration string to a cron expression.
 * Only supports day intervals (converts to "every N days at midnight").
 * For sub-day intervals, falls back to minute/hour cron.
 */
function durationToCron(interval: string): string {
  const match = interval.match(/^(\d+)(d|h|m)$/);
  if (!match) {
    throw new Error(`Cannot convert interval "${interval}" to cron expression`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "d": return `0 0 */${value} * *`;  // Every N days at midnight
    case "h": return `0 */${value} * * *`;   // Every N hours
    case "m": return `*/${value} * * * *`;   // Every N minutes
    default: throw new Error(`Cannot convert interval unit "${unit}" to cron`);
  }
}

/**
 * Substitute {variable} placeholders in chain input values.
 * Resolves against process run inputs and collected step outputs.
 */
export function substituteVariables(
  template: Record<string, string>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(template)) {
    if (typeof value !== "string") {
      result[key] = value;
      continue;
    }

    // Replace {variable} patterns
    const substituted = value.replace(/\{([^}]+)\}/g, (_match, varName: string) => {
      // Try direct lookup
      if (varName in context) {
        const val = context[varName];
        return typeof val === "string" ? val : JSON.stringify(val);
      }

      // Try dotted path (e.g. "target.personId")
      const parts = varName.split(".");
      let current: unknown = context;
      for (const part of parts) {
        if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          // Variable not found — leave placeholder as-is
          return `{${varName}}`;
        }
      }
      return typeof current === "string" ? current : JSON.stringify(current);
    });

    result[key] = substituted;
  }

  return result;
}

/**
 * Collect all outputs from a completed process run's step runs.
 * Merges run inputs with all step outputs into a single context.
 */
async function collectRunContext(processRunId: string): Promise<Record<string, unknown>> {
  const [run] = await db
    .select({
      inputs: schema.processRuns.inputs,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, processRunId))
    .limit(1);

  if (!run) return {};

  const context: Record<string, unknown> = {
    ...(run.inputs as Record<string, unknown> || {}),
  };

  // Collect all approved step outputs
  const stepRuns = await db
    .select({
      stepId: schema.stepRuns.stepId,
      outputs: schema.stepRuns.outputs,
    })
    .from(schema.stepRuns)
    .where(
      and(
        eq(schema.stepRuns.processRunId, processRunId),
        eq(schema.stepRuns.status, "approved"),
      ),
    );

  for (const sr of stepRuns) {
    if (sr.outputs && typeof sr.outputs === "object") {
      Object.assign(context, sr.outputs as Record<string, unknown>);
    }
  }

  return context;
}

/**
 * Process chain definitions for a completed process run.
 *
 * For each chain:
 * - "delay" → create a delayed_runs record with executeAt = now + delay
 * - "schedule" → create a schedule record (picked up by existing scheduler)
 * - "event" → log as registered but not yet active (AC11 — deferred to 098b)
 *
 * Idempotent: checks chainsProcessed flag before executing. Sets it after.
 */
export async function processChains(processRunId: string): Promise<void> {
  // 1. Check if chains already processed (idempotency — AC8)
  const [run] = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      chainsProcessed: schema.processRuns.chainsProcessed,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, processRunId))
    .limit(1);

  if (!run) {
    console.warn(`[chain] Process run ${processRunId} not found`);
    return;
  }

  if (run.chainsProcessed) {
    return; // Already processed — idempotent
  }

  // 2. Get process definition to read chain definitions and trust tier
  const [parentProcess] = await db
    .select({
      slug: schema.processes.slug,
      definition: schema.processes.definition,
      trustTier: schema.processes.trustTier,
    })
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  if (!parentProcess) {
    console.warn(`[chain] Process ${run.processId} not found`);
    return;
  }

  const definition = parentProcess.definition as Record<string, unknown>;
  const chains = definition.chain as ChainDefinition[] | undefined;

  if (!chains || chains.length === 0) {
    // No chains to process — mark as done
    await db
      .update(schema.processRuns)
      .set({ chainsProcessed: true })
      .where(eq(schema.processRuns.id, processRunId));
    return;
  }

  // 3. Collect context for variable substitution
  const context = await collectRunContext(processRunId);

  console.log(`[chain] Processing ${chains.length} chain(s) for run ${processRunId.slice(0, 8)}`);

  // 4. Process each chain definition
  for (const chain of chains) {
    const triggerType = normalizeChainTrigger(chain);
    const resolvedInputs = substituteVariables(chain.inputs, context);

    switch (triggerType) {
      case "delay": {
        const delayMs = parseDuration(chain.delay!);
        const executeAt = new Date(Date.now() + delayMs);

        await db.insert(schema.delayedRuns).values({
          processSlug: chain.process,
          inputs: resolvedInputs,
          executeAt,
          status: "pending",
          createdByRunId: processRunId,
          parentTrustTier: parentProcess.trustTier as "supervised" | "spot_checked" | "autonomous" | "critical",
        });

        console.log(`[chain] Created delayed run: ${chain.process} (${chain.delay})`);
        break;
      }

      case "schedule": {
        const cronExpression = durationToCron(chain.interval!);

        // Find or create the target process record
        const [targetProcess] = await db
          .select({ id: schema.processes.id })
          .from(schema.processes)
          .where(eq(schema.processes.slug, chain.process))
          .limit(1);

        if (!targetProcess) {
          console.warn(`[chain] Schedule target process not found: ${chain.process}`);
          break;
        }

        // Check if schedule already exists for this process
        const [existingSchedule] = await db
          .select({ id: schema.schedules.id })
          .from(schema.schedules)
          .where(eq(schema.schedules.processId, targetProcess.id))
          .limit(1);

        if (!existingSchedule) {
          await db.insert(schema.schedules).values({
            processId: targetProcess.id,
            cronExpression,
            enabled: true,
          });
          console.log(`[chain] Created schedule: ${chain.process} (${chain.interval})`);
        } else {
          console.log(`[chain] Schedule already exists for ${chain.process}, skipping`);
        }
        break;
      }

      case "event": {
        // AC11: Parse but defer — log as registered, not yet active
        const eventName = chain.event || chain.trigger;
        console.log(
          `[chain] Event handler registered (not yet active): "${eventName}" → ${chain.process}. ` +
          `Inbound email classification (098b) will activate specific handlers.`
        );
        break;
      }
    }
  }

  // 5. Mark chains as processed (idempotency flag)
  await db
    .update(schema.processRuns)
    .set({ chainsProcessed: true })
    .where(eq(schema.processRuns.id, processRunId));

  console.log(`[chain] Chains processed for run ${processRunId.slice(0, 8)}`);
}
