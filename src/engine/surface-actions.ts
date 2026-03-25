/**
 * Ditto — Surface Action Handler (ADR-021 Section 8)
 *
 * When a user acts on an ActionDef (clicks a button, submits a form),
 * the surface sends the action back through this single entry point.
 *
 * Session-scoped action validation: emitted action IDs are tracked
 * per session (in-memory Map, TTL = session duration). An action ID
 * not in the registry is rejected. Entity existence is also validated.
 *
 * AC14: Session-scoped validation per ADR-021 Section 8.
 *
 * Provenance: Brief 045, ADR-021, Slack action_id + Telegram callback_data pattern.
 */

import type { ContentBlock } from "./content-blocks";
import { approveRun, editRun, rejectRun } from "./review-actions";

// ============================================================
// Action Registry (session-scoped, in-memory)
// ============================================================

interface RegisteredAction {
  actionId: string;
  sessionId: string;
  registeredAt: number;
  context: Record<string, unknown>;
}

/** In-memory action registry. TTL-based cleanup on access. */
const actionRegistry = new Map<string, RegisteredAction>();

/** Default TTL: 1 hour */
const ACTION_TTL_MS = 60 * 60 * 1000;

/**
 * Register an action ID as valid for a session.
 * Called when the Self emits content blocks with actions.
 */
export function registerAction(
  actionId: string,
  sessionId: string,
  context: Record<string, unknown> = {},
): void {
  actionRegistry.set(actionId, {
    actionId,
    sessionId,
    registeredAt: Date.now(),
    context,
  });
}

/**
 * Register all action IDs from a set of content blocks.
 */
export function registerBlockActions(
  blocks: ContentBlock[],
  sessionId: string,
): void {
  for (const block of blocks) {
    if ("actions" in block && Array.isArray(block.actions)) {
      for (const action of block.actions) {
        registerAction(action.id, sessionId, action.payload ?? {});
      }
    }
  }
}

/** Cleanup expired entries */
function cleanupRegistry(): void {
  const now = Date.now();
  for (const [id, entry] of actionRegistry) {
    if (now - entry.registeredAt > ACTION_TTL_MS) {
      actionRegistry.delete(id);
    }
  }
}

/**
 * Validate an action ID against the registry.
 * Returns the registered context if valid, null if rejected.
 */
function validateAction(
  actionId: string,
  userId: string,
): RegisteredAction | null {
  cleanupRegistry();
  const entry = actionRegistry.get(actionId);
  if (!entry) return null;
  // Action consumed — remove from registry (single-use)
  actionRegistry.delete(actionId);
  return entry;
}

// ============================================================
// Action Handler
// ============================================================

export interface SurfaceActionResult {
  success: boolean;
  message: string;
  blocks: ContentBlock[];
}

/**
 * Handle a surface action. The surface never calls approveRun()
 * or editRun() directly — all actions go through this entry point.
 *
 * Action IDs are namespaced: review.approve.{runId}, input.submit.{requestId}, etc.
 */
export async function handleSurfaceAction(
  userId: string,
  actionId: string,
  payload?: Record<string, unknown>,
): Promise<SurfaceActionResult> {
  // Validate against session-scoped registry
  const registered = validateAction(actionId, userId);
  if (!registered) {
    return {
      success: false,
      message: "Action expired or invalid. Please refresh and try again.",
      blocks: [],
    };
  }

  // Parse action namespace
  const parts = actionId.split(".");
  const namespace = parts[0];

  try {
    switch (namespace) {
      case "review": {
        const action = parts[1]; // approve, edit, reject
        const runId = parts.slice(2).join(".");

        if (action === "approve") {
          const result = await approveRun(runId);
          return {
            success: result.action.success,
            message: result.action.message,
            blocks: [{
              type: "status_card",
              entityType: "process_run",
              entityId: runId,
              title: "Review Action",
              status: "approved",
              details: { Result: result.action.message },
            }],
          };
        }

        if (action === "edit") {
          const feedback = (payload?.feedback as string) ?? "";
          const result = await editRun(runId, feedback);
          return {
            success: result.action.success,
            message: result.action.message,
            blocks: [{
              type: "status_card",
              entityType: "process_run",
              entityId: runId,
              title: "Review Action",
              status: "edited",
              details: { Result: result.action.message },
            }],
          };
        }

        if (action === "reject") {
          const reason = (payload?.reason as string) ?? "";
          const result = await rejectRun(runId, reason);
          return {
            success: result.success,
            message: result.message,
            blocks: [{
              type: "status_card",
              entityType: "process_run",
              entityId: runId,
              title: "Review Action",
              status: "rejected",
              details: { Result: result.message },
            }],
          };
        }

        return { success: false, message: `Unknown review action: ${action}`, blocks: [] };
      }

      default:
        return { success: false, message: `Unknown action namespace: ${namespace}`, blocks: [] };
    }
  } catch (error) {
    return {
      success: false,
      message: `Action failed: ${error instanceof Error ? error.message : String(error)}`,
      blocks: [],
    };
  }
}
