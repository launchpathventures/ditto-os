/**
 * Ditto — Briefing Assembler
 *
 * Queries DB for all briefing inputs and assembles structured data
 * that the Self weaves into a natural narrative briefing.
 *
 * Five dimensions (Insight-076):
 * 1. Focus — what needs attention first, with reasoning
 * 2. Attention — aging items without recent activity
 * 3. Upcoming — predicted work, items nearing completion
 * 4. Risk — temporal, data staleness, correction-pattern signals
 * 5. Suggestions — coverage gaps, trust upgrades, next steps
 *
 * Provenance: Linear Pulse (narrative daily summary), Insight-076, Brief 043.
 */

import { db, schema } from "../db";
import { eq, desc, and, gte, or, inArray } from "drizzle-orm";
import { detectAllRisks, type DetectedRisk, type RiskThresholds } from "./risk-detector";
import { getUserModel, type UserModel } from "./user-model";
import { matchIndustry, findCoverageGaps, type ProcessPattern } from "./industry-patterns";
import { computeTrustState, generateUpgradeCelebration, type TrustState } from "./trust";
import type { TrustMilestoneBlock } from "./content-blocks";
import { computeCorrectionRates, formatCorrectionEvidence } from "./harness-handlers/feedback-recorder";

// ============================================================
// Types
// ============================================================

export interface FocusItem {
  id: string;
  label: string;
  reason: string;
  priority: "high" | "medium" | "low";
  type: "review" | "human_input" | "exception" | "active";
}

export interface AttentionItem {
  id: string;
  label: string;
  daysSinceActivity: number;
  status: string;
}

export interface UpcomingItem {
  id: string;
  label: string;
  prediction: string;
}

export interface SuggestionItem {
  id: string;
  type: "coverage_gap" | "trust_upgrade" | "process_improvement" | "next_step";
  suggestion: string;
  reasoning: string;
}

/** Autonomous digest entry — one per process that auto-advanced (Brief 158 MP-3.1) */
export interface AutoDigestEntry {
  processId: string;
  processName: string;
  stepsAdvanced: number;
  /** Human-readable summary, e.g. "3 emails sent, 1 response received" */
  summary: string;
}

/** Wait-state entry — a process waiting for an external event (Brief 158 MP-3.2) */
export interface WaitStateEntry {
  processRunId: string;
  processName: string;
  waitEvent: string;
  description: string;
  since: Date;
}

/** Correction rate trend for a process with significant learning effect (Brief 159 MP-4.3) */
export interface CorrectionRateTrend {
  processId: string;
  processName: string;
  pattern: string;
  /** Human-readable evidence: "labour estimate corrections: 60% → 8% after learning" */
  narrative: string;
  rateBefore: number;
  rateAfter: number;
}

/** Spot-check transparency stats per process (Brief 160 MP-5.4) */
export interface SpotCheckStats {
  processId: string;
  processName: string;
  /** Total step runs in the period */
  totalRuns: number;
  /** Runs that were sampled for human review */
  sampledRuns: number;
  /** Runs that auto-advanced without review */
  autoAdvancedRuns: number;
  /** Auto-advanced runs that passed automated checks */
  autoPassedChecks: number;
}

export interface BriefingData {
  /** Items that need the user's attention first */
  focus: FocusItem[];
  /** Items aging without activity */
  attention: AttentionItem[];
  /** Predicted upcoming work */
  upcoming: UpcomingItem[];
  /** Risk signals (woven into narrative, never called "risk") */
  risks: DetectedRisk[];
  /** Suggestions (max 1-2, zero during exceptions) */
  suggestions: SuggestionItem[];
  /** Summary stats for the Self to reference */
  stats: {
    completedSinceLastVisit: number;
    activeRuns: number;
    pendingReviews: number;
    pendingHumanInput: number;
    totalExceptions: number;
  };
  /** When the user was last active (for "since you left" framing) */
  lastActiveAt: Date | null;
  /** User model completeness — verbose for new users, terse for power users */
  userFamiliarity: "new" | "developing" | "established";
  /** Journey smoke test health — "8/8 passing" or "7/8 — [name] failing" (Brief 112) */
  journeyHealth?: {
    total: number;
    passing: number;
    failing: number;
    failingJourneys: string[];
    lastRunAt: Date | null;
  };
  /** Steps auto-advanced at autonomous/spot-checked tier since last session (Brief 158 MP-3.1) */
  autonomousDigest: AutoDigestEntry[];
  /** Processes waiting for external events (Brief 158 MP-3.2) */
  waitStates: WaitStateEntry[];
  /** Correction rate trends with significant improvement after learning (Brief 159 MP-4.3) */
  correctionRateTrends: CorrectionRateTrend[];
  /** Trust milestone blocks — upgrade celebrations and downgrade explanations (Brief 160 MP-5.1/5.2) */
  trustMilestones: TrustMilestoneBlock[];
  /** Spot-check transparency — auto-advanced vs sampled counts per process (Brief 160 MP-5.4) */
  spotCheckTransparency: SpotCheckStats[];
  /** When this briefing was generated — never serve stale data (Brief 158 MP-3.5) */
  generatedAt: Date;
}

