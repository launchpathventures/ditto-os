/**
 * Ditto Web — Feed Item Types
 *
 * Discriminated union for the 6 feed item types.
 * Used by feed-assembler (engine), API route, and React components.
 *
 * Provenance: Brief 041 (Feed & Review). Item types from UX spec sections 1.2-1.4.
 */

// ============================================================
// Priority levels (ordering)
// ============================================================

export type FeedPriority = "action" | "informational" | "historical";

/** Priority sort order: action-required first, then informational, then historical */
export const PRIORITY_ORDER: Record<FeedPriority, number> = {
  action: 0,
  informational: 1,
  historical: 2,
};

// ============================================================
// Confidence indicator
// ============================================================

export type ConfidenceLevel = "high" | "medium" | "low";

// ============================================================
// Feed item types (discriminated union)
// ============================================================

/** Type 1: Shift report — narrative daily briefing */
export interface ShiftReportItem {
  itemType: "shift-report";
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
  data: {
    summary: string;
    details?: string;
    stats?: {
      reviewsPending: number;
      runsCompleted: number;
      exceptionsActive: number;
    };
  };
}

/** Type 2: Review card — inline approve/edit/reject */
export interface ReviewItem {
  itemType: "review";
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
  data: {
    processRunId: string;
    processName: string;
    stepName: string;
    outputText: string;
    confidence: ConfidenceLevel | null;
    flags?: string[];
  };
}

/** Type 3: Work update — progress notification */
export interface WorkUpdateItem {
  itemType: "work-update";
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
  data: {
    processName: string;
    processRunId: string;
    status: string;
    summary: string;
    detail?: string;
    stepsExecuted?: number;
  };
}

/** Type 4: Exception — warning/error requiring attention */
export interface ExceptionItem {
  itemType: "exception";
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
  data: {
    processName: string;
    processRunId: string;
    stepId: string;
    errorMessage: string;
    explanation: string;
  };
}

/** Type 5: Insight — pattern detection / "Teach this" prompt */
export interface InsightItem {
  itemType: "insight";
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
  data: {
    processId: string;
    processName: string;
    pattern: string;
    count: number;
    evidence: string;
  };
}

/** Type 6: Process output — rendered output card */
export interface ProcessOutputItem {
  itemType: "process-output";
  id: string;
  priority: FeedPriority;
  timestamp: string;
  entityId?: string;
  entityLabel?: string;
  data: {
    processName: string;
    processRunId: string;
    outputName: string;
    outputType: string;
    summary: string;
    content: unknown;
    /** Content blocks for structured rendering (Brief 045) */
    blocks?: import("../../../src/engine/content-blocks").ContentBlock[];
  };
}

/** The discriminated union */
export type FeedItem =
  | ShiftReportItem
  | ReviewItem
  | WorkUpdateItem
  | ExceptionItem
  | InsightItem
  | ProcessOutputItem;

// ============================================================
// Feed response shape
// ============================================================

export interface FeedResponse {
  items: FeedItem[];
  /** ISO timestamp of when the feed was assembled */
  assembledAt: string;
}

// ============================================================
// Entity group (for grouping by work item)
// ============================================================

export interface EntityGroup {
  entityId: string;
  entityLabel: string;
  items: FeedItem[];
}
