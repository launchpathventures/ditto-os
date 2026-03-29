/**
 * Ditto — Composition Engine Types
 *
 * Core types for the composition engine: intents, context, and results.
 * Navigation destinations map to composition intents, not pages.
 *
 * Provenance: ADR-024 (Composable Workspace Architecture), Brief 047.
 */

import type { ContentBlock } from "@/lib/engine";
import type { ProcessSummary, WorkItemSummary } from "@/lib/process-query";
import type { FeedItem } from "@/lib/feed-types";

// ============================================================
// Composition intents — what the user wants to focus on
// ============================================================

/**
 * Navigation destinations that trigger composition.
 * Settings is excluded — it's scaffold, not canvas (ADR-024 Constraint 3).
 */
export type CompositionIntent =
  | "today"
  | "inbox"
  | "work"
  | "projects"
  | "routines";

// ============================================================
// Composition context — data available to composition functions
// ============================================================

/**
 * All data a composition function might need.
 * Assembled from React Query cache — synchronous access to already-fetched data.
 */
export interface CompositionContext {
  /** Active (non-system) processes */
  processes: ProcessSummary[];
  /** Active work items */
  workItems: WorkItemSummary[];
  /** Feed items (shift reports, reviews, exceptions, etc.) */
  feedItems: FeedItem[];
  /** Pending reviews (subset of feed items with itemType "review") */
  pendingReviews: FeedItem[];
  /** User model summary — populated when user model is available (Phase 11+) */
  userModelSummary?: Record<string, unknown>;
  /** Current risk signals — populated when risk detector is wired (Phase 11+) */
  currentRisks?: Array<{ type: string; description: string; severity: "low" | "medium" | "high" }>;
  /** Current time for narrative generation */
  now: Date;
}

// ============================================================
// Composition result
// ============================================================

export interface CompositionResult {
  /** The composed blocks for the centre canvas */
  blocks: ContentBlock[];
  /** Right panel context hint for this composition */
  panelHint?: "feed" | "empty";
}

// ============================================================
// Composition function signature
// ============================================================

/**
 * A composition function: pure, synchronous, no LLM calls.
 * Takes context, returns ContentBlock[].
 */
export type CompositionFunction = (context: CompositionContext) => ContentBlock[];
