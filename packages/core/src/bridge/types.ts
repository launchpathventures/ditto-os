/**
 * Bridge — engine-core types.
 *
 * Wire-shape and value types only. Zero Ditto-specific imports — verified by
 * the AC #2 grep. The cloud dispatcher (Ditto product layer) and the daemon
 * (`packages/bridge-cli`) both consume these.
 *
 * Brief 212 §What Changes line for `packages/core/src/bridge/types.ts`.
 */

import type { BridgeJobState } from "./state-machine.js";

export type BridgeJobKind = "exec" | "tmux.send";

/** `exec` payload — run a subprocess on the daemon. */
export interface BridgeExecPayload {
  kind: "exec";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Default 600_000 (10 min). Bounded 1_000–3_600_000 by tool resolver. */
  timeoutMs?: number;
}

/** `tmux.send` payload — send keys (with trailing Enter) to a named tmux session. */
export interface BridgeTmuxSendPayload {
  kind: "tmux.send";
  tmuxSession: string;
  /** Literal keystrokes; daemon appends `Enter` automatically. */
  keys: string;
}

export type BridgePayload = BridgeExecPayload | BridgeTmuxSendPayload;

/**
 * The persisted job. Mirrors the `bridge_jobs` table 1:1 but is database-
 * agnostic (used by the cloud dispatcher in-memory + as the wire-side shape).
 */
export interface BridgeJob {
  id: string;
  /** The device the job is targeted at (after fallback resolution). */
  deviceId: string;
  /** The originally-requested primary device (only differs from deviceId on fallback routing). */
  requestedDeviceId?: string;
  routedAs: "primary" | "fallback" | "queued_for_primary";
  processRunId: string;
  stepRunId: string;
  payload: BridgePayload;
  state: BridgeJobState;
  queuedAt: number;
  dispatchedAt?: number;
  completedAt?: number;
  /** Last heartbeat received from the daemon (used by the staleness sweeper). */
  lastHeartbeatAt?: number;
  exitCode?: number | null;
  stdoutBytes?: number;
  stderrBytes?: number;
  truncated?: boolean;
  terminationSignal?: "SIGTERM" | "SIGKILL";
}

/** Streamed stdout/stderr chunk from the daemon. */
export interface BridgeStreamFrame {
  kind: "stream";
  jobId: string;
  stream: "stdout" | "stderr";
  /** UTF-8 chunk; line-buffered on the daemon side. */
  data: string;
  /** Cumulative bytes for this stream (useful for the 4 MB cap check). */
  cumulativeBytes: number;
}

/** Final exec frame from the daemon. */
export interface BridgeResultFrame {
  kind: "result";
  jobId: string;
  exitCode: number | null;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
  terminationSignal?: "SIGTERM" | "SIGKILL";
  /** Set when daemon couldn't run the command (e.g., cwd not found, tmux missing). */
  errorMessage?: string;
}

export type BridgeFrame = BridgeStreamFrame | BridgeResultFrame;

/** A device the workspace has paired with. Mirrors `bridge_devices`. */
export interface RegisteredDevice {
  id: string;
  workspaceId: string;
  deviceName: string;
  status: "active" | "revoked" | "rotated";
  pairedAt: number;
  lastDialAt?: number;
  lastIp?: string;
  revokedAt?: number;
  revokedReason?: string;
}

/**
 * The interface the cloud dispatcher implements and the daemon-side tooling
 * mocks against. Defined here so consumers don't reach into the dispatcher's
 * concrete class.
 */
export interface LocalBridge {
  /** Listed devices for the current workspace. */
  listDevices(): Promise<RegisteredDevice[]>;
  /** Dispatch a job (after trust-gate; insight-180 stepRunId guard required). */
  dispatch(opts: {
    deviceId?: string;
    fallbackDeviceIds?: string[];
    payload: BridgePayload;
    /** FK to processRuns.id — required for bridge_jobs.processRunId FK. */
    processRunId: string;
    stepRunId: string;
    /**
     * Faithful upstream trust decision. The bridge-layer audit row
     * (`harness_decisions`) records this verbatim — fabricating values
     * here would lie about how autonomous the dispatch was (Insight-180).
     */
    trustTier: "supervised" | "spot_checked" | "autonomous" | "critical";
    trustAction: "pause" | "advance" | "sample_pause" | "sample_advance";
  }): Promise<{ jobId: string; routedDeviceId: string; routedAs: BridgeJob["routedAs"] }>;
  /** Cancel an in-flight or queued job. */
  cancel(jobId: string): Promise<void>;
  /** Revoke a device — closes its WebSocket and revokes the JWT. */
  revoke(deviceId: string, reason: string): Promise<void>;
}
