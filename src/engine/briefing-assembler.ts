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
import { eq, desc, and, gte, or } from "drizzle-orm";
import { detectAllRisks, type DetectedRisk, type RiskThresholds } from "./risk-detector";
import { getUserModel, type UserModel } from "./user-model";
import { matchIndustry, findCoverageGaps, type ProcessPattern } from "./industry-patterns";
import { computeTrustState } from "./trust";

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
  const [focus, attention, upcoming, risks, suggestions, stats] = await Promise.all([
    assembleFocus(lastActiveAt),
    assembleAttention(),
    assembleUpcoming(),
    detectAllRisks(riskThresholds),
    assembleSuggestions(userId),
    assembleStats(lastActiveAt),
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
      suggestions.push({
        id: `trust-${proc.slug}`,
        type: "trust_upgrade",
        suggestion: `${proc.name} has been running smoothly — you could let it handle more on its own`,
        reasoning: `${Math.round(trustState.approvalRate * 100)}% approval rate over ${trustState.runsInWindow} runs, ${trustState.consecutiveCleanRuns} in a row without corrections`,
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
