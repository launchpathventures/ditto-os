/**
 * `LocalBridge` adapter — Brief 215 wiring against Brief 212's primitives.
 *
 * Brief 212 shipped functional primitives (`dispatchBridgeJob`, `sendBridgeFrame`,
 * `revokeDeviceConnection`, `isDeviceConnected`, `bridgeDevices` schema) but did
 * not ship a class implementing the `LocalBridge` interface declared in
 * `packages/core/src/bridge/types.ts`.
 *
 * This file composes those primitives into the interface that Brief 215's
 * `local-mac-mini` `RunnerAdapter` (`src/adapters/local-mac-mini.ts`) consumes.
 * Engine boot wires it into the runner registry; cancellations and revocations
 * route through it to the existing bridge-server.
 */

import { eq } from "drizzle-orm";
import { db as appDb } from "../db/index.js";
import { bridgeDevices } from "../db/schema/index.js";
import {
  dispatchBridgeJob,
  type BridgeDispatchOutcome,
} from "./harness-handlers/bridge-dispatch.js";
import {
  isDeviceConnected,
  revokeDeviceConnection,
  sendBridgeFrame,
} from "./bridge-server.js";
import type {
  LocalBridge,
  RegisteredDevice,
  BridgePayload,
  BridgeJob,
} from "@ditto/core";

interface CreateLocalBridgeOpts {
  /** Defaults to "default"; future multi-workspace support overrides. */
  workspaceId?: string;
  /** Test override — defaults to the app's drizzle handle. */
  db?: typeof appDb;
}

export function createLocalBridge(opts: CreateLocalBridgeOpts = {}): LocalBridge {
  const workspaceId = opts.workspaceId ?? "default";
  const db = opts.db ?? appDb;

  return {
    async listDevices(): Promise<RegisteredDevice[]> {
      const rows = await db
        .select()
        .from(bridgeDevices)
        .where(eq(bridgeDevices.workspaceId, workspaceId));
      return rows.map(rowToRegisteredDevice);
    },

    async dispatch(opts: {
      deviceId?: string;
      fallbackDeviceIds?: string[];
      payload: BridgePayload;
      processRunId: string;
      stepRunId: string;
      trustTier: "supervised" | "spot_checked" | "autonomous" | "critical";
      trustAction: "pause" | "advance" | "sample_pause" | "sample_advance";
    }): Promise<{ jobId: string; routedDeviceId: string; routedAs: BridgeJob["routedAs"] }> {
      const outcome: BridgeDispatchOutcome = await dispatchBridgeJob(
        {
          stepRunId: opts.stepRunId,
          processRunId: opts.processRunId,
          // Trust decision is recorded faithfully — the bridge-layer audit
          // row (Brief 212's `harness_decisions` write) reflects the real
          // upstream tier, not a fabrication.
          trustTier: opts.trustTier,
          trustAction: opts.trustAction,
          deviceId: opts.deviceId,
          fallbackDeviceIds: opts.fallbackDeviceIds,
          payload: opts.payload,
          workspaceId,
        },
        {
          db,
          isDeviceOnline: (deviceId) => isDeviceConnected(deviceId),
          sendOverWire: (jobId, deviceId, payload) => sendBridgeFrame(jobId, deviceId, payload),
        },
      );

      if (!outcome.ok) {
        throw new Error(`bridge dispatch failed: ${outcome.reason} — ${outcome.message}`);
      }
      return {
        jobId: outcome.jobId,
        routedDeviceId: outcome.routedDeviceId,
        routedAs: outcome.routedAs,
      };
    },

    async cancel(_jobId: string): Promise<void> {
      // Brief 212 ships in-flight job cancellation via the bridge-jobs state
      // machine + frame send; the explicit cancel API is not yet exposed as
      // a free function. Throw a clear-intent error rather than silently
      // succeeding — the runner-dispatcher's caller can catch and downgrade.
      throw new Error(
        "LocalBridge.cancel is not yet wired — Brief 212 ships state-machine cancel via the bridge-jobs row update; expose a free function next sub-brief.",
      );
    },

    async revoke(deviceId: string, reason: string): Promise<void> {
      revokeDeviceConnection(deviceId, reason);
    },
  };
}

function rowToRegisteredDevice(row: typeof bridgeDevices.$inferSelect): RegisteredDevice {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    deviceName: row.deviceName,
    status: row.status,
    pairedAt: row.pairedAt.getTime(),
    lastDialAt: row.lastDialAt?.getTime(),
    lastIp: row.lastIp ?? undefined,
    revokedAt: row.revokedAt?.getTime(),
    revokedReason: row.revokedReason ?? undefined,
  };
}
