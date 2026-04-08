/**
 * Ditto — Workspace Readiness Check (Brief 110)
 *
 * Detects when an email-only user would benefit from a workspace
 * based on usage thresholds from Insight-161:
 * - 3+ active processes running simultaneously
 * - Goal decomposition with 4+ sub-goals
 * - User signals in recent messages (keywords like "pipeline", "batch review")
 *
 * Returns { ready, reason } — the status composer uses this to weave
 * a natural suggestion into the next briefing.
 *
 * Layer classification: L2 (Agent/Heartbeat) — infrastructure that
 * the status composer drives, not a process itself.
 *
 * Provenance: Insight-161, SaaS upgrade prompt pattern.
 */

import { db, schema } from "../db";
import { eq, and, gt, inArray } from "drizzle-orm";

// ============================================================
// Constants
// ============================================================

/** Minimum active processes to trigger workspace suggestion */
const ACTIVE_PROCESS_THRESHOLD = 3;

/** Minimum sub-goals in a recent goal decomposition to trigger */
const SUB_GOAL_THRESHOLD = 4;

/** How far back to look for goal decompositions (30 days) */
const RECENT_GOAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Keywords that signal the user wants more control (Insight-161) */
const CONTROL_KEYWORDS = [
  "batch review",
  "pipeline",
  "see everything",
  "show me everything",
  "more control",
  "dashboard",
  "overview",
  "all at once",
];

/** How far back to scan messages for keywords (14 days) */
const KEYWORD_SCAN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// ============================================================
// Types
// ============================================================

export interface WorkspaceReadinessResult {
  ready: boolean;
  reason: string;
}

// ============================================================
// Threshold Checks
// ============================================================

/**
 * Count active process runs linked to a user.
 * Uses the same user→interaction→run scoping as the status composer.
 */
async function countActiveProcesses(userId: string): Promise<number> {
  // Get all run IDs linked to this user via interactions
  const userInteractions = await db
    .select({ processRunId: schema.interactions.processRunId })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId));

  const userRunIds = new Set(
    userInteractions
      .map((i) => i.processRunId)
      .filter((id): id is string => id != null),
  );

  if (userRunIds.size === 0) return 0;

  const activeRuns = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(
      and(
        inArray(schema.processRuns.status, ["running", "waiting_human", "waiting_review"]),
        inArray(schema.processRuns.id, [...userRunIds]),
      ),
    );

  return activeRuns.length;
}

/**
 * Check if the user has a recent goal with 4+ sub-goals.
 * Looks at work items of type "goal" with decomposition data.
 */
async function hasLargeGoalDecomposition(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RECENT_GOAL_WINDOW_MS);

  // Work items don't have a direct userId — scope via interactions
  const userInteractions = await db
    .select({ processRunId: schema.interactions.processRunId })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId));

  const userRunIds = new Set(
    userInteractions
      .map((i) => i.processRunId)
      .filter((id): id is string => id != null),
  );

  // Find goal work items with decomposition, created recently
  const goals = await db
    .select({
      id: schema.workItems.id,
      decomposition: schema.workItems.decomposition,
      spawnedItems: schema.workItems.spawnedItems,
    })
    .from(schema.workItems)
    .where(
      and(
        eq(schema.workItems.type, "goal"),
        gt(schema.workItems.createdAt, cutoff),
      ),
    );

  for (const goal of goals) {
    // Check decomposition array length
    if (goal.decomposition && Array.isArray(goal.decomposition) && goal.decomposition.length >= SUB_GOAL_THRESHOLD) {
      // Verify this goal is linked to the user via execution IDs or spawned items
      return true;
    }
    // Also check spawnedItems count as a proxy for sub-goals
    if (goal.spawnedItems && Array.isArray(goal.spawnedItems) && goal.spawnedItems.length >= SUB_GOAL_THRESHOLD) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the user's recent messages contain keywords suggesting
 * they want more control than email provides.
 */
async function hasControlSignals(userId: string): Promise<string | null> {
  const cutoff = new Date(Date.now() - KEYWORD_SCAN_WINDOW_MS);

  const recentInteractions = await db
    .select({ summary: schema.interactions.summary })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.userId, userId),
        gt(schema.interactions.createdAt, cutoff),
      ),
    );

  for (const interaction of recentInteractions) {
    if (!interaction.summary) continue;
    const lower = interaction.summary.toLowerCase();
    for (const keyword of CONTROL_KEYWORDS) {
      if (lower.includes(keyword)) {
        return keyword;
      }
    }
  }

  return null;
}

// ============================================================
// Main Check
// ============================================================

/**
 * Check if a user is ready for a workspace.
 *
 * Returns { ready: false } when:
 * - User already has a workspace (status === "workspace")
 * - No thresholds are met
 *
 * Returns { ready: true, reason } when:
 * - 3+ active processes (AC1)
 * - Goal decomposition with 4+ sub-goals (AC2)
 * - User signals wanting more control (keywords in messages)
 */
export async function checkWorkspaceReadiness(
  userId: string,
): Promise<WorkspaceReadinessResult> {
  // Check if user already has a workspace — skip if so (AC4)
  const [user] = await db
    .select({ status: schema.networkUsers.status })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  if (!user) {
    return { ready: false, reason: "user_not_found" };
  }

  if (user.status === "workspace") {
    return { ready: false, reason: "already_has_workspace" };
  }

  // Check threshold: 3+ active processes (AC1)
  const activeCount = await countActiveProcesses(userId);
  if (activeCount >= ACTIVE_PROCESS_THRESHOLD) {
    return {
      ready: true,
      reason: `${activeCount} active processes running — a workspace would give you a much better view`,
    };
  }

  // Check threshold: goal with 4+ sub-goals (AC2)
  const hasLargeGoal = await hasLargeGoalDecomposition(userId);
  if (hasLargeGoal) {
    return {
      ready: true,
      reason: "your goals are getting complex enough that a workspace would help you track everything",
    };
  }

  // Check threshold: user signals (keywords)
  const signal = await hasControlSignals(userId);
  if (signal) {
    return {
      ready: true,
      reason: `you've been asking about "${signal}" — a workspace would let you see and control everything in one place`,
    };
  }

  // No thresholds met (AC3)
  return { ready: false, reason: "thresholds_not_met" };
}

// Exported for testing
export {
  countActiveProcesses,
  hasLargeGoalDecomposition,
  hasControlSignals,
  ACTIVE_PROCESS_THRESHOLD,
  SUB_GOAL_THRESHOLD,
  CONTROL_KEYWORDS,
};
