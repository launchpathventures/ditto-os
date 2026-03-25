/**
 * Ditto — Feed Assembler
 *
 * Queries workItems, processRuns, stepRuns, activities, processOutputs, and feedback
 * to produce typed feed items for the web dashboard.
 *
 * Provenance: Brief 041 (Feed & Review), AC15.
 */

import { db, schema } from "../db";
import { eq, desc, and, or, inArray } from "drizzle-orm";
import { checkCorrectionPattern } from "./harness-handlers/feedback-recorder";
import type { ContentBlock, ReviewCardBlock, AlertBlock, DataBlock } from "./content-blocks";

// Feed item types are defined in packages/web/lib/feed-types.ts
// We duplicate the minimal shape here to avoid cross-package imports from engine → web.

type FeedPriority = "action" | "informational" | "historical";
type ConfidenceLevel = "high" | "medium" | "low";

interface FeedItemBase {
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
}

interface ShiftReportItem extends FeedItemBase {
  itemType: "shift-report";
  data: {
    summary: string;
    details?: string;
    stats?: {
      reviewsPending: number;
      runsCompleted: number;
      exceptionsActive: number;
    };
  };
}

interface ReviewItem extends FeedItemBase {
  itemType: "review";
  data: {
    processRunId: string;
    processName: string;
    stepName: string;
    outputText: string;
    confidence: ConfidenceLevel | null;
    flags?: string[];
    blocks?: ContentBlock[];
  };
}

interface WorkUpdateItem extends FeedItemBase {
  itemType: "work-update";
  data: {
    processName: string;
    processRunId: string;
    status: string;
    summary: string;
    detail?: string;
    stepsExecuted?: number;
  };
}

interface ExceptionItem extends FeedItemBase {
  itemType: "exception";
  data: {
    processName: string;
    processRunId: string;
    stepId: string;
    errorMessage: string;
    explanation: string;
    blocks?: ContentBlock[];
  };
}

interface InsightItem extends FeedItemBase {
  itemType: "insight";
  data: {
    processId: string;
    processName: string;
    pattern: string;
    count: number;
    evidence: string;
  };
}

interface ProcessOutputItem extends FeedItemBase {
  itemType: "process-output";
  data: {
    processName: string;
    processRunId: string;
    outputName: string;
    outputType: string;
    summary: string;
    content: unknown;
    blocks?: ContentBlock[];
  };
}

type FeedItem =
  | ShiftReportItem
  | ReviewItem
  | WorkUpdateItem
  | ExceptionItem
  | InsightItem
  | ProcessOutputItem;

// ============================================================
// Main assembler
// ============================================================

/**
 * Assemble feed items from all relevant DB tables.
 * Returns items sorted by priority (action first), then by timestamp (newest first).
 */
export async function assembleFeed(): Promise<{
  items: FeedItem[];
  assembledAt: string;
}> {
  const items: FeedItem[] = [];

  // Run all queries in parallel
  const [
    reviewItems,
    workUpdates,
    exceptions,
    outputs,
    shiftReport,
    insights,
  ] = await Promise.all([
    assembleReviewItems(),
    assembleWorkUpdates(),
    assembleExceptions(),
    assembleProcessOutputs(),
    assembleShiftReport(),
    assembleInsights(),
  ]);

  items.push(...reviewItems, ...workUpdates, ...exceptions, ...outputs, ...insights);
  if (shiftReport) items.push(shiftReport);

  // Sort: priority first (action > informational > historical), then newest first
  const priorityOrder = { action: 0, informational: 1, historical: 2 };
  items.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return { items, assembledAt: new Date().toISOString() };
}

// ============================================================
// Type 1: Shift report
// ============================================================

async function assembleShiftReport(): Promise<ShiftReportItem | null> {
  // Count pending reviews
  const waitingRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_review"));

  // Count completed runs in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "approved"));

  const completedRecent = recentRuns.filter(
    (r) => r.completedAt && r.completedAt >= oneDayAgo
  );

  // Count active exceptions (failed runs)
  const failedRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "failed"));

  const reviewsPending = waitingRuns.length;
  const runsCompleted = completedRecent.length;
  const exceptionsActive = failedRuns.length;

  // Only show shift report if there's something to report
  if (reviewsPending === 0 && runsCompleted === 0 && exceptionsActive === 0) {
    return null;
  }

  const parts: string[] = [];
  if (reviewsPending > 0) {
    parts.push(`${reviewsPending} item${reviewsPending !== 1 ? "s" : ""} waiting for your review`);
  }
  if (runsCompleted > 0) {
    parts.push(`${runsCompleted} run${runsCompleted !== 1 ? "s" : ""} completed in the last 24 hours`);
  }
  if (exceptionsActive > 0) {
    parts.push(`${exceptionsActive} exception${exceptionsActive !== 1 ? "s" : ""} need attention`);
  }

  return {
    itemType: "shift-report",
    id: `shift-report-${new Date().toISOString().split("T")[0]}`,
    priority: reviewsPending > 0 || exceptionsActive > 0 ? "action" : "informational",
    timestamp: new Date().toISOString(),
    data: {
      summary: parts.join(". ") + ".",
      stats: { reviewsPending, runsCompleted, exceptionsActive },
    },
  };
}

