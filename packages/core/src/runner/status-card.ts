/**
 * Runner-Dispatch StatusCardBlock builder — Brief 221 §D6 + §D12.
 *
 * Pure function. Given the runner-dispatch state observed at this transition,
 * returns a `StatusCardBlock` carrying typed metadata so the conversation
 * surface renders the runner-specific template. Metadata-first per Insight-138.
 *
 * The `metadata.cardKind = "runnerDispatch"` discriminator drives the
 * web-side renderer's dispatch table (D6) — adding future subtypes (Brief 220
 * deploy-status etc.) registers a new cardKind, no cascading-if branches.
 *
 * Engine-core boundary: imports only ContentBlock types + RunnerKind/Mode +
 * RunnerDispatchStatus from this package. No Ditto opinions.
 */

import type { StatusCardBlock } from "../content-blocks.js";
import type {
  RunnerKind,
  RunnerMode,
  RunnerDispatchStatus,
} from "./kinds.js";

/**
 * The `cardKind` discriminator that marks this StatusCardBlock as the
 * runner-dispatch subtype. Brief 220 / Brief 229 / future subtypes register
 * different values; the renderer dispatches via a `Record<string, RendererFn>`.
 */
export const RUNNER_DISPATCH_CARD_KIND = "runnerDispatch" as const;

/**
 * The optional metadata fields on a runner-dispatch StatusCardBlock. The
 * renderer reads these directly. `details` (the existing `Record<string,
 * string>` field on StatusCardBlock) is also populated as a defensive
 * mirror for any consumer that doesn't yet read `metadata`.
 */
export interface RunnerDispatchCardMetadata {
  cardKind: typeof RUNNER_DISPATCH_CARD_KIND;
  runnerKind: RunnerKind;
  runnerMode: RunnerMode;
  status: RunnerDispatchStatus;
  attemptIndex: number;
  externalUrl?: string;
  prUrl?: string;
  previewUrl?: string;
  errorReason?: string;
  /** When set + status is terminal-failure, the renderer can hint a retry. */
  nextRunnerKind?: RunnerKind;
  /** Server-stamped elapsed seconds since dispatched (live runs only). */
  elapsedSeconds?: number;
}

export interface BuildRunnerDispatchCardInput {
  /**
   * The work item the dispatch targets. The card's `entityType` is
   * `"work_item"` and `entityId` is this id, so the conversation surface
   * can group the card with its work item.
   */
  workItemId: string;
  /** Short user-facing title — typically the work-item title. */
  title: string;
  runnerKind: RunnerKind;
  runnerMode: RunnerMode;
  status: RunnerDispatchStatus;
  attemptIndex: number;
  externalUrl?: string | null;
  prUrl?: string | null;
  previewUrl?: string | null;
  errorReason?: string | null;
  nextRunnerKind?: RunnerKind | null;
  elapsedSeconds?: number | null;
}

/**
 * Build a StatusCardBlock for a runner-dispatch transition. The renderer
 * keys off `metadata.cardKind` to pick the runner-dispatch template.
 */
export function buildRunnerDispatchCard(
  input: BuildRunnerDispatchCardInput,
): StatusCardBlock {
  const meta: RunnerDispatchCardMetadata = {
    cardKind: RUNNER_DISPATCH_CARD_KIND,
    runnerKind: input.runnerKind,
    runnerMode: input.runnerMode,
    status: input.status,
    attemptIndex: input.attemptIndex,
  };
  if (input.externalUrl) meta.externalUrl = input.externalUrl;
  if (input.prUrl) meta.prUrl = input.prUrl;
  if (input.previewUrl) meta.previewUrl = input.previewUrl;
  if (input.errorReason) meta.errorReason = input.errorReason;
  if (input.nextRunnerKind) meta.nextRunnerKind = input.nextRunnerKind;
  if (input.elapsedSeconds != null) meta.elapsedSeconds = input.elapsedSeconds;

  // `details` is a defensive string-only mirror of metadata. Existing
  // generic StatusCard renderers (process status etc.) read details; the
  // runner-template renderer reads metadata.
  const details: Record<string, string> = {
    runnerKind: input.runnerKind,
    runnerMode: input.runnerMode,
    status: input.status,
    attemptIndex: String(input.attemptIndex),
  };
  if (input.externalUrl) details.externalUrl = input.externalUrl;
  if (input.prUrl) details.prUrl = input.prUrl;
  if (input.previewUrl) details.previewUrl = input.previewUrl;
  if (input.errorReason) details.errorReason = input.errorReason;

  return {
    type: "status_card",
    entityType: "work_item",
    entityId: input.workItemId,
    title: input.title,
    status: input.status,
    details,
    metadata: meta as unknown as Record<string, unknown>,
  };
}

/**
 * Type-guard for the renderer dispatch-table fork. Returns true iff the
 * block is a StatusCardBlock whose metadata identifies it as the
 * runner-dispatch subtype.
 */
export function isRunnerDispatchCard(
  block: StatusCardBlock,
): block is StatusCardBlock & {
  metadata: RunnerDispatchCardMetadata;
} {
  const meta = block.metadata as Record<string, unknown> | undefined;
  return meta?.cardKind === RUNNER_DISPATCH_CARD_KIND;
}
