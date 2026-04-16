/**
 * Ditto — Composition Engine Types
 *
 * Core types for the composition engine: intents, context, and results.
 * Navigation destinations map to composition intents, not pages.
 *
 * Provenance: original (ADR-024 Composable Workspace Architecture).
 */

import type { ContentBlock } from "@/lib/engine";
import type { ProcessSummary, WorkItemSummary } from "@/lib/process-query";
import type { FeedItem } from "@/lib/feed-types";

// ============================================================
// Active run summary (Brief 053)
// ============================================================

export interface ActiveRunSummary {
  runId: string;
  processSlug: string;
  processName: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  status: string;
  startedAt: string;
}

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
  | "growth"
  | "library"
  | "routines"
  | "roadmap";

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
  /** Active pipeline runs with progress (Brief 053) */
  activeRuns: ActiveRunSummary[];
  /** User model summary — populated when user model is available (Phase 11+) */
  userModelSummary?: Record<string, unknown>;
  /** Current risk signals — populated when risk detector is wired (Phase 11+) */
  currentRisks?: Array<{ type: string; description: string; severity: "low" | "medium" | "high" }>;
  /** Roadmap data — lazily loaded when roadmap intent is active (Brief 055) */
  roadmap?: RoadmapData;
  /** Growth plan data — lazily loaded when growth intent is active (Brief 140) */
  growthPlans?: GrowthPlanSummary[];
  /** Process capabilities — lazily loaded when library intent is active */
  capabilities?: ProcessCapability[];
  /** Recommended capabilities from capability matcher (score > 0.5, max 3) */
  recommended?: ProcessCapability[];
  /** Current time for narrative generation */
  now: Date;
}

// ============================================================
// Growth plan summary (Brief 140) — assembled server-side from GTM pipeline runs
// ============================================================

export interface GrowthExperiment {
  track: "credibility" | "pain-naming" | "outreach" | string;
  description: string;
  verdict?: "kill" | "continue" | "graduate" | string;
}

export interface PublishedContent {
  platform: string;
  postId?: string;
  postUrl?: string;
  publishedAt?: string;
  content?: string;
}

export interface GrowthPlanSummary {
  planName: string;
  runId: string;
  processSlug: string;
  status: string;
  currentStep: string;
  cycleNumber: number;
  startedAt: string;
  gtmContext: {
    audience?: string;
    channels?: string[];
    goals?: string[];
  };
  experiments: GrowthExperiment[];
  publishedContent: PublishedContent[];
  lastBrief?: string;
}

// ============================================================
// Process capability (Library view) — assembled from templates + cycles
// ============================================================

export interface ProcessCapability {
  /** Template slug (e.g., "gtm-pipeline") */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Plain-language description of what Alex does */
  description: string;
  /** Business function category */
  category: "growth" | "sales" | "relationships" | "operations" | "admin";
  /** Whether this is a continuous cycle or a one-shot template */
  type: "cycle" | "template";
  /** Whether this capability is currently active (has a running instance) */
  active: boolean;
  /** Number of active instances (for multi-plan types like GTM) */
  activeCount: number;
  /** The operator (who runs it) */
  operator?: string;
  /** Relevance score from capability matcher (0-1), present when user model exists */
  relevanceScore?: number;
  /** Match reason using user's own words, present when relevanceScore > 0 */
  matchReason?: string;
}

// ============================================================
// Roadmap data (Brief 055) — mirrored from src/engine/brief-index.ts
// (re-export via relative path outside the web package breaks Next.js build)
// ============================================================

export interface BriefSummary {
  number: number;
  name: string;
  status: "draft" | "ready" | "in-progress" | "complete";
  dependsOn: string;
  unlocks: string;
  date: string;
  filePath: string;
}

export interface Phase {
  number: number;
  name: string;
  status: "done" | "in-progress" | "not-started";
  briefCount: number;
  completedBriefCount: number;
}

export interface RoadmapData {
  phases: Phase[];
  briefs: BriefSummary[];
  stats: {
    total: number;
    ready: number;
    inProgress: number;
    complete: number;
    draft: number;
  };
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