// ============================================================
// Type 2: Review items
// ============================================================

async function assembleReviewItems(): Promise<ReviewItem[]> {
  const waitingRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_review"))
    .orderBy(desc(schema.processRuns.createdAt));

  const items: ReviewItem[] = [];

  for (const run of waitingRuns) {
    // Get process name
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    // Get the waiting step
    const [waitingStep] = await db
      .select()
      .from(schema.stepRuns)
      .where(
        and(
          eq(schema.stepRuns.processRunId, run.id),
          eq(schema.stepRuns.status, "waiting_review"),
        ),
      )
      .limit(1);

    // Get outputs needing review
    const outputs = await db
      .select()
      .from(schema.processOutputs)
      .where(
        and(
          eq(schema.processOutputs.processRunId, run.id),
          eq(schema.processOutputs.needsReview, true),
        ),
      );

    const outputText = outputs
      .map((o) => {
        const content = o.content;
        if (typeof content === "string") return content;
        if (content && typeof content === "object" && "text" in content) {
          return (content as Record<string, string>).text;
        }
        return JSON.stringify(content, null, 2);
      })
      .join("\n\n---\n\n");

    // Get harness flags (from review details)
    const decisions = await db
      .select()
      .from(schema.harnessDecisions)
      .where(eq(schema.harnessDecisions.processRunId, run.id));

    const flags: string[] = [];
    for (const d of decisions) {
      const details = d.reviewDetails as Record<string, unknown> | null;
      if (details && Array.isArray(details.flags)) {
        flags.push(...(details.flags as string[]));
      }
    }

    // Find the work item entity this run belongs to
    const workItem = await findWorkItemForRun(run.id);

    // Build content blocks for this review item (Brief 045, AC10)
    const reviewBlock: ReviewCardBlock = {
      type: "review_card",
      processRunId: run.id,
      stepName: waitingStep?.stepId ?? "unknown",
      outputText: outputText || "(no output)",
      confidence: (waitingStep?.confidenceLevel as ConfidenceLevel) ?? null,
      actions: [
        { id: `review.approve.${run.id}`, label: "Approve", style: "primary" },
        { id: `review.edit.${run.id}`, label: "Edit", style: "secondary" },
        { id: `review.reject.${run.id}`, label: "Reject", style: "danger" },
      ],
      knowledgeUsed: flags.length > 0 ? flags : undefined,
    };

    items.push({
      itemType: "review",
      id: `review-${run.id}`,
      priority: "action",
      timestamp: (run.createdAt ?? new Date()).toISOString(),
      entityId: workItem?.id,
      entityLabel: workItem?.content?.slice(0, 60),
      data: {
        processRunId: run.id,
        processName: proc?.name ?? "Process",
        stepName: waitingStep?.stepId ?? "unknown",
        outputText: outputText || "(no output)",
        confidence: (waitingStep?.confidenceLevel as ConfidenceLevel) ?? null,
        flags: flags.length > 0 ? flags : undefined,
        blocks: [reviewBlock],
      },
    });
  }

  return items;
}

// ============================================================
// Type 3: Work updates
// ============================================================

async function assembleWorkUpdates(): Promise<WorkUpdateItem[]> {
  // Recent completed or running runs (last 24h)
  const recentRuns = await db
    .select()
    .from(schema.processRuns)
    .where(
      or(
        eq(schema.processRuns.status, "running"),
        eq(schema.processRuns.status, "approved"),
      ),
    )
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(20);

  const items: WorkUpdateItem[] = [];

  for (const run of recentRuns) {
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    // Count completed steps
    const completedSteps = await db
      .select()
      .from(schema.stepRuns)
      .where(
        and(
          eq(schema.stepRuns.processRunId, run.id),
          eq(schema.stepRuns.status, "approved"),
        ),
      );

    const status = run.status === "approved" ? "Completed" : "Running";
    const summary = `${proc?.name ?? "Process"} — ${status}`;

    const workItem = await findWorkItemForRun(run.id);

    items.push({
      itemType: "work-update",
      id: `update-${run.id}`,
      priority: "informational",
      timestamp: (run.completedAt ?? run.createdAt ?? new Date()).toISOString(),
      entityId: workItem?.id,
      entityLabel: workItem?.content?.slice(0, 60),
      data: {
        processName: proc?.name ?? "Process",
        processRunId: run.id,
        status: run.status,
        summary,
        stepsExecuted: completedSteps.length,
      },
    });
  }

  return items;
}

