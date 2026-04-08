/**
 * Ditto — Admin Oversight (Brief 108)
 *
 * Core admin functions for monitoring, guiding, pausing, and
 * acting as Alex across all users. Used by admin API routes.
 *
 * Provenance: Brief 108, Insight-160 (trust context, admin reviews on downgrade).
 */

import { db, schema } from "../db";
import { eq, desc, and, inArray, count } from "drizzle-orm";
import { sendAndRecord } from "./channel";

// ============================================================
// Types
// ============================================================

export interface UserHealthSummary {
  id: string;
  name: string | null;
  email: string;
  status: string;
  processCount: number;
  lastActivity: string | null;
  health: "green" | "yellow" | "red";
  pausedAt: string | null;
  recentDowngrades: number;
}

export interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  status: string;
  businessContext: string | null;
  pausedAt: string | null;
  createdAt: string;
  processes: Array<{
    id: string;
    name: string;
    slug: string;
    trustTier: string;
    status: string;
  }>;
  recentRuns: Array<{
    id: string;
    processName: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  qualityMetrics: {
    totalRuns: number;
    approvedRuns: number;
    rejectedRuns: number;
    editedRuns: number;
    approvalRate: number;
    editRate: number;
  };
  adminFeedback: Array<{
    id: string;
    feedback: string;
    createdBy: string;
    createdAt: string;
  }>;
}

// ============================================================
// Dashboard Data
// ============================================================

/**
 * Get admin dashboard data — list of all network users with quality health.
 * Brief 108 AC1.
 */
export async function getAdminDashboardData(): Promise<UserHealthSummary[]> {
  const users = await db
    .select()
    .from(schema.networkUsers)
    .orderBy(desc(schema.networkUsers.updatedAt));

  if (users.length === 0) return [];

  // Get process counts per user (via people → processes linkage is indirect,
  // but processes are global — count all active processes)
  const allProcesses = await db
    .select({ id: schema.processes.id })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  // Get recent downgrades (last 30 days) — these are global process-level
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentDowngrades = await db
    .select({
      processId: schema.trustChanges.processId,
      createdAt: schema.trustChanges.createdAt,
    })
    .from(schema.trustChanges)
    .where(eq(schema.trustChanges.actor, "system"));

  // Get latest activity per user
  const recentActivities = await db
    .select({
      entityId: schema.activities.entityId,
      createdAt: schema.activities.createdAt,
    })
    .from(schema.activities)
    .orderBy(desc(schema.activities.createdAt))
    .limit(500);

  // Get recent interactions per user for last-activity tracking
  const recentInteractions = await db
    .select({
      userId: schema.interactions.userId,
      createdAt: schema.interactions.createdAt,
    })
    .from(schema.interactions)
    .orderBy(desc(schema.interactions.createdAt))
    .limit(500);

  // Build per-user downgrade counts.
  // Trust changes are on processIds — link to users via interactions.processRunId → processRuns.processId.
  const userDowngradeCounts = new Map<string, number>();
  const downgradedProcessIds = new Set(
    recentDowngrades
      .filter((d) => d.createdAt >= thirtyDaysAgo)
      .map((d) => d.processId),
  );

  if (downgradedProcessIds.size > 0) {
    const linkedInteractions = await db
      .select({
        userId: schema.interactions.userId,
        processId: schema.processRuns.processId,
      })
      .from(schema.interactions)
      .innerJoin(
        schema.processRuns,
        eq(schema.interactions.processRunId, schema.processRuns.id),
      )
      .where(inArray(schema.processRuns.processId, [...downgradedProcessIds]));

    for (const row of linkedInteractions) {
      userDowngradeCounts.set(
        row.userId,
        (userDowngradeCounts.get(row.userId) || 0) + 1,
      );
    }
  }

  return users.map((user) => {
    // Find last interaction for this user
    const lastInteraction = recentInteractions.find((i) => i.userId === user.id);

    // Determine health based on per-user downgrades and pause status
    const userDowngradeCount = userDowngradeCounts.get(user.id) || 0;
    let health: "green" | "yellow" | "red" = "green";
    if (user.pausedAt) {
      health = "red";
    } else if (userDowngradeCount > 0) {
      health = "yellow";
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      processCount: allProcesses.length,
      lastActivity: lastInteraction?.createdAt?.toISOString() ?? null,
      health,
      pausedAt: user.pausedAt?.toISOString() ?? null,
      recentDowngrades: userDowngradeCount,
    };
  });
}

// ============================================================
// User Detail
// ============================================================

