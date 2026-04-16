/**
 * Ditto — Process Data Queries
 *
 * Server-side queries for process list, detail, activities, and trust
 * used by the web dashboard's process detail views.
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

import { db, schema } from "../db";
import { eq, desc, and, or, inArray, like } from "drizzle-orm";
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

// ============================================================
// Growth Plans (Brief 140) — GTM pipeline run summaries
// ============================================================

export interface GrowthPlanSummary {
  planName: string;
  runId: string;
  processSlug: string;
  status: string;
  currentStep: string;
  cycleNumber: number;
  startedAt: string;
  gtmContext: {
    audience?: string;
    channels?: string[];
    goals?: string[];
  };
  experiments: Array<{
    track: string;
    description: string;
    verdict?: string;
  }>;
  publishedContent: Array<{
    platform: string;
    postId?: string;
    postUrl?: string;
    publishedAt?: string;
    content?: string;
  }>;
  lastBrief?: string;
}

/**
 * Get growth plan summaries from active GTM pipeline runs.
 * Queries runs with slug matching "gtm-pipeline*", enriches with
 * step outputs for experiments, published content, and briefs.
 *
 * Brief 140: Growth composition intent data.
 */
export async function getGrowthPlans(): Promise<GrowthPlanSummary[]> {
  // Find GTM pipeline processes
  const gtmProcesses = await db
    .select({ id: schema.processes.id, slug: schema.processes.slug, name: schema.processes.name })
    .from(schema.processes)
    .where(like(schema.processes.slug, "gtm-pipeline%"));

  if (gtmProcesses.length === 0) return [];

  const processIds = gtmProcesses.map((p) => p.id);
  const processMap = new Map(gtmProcesses.map((p) => [p.id, p]));

  // Get active + recent runs for these processes
  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(
      and(
        inArray(schema.processRuns.processId, processIds),
        or(
          eq(schema.processRuns.status, "running"),
          eq(schema.processRuns.status, "waiting_review"),
          eq(schema.processRuns.status, "approved"),
        ),
      ),
    )
    .orderBy(desc(schema.processRuns.createdAt));

  if (runs.length === 0) return [];

  // Batch fetch step runs for all GTM runs
  const runIds = runs.map((r) => r.id);
  const allStepRuns = await db
    .select({
      processRunId: schema.stepRuns.processRunId,
      stepId: schema.stepRuns.stepId,
      status: schema.stepRuns.status,
      outputs: schema.stepRuns.outputs,
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

  // Count runs per process for cycle numbering
  const cycleCountByProcess = new Map<string, number>();

  const summaries: GrowthPlanSummary[] = [];

  for (const run of runs) {
    const proc = processMap.get(run.processId);
    if (!proc) continue;

    const stepRuns = stepRunsByRun.get(run.id) ?? [];

    // Cycle number: count of runs for this process up to this one
    const count = (cycleCountByProcess.get(run.processId) ?? 0) + 1;
    cycleCountByProcess.set(run.processId, count);

    // Extract gtmContext from run inputs
    const inputs = (run.inputs ?? {}) as Record<string, unknown>;
    const rawGtm = (inputs.gtmContext ?? {}) as Record<string, unknown>;
    const gtmContext = {
      audience: typeof rawGtm.audience === "string" ? rawGtm.audience : undefined,
      channels: Array.isArray(rawGtm.channels) ? rawGtm.channels as string[] : undefined,
      goals: Array.isArray(rawGtm.goals) ? rawGtm.goals as string[] : undefined,
    };

    // Extract experiments from "assess" step outputs
    const assessStep = stepRuns.find((s) => s.stepId === "assess");
    const experiments: GrowthPlanSummary["experiments"] = [];
    if (assessStep?.outputs) {
      const assessOutputs = assessStep.outputs as Record<string, unknown>;
      const rawExperiments = assessOutputs.experiments;
      if (Array.isArray(rawExperiments)) {
        for (const exp of rawExperiments) {
          if (exp && typeof exp === "object") {
            const e = exp as Record<string, unknown>;
            experiments.push({
              track: typeof e.track === "string" ? e.track : "unknown",
              description: typeof e.description === "string" ? e.description : String(e.what ?? ""),
              verdict: typeof e.verdict === "string" ? e.verdict : undefined,
            });
          }
        }
      }
    }

    // Extract published content from land-content step outputs
    const publishedContent: GrowthPlanSummary["publishedContent"] = [];
    const landStep = stepRuns.find((s) => s.stepId === "land-content");
    if (landStep?.outputs) {
      const landOutputs = landStep.outputs as Record<string, unknown>;
      const rawResults = landOutputs["content-results"];
      if (Array.isArray(rawResults)) {
        for (const post of rawResults) {
          if (post && typeof post === "object") {
            const p = post as Record<string, unknown>;
            publishedContent.push({
              platform: typeof p.platform === "string" ? p.platform : "unknown",
              postId: typeof p.postId === "string" ? p.postId : undefined,
              postUrl: typeof p.postUrl === "string" ? p.postUrl : undefined,
              publishedAt: typeof p.publishedAt === "string" ? p.publishedAt : undefined,
              content: typeof p.content === "string" ? p.content : undefined,
            });
          }
        }
      }
    }

    // Extract last brief from "brief" step outputs
    const briefStep = stepRuns.find((s) => s.stepId === "brief");
    let lastBrief: string | undefined;
    if (briefStep?.outputs) {
      const briefOutputs = briefStep.outputs as Record<string, unknown>;
      const rawBrief = briefOutputs["gtm-brief"];
      if (typeof rawBrief === "string") {
        lastBrief = rawBrief;
      } else if (rawBrief && typeof rawBrief === "object") {
        const b = rawBrief as Record<string, unknown>;
        lastBrief = typeof b.summary === "string" ? b.summary : JSON.stringify(rawBrief);
      }
    }

    // Current step name
    const currentStepRun = stepRuns.find(
      (s) => s.status === "running" || s.status === "waiting_review",
    );
    const currentStep = currentStepRun?.stepId ?? (run.status === "approved" ? "Complete" : "Queued");

    // Plan name: use audience from gtmContext or process name
    const planName = gtmContext.audience
      ? `${proc.name}: ${gtmContext.audience}`
      : proc.name;

    summaries.push({
      planName,
      runId: run.id,
      processSlug: proc.slug,
      status: run.status,
      currentStep,
      cycleNumber: count,
      startedAt: run.startedAt?.toISOString() ?? run.createdAt?.toISOString() ?? new Date().toISOString(),
      gtmContext,
      experiments,
      publishedContent,
      lastBrief,
    });
  }

  return summaries;
}

// ============================================================
// Process Capabilities (Library view)
// ============================================================

import fs from "fs";
import path from "path";
import YAML from "yaml";

export interface ProcessCapability {
  slug: string;
  name: string;
  description: string;
  category: "growth" | "sales" | "relationships" | "operations" | "admin";
  type: "cycle" | "template";
  active: boolean;
  activeCount: number;
  operator?: string;
  relevanceScore?: number;
  matchReason?: string;
}

/**
 * Category classification based on template metadata.
 */
function classifyCategory(parsed: Record<string, unknown>): ProcessCapability["category"] {
  const slug = (parsed.id as string) || "";
  const gear = (parsed.gear as string) || "";
  const description = ((parsed.description as string) || "").toLowerCase();

  if (slug.includes("gtm") || slug.includes("content") || slug.includes("social") || gear === "digital-acquisition") {
    return "growth";
  }
  if (slug.includes("selling") || slug.includes("outreach") || slug.includes("pipeline") || slug.includes("objection") || gear === "direct-outreach") {
    return "sales";
  }
  if (slug.includes("connect") || slug.includes("network") || slug.includes("nurture") || slug.includes("relationship") || slug.includes("warm-path") || slug.includes("ghost")) {
    return "relationships";
  }
  if (slug.includes("inbox") || slug.includes("meeting") || slug.includes("briefing") || slug.includes("follow-up") || description.includes("triage") || description.includes("weekly")) {
    return "operations";
  }
  return "admin";
}

/** Internal sub-processes excluded from user-facing catalog */
const INTERNAL_SLUGS = new Set([
  "channel-router",
  "quality-gate",
  "relationship-scoring",
  "opt-out-management",
  "smoke-test-runner",
  "library-curation",
  "front-door-conversation",
  "front-door-intake",
  "front-door-cos-intake",
  "user-nurture-first-week",
  "user-reengagement",
  "person-research",
  "outreach-quality-review",
]);

/**
 * Get process capabilities for the Library view.
 * Reads templates + cycles from filesystem, cross-references with active runs.
 *
 * When userId is provided, annotates each capability with relevanceScore and
 * matchReason from the capability matcher (Brief 168).
 */
export async function getProcessCapabilities(userId?: string): Promise<ProcessCapability[]> {
  const capabilities: ProcessCapability[] = [];

  const loadFromDir = (dir: string, type: ProcessCapability["type"]) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

    for (const file of files) {
      if (file === "README.md") continue;
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        const parsed = YAML.parse(content) as Record<string, unknown> | null;
        if (!parsed) continue;

        const slug = (parsed.id as string) || file.replace(/\.ya?ml$/, "");
        if (INTERNAL_SLUGS.has(slug)) continue;

        const name = (parsed.name as string) || slug;
        const rawDesc = (parsed.description as string) || "";
        const description = rawDesc.split(/\.\s/)[0].trim().replace(/\n/g, " ").slice(0, 200);
        const operator = (parsed.operator as string) || undefined;

        capabilities.push({
          slug,
          name,
          description: description + (description.endsWith(".") ? "" : "."),
          category: classifyCategory(parsed),
          type,
          active: false,
          activeCount: 0,
          operator,
        });
      } catch {
        continue;
      }
    }
  };

  const templateDir = path.resolve(process.cwd(), "processes/templates");
  const cycleDir = path.resolve(process.cwd(), "processes/cycles");
  loadFromDir(templateDir, "template");
  loadFromDir(cycleDir, "cycle");

  // Cross-reference with active process runs
  const activeRuns = await db
    .select({
      processId: schema.processRuns.processId,
      status: schema.processRuns.status,
    })
    .from(schema.processRuns)
    .where(
      or(
        eq(schema.processRuns.status, "running"),
        eq(schema.processRuns.status, "waiting_review"),
        eq(schema.processRuns.status, "queued"),
      ),
    );

  const processIds = [...new Set(activeRuns.map((r) => r.processId))];
  if (processIds.length > 0) {
    const processes = await db
      .select({ id: schema.processes.id, slug: schema.processes.slug })
      .from(schema.processes)
      .where(inArray(schema.processes.id, processIds));

    const slugToCount = new Map<string, number>();
    for (const run of activeRuns) {
      const proc = processes.find((p) => p.id === run.processId);
      if (proc) {
        slugToCount.set(proc.slug, (slugToCount.get(proc.slug) || 0) + 1);
      }
    }

    for (const cap of capabilities) {
      const count = slugToCount.get(cap.slug) || 0;
      const cycleCount = slugToCount.get(`${cap.slug}-cycle`) || 0;
      const total = count + cycleCount;
      if (total > 0) {
        cap.active = true;
        cap.activeCount = total;
      }
    }
  }

  // Brief 168: Annotate with relevance scoring when userId provided.
  // Uses matchCapabilities() directly with templates derived from already-loaded
  // capabilities to avoid double YAML loading. Suppression rules (5+ processes,
  // 2+ supervised, dismissals) applied inline.
  if (userId) {
    try {
      const { getUserModel } = await import("./user-model");
      const capMatcher = await import("./capability-matcher");
      const { getActiveDismissalHashes, hashContent } = await import("./suggestion-dismissals");

      const userModel = await getUserModel(userId);
      if (userModel.entries.length > 0) {
        // Suppression: 5+ active-or-paused processes → skip scoring
        const registeredProcesses = await db
          .select({ slug: schema.processes.slug, status: schema.processes.status, trustTier: schema.processes.trustTier })
          .from(schema.processes)
          .where(or(eq(schema.processes.status, "active"), eq(schema.processes.status, "paused")));

        const shouldSuppress =
          registeredProcesses.length >= 5 ||
          registeredProcesses.filter((p) => p.status === "active" && p.trustTier === "supervised").length >= 2;

        if (!shouldSuppress) {
          // Build templates from already-loaded capabilities (avoid re-reading YAML)
          const templates = capabilities.map((c) => ({
            slug: c.slug,
            name: c.name,
            description: c.description,
            qualityCriteria: [] as string[],
          }));

          const activeSlugs = registeredProcesses.map((p) => p.slug);
          const rawMatches = capMatcher.matchCapabilities(
            userModel.entries.map((e) => ({ dimension: e.dimension, content: e.content })),
            activeSlugs,
            templates,
          );

          // Filter dismissed suggestions (30-day cooldown)
          const dismissedHashes = await getActiveDismissalHashes(userId);
          const matches = rawMatches.filter(
            (m) => !dismissedHashes.has(hashContent(m.templateSlug)),
          );

          // Create lookup map from matches
          const matchMap = new Map(matches.map((m) => [m.templateSlug, m]));

          for (const cap of capabilities) {
            const match = matchMap.get(cap.slug);
            if (match) {
              cap.relevanceScore = match.relevanceScore;
              cap.matchReason = match.matchReason;
            }
          }
        }
      }
    } catch (err) {
      // AC7: Graceful degradation — return capabilities without scoring
      console.warn("[process-data] Capability scoring failed, returning unscored:", err);
    }
  }

  // Sort: active first, then by category, then by name
  capabilities.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  return capabilities;
}
