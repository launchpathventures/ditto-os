/**
 * Runner-Dispatch Pause Payload Builder — Brief 221 §D8.
 *
 * Pure function. Given the data needed to render a pause-approval review page,
 * returns the structured `ContentBlock[]` that goes into `review_pages.contentBlocks`.
 *
 * Generic and parameterised: `formId`, `actionNamespace`, and user-facing `copy`
 * are INJECTED. The helper knows ContentBlock types (in core) and runner kinds
 * (in core) — nothing about Ditto's review-page table, token minting, Self,
 * personas, or workspace concepts. ProcessOS or any other consumer can call
 * with their own form-id / namespace / copy.
 *
 * The product-layer caller (Ditto's `pauseRunnerDispatchForApproval()`)
 * hardcodes the Ditto values:
 *   formId = "runner-dispatch-approval"
 *   actionNamespace = "runner-dispatch-approval"
 *   copy = { ... Ditto-flavoured strings ... }
 */

import type {
  ContentBlock,
  TextBlock,
  WorkItemFormBlock,
  ActionBlock,
  ActionDef,
  InteractiveField,
} from "../content-blocks.js";
import type { RunnerKind, RunnerMode } from "./kinds.js";

// ============================================================
// Input shape
// ============================================================

/**
 * A snapshot of the work item being paused. Only the fields the helper
 * needs to render the summary; no DB cursors, no Drizzle types.
 */
export interface PauseWorkItemRef {
  id: string;
  title: string;
  /** Short body summary — a 1-2 sentence description of the work. */
  summary: string;
}

/**
 * A snapshot of the project. Only what the summary text references.
 */
export interface PauseProjectRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * One eligible runner option (chain-resolved + health-aware) shown in the
 * radio list.
 */
export interface PauseRunnerOption {
  kind: RunnerKind;
  mode: RunnerMode;
  /** User-facing label, e.g. "Mac mini", "Routine", "Managed Agent". */
  label: string;
  /**
   * Optional health-degradation hint shown alongside the label, e.g.
   * "offline", "rate-limited". `null` for healthy runners.
   */
  degradedReason?: string | null;
}

/**
 * Customisable copy. The Ditto product caller hardcodes Ditto-flavoured
 * strings; ProcessOS would inject its own.
 */
export interface PauseCopy {
  /** Header / summary lead-in, e.g. "Approve dispatch". */
  header: string;
  /** Lead-in to the runner radio list, e.g. "This work will run on:". */
  runnerLabel: string;
  /** Toggle label, e.g. "Force cloud for this approval". */
  forceCloudLabel: string;
  /** Approve button label, e.g. "Approve & dispatch". */
  approveLabel: string;
  /** Reject button label, e.g. "Reject". */
  rejectLabel: string;
}

export interface MintRunnerDispatchPauseInput {
  workItem: PauseWorkItemRef;
  project: PauseProjectRef;
  /**
   * The eligible-runner list, in chain order, mode-filtered and health-aware.
   * Caller computes via `resolveChain()` from this package and joins to
   * project_runners rows for labels + degradation reasons.
   */
  eligibleRunners: PauseRunnerOption[];
  /**
   * The currently-set `runner_mode_required` on the work item. When already
   * set to a non-`any` value, the force-cloud / force-local toggle is
   * pre-set + disabled.
   */
  modeRequired: "local" | "cloud" | "any" | null;
  /** Server-stamped form discriminator, e.g. "runner-dispatch-approval". */
  formId: string;
  /**
   * Server-stamped action-namespace prefix for Approve / Reject actions,
   * e.g. "runner-dispatch-approval". Action IDs become
   * `<namespace>:approve` and `<namespace>:reject`.
   */
  actionNamespace: string;
  /** User-facing copy strings — caller-injected for i18n / brand voice. */
  copy: PauseCopy;
}

// ============================================================
// Output
// ============================================================

/**
 * Builds the structured pause payload as a ContentBlock[]. Caller persists
 * this into `review_pages.contentBlocks`; the approve route re-reads it to
 * validate `selectedKind` against the server-stamped eligibility list.
 *
 * Layout:
 *   1. TextBlock — work-item summary (header line + body)
 *   2. WorkItemFormBlock — kind selector (`select` field with eligible-only
 *      options) + force-cloud toggle (`toggle` field)
 *   3. ActionBlock — Approve + Reject buttons
 */
export function mintRunnerDispatchPause(
  input: MintRunnerDispatchPauseInput,
): ContentBlock[] {
  const summary: TextBlock = {
    type: "text",
    text:
      `**${input.copy.header}**\n\n` +
      `**${input.workItem.title}**\n` +
      `${input.workItem.summary}\n\n` +
      `_Project: ${input.project.name}_`,
  };

  const kindOptions = input.eligibleRunners.map((r) =>
    formatKindOption(r),
  );

  // Default the kind selector to the first eligible runner (the chain head).
  const defaultKind = input.eligibleRunners[0]?.kind ?? "";

  const kindField: InteractiveField = {
    name: "selectedKind",
    label: input.copy.runnerLabel,
    type: "select",
    options: kindOptions,
    value: defaultKind,
    required: true,
  };

  // Force-cloud toggle. Pre-set + (semantically) disabled when modeRequired
  // is already a hard value. Renderer is responsible for rendering disabled
  // state from the value alone (no separate "disabled" flag in the
  // InteractiveField type today).
  const forceCloudInitial = input.modeRequired === "cloud";

  const forceCloudField: InteractiveField = {
    name: "forceCloud",
    label: input.copy.forceCloudLabel,
    type: "toggle",
    value: forceCloudInitial,
    required: false,
  };

  const form: WorkItemFormBlock = {
    type: "work_item_form",
    formId: input.formId,
    fields: [kindField, forceCloudField],
    defaults: {
      selectedKind: defaultKind,
      forceCloud: forceCloudInitial,
    },
  };

  const approve: ActionDef = {
    id: `${input.actionNamespace}:approve`,
    label: input.copy.approveLabel,
    style: "primary",
  };
  const reject: ActionDef = {
    id: `${input.actionNamespace}:reject`,
    label: input.copy.rejectLabel,
    style: "danger",
  };

  const actions: ActionBlock = {
    type: "actions",
    actions: [approve, reject],
  };

  return [summary, form, actions];
}

function formatKindOption(r: PauseRunnerOption): string {
  const modeLabel = r.mode === "cloud" ? "Cloud" : "Local";
  const degraded = r.degradedReason ? ` (${r.degradedReason})` : "";
  // "Routine · Cloud" or "Mac mini · Local (offline)"
  return `${r.kind}|${r.label} · ${modeLabel}${degraded}`;
}

/**
 * Inverse helper for renderers: given an option string from the eligible-list
 * (formatted by `formatKindOption`), recover the runner kind. The kind is the
 * source-of-truth identifier; the human-readable label is for display.
 *
 * Format: `<kind>|<display label>`. The pipe is the separator.
 */
export function parseKindOption(option: string): {
  kind: string;
  label: string;
} {
  const idx = option.indexOf("|");
  if (idx === -1) {
    return { kind: option, label: option };
  }
  return {
    kind: option.slice(0, idx),
    label: option.slice(idx + 1),
  };
}
