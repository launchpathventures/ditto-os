/**
 * Runner Dispatch State Machine
 *
 * Pure transition function for `runner_dispatches.status`. Brief 215 §"What
 * Changes" / file `state-machine.ts`. Brief 215 AC #5 enumerates the legal/
 * illegal transitions covered by the unit tests.
 *
 * 9 states, 9 events. Terminal states are {succeeded, failed, timed_out,
 * rate_limited, cancelled, revoked}. `reset` is the only event valid from
 * a terminal state — it requeues the dispatch (the dispatcher uses this when
 * it advances to the next runner in the chain after a failure / rate-limit /
 * timeout).
 */

import { type RunnerDispatchStatus } from "./kinds.js";

export const runnerDispatchEventValues = [
  /** Cloud dispatcher placed the job into the runner-specific queue or wire. */
  "dispatch",
  /** First evidence the runner started executing (status update / first frame). */
  "start",
  /** Runner reported success (terminal). */
  "succeed",
  /** Runner reported failure (non-rate, non-timeout). */
  "fail",
  /** Runner reported a timeout (cloud-side staleness sweep or runner-reported). */
  "timeout",
  /** Runner reported a rate-limit hit — chain advances to the next kind. */
  "rate_limit",
  /** Human-initiated cancel via UI / API (queued or running). */
  "cancel",
  /** Credential revoked or runner unregistered while dispatch was in-flight. */
  "revoke",
  /**
   * Recycle a terminal dispatch back to `queued` so the dispatcher can attempt
   * the next kind in the chain. Only legal from terminal states.
   */
  "reset",
] as const;
export type RunnerDispatchEvent = (typeof runnerDispatchEventValues)[number];

const TERMINAL_STATES: ReadonlySet<RunnerDispatchStatus> = new Set([
  "succeeded",
  "failed",
  "timed_out",
  "rate_limited",
  "cancelled",
  "revoked",
]);

export function isTerminalDispatchStatus(state: RunnerDispatchStatus): boolean {
  return TERMINAL_STATES.has(state);
}

const TRANSITIONS: Readonly<
  Record<RunnerDispatchStatus, Partial<Record<RunnerDispatchEvent, RunnerDispatchStatus>>>
> = {
  queued: {
    dispatch: "dispatched",
    /**
     * Adapter threw synchronously before the external system created a run ID.
     * The SM treats this as a terminal failure so the dispatcher can advance
     * the chain — distinct from `cancel` (human-initiated) and `revoke`
     * (credential/device).
     */
    fail: "failed",
    cancel: "cancelled",
    revoke: "revoked",
  },
  dispatched: {
    start: "running",
    fail: "failed",
    cancel: "cancelled",
    revoke: "revoked",
    rate_limit: "rate_limited",
    timeout: "timed_out",
  },
  running: {
    succeed: "succeeded",
    fail: "failed",
    timeout: "timed_out",
    rate_limit: "rate_limited",
    cancel: "cancelled",
    revoke: "revoked",
  },
  succeeded: { reset: "queued" },
  failed: { reset: "queued" },
  timed_out: { reset: "queued" },
  rate_limited: { reset: "queued" },
  cancelled: { reset: "queued" },
  revoked: {},
};

export interface DispatchTransitionOk {
  ok: true;
  to: RunnerDispatchStatus;
}

export interface DispatchTransitionError {
  ok: false;
  reason: "illegal-transition" | "non-terminal-reset" | "revoked-terminal";
  from: RunnerDispatchStatus;
  event: RunnerDispatchEvent;
}

export type DispatchTransitionResult = DispatchTransitionOk | DispatchTransitionError;

/**
 * Pure state-transition function. Returns the next state on success or a
 * structured error result on illegal transitions. Callers persist state only
 * on `ok: true`.
 *
 * Notes:
 * - `reset` is rejected from any non-terminal state (you cannot requeue a
 *   running job — cancel it first).
 * - `revoked` is one-way terminal — no `reset` to requeue. The dispatcher
 *   creates a fresh dispatch row instead.
 * - All other terminal states accept `reset` so the dispatcher can recycle
 *   for chain advancement.
 */
export function transitionDispatch(
  from: RunnerDispatchStatus,
  event: RunnerDispatchEvent
): DispatchTransitionResult {
  const to = TRANSITIONS[from][event];
  if (!to) {
    if (event === "reset" && !TERMINAL_STATES.has(from)) {
      return { ok: false, reason: "non-terminal-reset", from, event };
    }
    if (event === "reset" && from === "revoked") {
      return { ok: false, reason: "revoked-terminal", from, event };
    }
    return { ok: false, reason: "illegal-transition", from, event };
  }
  return { ok: true, to };
}
