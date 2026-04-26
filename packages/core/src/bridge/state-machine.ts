/**
 * Bridge Job State Machine
 *
 * Pure, framework-agnostic state machine for `bridge_jobs` rows. The cloud
 * dispatcher and the daemon never mutate state directly — they call
 * `transition(from, event)` and persist the new state if it's legal.
 *
 * 8 states, 7 events. Terminal states are succeeded/failed/orphaned/cancelled/
 * revoked. Illegal transitions return an error result (notably the
 * `revoked → succeeded` race when a stale frame arrives after revocation).
 *
 * Brief 212 §Constraints "Bridge job state machine — transition triggers"
 * is the canonical spec; this file is the canonical implementation.
 */

export const bridgeJobStateValues = [
  "queued",
  "dispatched",
  "running",
  "succeeded",
  "failed",
  "orphaned",
  "cancelled",
  "revoked",
] as const;
export type BridgeJobState = (typeof bridgeJobStateValues)[number];

export const bridgeJobEventValues = [
  /** Cloud dispatcher wrote the JSON-RPC request to the WebSocket. */
  "dispatch",
  /** Daemon's first stream frame (or tmux-send-ack) arrived. */
  "first-frame",
  /** Daemon emitted exec.result with exitCode 0. */
  "succeed",
  /** Daemon emitted exec.result with non-zero exitCode, OR an error frame. */
  "fail",
  /** Cloud-side staleness sweeper detected lastHeartbeatAt > maxStalenessMs. */
  "stale",
  /** Human-initiated abort via UI (POST /cancel). */
  "cancel",
  /** Device JWT revoked while job was in any non-terminal state. */
  "revoke",
] as const;
export type BridgeJobEvent = (typeof bridgeJobEventValues)[number];

const TERMINAL_STATES: ReadonlySet<BridgeJobState> = new Set([
  "succeeded",
  "failed",
  "orphaned",
  "cancelled",
  "revoked",
]);

export function isTerminalBridgeJobState(state: BridgeJobState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Legal transitions table. Maps `from` state → `event` → resulting state.
 * Anything not in the table is illegal.
 *
 * Notes:
 * - `cancel` is legal from any non-terminal pre-running state AND from
 *   `running` (human can abort an in-flight job).
 * - `revoke` is legal from any non-terminal state (queued, dispatched,
 *   running). It is NOT legal from terminal states — once a job is in a
 *   terminal state, revoking the device does not change the job's outcome.
 * - `succeed`/`fail`/`stale` are only legal from `running`. A late frame
 *   arriving after revoke/cancel/orphan is rejected.
 */
const TRANSITIONS: Readonly<
  Record<BridgeJobState, Partial<Record<BridgeJobEvent, BridgeJobState>>>
> = {
  queued: {
    dispatch: "dispatched",
    cancel: "cancelled",
    revoke: "revoked",
  },
  dispatched: {
    "first-frame": "running",
    cancel: "cancelled",
    revoke: "revoked",
  },
  running: {
    succeed: "succeeded",
    fail: "failed",
    stale: "orphaned",
    cancel: "cancelled",
    revoke: "revoked",
  },
  succeeded: {},
  failed: {},
  orphaned: {},
  cancelled: {},
  revoked: {},
};

export interface BridgeJobTransitionOk {
  ok: true;
  to: BridgeJobState;
}

export interface BridgeJobTransitionError {
  ok: false;
  reason: "illegal-transition" | "terminal-state";
  from: BridgeJobState;
  event: BridgeJobEvent;
}

export type BridgeJobTransitionResult = BridgeJobTransitionOk | BridgeJobTransitionError;

/**
 * Pure transition function. Returns the next state if legal, otherwise an
 * error result. Callers persist state only on `ok: true`.
 *
 * Late-frame race example (the AC #2-cited revoked→succeeded case):
 *   transitionBridgeJob("revoked", "succeed")
 *   → { ok: false, reason: "terminal-state", from: "revoked", event: "succeed" }
 */
export function transitionBridgeJob(
  from: BridgeJobState,
  event: BridgeJobEvent,
): BridgeJobTransitionResult {
  if (TERMINAL_STATES.has(from)) {
    return { ok: false, reason: "terminal-state", from, event };
  }
  const to = TRANSITIONS[from][event];
  if (!to) {
    return { ok: false, reason: "illegal-transition", from, event };
  }
  return { ok: true, to };
}