// ============================================================
// Type 4: Exceptions
// ============================================================

async function assembleExceptions(): Promise<ExceptionItem[]> {
  const failedRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "failed"))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(10);

  const items: ExceptionItem[] = [];

  for (const run of failedRuns) {
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    // Find the failed step
    const [failedStep] = await db
      .select()
      .from(schema.stepRuns)
      .where(
        and(
          eq(schema.stepRuns.processRunId, run.id),
          eq(schema.stepRuns.status, "failed"),
        ),
      )
      .limit(1);

    const workItem = await findWorkItemForRun(run.id);

    // Build alert block for exception (Brief 045, AC10)
    const alertBlock: AlertBlock = {
      type: "alert",
      severity: "error",
      title: proc?.name ?? "Process Error",
      content: `Error at step "${failedStep?.stepId ?? "unknown"}": ${failedStep?.error ?? "Unknown error"}`,
      actions: [
        { id: `exception.investigate.${run.id}`, label: "Investigate" },
      ],
    };

    items.push({
      itemType: "exception",
      id: `exception-${run.id}`,
      priority: "action",
      timestamp: (run.completedAt ?? run.createdAt ?? new Date()).toISOString(),
      entityId: workItem?.id,
      entityLabel: workItem?.content?.slice(0, 60),
      data: {
        processName: proc?.name ?? "Process",
        processRunId: run.id,
        stepId: failedStep?.stepId ?? "unknown",
        errorMessage: failedStep?.error ?? "Unknown error",
        explanation: `${proc?.name ?? "A process"} encountered an error at step "${failedStep?.stepId ?? "unknown"}".`,
        blocks: [alertBlock],
      },
    });
  }

  return items;
}

// ============================================================
// Type 5: Insights (correction pattern detection)
// ============================================================

async function assembleInsights(): Promise<InsightItem[]> {
  // Get all active processes and check for correction patterns
  const processes = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  const items: InsightItem[] = [];

  for (const proc of processes) {
    const pattern = await checkCorrectionPattern(proc.id);
    if (pattern) {
      items.push({
        itemType: "insight",
        id: `insight-${proc.id}-${pattern.pattern}`,
        priority: "informational",
        timestamp: new Date().toISOString(),
        entityId: proc.id,
        entityLabel: proc.name,
        data: {
          processId: proc.id,
          processName: proc.name,
          pattern: pattern.pattern,
          count: pattern.count,
          evidence: `You've made ${pattern.count} similar corrections to "${pattern.pattern}" in ${proc.name}.`,
        },
      });
    }
  }

  return items;
}

// ============================================================
// Type 6: Process outputs (reviewed, delivered)
// ============================================================

async function assembleProcessOutputs(): Promise<ProcessOutputItem[]> {
  // Recent reviewed outputs
  const outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.needsReview, false))
    .orderBy(desc(schema.processOutputs.createdAt))
    .limit(10);

  if (outputs.length === 0) return [];

  // Get unique process run IDs
  const runIds = [...new Set(outputs.map((o) => o.processRunId))];
  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(inArray(schema.processRuns.id, runIds));

  const runMap = new Map(runs.map((r) => [r.id, r]));

  // Get process names
  const processIds = [...new Set(runs.map((r) => r.processId))];
  const procs = processIds.length > 0
    ? await db
        .select()
        .from(schema.processes)
        .where(inArray(schema.processes.id, processIds))
    : [];
  const procMap = new Map(procs.map((p) => [p.id, p]));

  const items: ProcessOutputItem[] = [];

  for (const output of outputs) {
    const run = runMap.get(output.processRunId);
    const proc = run ? procMap.get(run.processId) : undefined;

    const content = output.content as Record<string, unknown>;
    const textValue = content?.text;
    const summary =
      typeof textValue === "string"
        ? textValue.slice(0, 120)
        : "Process output";

    items.push({
      itemType: "process-output",
      id: `output-${output.id}`,
      priority: "historical",
      timestamp: (output.createdAt ?? new Date()).toISOString(),
      entityId: run?.id,
      entityLabel: proc?.name,
      data: {
        processName: proc?.name ?? "Process",
        processRunId: output.processRunId,
        outputName: output.name,
        outputType: output.type,
        summary,
        content: output.content,
      },
    });
  }

  return items;
}

// ============================================================
// Helpers
// ============================================================

async function findWorkItemForRun(
  runId: string,
): Promise<{ id: string; content: string } | null> {
  // Work items store execution IDs as JSON array
  const allWorkItems = await db
    .select({ id: schema.workItems.id, content: schema.workItems.content, executionIds: schema.workItems.executionIds })
    .from(schema.workItems)
    .limit(100);

  for (const wi of allWorkItems) {
    const execIds = wi.executionIds;
    if (Array.isArray(execIds) && execIds.includes(runId)) {
      return { id: wi.id, content: wi.content };
    }
  }

  return null;
}