// ============================================================
// Assembly
// ============================================================

/**
 * Assemble all briefing data for a user return.
 * This produces structured data — the Self turns it into narrative.
 */
export async function assembleBriefing(
  userId: string,
  riskThresholds?: Partial<RiskThresholds>,
): Promise<BriefingData> {
  // Determine last active time from most recent suspended session
  const [lastSession] = await db
    .select({ lastActiveAt: schema.sessions.lastActiveAt })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        eq(schema.sessions.status, "suspended"),
      ),
    )
    .orderBy(desc(schema.sessions.lastActiveAt))
    .limit(1);

  const lastActiveAt = lastSession?.lastActiveAt
    ? (lastSession.lastActiveAt instanceof Date
        ? lastSession.lastActiveAt
        : new Date(Number(lastSession.lastActiveAt)))
    : null;

  // Run queries in parallel
  const [focus, attention, upcoming, risks, suggestions, stats, autonomousDigest, waitStates, correctionRateTrends, trustMilestones, spotCheckTransparency] = await Promise.all([
    assembleFocus(lastActiveAt),
    assembleAttention(),
    assembleUpcoming(),
    detectAllRisks(riskThresholds),
    assembleSuggestions(userId),
    assembleStats(lastActiveAt),
    assembleAutonomousDigest(lastActiveAt),
    assembleWaitStates(),
    assembleCorrectionRateTrends(),
    assembleTrustMilestones(lastActiveAt),
    assembleSpotCheckTransparency(lastActiveAt),
  ]);

  // Determine user familiarity
  const userModel = await getUserModel(userId);
  const userFamiliarity: BriefingData["userFamiliarity"] =
    userModel.completeness < 0.3 ? "new" :
    userModel.completeness < 0.7 ? "developing" : "established";

  // Cap suggestions: zero during exceptions (Brief 043 constraint)
  const cappedSuggestions = stats.totalExceptions > 0
    ? []
    : suggestions.slice(0, 2);

  // Journey health (Brief 112) — non-blocking, optional
  let journeyHealth: BriefingData["journeyHealth"];
  try {
    const { getJourneyHealth } = await import("./smoke-test-runner");
    const health = await getJourneyHealth();
    if (health.lastRunAt) {
      journeyHealth = health;
    }
  } catch {
    // Smoke test runner not available — skip
  }

  return {
    focus,
    attention,
    upcoming,
    risks,
    suggestions: cappedSuggestions,
    stats,
    lastActiveAt,
    userFamiliarity,
    journeyHealth,
    autonomousDigest,
    waitStates,
    correctionRateTrends,
    trustMilestones,
    spotCheckTransparency,
    generatedAt: new Date(),
  };
}

// ============================================================
// Focus Dimension
// ============================================================

async function assembleFocus(lastActiveAt: Date | null): Promise<FocusItem[]> {
  const items: FocusItem[] = [];

  // 1. Pending reviews — always high priority
  const pendingReviews = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      currentStepId: schema.processRuns.currentStepId,
      createdAt: schema.processRuns.createdAt,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_review"))
    .orderBy(schema.processRuns.createdAt);

  for (const run of pendingReviews) {
    // Get process name
    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    items.push({
      id: run.id,
      label: proc?.name ?? "Unknown process",
      reason: "Waiting for your review",
      priority: "high",
      type: "review",
    });
  }

  // 2. Waiting for human input
  const waitingHuman = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      currentStepId: schema.processRuns.currentStepId,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_human"))
    .orderBy(schema.processRuns.createdAt);

  for (const run of waitingHuman) {
    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    items.push({
      id: run.id,
      label: proc?.name ?? "Unknown process",
      reason: `Needs your input (step: ${run.currentStepId ?? "unknown"})`,
      priority: "high",
      type: "human_input",
    });
  }

  // 3. Failed runs — exceptions
  const failedRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "failed"))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(5);

  for (const run of failedRuns) {
    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    items.push({
      id: run.id,
      label: proc?.name ?? "Unknown process",
      reason: "Something went wrong — needs investigation",
      priority: "high",
      type: "exception",
    });
  }

  // 4. Active runs (informational)
  const activeRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      currentStepId: schema.processRuns.currentStepId,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "running"))
    .orderBy(schema.processRuns.createdAt);

  for (const run of activeRuns) {
    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    items.push({
      id: run.id,
      label: proc?.name ?? "Unknown process",
      reason: `Running (${run.currentStepId ?? "in progress"})`,
      priority: "low",
      type: "active",
    });
  }

  return items;
}