/**
 * Get detailed view of a specific user for admin.
 * Brief 108 AC2.
 */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const [user] = await db
    .select()
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  if (!user) return null;

  // Get all active processes (network service is centralized — processes are shared)
  const processes = await db
    .select({
      id: schema.processes.id,
      name: schema.processes.name,
      slug: schema.processes.slug,
      trustTier: schema.processes.trustTier,
      status: schema.processes.status,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  // Get recent 10 runs
  const recentRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      status: schema.processRuns.status,
      startedAt: schema.processRuns.startedAt,
      completedAt: schema.processRuns.completedAt,
    })
    .from(schema.processRuns)
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(10);

  // Map process names to runs
  const processMap = new Map(processes.map((p) => [p.id, p.name]));

  // Get quality metrics from feedback
  const allFeedback = await db
    .select({
      type: schema.feedback.type,
    })
    .from(schema.feedback);

  const totalRuns = allFeedback.length;
  const approvedRuns = allFeedback.filter((f) => f.type === "approve" || f.type === "auto_approve").length;
  const rejectedRuns = allFeedback.filter((f) => f.type === "reject").length;
  const editedRuns = allFeedback.filter((f) => f.type === "edit").length;

  // Get admin feedback for this user
  const feedbackEntries = await db
    .select()
    .from(schema.adminFeedback)
    .where(eq(schema.adminFeedback.userId, userId))
    .orderBy(desc(schema.adminFeedback.createdAt));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    businessContext: user.businessContext,
    pausedAt: user.pausedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      trustTier: p.trustTier,
      status: p.status,
    })),
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      processName: processMap.get(r.processId) ?? r.processId,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
    qualityMetrics: {
      totalRuns,
      approvedRuns,
      rejectedRuns,
      editedRuns,
      approvalRate: totalRuns > 0 ? approvedRuns / totalRuns : 0,
      editRate: totalRuns > 0 ? editedRuns / totalRuns : 0,
    },
    adminFeedback: feedbackEntries.map((f) => ({
      id: f.id,
      feedback: f.feedback,
      createdBy: f.createdBy,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

// ============================================================
// Pause / Resume
// ============================================================

/**
 * Pause all Alex-driven activity for a user.
 * Sets pausedAt timestamp on networkUsers.
 * Brief 108 AC3.
 */
export async function pauseUserProcesses(
  userId: string,
  adminId: string,
): Promise<void> {
  await db
    .update(schema.networkUsers)
    .set({ pausedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.networkUsers.id, userId));

  // Audit trail
  await db.insert(schema.activities).values({
    action: "admin.pause_user",
    description: `Admin paused Alex for user ${userId}`,
    actorType: "admin",
    actorId: adminId,
    entityType: "network_user",
    entityId: userId,
  });
}

/**
 * Resume Alex activity for a user.
 * Clears the pausedAt flag. Processes resume from where they paused.
 * Brief 108 AC4.
 */
export async function resumeUserProcesses(
  userId: string,
  adminId: string,
): Promise<void> {
  await db
    .update(schema.networkUsers)
    .set({ pausedAt: null, updatedAt: new Date() })
    .where(eq(schema.networkUsers.id, userId));

  // Audit trail
  await db.insert(schema.activities).values({
    action: "admin.resume_user",
    description: `Admin resumed Alex for user ${userId}`,
    actorType: "admin",
    actorId: adminId,
    entityType: "network_user",
    entityId: userId,
  });
}

// ============================================================
// Admin Feedback
// ============================================================

/**
 * Store admin feedback for a specific user.
 * Alex loads this as admin-scoped context when working with the user.
 * Brief 108 AC5.
 */
export async function addAdminFeedback(
  userId: string,
  feedback: string,
  adminId: string,
): Promise<string> {
  const [entry] = await db
    .insert(schema.adminFeedback)
    .values({
      userId,
      feedback,
      createdBy: adminId,
    })
    .returning({ id: schema.adminFeedback.id });

  // Audit trail
  await db.insert(schema.activities).values({
    action: "admin.add_feedback",
    description: `Admin added feedback for user ${userId}`,
    actorType: "admin",
    actorId: adminId,
    entityType: "network_user",
    entityId: userId,
    metadata: { feedbackId: entry.id },
  });

  return entry.id;
}

/**
 * Get admin feedback for a user (for context assembly).
 */
export async function getAdminFeedbackForUser(
  userId: string,
): Promise<Array<{ feedback: string; createdAt: Date }>> {
  return db
    .select({
      feedback: schema.adminFeedback.feedback,
      createdAt: schema.adminFeedback.createdAt,
    })
    .from(schema.adminFeedback)
    .where(eq(schema.adminFeedback.userId, userId))
    .orderBy(desc(schema.adminFeedback.createdAt));
}

// ============================================================
// Act as Alex
// ============================================================

/**
 * Send an email as Alex (admin composes, Alex's identity sends).
 * For edge cases: manual follow-up, relationship repair.
 * Brief 108 AC6.
 */
export async function sendAsAlex(params: {
  to: string;
  subject: string;
  body: string;
  personId: string;
  userId: string;
  adminId: string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendAndRecord({
    to: params.to,
    subject: params.subject,
    body: params.body,
    personaId: "alex",
    mode: "connecting",
    personId: params.personId,
    userId: params.userId,
  });

  // Audit trail — always log, even on failure
  await db.insert(schema.activities).values({
    action: "admin.act_as_alex",
    description: `Admin sent email as Alex to ${params.to}`,
    actorType: "admin",
    actorId: params.adminId,
    entityType: "network_user",
    entityId: params.userId,
    metadata: {
      to: params.to,
      subject: params.subject,
      success: result.success,
      interactionId: result.interactionId,
    },
  });

  return { success: result.success, error: result.error };
}

// ============================================================
// Pause Check Helper
// ============================================================

/**
 * Check if a user is paused. Used by pulse and heartbeat
 * to skip paused users before executing Alex-driven work.
 * Brief 108 AC3.
 */
export async function isUserPaused(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ pausedAt: schema.networkUsers.pausedAt })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  return user?.pausedAt != null;
}
