/**
 * Ditto — Tool-Result → Transition Map
 *
 * Single source of truth for mapping Self tool names to workspace transitions.
 * Returns a discriminated union: panel overrides OR center view changes (AC7).
 *
 * Panel transitions → right panel content change (existing behavior)
 * Center transitions → CenterView change (artifact mode — Brief 048)
 *
 * Phase 11 migration: replace this file with `context-shift` protocol events.
 *
 * Provenance: Brief 046 (panel transitions), Brief 048 (center transitions).
 */

import type { PanelContext } from "@/components/layout/right-panel";
import type { ArtifactType } from "@/components/layout/artifact-layout";

// ============================================================
// CenterView type for artifact mode (mirrored from workspace.tsx)
// Kept here to avoid circular imports — workspace.tsx imports this file.
// ============================================================

export type ArtifactCenterView = {
  type: "artifact";
  artifactType: ArtifactType;
  artifactId: string;
  processId: string;
  runId?: string;
};

// ============================================================
// Discriminated union return type (AC7)
// ============================================================

export type TransitionResult =
  | { target: "panel"; context: PanelContext }
  | { target: "center"; view: ArtifactCenterView }
  | null;

/**
 * A transition factory receives the tool result and returns a TransitionResult.
 */
type TransitionFactory = (result: unknown) => TransitionResult;

/**
 * Map of tool names → transition factories.
 *
 * generate_process(save=false) → panel: process-builder (show emerging YAML)
 * generate_process(save=true)  → panel: process (navigate to saved process)
 * get_process_detail            → panel: process (show process trust context)
 * get_briefing                  → panel: briefing (show briefing data in right panel)
 * generate_document             → center: artifact mode (document viewer)
 * generate_artifact             → center: artifact mode (type from result)
 */
const TRANSITION_TOOL_MAP: Record<string, TransitionFactory> = {
  generate_process: (result) => {
    const r = result as { saved?: boolean; yaml?: string; slug?: string; processId?: string } | null;
    if (!r) return null;

    if (r.saved) {
      return r.processId
        ? { target: "panel", context: { type: "process", processId: r.processId } }
        : null;
    }

    if (r.yaml) {
      return { target: "panel", context: { type: "process-builder", yaml: r.yaml, slug: r.slug } };
    }

    return null;
  },

  get_process_detail: (result) => {
    const r = result as { processId?: string } | null;
    if (!r?.processId) return null;
    return { target: "panel", context: { type: "process", processId: r.processId } };
  },

  get_briefing: (result) => {
    const r = result as Record<string, unknown> | null;
    if (!r) return null;
    return { target: "panel", context: { type: "briefing", data: r } };
  },

  // Artifact-producing tools — trigger center view transition to artifact mode
  generate_document: (result) => {
    const r = result as { artifactId?: string; processId?: string; runId?: string } | null;
    if (!r?.artifactId || !r?.processId) return null;
    return {
      target: "center",
      view: {
        type: "artifact",
        artifactType: "document",
        artifactId: r.artifactId,
        processId: r.processId,
        runId: r.runId,
      },
    };
  },

  // Brief 053: Pipeline trigger → show process run detail in right panel
  start_pipeline: (result) => {
    const r = result as {
      result?: string;
      metadata?: { runId?: string; processSlug?: string };
    } | null;
    if (!r?.metadata?.runId) return null;
    return {
      target: "panel",
      context: {
        type: "process_run",
        runId: r.metadata.runId,
        processSlug: r.metadata.processSlug ?? "dev-pipeline",
      },
    };
  },

  // Dev pipeline role outputs — >500 chars triggers artifact mode (Brief 050)
  start_dev_role: (result) => {
    // Tool output from AI SDK v6 has shape { result, blocks, metadata }
    const r = result as {
      result?: string;
      blocks?: unknown[];
      metadata?: { runId?: string; processSlug?: string; role?: string };
    } | null;
    if (!r?.result) return null;
    // Only promote substantial outputs to artifact mode
    if (r.result.length <= 500) return null;
    const runId = r.metadata?.runId;
    if (!runId) return null;
    return {
      target: "center",
      view: {
        type: "artifact",
        artifactType: "document",
        artifactId: runId,
        processId: r.metadata?.processSlug ?? "dev-pipeline",
        runId,
      },
    };
  },

  generate_artifact: (result) => {
    const r = result as {
      artifactId?: string;
      artifactType?: ArtifactType;
      processId?: string;
      runId?: string;
    } | null;
    if (!r?.artifactId || !r?.processId) return null;
    return {
      target: "center",
      view: {
        type: "artifact",
        artifactType: r.artifactType ?? "document",
        artifactId: r.artifactId,
        processId: r.processId,
        runId: r.runId,
      },
    };
  },
};

/**
 * Resolve a tool result to a transition.
 * Returns a discriminated union: panel override, center view change, or null.
 */
export function resolveTransition(
  toolName: string,
  result: unknown,
): TransitionResult {
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