// ============================================================
// Attention Dimension
// ============================================================

async function assembleAttention(): Promise<AttentionItem[]> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Work items that haven't been touched recently
  const staleItems = await db
    .select({
      id: schema.workItems.id,
      content: schema.workItems.content,
      status: schema.workItems.status,
      updatedAt: schema.workItems.updatedAt,
    })
    .from(schema.workItems)
    .where(
      and(
        or(
          eq(schema.workItems.status, "intake"),
          eq(schema.workItems.status, "routed"),
          eq(schema.workItems.status, "in_progress"),
          eq(schema.workItems.status, "waiting_human"),
        ),
      ),
    )
    .orderBy(schema.workItems.updatedAt)
    .limit(10);

  return staleItems
    .filter((item) => {
      const updatedAt = item.updatedAt instanceof Date
        ? item.updatedAt
        : new Date(Number(item.updatedAt));
      return updatedAt < threeDaysAgo;
    })
    .map((item) => {
      const updatedAt = item.updatedAt instanceof Date
        ? item.updatedAt
        : new Date(Number(item.updatedAt));
      return {
        id: item.id,
        label: item.content.slice(0, 80),
        daysSinceActivity: Math.floor(
          (Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000),
        ),
        status: item.status,
      };
    });
}

// ============================================================
// Upcoming Dimension
// ============================================================

async function assembleUpcoming(): Promise<UpcomingItem[]> {
  const items: UpcomingItem[] = [];

  // Running process runs that are near completion
  // (on the last step or second-to-last step)
  const runningRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      currentStepId: schema.processRuns.currentStepId,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "running"));

  for (const run of runningRuns) {
    const [proc] = await db
      .select({
        name: schema.processes.name,
        definition: schema.processes.definition,
      })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    if (!proc?.definition) continue;

    const def = proc.definition as Record<string, unknown>;
    const steps = (def.steps as Array<Record<string, unknown>>) ?? [];

    if (steps.length === 0) continue;

    // Find current step position
    const currentIdx = steps.findIndex(
      (s) => s.id === run.currentStepId || s.parallel_group === run.currentStepId,
    );
    const isNearEnd = currentIdx >= 0 && currentIdx >= steps.length - 2;

    if (isNearEnd) {
      items.push({
        id: run.id,
        label: proc.name,
        prediction: "Finishing soon — output coming",
      });
    }
  }

  // Work items in progress with spawned sub-items nearing completion
  const inProgressGoals = await db
    .select({
      id: schema.workItems.id,
      content: schema.workItems.content,
      decomposition: schema.workItems.decomposition,
    })
    .from(schema.workItems)
    .where(
      and(
        eq(schema.workItems.type, "goal"),
        eq(schema.workItems.status, "in_progress"),
      ),
    );

  for (const goal of inProgressGoals) {
    if (!goal.decomposition) continue;
    const tasks = goal.decomposition as Array<{ taskId: string; status: string }>;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const total = tasks.length;

    if (total > 0 && completed >= total - 1 && completed < total) {
      items.push({
        id: goal.id,
        label: goal.content.slice(0, 80),
        prediction: `${completed}/${total} tasks done — almost complete`,
      });
    }
  }

  return items;
}

// ============================================================
// Suggestions Dimension
// ============================================================

