/**
 * @ditto/core/work-items — brief-equivalent types (Brief 223)
 *
 * Pure TypeScript types for the brief-equivalent layer that coexists with
 * the existing intake/routing layer on the `work_items` table. Project-
 * flavored work items (rows where `projectId` is non-null) populate
 * `briefState`, `title`, `body`, `riskScore`, `confidence`, `modelAssignment`,
 * `linkedCaptureId`, `linkedProcessRunId`, `stateChangedAt`. Non-project items
 * (legacy intake) populate `content` + `status`.
 *
 * The two state machines coexist semantically partitioned by `projectId` via
 * a DB-level CHECK constraint (see schema.ts).
 */

import {
  type BriefState,
  type WorkItemType,
  type RunnerKindValue,
} from "../db/schema.js";

export type { BriefState };

/** Brief-equivalent input for `POST /api/v1/projects/:id/work-items` (downstream). */
export interface WorkItemBriefInput {
  projectId: string;
  type: WorkItemType;
  title: string;
  body: string;
  briefState?: BriefState;
  riskScore?: number | null;
  confidence?: number | null;
  modelAssignment?: string | null;
  linkedCaptureId?: string | null;
}

/** Brief-equivalent payload for `POST /api/v1/work-items/:id/status` (the runner webhook). */
export interface WorkItemStatusUpdate {
  state: BriefState;
  prUrl?: string;
  error?: string;
  notes?: string;
  /** Insight-180 step-run guard. NULL allowed under bounded waiver. */
  stepRunId?: string;
  /** When provided, the webhook bridges the Brief 215 dispatch lifecycle. */
  runnerKind?: RunnerKindValue;
  externalRunId?: string;
  /** Optional: the runner's process_runs.id when it kicked off a process. */
  linkedProcessRunId?: string;
}
