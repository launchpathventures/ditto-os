/**
 * Ditto — Process Data Queries
 *
 * Server-side queries for process list, detail, activities, and trust
 * used by the web dashboard's process detail views.
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

import { db, schema } from "../db";
import { eq, desc, and, or, inArray } from "drizzle-orm";
import { computeTrustState, executeTierChange } from "./trust";
import type { TrustTier } from "../db/schema";
import type { ContentBlock } from "./content-blocks";

// ============================================================
// Types
// ============================================================

export interface ProcessSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  trustTier: TrustTier;
  system: boolean;
  recentRunCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

export interface ProcessStepDefinition {
  id: string;
  name: string;
  executor: string;
  description?: string;
}

export interface ProcessDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  trustTier: TrustTier;
  system: boolean;
  steps: ProcessStepDefinition[];
  trustState: {
    approvalRate: number;
    runsInWindow: number;
    consecutiveCleanRuns: number;
    trend: "improving" | "stable" | "declining";
    approvals: number;
    edits: number;
    rejections: number;
  };
  recentRuns: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    totalCostCents: number | null;
  }>;
}

export interface ProcessRunDetail {
  id: string;
  processId: string;
  processName: string;
  status: string;
  currentStepId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalCostCents: number | null;
  steps: Array<{
    id: string;
    stepId: string;
    status: string;
    executorType: string;
    outputs: Record<string, unknown>;
    startedAt: string | null;
    completedAt: string | null;
    costCents: number | null;
    confidenceLevel: string | null;
    model: string | null;
    error: string | null;
  }>;
}

export interface ActivityEntry {
  id: string;
  action: string;
  description: string | null;
  actorType: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ============================================================
// Queries
// ============================================================

/**
 * List all non-system processes with summary metrics.
 */
export async function listProcesses(): Promise<ProcessSummary[]> {
  const allProcesses = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"))
    .orderBy(desc(schema.processes.updatedAt));

  const result: ProcessSummary[] = [];

  for (const p of allProcesses) {
    // Check if system process
    const def = p.definition as Record<string, unknown>;
    const isSystem = def.system === true;

    // Get recent run count and last run
    const runs = await db
      .select({
        id: schema.processRuns.id,
        status: schema.processRuns.status,
        createdAt: schema.processRuns.createdAt,
      })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.processId, p.id))
      .orderBy(desc(schema.processRuns.createdAt))
      .limit(20);

    result.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      status: p.status,
      trustTier: p.trustTier as TrustTier,
      system: isSystem,
      recentRunCount: runs.length,
      lastRunAt: runs[0]?.createdAt?.toISOString() ?? null,
      lastRunStatus: runs[0]?.status ?? null,
    });
  }

  return result;
}

/**
 * Get active work items with their assigned process info.
 */
export async function listActiveWorkItems(): Promise<
  Array<{
    id: string;
    type: string;
    status: string;
    content: string;
    assignedProcess: string | null;
    processName: string | null;
    createdAt: string;
  }>
> {
  const items = await db
    .select()
    .from(schema.workItems)
    .where(
      or(
        eq(schema.workItems.status, "intake"),
        eq(schema.workItems.status, "routed"),
        eq(schema.workItems.status, "in_progress"),
        eq(schema.workItems.status, "waiting_human"),
      ),
    )
    .orderBy(desc(schema.workItems.updatedAt));

  const result = [];
  for (const item of items) {
    let processName: string | null = null;
    if (item.assignedProcess) {
      const proc = await db
        .select({ name: schema.processes.name })
        .from(schema.processes)
        .where(eq(schema.processes.id, item.assignedProcess))
        .limit(1);
      processName = proc[0]?.name ?? null;
    }

    result.push({
      id: item.id,
      type: item.type,
      status: item.status,
      content: item.content,
      assignedProcess: item.assignedProcess,
      processName,
      createdAt: item.createdAt.toISOString(),
    });
  }

  return result;
}

/**
 * Get detailed process information including steps, trust state, and recent runs.
 */
export async function getProcessDetail(
  processId: string,
): Promise<ProcessDetail | null> {
  const proc = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, processId))
    .limit(1);

  if (!proc[0]) return null;
  const p = proc[0];
  const def = p.definition as Record<string, unknown>;
  const isSystem = def.system === true;

  // Extract steps from definition
  const rawSteps = (def.steps ?? []) as Array<Record<string, unknown>>;
  const steps: ProcessStepDefinition[] = rawSteps.map((s) => ({
    id: (s.id as string) ?? "",
    name: (s.name as string) ?? (s.id as string) ?? "",
    executor: (s.executor as string) ?? "unknown",
    description: s.description as string | undefined,
  }));

  // Get trust state
  const trustState = await computeTrustState(p.id);

  // Get recent runs
  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, p.id))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(10);

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    trustTier: p.trustTier as TrustTier,
    system: isSystem,
    steps,
    trustState: {
      approvalRate: trustState.approvalRate,
      runsInWindow: trustState.runsInWindow,
      consecutiveCleanRuns: trustState.consecutiveCleanRuns,
      trend: trustState.trend,
      approvals: trustState.approvals,
      edits: trustState.edits,
      rejections: trustState.rejections,
    },
    recentRuns: runs.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      totalCostCents: r.totalCostCents,
    })),
  };
}