async function assembleSuggestions(userId: string): Promise<SuggestionItem[]> {
  const suggestions: SuggestionItem[] = [];

  // 1. Coverage gap suggestions from industry patterns
  const userModel = await getUserModel(userId);
  const workSignals = userModel.entries.map((e) => e.content);

  const industry = matchIndustry(workSignals);
  if (industry) {
    // Get existing processes
    const existingProcesses = await db
      .select({
        name: schema.processes.name,
        description: schema.processes.description,
      })
      .from(schema.processes)
      .where(eq(schema.processes.status, "active"));

    const gaps = findCoverageGaps(industry, existingProcesses);

    // Suggest the highest-importance gap
    const coreGaps = gaps.filter((g) => g.importance === "core");
    const topGap = coreGaps[0] ?? gaps[0];

    if (topGap) {
      suggestions.push({
        id: `coverage-${topGap.id}`,
        type: "coverage_gap",
        suggestion: `Other ${industry.name.toLowerCase()} businesses find it useful to have ${topGap.name.toLowerCase()}`,
        reasoning: topGap.description,
      });
    }
  }

  // 2. Trust upgrade suggestions — processes ready for more autonomy
  const processes = await db
    .select({
      id: schema.processes.id,
      name: schema.processes.name,
      slug: schema.processes.slug,
      trustTier: schema.processes.trustTier,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  for (const proc of processes) {
    // Skip already autonomous or critical processes
    if (proc.trustTier === "autonomous" || proc.trustTier === "critical") continue;

    const trustState = await computeTrustState(proc.id);

    // If high approval rate and enough runs, suggest upgrade
    if (
      trustState.runsInWindow >= 10 &&
      trustState.approvalRate >= 0.9 &&
      trustState.consecutiveCleanRuns >= 5
    ) {
      const nextTier = proc.trustTier === "supervised" ? "spot-checked" : "autonomous";

      // Brief 159 MP-4.4: Include correction rate evidence in reasoning
      let reasoning = `${Math.round(trustState.approvalRate * 100)}% approval rate over ${trustState.runsInWindow} runs, ${trustState.consecutiveCleanRuns} in a row without corrections`;
      try {
        const rates = await computeCorrectionRates(proc.id);
        const evidence = formatCorrectionEvidence(rates);
        if (evidence) {
          reasoning += `. Learning effect: ${evidence}`;
        }
      } catch {
        // Non-blocking
      }

      suggestions.push({
        id: `trust-${proc.slug}`,
        type: "trust_upgrade",
        suggestion: `${proc.name} has been running smoothly — you could let it handle more on its own`,
        reasoning,
      });
    }
  }

  // 3. Next step suggestions from user model gaps
  if (userModel.missingDimensions.length > 0) {
    const priorityMissing = userModel.missingDimensions[0];
    suggestions.push({
      id: `deepen-${priorityMissing}`,
      type: "next_step",
      suggestion: `I'd like to understand more about your ${priorityMissing} — it helps me work better for you`,
      reasoning: `${userModel.populatedDimensions.length}/${9} dimensions of understanding populated`,
    });
  }

  return suggestions;
}

// ============================================================
// Stats
// ============================================================

async function assembleStats(lastActiveAt: Date | null): Promise<BriefingData["stats"]> {
  // Count completions since last visit (or last 24h if no visit tracked)
  const since = lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  const completedRuns = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.status, "approved"),
        gte(schema.processRuns.completedAt, since),
      ),
    );

  const activeRuns = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "running"));

  const pendingReviews = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_review"));

  const pendingHuman = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_human"));

  const failedRuns = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "failed"));

  return {
    completedSinceLastVisit: completedRuns.length,
    activeRuns: activeRuns.length,
    pendingReviews: pendingReviews.length,
    pendingHumanInput: pendingHuman.length,
    totalExceptions: failedRuns.length,
  };
}

// ============================================================
// Autonomous Digest (Brief 158 MP-3.1)
// ============================================================

/**
 * Query auto-advanced step runs since last session.
 * Auto-advanced = trustAction is "advance" or "sample_advance" in harnessDecisions.
 * Groups by process for digest display.
 */
