/**
 * Ditto — Tool-Result → Panel Transition Map
 *
 * Single source of truth for mapping Self tool names to right panel context.
 * When the Self calls a tool, the workspace scans for completed tool-invocation
 * parts and resolves them through this map to determine panel state.
 *
 * Phase 11 migration: replace this file with `context-shift` protocol events.
 *
 * AC5: Single constant map (TRANSITION_TOOL_MAP).
 * Provenance: Brief 046, credential-request pattern (extend).
 */

import type { PanelContext } from "@/components/layout/right-panel";

/**
 * A transition factory receives the tool result and returns a PanelContext
 * (or null if the result doesn't warrant a transition).
 */
type TransitionFactory = (result: unknown) => PanelContext | null;

/**
 * Map of tool names → panel context factories.
 *
 * generate_process(save=false) → process-builder (show emerging YAML)
 * generate_process(save=true)  → process (navigate to saved process)
 * get_process_detail            → process (show process trust context)
 * get_briefing                  → briefing (show briefing data in right panel)
 */
const TRANSITION_TOOL_MAP: Record<string, TransitionFactory> = {
  generate_process: (result) => {
    const r = result as { saved?: boolean; yaml?: string; slug?: string; processId?: string } | null;
    if (!r) return null;

    if (r.saved) {
      // Process was saved — navigate to process detail
      return r.processId
        ? { type: "process", processId: r.processId }
        : null;
    }

    // Preview mode — show Process Builder with YAML
    if (r.yaml) {
      return { type: "process-builder", yaml: r.yaml, slug: r.slug };
    }

    return null;
  },

  get_process_detail: (result) => {
    const r = result as { processId?: string } | null;
    if (!r?.processId) return null;
    return { type: "process", processId: r.processId };
  },

  get_briefing: (result) => {
    const r = result as Record<string, unknown> | null;
    if (!r) return null;
    return { type: "briefing", data: r };
  },
};

/**
 * Resolve a tool result to a panel context transition.
 * Returns null if the tool doesn't trigger a panel change.
 */
export function resolveTransition(
  toolName: string,
  result: unknown,
): PanelContext | null {
  const factory = TRANSITION_TOOL_MAP[toolName];
  if (!factory) return null;
  return factory(result);
}

/**
 * Check if a tool result represents a saved process (for entry-point auto-switch).
 */
export function isProcessSaved(toolName: string, result: unknown): boolean {
  if (toolName !== "generate_process") return false;
  const r = result as { saved?: boolean } | null;
  return !!r?.saved;
}
