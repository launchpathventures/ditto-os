/**
 * Local Mac mini Runner Adapter — Brief 215 thin shim over Brief 212's bridge.
 *
 * Brief 215 AC #9 wires this adapter into the runner registry under kind
 * `local-mac-mini`. Brief 212's `LocalBridge` primitive (cloud dispatcher
 * implementation, packages/core/src/bridge/types.ts) is the actual transport
 * — this file is the contract bridge between the runner-dispatcher world
 * and the bridge-server world.
 *
 * Brief 215's scope ships the contract + registration; the wiring to a real
 * `LocalBridge` instance comes when Brief 212's cloud dispatcher merges. In
 * the meantime, the adapter accepts a `LocalBridge` injected at construction
 * (the engine boot wires the running bridge-server into it) and falls back
 * to a noop bridge in test mode that returns the structure-shape needed by
 * tests but performs no I/O.
 */

import { z } from "zod";
import type {
  CancelResult,
  DispatchExecuteContext,
  DispatchResult,
  DispatchStatusSnapshot,
  HealthCheckResult,
  ProjectRef,
  ProjectRunnerRef,
  RunnerAdapter,
  RunnerKind,
  RunnerMode,
  WorkItemRef,
  LocalBridge,
} from "@ditto/core";

/**
 * project_runners.config_json shape for `local-mac-mini`.
 *
 * Pipeline-spec fields per the user's pasted_text 2026-04-25_21-14-58
 * (referenced in Brief 215 §Provenance and the runners admin form). The
 * actual SSH/tmux execution happens on the daemon side (Brief 212's
 * bridge-cli); this config tells the cloud-side dispatcher which device +
 * tmux session to target.
 */
export const localMacMiniConfigSchema = z.object({
  /** Bridge device id (FK into bridge_devices) — set by the pairing flow. */
  deviceId: z.string().min(1),
  /** Optional: tmux session name to keystroke commands into (per Brief 212). */
  tmuxSession: z.string().optional(),
  /** Optional human-readable label exposed in the admin UI. */
  sshHost: z.string().optional(),
  sshUser: z.string().optional(),
  /** Pointer into credentials table (also captured by ProjectRunnerRef.credentialIds). */
  credentialId: z.string().optional(),
});

export type LocalMacMiniConfig = z.infer<typeof localMacMiniConfigSchema>;

const TEST_MODE = process.env.DITTO_TEST_MODE === "true";

/**
 * Build the `local-mac-mini` runner adapter.
 *
 * The dispatcher (Brief 215's runner-dispatcher.ts) calls `execute()` after
 * the trust gate has approved (or sampled-in) the dispatch. Insight-180
 * compliance: the dispatcher passes `stepRunId`; this adapter rejects calls
 * without one (except in test mode).
 *
 * For Brief 215 scope: when `bridge` is provided, dispatch is delegated to
 * Brief 212's primitive. When `bridge` is null AND test mode is on, a noop
 * shape is returned to keep tests pure. When `bridge` is null AND test mode
 * is off, the adapter throws — engine-boot must wire a bridge.
 */
export function createLocalMacMiniAdapter(opts: {
  bridge: LocalBridge | null;
}): RunnerAdapter {
  const kind: RunnerKind = "local-mac-mini";
  const mode: RunnerMode = "local";

  function requireBridge(): LocalBridge {
    if (opts.bridge) return opts.bridge;
    if (TEST_MODE) {
      // Noop shape — never invoked because tests inject their own adapter.
      throw new Error(
        "local-mac-mini: bridge unavailable in test mode (tests should inject a stub adapter)."
      );
    }
    throw new Error(
      "local-mac-mini: no LocalBridge wired. Engine boot must inject bridge-server's dispatcher."
    );
  }

  return {
    kind,
    mode,
    configSchema: localMacMiniConfigSchema,
    // Brief 215 substrate ships without cancel wiring — sub-brief 221 (mobile
    // UX) or a polish brief implements bridge-job cancel. Set false so the
    // dispatcher knows to skip cancel() rather than throwing on call.
    supportsCancel: false,

    async execute(
      ctx: DispatchExecuteContext,
      workItem: WorkItemRef,
      _project: ProjectRef,
      projectRunner: ProjectRunnerRef
    ): Promise<DispatchResult> {
      if (!ctx.stepRunId && !TEST_MODE) {
        throw new Error(
          "local-mac-mini.execute() requires stepRunId (Insight-180 guard)."
        );
      }

      const cfgParse = localMacMiniConfigSchema.safeParse(projectRunner.configJson);
      if (!cfgParse.success) {
        return {
          externalRunId: null,
          externalUrl: null,
          startedAt: new Date(),
          finalStatus: "failed",
          errorReason: `Invalid config_json for local-mac-mini: ${cfgParse.error.message}`,
        };
      }

      const bridge = requireBridge();
      const config = cfgParse.data;

      // Dispatch a `tmux.send` payload when tmuxSession is configured;
      // otherwise dispatch an `exec` of the work-item content directly.
      const payload = config.tmuxSession
        ? ({
            kind: "tmux.send" as const,
            tmuxSession: config.tmuxSession,
            keys: workItem.content,
          })
        : ({
            kind: "exec" as const,
            command: "bash",
            args: ["-lc", workItem.content],
          });

      const dispatched = await bridge.dispatch({
        deviceId: config.deviceId,
        payload,
        processRunId: ctx.processRunId,
        stepRunId: ctx.stepRunId,
        trustTier: ctx.trust.trustTier,
        trustAction: ctx.trust.trustAction,
      });

      return {
        externalRunId: dispatched.jobId,
        externalUrl: null,
        startedAt: new Date(),
      };
    },

    async status(_dispatchId: string, _externalRunId: string): Promise<DispatchStatusSnapshot> {
      // Brief 215 scope: status polling lives in bridge-server's heartbeat /
      // staleness sweeper. Sub-brief 221 surfaces this in the admin UI.
      return {
        status: "queued",
        externalRunId: _externalRunId,
        externalUrl: null,
        lastUpdatedAt: new Date(),
      };
    },

    async cancel(_dispatchId: string, _externalRunId: string): Promise<CancelResult> {
      // `supportsCancel: false` advertises that this adapter cannot cancel —
      // the dispatcher should not call cancel() in production. If it does
      // (bug or test path), return a soft-fail rather than throwing.
      return {
        ok: false,
        reason:
          "local-mac-mini cancel not yet wired — Brief 212 didn't ship a free function for in-flight bridge-job cancellation; sub-brief 221 (mobile UX) or polish brief.",
      };
    },

    async healthCheck(projectRunner: ProjectRunnerRef): Promise<HealthCheckResult> {
      try {
        const bridge = requireBridge();
        const cfgParse = localMacMiniConfigSchema.safeParse(projectRunner.configJson);
        if (!cfgParse.success) {
          return { status: "unauthenticated", reason: "config invalid" };
        }
        const devices = await bridge.listDevices();
        const found = devices.find((d) => d.id === cfgParse.data.deviceId);
        if (!found) return { status: "unreachable", reason: "device not paired" };
        if (found.status !== "active") {
          return { status: "unauthenticated", reason: `device status: ${found.status}` };
        }
        return { status: "healthy" };
      } catch (e) {
        return {
          status: "unknown",
          reason: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}