async function assembleAutonomousDigest(lastActiveAt: Date | null): Promise<AutoDigestEntry[]> {
  const since = lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get harness decisions that auto-advanced since last session
  const autoDecisions = await db
    .select({
      processRunId: schema.harnessDecisions.processRunId,
      stepRunId: schema.harnessDecisions.stepRunId,
      trustAction: schema.harnessDecisions.trustAction,
      createdAt: schema.harnessDecisions.createdAt,
    })
    .from(schema.harnessDecisions)
    .where(
      and(
        inArray(schema.harnessDecisions.trustAction, ["advance", "sample_advance"]),
        gte(schema.harnessDecisions.createdAt, since),
      ),
    );

  if (autoDecisions.length === 0) return [];

  // Group by process run, collecting step run IDs for summary extraction
  const byProcessRun = new Map<string, { runId: string; stepRunIds: string[] }>();
  for (const d of autoDecisions) {
    const existing = byProcessRun.get(d.processRunId);
    if (existing) {
      existing.stepRunIds.push(d.stepRunId);
    } else {
      byProcessRun.set(d.processRunId, { runId: d.processRunId, stepRunIds: [d.stepRunId] });
    }
  }

  // Batch-fetch process runs and step runs to avoid N+1 queries
  const runIds = [...byProcessRun.keys()];
  const allStepRunIds = [...byProcessRun.values()].flatMap((v) => v.stepRunIds);

  const [processRunRows, stepRunRows] = await Promise.all([
    db.select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
    })
      .from(schema.processRuns)
      .where(inArray(schema.processRuns.id, runIds)),
    db.select({
      id: schema.stepRuns.id,
      stepId: schema.stepRuns.stepId,
      outputs: schema.stepRuns.outputs,
      processRunId: schema.stepRuns.processRunId,
    })
      .from(schema.stepRuns)
      .where(inArray(schema.stepRuns.id, allStepRunIds)),
  ]);

  // Index lookups
  const runToProcess = new Map(processRunRows.map((r) => [r.id, r.processId]));
  const uniqueProcessIds = [...new Set(processRunRows.map((r) => r.processId))];

  // Batch-fetch process names
  const processRows = uniqueProcessIds.length > 0
    ? await db.select({ id: schema.processes.id, name: schema.processes.name })
        .from(schema.processes)
        .where(inArray(schema.processes.id, uniqueProcessIds))
    : [];
  const processNames = new Map(processRows.map((p) => [p.id, p.name]));

  // Index step runs by process run ID
  const stepRunsByRunId = new Map<string, typeof stepRunRows>();
  for (const sr of stepRunRows) {
    const existing = stepRunsByRunId.get(sr.processRunId) ?? [];
    existing.push(sr);
    stepRunsByRunId.set(sr.processRunId, existing);
  }

  // Build entries
  const entries: AutoDigestEntry[] = [];

  for (const [runId, info] of byProcessRun) {
    const processId = runToProcess.get(runId);
    if (!processId) continue;

    const stepsForRun = stepRunsByRunId.get(runId) ?? [];
    const summary = buildDigestSummary(stepsForRun);

    entries.push({
      processId,
      processName: processNames.get(processId) ?? "Unknown process",
      stepsAdvanced: info.stepRunIds.length,
      summary,
    });
  }

  return entries;
}

/**
 * Build a human-readable summary from step run data.
 * Inspects step IDs and outputs to produce activity descriptions
 * like "3 emails sent, 1 response received" instead of generic "3 steps auto-advanced."
 *
 * Falls back to step count if no meaningful labels can be extracted.
 */
function buildDigestSummary(
  stepRuns: Array<{ stepId: string; outputs: Record<string, unknown> | null }>,
): string {
  const count = stepRuns.length;

  // Tally activity types from step IDs and output metadata
  const activityCounts = new Map<string, number>();

  for (const sr of stepRuns) {
    // Check outputs for an explicit activity label (convention: _activityLabel)
    const outputs = sr.outputs as Record<string, unknown> | null;
    const label = outputs?._activityLabel as string | undefined;

    if (label) {
      activityCounts.set(label, (activityCounts.get(label) ?? 0) + 1);
      continue;
    }

    // Infer activity from step ID naming conventions
    const stepId = sr.stepId.toLowerCase();
    if (stepId.includes("email") || stepId.includes("send")) {
      activityCounts.set("emails sent", (activityCounts.get("emails sent") ?? 0) + 1);
    } else if (stepId.includes("quote") || stepId.includes("generate")) {
      activityCounts.set("generated", (activityCounts.get("generated") ?? 0) + 1);
    } else if (stepId.includes("follow") || stepId.includes("nurture")) {
      activityCounts.set("follow-ups", (activityCounts.get("follow-ups") ?? 0) + 1);
    } else if (stepId.includes("response") || stepId.includes("reply")) {
      activityCounts.set("responses processed", (activityCounts.get("responses processed") ?? 0) + 1);
    } else {
      activityCounts.set("steps completed", (activityCounts.get("steps completed") ?? 0) + 1);
    }
  }

  if (activityCounts.size === 0) {
    return `${count} step${count === 1 ? "" : "s"} auto-advanced`;
  }

  // Build summary: "3 emails sent, 1 response processed"
  const parts: string[] = [];
  for (const [activity, n] of activityCounts) {
    parts.push(`${n} ${activity}`);
  }
  return parts.join(", ");
}

