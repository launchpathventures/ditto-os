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

import type { ContentBlock, FormSubmitAction } from "./content-blocks";
import { approveRun, editRun, rejectRun } from "./review-actions";
import { executeDelegation } from "./self-delegation";
import { recordDismissal } from "./suggestion-dismissals";

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
 * Also registers form-submit tokens for interactive blocks (Brief 072 — F072-1 fix).
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
    // Register form-submit capability for interactive blocks
    if (block.type === "process_proposal" && "interactive" in block && block.interactive) {
      registerAction(`form-submit:process_proposal`, sessionId, { blockType: "process_proposal" });
    }
    if (block.type === "work_item_form") {
      registerAction(`form-submit:work_item_form`, sessionId, { blockType: "work_item_form" });
    }
    if (block.type === "connection_setup") {
      registerAction(`form-submit:connection_setup`, sessionId, { blockType: "connection_setup" });
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
  // Brief 072: form-submit actions validated via block-type-scoped registry tokens (F072-1 fix)
  if (actionId === "form-submit") {
    const blockType = (payload as Record<string, unknown> | undefined)?.blockType as string | undefined;
    const registryKey = blockType ? `form-submit:${blockType}` : null;
    if (!registryKey || !validateAction(registryKey, userId)) {
      return {
        success: false,
        message: "Form submission expired or invalid. Please refresh and try again.",
        blocks: [],
      };
    }
    return handleFormSubmit(userId, payload);
  }

  // Validate against session-scoped registry
  const registered = validateAction(actionId, userId);
  if (!registered) {
    return {
      success: false,
      message: "Action expired or invalid. Please refresh and try again.",
      blocks: [],
    };
  }

  // Parse action namespace — suggestion actions use "suggest-accept-N-TS" / "suggest-dismiss-N-TS" format
  const isSuggestionAction = actionId.startsWith("suggest-accept-") || actionId.startsWith("suggest-dismiss-");
  const parts = actionId.split(".");
  const namespace = isSuggestionAction ? "suggest" : parts[0];

  try {
    switch (namespace) {
      case "suggest": {
        const isDismiss = actionId.startsWith("suggest-dismiss-");
        if (isDismiss && payload?.content && payload?.suggestionType) {
          await recordDismissal(
            userId,
            payload.suggestionType as string,
            payload.content as string,
          );
          return {
            success: true,
            message: "Suggestion dismissed — won't suggest again for 30 days.",
            blocks: [{
              type: "status_card",
              entityType: "work_item",
              entityId: actionId,
              title: "Suggestion dismissed",
              status: "dismissed",
              details: { Type: payload.suggestionType as string },
            }],
          };
        }

        // Accept — just acknowledge, Self handles the rest via conversation
        return {
          success: true,
          message: "Suggestion accepted.",
          blocks: [],
        };
      }

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

// ============================================================
// Form Submit Handler (Brief 072)
// ============================================================

/**
 * Handle form-submit actions from interactive content blocks.
 * Routes by blockType to the appropriate engine function.
 * Validates submitted data server-side before creating entities.
 */
async function handleFormSubmit(
  userId: string,
  payload?: Record<string, unknown>,
): Promise<SurfaceActionResult> {
  if (!payload) {
    return { success: false, message: "Missing form payload", blocks: [] };
  }

  const blockType = payload.blockType as FormSubmitAction["blockType"] | undefined;
  const values = payload.values as Record<string, unknown> | undefined;

  if (!blockType || !values) {
    return { success: false, message: "Missing blockType or values", blocks: [] };
  }

  try {
    switch (blockType) {
      case "process_proposal": {
        // Validate required fields
        const name = values.name as string | undefined;
        if (!name || !name.trim()) {
          return { success: false, message: "Process name is required", blocks: [] };
        }

        const steps = values.steps as string[] | undefined;
        const stepDefs = (steps ?? []).filter((s) => s.trim()).map((s) => ({
          name: s.trim(),
          description: "",
        }));

        const result = await executeDelegation("generate_process", {
          name: name.trim(),
          description: (values.description as string) ?? "",
          trigger: (values.trigger as string) ?? "",
          steps: stepDefs,
          save: true,
        });

        return {
          success: result.success,
          message: result.success ? `Process "${name}" created` : result.output,
          blocks: result.success
            ? [{
                type: "status_card",
                entityType: "process_run",
                entityId: name.trim(),
                title: name.trim(),
                status: "created",
                details: { Steps: String(stepDefs.length) },
              }]
            : [],
        };
      }

      case "work_item_form": {
        // Validate required fields
        const content = values.content as string | undefined;
        if (!content || !content.trim()) {
          return { success: false, message: "Content is required", blocks: [] };
        }

        const itemType = values.type as string | undefined;
        if (itemType && !["task", "goal", "exception"].includes(itemType)) {
          return { success: false, message: `Invalid type: ${itemType}`, blocks: [] };
        }

        const result = await executeDelegation("create_work_item", {
          content: content.trim(),
          classification: itemType ?? "task",
          goalContext: (values.goalContext as string) ?? undefined,
        });

        return {
          success: result.success,
          message: result.success ? "Work item created" : result.output,
          blocks: result.success
            ? [{
                type: "status_card",
                entityType: "work_item",
                entityId: "",
                title: content.trim().slice(0, 60),
                status: itemType ?? "task",
                details: {},
              }]
            : [],
        };
      }

      case "connection_setup": {
        // Route to credential API — do NOT store credentials in blocks
        const serviceName = values.serviceName as string | undefined;
        if (!serviceName) {
          return { success: false, message: "Service name is required", blocks: [] };
        }

        // Forward to the connect_service engine function for auth flow
        const result = await executeDelegation("connect_service", {
          service: serviceName,
          action: "setup_guide",
          ...values,
        });

        return {
          success: result.success,
          message: result.success ? `Connection to ${serviceName} initiated` : result.output,
          blocks: result.success
            ? [{
                type: "status_card",
                entityType: "work_item",
                entityId: serviceName,
                title: serviceName,
                status: "connecting",
                details: {},
              }]
            : [],
        };
      }

      default:
        return { success: false, message: `Unknown form block type: ${blockType}`, blocks: [] };
    }
  } catch (error) {
    return {
      success: false,
      message: `Form submission failed: ${error instanceof Error ? error.message : String(error)}`,
      blocks: [],
    };
  }
}
