/**
 * Ditto — Composition Engine Router
 *
 * Maps composition intents to composition functions.
 * Each navigation destination triggers a composition function that
 * returns ContentBlock[], rendered by the block registry.
 *
 * ADR-024: Navigation destinations are composition intents, not pages.
 * Phase 11+ migration: these functions become fallbacks when the Self
 * drives composition.
 *
 * Provenance: Brief 047, ADR-024.
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionIntent, CompositionContext } from "./types";
import { getMustShowBlocks } from "./must-show";
import { composeToday } from "./today";
import { composeInbox } from "./inbox";
import { composeWork } from "./work";
import { composeProjects } from "./projects";
import { composeRoutines } from "./routines";

export type { CompositionIntent, CompositionContext } from "./types";

/**
 * Registry of composition functions per intent.
 */
const COMPOSITION_FUNCTIONS: Record<
  CompositionIntent,
  (context: CompositionContext) => ContentBlock[]
> = {
  today: composeToday,
  inbox: composeInbox,
  work: composeWork,
  projects: composeProjects,
  routines: composeRoutines,
};

/**
 * Compose blocks for a given navigation intent.
 *
 * Must-show blocks (critical alerts, trust gate reviews) are
 * prepended to any composition — they cannot be suppressed.
 *
 * If the composition function throws, a fallback composition is returned.
 *
 * @returns ContentBlock[] ready for block registry rendering
 */
export function compose(
  intent: CompositionIntent,
  context: CompositionContext,
): ContentBlock[] {
  // Must-show blocks always appear first (ADR-024 Constraint 5)
  const mustShow = getMustShowBlocks(context);

  try {
    const compositionFn = COMPOSITION_FUNCTIONS[intent];
    const blocks = compositionFn(context);

    if (blocks.length === 0 && mustShow.length === 0) {
      // Empty composition — return helpful fallback
      return [
        {
          type: "text",
          text: "Nothing to show here yet. Try asking me directly.",
        },
      ];
    }

    return [...mustShow, ...blocks];
  } catch {
    // Fallback composition on error (AC12)
    return [
      ...mustShow,
      {
        type: "text",
        text: "I'm having trouble loading this view. Try asking me directly.",
      },
    ];
  }
}