// ============================================================
// Wait States (Brief 158 MP-3.2)
// ============================================================

/**
 * Query processes waiting for external events.
 * These are runs with status "waiting_human" that have _waitFor metadata in step outputs.
 */
async function assembleWaitStates(): Promise<WaitStateEntry[]> {
  const waitingRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      runMetadata: schema.processRuns.runMetadata,
      currentStepId: schema.processRuns.currentStepId,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_human"));

  const entries: WaitStateEntry[] = [];

  for (const run of waitingRuns) {
    // Check runMetadata for waitFor info (set by heartbeat wait_for handling)
    const metadata = run.runMetadata as Record<string, unknown> | null;
    const waitForMeta = metadata?.waitFor as {
      event?: string;
      stepName?: string;
      stepRunId?: string;
    } | undefined;

    if (!waitForMeta?.event) continue;

    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    // Get the step run to find when the wait started
    let since: Date | null = null;
    if (waitForMeta.stepRunId) {
      const [stepRun] = await db
        .select({ completedAt: schema.stepRuns.completedAt })
        .from(schema.stepRuns)
        .where(eq(schema.stepRuns.id, waitForMeta.stepRunId))
        .limit(1);
      if (stepRun?.completedAt) {
        since = stepRun.completedAt instanceof Date
          ? stepRun.completedAt
          : new Date(Number(stepRun.completedAt));
      }
    }

    let timeDesc: string;
    if (since) {
      const daysSince = Math.floor((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000));
      timeDesc = daysSince === 0 ? "today" : daysSince === 1 ? "1 day ago" : `${daysSince} days ago`;
    } else {
      timeDesc = "recently";
    }

    entries.push({
      processRunId: run.id,
      processName: proc?.name ?? "Unknown process",
      waitEvent: waitForMeta.event,
      description: `Waiting for ${waitForMeta.event} — sent ${timeDesc}`,
      since: since ?? new Date(),
    });
  }

  return entries;
}

// ============================================================
// Correction Rate Trends (Brief 159 MP-4.3)
// ============================================================

/**
 * Query all active processes and compute correction rate trends.
 * Only includes patterns with significant improvement after learning.
 */
async function assembleCorrectionRateTrends(): Promise<CorrectionRateTrend[]> {
  const activeProcesses = await db
    .select({ id: schema.processes.id })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  const trends: CorrectionRateTrend[] = [];

  for (const proc of activeProcesses) {
    try {
      const rates = await computeCorrectionRates(proc.id);

      for (const improvement of rates.significantImprovements) {
        if (improvement.rateBefore !== null && improvement.rateAfter !== null) {
          const humanPattern = improvement.pattern.replace(/_/g, " ");
          const beforePct = Math.round(improvement.rateBefore * 100);
          const afterPct = Math.round(improvement.rateAfter * 100);

          trends.push({
            processId: rates.processId,
            processName: rates.processName,
            pattern: improvement.pattern,
            narrative: `${humanPattern} corrections: ${beforePct}% → ${afterPct}% after learning`,
            rateBefore: improvement.rateBefore,
            rateAfter: improvement.rateAfter,
          });
        }
      }
    } catch {
      // Non-blocking — skip processes with computation errors
    }
  }

  return trends;
}

// ============================================================
// Trust Milestones (Brief 160 MP-5.1 + MP-5.2)
// ============================================================

/**
 * Query recent trust tier changes and generate milestone blocks.
 *
 * MP-5.1: Upgrade celebrations for pending suggestions.
 * MP-5.2: Downgrade explanations stored in activity metadata by executeTierChange().
 */