/**
 * Get a specific process run with all its step runs.
 */
export async function getProcessRunDetail(
  runId: string,
): Promise<ProcessRunDetail | null> {
  const run = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, runId))
    .limit(1);

  if (!run[0]) return null;
  const r = run[0];

  // Get process name
  const proc = await db
    .select({ name: schema.processes.name })
    .from(schema.processes)
    .where(eq(schema.processes.id, r.processId))
    .limit(1);

  // Get step runs
  const steps = await db
    .select()
    .from(schema.stepRuns)
    .where(eq(schema.stepRuns.processRunId, r.id))
    .orderBy(schema.stepRuns.createdAt);

  return {
    id: r.id,
    processId: r.processId,
    processName: proc[0]?.name ?? "Unknown",
    status: r.status,
    currentStepId: r.currentStepId,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    totalCostCents: r.totalCostCents,
    steps: steps.map((s) => ({
      id: s.id,
      stepId: s.stepId,
      status: s.status,
      executorType: s.executorType,
      outputs: (s.outputs ?? {}) as Record<string, unknown>,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      costCents: s.costCents,
      confidenceLevel: s.confidenceLevel,
      model: s.model,
      error: s.error,
    })),
  };
}

/**
 * Get activity entries for a given process.
 */
export async function getProcessActivities(
  processId: string,
  limit: number = 50,
): Promise<ActivityEntry[]> {
  // Get activities directly linked to this process
  const directActivities = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.entityType, "process"),
        eq(schema.activities.entityId, processId),
      ),
    )
    .orderBy(desc(schema.activities.createdAt))
    .limit(limit);

  // Also get activities from process runs
  const runs = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, processId));
  const runIds = runs.map((r) => r.id);

  let runActivities: typeof directActivities = [];
  if (runIds.length > 0) {
    runActivities = await db
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.entityType, "processRun"),
          inArray(schema.activities.entityId, runIds),
        ),
      )
      .orderBy(desc(schema.activities.createdAt))
      .limit(limit);
  }

  // Get trust changes as activities
  const trustChanges = await db
    .select()
    .from(schema.trustChanges)
    .where(eq(schema.trustChanges.processId, processId))
    .orderBy(desc(schema.trustChanges.createdAt))
    .limit(20);

  // Merge and sort
  const allEntries: ActivityEntry[] = [
    ...directActivities.map((a) => ({
      id: a.id,
      action: a.action,
      description: a.description,
      actorType: a.actorType,
      actorId: a.actorId,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt.toISOString(),
    })),
    ...runActivities.map((a) => ({
      id: a.id,
      action: a.action,
      description: a.description,
      actorType: a.actorType,
      actorId: a.actorId,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt.toISOString(),
    })),
    ...trustChanges.map((tc) => ({
      id: tc.id,
      action: "trust_change",
      description: `Trust changed from ${tc.fromTier} to ${tc.toTier}: ${tc.reason}`,
      actorType: tc.actor,
      actorId: null,
      entityType: "process",
      entityId: tc.processId,
      metadata: (tc.metadata ?? {}) as Record<string, unknown>,
      createdAt: tc.createdAt.toISOString(),
    })),
  ];

  allEntries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return allEntries.slice(0, limit);
}

/**
 * Update trust tier for a process. Delegates to the canonical executeTierChange
 * in trust.ts to ensure consistent side effects (DB update, audit log, activity).
 */
export async function updateProcessTrust(
  processId: string,
  newTier: TrustTier,
  reason: string,
): Promise<void> {
  const proc = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, processId))
    .limit(1);

  if (!proc[0]) throw new Error(`Process not found: ${processId}`);

  const oldTier = proc[0].trustTier as TrustTier;
  if (oldTier === newTier) return;

  await executeTierChange({
    processId,
    fromTier: oldTier,
    toTier: newTier,
    reason,
    actor: "human",
  });
}

// ============================================================
// Active Runs (Brief 053)
// ============================================================

export interface ActiveRunSummary {
  runId: string;
  processSlug: string;
  processName: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  status: string;
  startedAt: string;
}

