/**
 * Ditto — Workspace Push (Brief 154)
 *
 * Network agent API for pushing blocks into workspace views,
 * refreshing views, and registering new adaptive compositions.
 *
 * All functions use emitNetworkEvent() — no changes to SSE infrastructure.
 *
 * Provenance: Brief 154 (Adaptive Workspace Views), Supabase Realtime pattern.
 */

import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { emitNetworkEvent } from "./network-events";
import type { ContentBlock } from "./content-blocks";

// ============================================================
// Rate limiting — max 20 push events per minute per user
// ============================================================

const pushCounts = new Map<string, { count: number; windowStart: number }>();
const MAX_PUSHES_PER_MINUTE = 20;
const WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = pushCounts.get(userId);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    pushCounts.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_PUSHES_PER_MINUTE) {
    console.warn(`[workspace-push] Rate limit exceeded for user ${userId.slice(0, 8)}: ${entry.count}/${MAX_PUSHES_PER_MINUTE} in window`);
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================
// Push blocks to workspace view
// ============================================================

/**
 * Push blocks into an adaptive workspace view via SSE.
 * Requires stepRunId (Insight-180 invocation guard).
 *
 * @param mode - "append" adds blocks, "replace" replaces all blocks
 */
export function pushBlocksToWorkspace(
  userId: string,
  viewSlug: string,
  blocks: ContentBlock[],
  mode: "append" | "replace",
  stepRunId?: string,
): number | null {
  // Insight-180: stepRunId guard
  if (!stepRunId && !process.env.DITTO_TEST_MODE) {
    console.warn("[workspace-push] pushBlocksToWorkspace called without stepRunId — rejected");
    return null;
  }

  if (!checkRateLimit(userId)) return null;

  return emitNetworkEvent(userId, "workspace_blocks_push", {
    viewSlug,
    blocks,
    mode,
  });
}

// ============================================================
// Refresh workspace view
// ============================================================

/**
 * Emit a refresh event for a workspace view. The client will
 * invalidate its React Query cache and re-evaluate the composition.
 */
export function refreshWorkspaceView(
  userId: string,
  viewSlug: string,
): number | null {
  if (!checkRateLimit(userId)) return null;

  return emitNetworkEvent(userId, "workspace_view_refresh", {
    viewSlug,
  });
}

// ============================================================
// Register workspace view
// ============================================================

/**
 * Register a new adaptive workspace view.
 * Validates the schema, inserts the DB record, and emits an SSE event
 * so the sidebar updates without page reload.
 * Requires stepRunId (Insight-180 invocation guard).
 */
export async function registerWorkspaceView(
  userId: string,
  workspaceId: string,
  params: {
    slug: string;
    label: string;
    icon?: string;
    description?: string;
    schema: Record<string, unknown>;
    sourceProcessId?: string;
  },
  stepRunId?: string,
): Promise<{ success: boolean; error?: string; viewId?: string }> {
  // Insight-180: stepRunId guard
  if (!stepRunId && !process.env.DITTO_TEST_MODE) {
    console.warn("[workspace-push] registerWorkspaceView called without stepRunId — rejected");
    return { success: false, error: "stepRunId required (Insight-180)" };
  }

  // Validate schema (dynamic import to avoid circular deps with web package)
  // Schema validation is done inline here since we can't import web package code
  const s = params.schema as { version?: number; blocks?: unknown[] };
  if (s.version !== 1 || !Array.isArray(s.blocks) || s.blocks.length === 0) {
    return { success: false, error: "Invalid composition schema: must have version 1 and non-empty blocks array" };
  }

  // Reserved slug check
  const reserved = new Set(["today", "inbox", "work", "projects", "growth", "library", "routines", "roadmap", "settings"]);
  if (reserved.has(params.slug)) {
    return { success: false, error: `"${params.slug}" is a reserved slug` };
  }

  // Check for existing
  const [existing] = await db
    .select({ id: schema.workspaceViews.id })
    .from(schema.workspaceViews)
    .where(
      and(
        eq(schema.workspaceViews.workspaceId, workspaceId),
        eq(schema.workspaceViews.slug, params.slug),
      ),
    )
    .limit(1);

  if (existing) {
    return { success: false, error: `View with slug "${params.slug}" already exists` };
  }

  // Get next position
  const allViews = await db
    .select({ position: schema.workspaceViews.position })
    .from(schema.workspaceViews)
    .where(eq(schema.workspaceViews.workspaceId, workspaceId));
  const nextPosition = allViews.length > 0
    ? Math.max(...allViews.map((v) => v.position)) + 1
    : 0;

  // Insert
  const [view] = await db
    .insert(schema.workspaceViews)
    .values({
      workspaceId,
      slug: params.slug,
      label: params.label,
      icon: params.icon ?? null,
      description: params.description ?? null,
      schema: params.schema,
      sourceProcessId: params.sourceProcessId ?? null,
      position: nextPosition,
    })
    .returning({ id: schema.workspaceViews.id });

  // Emit SSE event so sidebar updates live
  emitNetworkEvent(userId, "workspace_view_registered", {
    slug: params.slug,
    label: params.label,
  });

  return { success: true, viewId: view.id };
}

// ============================================================
// Testing helpers
// ============================================================

export function _resetRateLimitsForTesting(): void {
  pushCounts.clear();
}