async function assembleTrustMilestones(lastActiveAt: Date | null): Promise<TrustMilestoneBlock[]> {
  const milestones: TrustMilestoneBlock[] = [];
  const since = lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  // MP-5.1: Pending upgrade suggestions → celebration blocks
  const pendingSuggestions = await db
    .select({
      id: schema.trustSuggestions.id,
      processId: schema.trustSuggestions.processId,
      currentTier: schema.trustSuggestions.currentTier,
      suggestedTier: schema.trustSuggestions.suggestedTier,
      evidence: schema.trustSuggestions.evidence,
    })
    .from(schema.trustSuggestions)
    .where(eq(schema.trustSuggestions.status, "pending"));

  for (const suggestion of pendingSuggestions) {
    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, suggestion.processId))
      .limit(1);

    const state = await computeTrustState(suggestion.processId);

    milestones.push(generateUpgradeCelebration({
      processName: proc?.name ?? "Unknown process",
      currentTier: suggestion.currentTier as Parameters<typeof generateUpgradeCelebration>[0]["currentTier"],
      suggestedTier: suggestion.suggestedTier as Parameters<typeof generateUpgradeCelebration>[0]["suggestedTier"],
      state,
      suggestionId: suggestion.id,
    }));
  }

  // MP-5.2: Recent downgrade activities with milestone blocks
  const downgradeActivities = await db
    .select({
      metadata: schema.activities.metadata,
    })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.action, "trust.tier_change"),
        gte(schema.activities.createdAt, since),
      ),
    )
    .orderBy(desc(schema.activities.createdAt));

  for (const activity of downgradeActivities) {
    const meta = activity.metadata as Record<string, unknown> | null;
    const block = meta?.milestoneBlock as TrustMilestoneBlock | undefined;
    if (block && block.type === "trust_milestone" && block.milestoneType === "downgrade") {
      milestones.push(block);
    }
  }

  return milestones;
}

// ============================================================
// Spot-Check Transparency (Brief 160 MP-5.4)
// ============================================================

/**
 * For spot-checked processes, show auto-advanced vs sampled run counts.
 *
 * MP-5.4: Queries harnessDecisions for trust actions since last session,
 * groups by process, and counts sampled vs auto-advanced.
 */
async function assembleSpotCheckTransparency(lastActiveAt: Date | null): Promise<SpotCheckStats[]> {
  const since = lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get spot-checked processes
  const spotCheckedProcesses = await db
    .select({
      id: schema.processes.id,
      name: schema.processes.name,
    })
    .from(schema.processes)
    .where(
      and(
        eq(schema.processes.status, "active"),
        eq(schema.processes.trustTier, "spot_checked"),
      ),
    );

  if (spotCheckedProcesses.length === 0) return [];

  const processIds = spotCheckedProcesses.map((p) => p.id);
  const processNames = new Map(spotCheckedProcesses.map((p) => [p.id, p.name]));

  // Get recent process runs for these processes
  const recentRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
    })
    .from(schema.processRuns)
    .where(
      and(
        inArray(schema.processRuns.processId, processIds),
        gte(schema.processRuns.createdAt, since),
      ),
    );

  if (recentRuns.length === 0) return [];

  const runIds = recentRuns.map((r) => r.id);
  const runToProcess = new Map(recentRuns.map((r) => [r.id, r.processId]));

  // Get harness decisions for these runs
  const decisions = await db
    .select({
      processRunId: schema.harnessDecisions.processRunId,
      trustAction: schema.harnessDecisions.trustAction,
      reviewResult: schema.harnessDecisions.reviewResult,
    })
    .from(schema.harnessDecisions)
    .where(inArray(schema.harnessDecisions.processRunId, runIds));

  // Group by process
  const statsByProcess = new Map<string, { total: number; sampled: number; autoAdvanced: number; autoPassedChecks: number }>();

  for (const d of decisions) {
    const processId = runToProcess.get(d.processRunId);
    if (!processId) continue;

    const stats = statsByProcess.get(processId) ?? { total: 0, sampled: 0, autoAdvanced: 0, autoPassedChecks: 0 };
    stats.total++;

    if (d.trustAction === "advance" || d.trustAction === "sample_advance") {
      stats.autoAdvanced++;
      if (d.reviewResult === "pass") {
        stats.autoPassedChecks++;
      }
    } else {
      stats.sampled++;
    }

    statsByProcess.set(processId, stats);
  }

  return [...statsByProcess.entries()].map(([processId, stats]) => ({
    processId,
    processName: processNames.get(processId) ?? "Unknown process",
    totalRuns: stats.total,
    sampledRuns: stats.sampled,
    autoAdvancedRuns: stats.autoAdvanced,
    autoPassedChecks: stats.autoPassedChecks,
  }));
}