/**
 * Get all active (running or waiting_review) process runs with step progress.
 * Uses joined queries to avoid N+1. Step definitions loaded from YAML once per slug.
 *
 * Brief 053 AC6.
 */
export async function getActiveRuns(): Promise<ActiveRunSummary[]> {
  // Single joined query: runs + process info
  const runs = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      status: schema.processRuns.status,
      createdAt: schema.processRuns.createdAt,
      processName: schema.processes.name,
      processSlug: schema.processes.slug,
    })
    .from(schema.processRuns)
    .innerJoin(schema.processes, eq(schema.processRuns.processId, schema.processes.id))
    .where(
      or(
        eq(schema.processRuns.status, "running"),
        eq(schema.processRuns.status, "waiting_review"),
      ),
    )
    .orderBy(desc(schema.processRuns.createdAt));

  if (runs.length === 0) return [];

  // Batch fetch all step runs for active runs in one query
  const runIds = runs.map((r) => r.id);
  const allStepRuns = await db
    .select({
      processRunId: schema.stepRuns.processRunId,
      stepId: schema.stepRuns.stepId,
      status: schema.stepRuns.status,
    })
    .from(schema.stepRuns)
    .where(inArray(schema.stepRuns.processRunId, runIds))
    .orderBy(schema.stepRuns.createdAt);

  // Group step runs by processRunId
  const stepRunsByRun = new Map<string, typeof allStepRuns>();
  for (const sr of allStepRuns) {
    const existing = stepRunsByRun.get(sr.processRunId) ?? [];
    existing.push(sr);
    stepRunsByRun.set(sr.processRunId, existing);
  }

  // Cache process definitions by slug (avoid re-reading YAML per run)
  const defCache = new Map<string, { totalSteps: number; stepNames: Map<string, string> }>();
  function getProcessDef(slug: string) {
    if (defCache.has(slug)) return defCache.get(slug)!;
    try {
      const { resolve } = require("path") as typeof import("path");
      const { loadProcessFile, flattenSteps } = require("./process-loader") as typeof import("./process-loader");
      const processDir = resolve(process.cwd(), "processes");
      const definition = loadProcessFile(resolve(processDir, `${slug}.yaml`));
      const allSteps = flattenSteps(definition);
      const stepNames = new Map(allSteps.map((s) => [s.id, s.name]));
      const result = { totalSteps: allSteps.length, stepNames };
      defCache.set(slug, result);
      return result;
    } catch {
      return null;
    }
  }

  const summaries: ActiveRunSummary[] = [];

  for (const run of runs) {
    const stepRuns = stepRunsByRun.get(run.id) ?? [];

    const completedSteps = stepRuns.filter(
      (s) => s.status === "approved" || s.status === "skipped",
    ).length;

    const currentStepRun = stepRuns.find(
      (s) => s.status === "running" || s.status === "waiting_review",
    );

    const def = getProcessDef(run.processSlug);
    const totalSteps = def?.totalSteps ?? stepRuns.length;
    let currentStep = currentStepRun?.stepId ?? "Unknown";
    if (currentStepRun && def) {
      currentStep = def.stepNames.get(currentStepRun.stepId) ?? currentStepRun.stepId;
    }

    summaries.push({
      runId: run.id,
      processSlug: run.processSlug,
      processName: run.processName,
      currentStep,
      totalSteps,
      completedSteps,
      status: run.status,
      startedAt: run.createdAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  return summaries;
}

/**
 * Get the output content of a process run as ContentBlock[].
 * Extracts text/code outputs from step runs and wraps them as typed blocks.
 *
 * Brief 050: Engine-connected artifact content.
 */
export async function getRunOutput(
  runId: string,
): Promise<{ blocks: ContentBlock[]; processName: string; status: string } | null> {
  const run = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, runId))
    .limit(1);

  if (!run[0]) return null;
  const r = run[0];

  // Get process name
  const proc = await db
    .select({ name: schema.processes.name })
    .from(schema.processes)
    .where(eq(schema.processes.id, r.processId))
    .limit(1);

  // Get step runs with outputs
  const steps = await db
    .select()
    .from(schema.stepRuns)
    .where(eq(schema.stepRuns.processRunId, r.id))
    .orderBy(schema.stepRuns.createdAt);

  const blocks: ContentBlock[] = [];

  for (const step of steps) {
    const outputs = (step.outputs ?? {}) as Record<string, unknown>;
    const outputText = (outputs.output as string) ?? (outputs.text as string) ?? "";

    if (!outputText) continue;

    // Wrap as TextBlock (markdown content)
    blocks.push({
      type: "text" as const,
      text: outputText,
    });
  }

  return {
    blocks,
    processName: proc[0]?.name ?? "Unknown",
    status: r.status,
  };
}
