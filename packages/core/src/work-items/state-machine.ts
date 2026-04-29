/**
 * Work-Item Brief State Machine
 *
 * Pure transition function for `work_items.briefState`. Brief 220 §D1.
 *
 * Coexists with `runner/state-machine.ts` (which governs the
 * runner-dispatch lifecycle); the two state machines are independent and
 * communicate only via webhook events that may transition both in turn.
 *
 * The deploy-gate arc (`shipped → deploying → deployed | deploy_failed`)
 * tolerates out-of-order GitHub webhook delivery by admitting direct
 * `shipped → deployed` and `shipped → deploy_failed` transitions. The
 * intermediate `deploying` is informational, not load-bearing.
 *
 * The retry arc (`deploy_failed → deploying → deployed`) is human-driven
 * (the user re-runs the failed workflow in GitHub; GitHub fires a fresh
 * `deployment_status: queued`). `deploy_failed → deployed` is also
 * admitted for the symmetric out-of-order case where the retry's `success`
 * arrives before its `queued`.
 *
 * Non-deploy transitions preserve Brief 223 semantics. `shipped → archived`
 * is admitted so projects without a production-deploy environment aren't
 * stranded forever in `shipped`.
 */

import { type BriefState } from "../db/schema.js";

/**
 * Allowed transitions per source state. Empty array = terminal w.r.t.
 * forward progress (only escape is operator/audit, not a routine event).
 */
export const BRIEF_STATE_TRANSITIONS: Readonly<
  Record<BriefState, ReadonlyArray<BriefState>>
> = {
  backlog: ["approved", "blocked", "archived"],
  approved: ["active", "blocked", "archived"],
  active: ["review", "blocked", "archived"],
  review: ["shipped", "blocked", "archived"],
  // Brief 220 D1: shipped admits four exits.
  // - `deploying` happy-path entry
  // - `deployed` direct (out-of-order webhook delivery — `success` first)
  // - `deploy_failed` direct (out-of-order webhook delivery — `failure` first)
  // - `archived` for projects without a production-deploy environment
  shipped: ["deploying", "deployed", "deploy_failed", "archived"],
  blocked: ["approved", "active", "archived"],
  // Brief 220 D1: deploying admits both terminal deploy outcomes.
  deploying: ["deployed", "deploy_failed"],
  // Brief 220 D1: deployed → archived only. No retreat to `shipped`,
  // no re-deploy from `deployed` (treat as new work item), no
  // post-deploy `blocked` (post-deploy issues are new work items).
  deployed: ["archived"],
  // Brief 220 D1: deploy_failed admits retry (back to deploying) AND
  // direct deployed for the out-of-order retry-success case.
  deploy_failed: ["deploying", "deployed", "archived"],
  // Brief 223: archived is fully terminal.
  archived: [],
};

export interface BriefStateTransitionOk {
  ok: true;
  to: BriefState;
}

export interface BriefStateTransitionError {
  ok: false;
  reason: "illegal-transition" | "terminal-state";
  from: BriefState;
  attempted: BriefState;
}

export type BriefStateTransitionResult =
  | BriefStateTransitionOk
  | BriefStateTransitionError;

/**
 * Pure state-transition validator. Returns `{ ok: true, to }` when the
 * proposed transition is legal; otherwise a structured error result.
 * Callers persist `to` only on `ok: true`.
 *
 * Intentionally idempotent-rejecting: `transitionBriefState("deploying",
 * "deploying")` returns `illegal-transition` so the webhook handler can
 * audit replays via `metadata.transitionRejected = true`.
 */
export function transitionBriefState(
  from: BriefState,
  to: BriefState,
): BriefStateTransitionResult {
  const allowed = BRIEF_STATE_TRANSITIONS[from];
  if (allowed.length === 0) {
    return { ok: false, reason: "terminal-state", from, attempted: to };
  }
  if (!allowed.includes(to)) {
    return { ok: false, reason: "illegal-transition", from, attempted: to };
  }
  return { ok: true, to };
}
