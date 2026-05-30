/**
 * Network Discovery Runtime Toggle (Brief 284, R-Q12)
 *
 * Network-wide operational kill switch for outbound discovery. The state is
 * derived from the most recent `operator_paused_discovery` /
 * `operator_resumed_discovery` audit event against the global subject — there
 * is no separate boolean table. This keeps the audit log as the source of
 * truth (consistent with the rest of Brief 284) and means the resume action
 * is a peer of the pause action rather than a mutation of state.
 *
 * Enforcement (downstream pipelines must check `isOutboundDiscoveryPaused()`
 * before invite/discovery work) is wired in Brief 279 / 286. This module
 * only owns: write the audit event, read the latest state.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { writeNetworkAuditEvent } from "./network-audit";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";

export const DISCOVERY_RUNTIME_SUBJECT_TYPE = "discovery_runtime";
export const DISCOVERY_RUNTIME_SUBJECT_ID = "outbound";

export interface SetOutboundDiscoveryPausedInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  paused: boolean;
  reason: string;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}

export interface OutboundDiscoveryPauseState {
  paused: boolean;
  changedAt: Date | null;
  reason: string | null;
  actorId: string | null;
  stepRunId: string | null;
}

export async function setOutboundDiscoveryPaused(
  input: SetOutboundDiscoveryPausedInput,
): Promise<OutboundDiscoveryPauseState> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "set_outbound_discovery_paused",
    { rootDir: input.rootDir },
  );
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("set_outbound_discovery_paused requires reason");
  }
  const now = input.now ?? new Date();
  const eventClass = input.paused
    ? "operator_paused_discovery"
    : "operator_resumed_discovery";

  const row = await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass,
    subjectType: DISCOVERY_RUNTIME_SUBJECT_TYPE,
    subjectId: DISCOVERY_RUNTIME_SUBJECT_ID,
    actorType: "admin",
    actorId: input.actorId ?? null,
    reasonCode: reason.slice(0, 240),
    metadata: input.metadata ?? null,
    now,
  });

  return {
    paused: input.paused,
    changedAt: row.createdAt,
    reason,
    actorId: input.actorId ?? null,
    stepRunId,
  };
}

export async function getOutboundDiscoveryPauseState(
  opts: { db?: NetworkDbLike } = {},
): Promise<OutboundDiscoveryPauseState> {
  const db = opts.db ?? networkDb;
  const [row] = await db
    .select()
    .from(networkSchema.networkAuditEvents)
    .where(
      and(
        eq(
          networkSchema.networkAuditEvents.subjectType,
          DISCOVERY_RUNTIME_SUBJECT_TYPE,
        ),
        eq(
          networkSchema.networkAuditEvents.subjectId,
          DISCOVERY_RUNTIME_SUBJECT_ID,
        ),
        inArray(networkSchema.networkAuditEvents.eventClass, [
          "operator_paused_discovery",
          "operator_resumed_discovery",
        ]),
      ),
    )
    .orderBy(desc(networkSchema.networkAuditEvents.createdAt))
    .limit(1);

  if (!row) {
    return {
      paused: false,
      changedAt: null,
      reason: null,
      actorId: null,
      stepRunId: null,
    };
  }
  return {
    paused: row.eventClass === "operator_paused_discovery",
    changedAt: row.createdAt,
    reason: row.reasonCode,
    actorId: row.actorId,
    stepRunId: row.stepRunId,
  };
}

export async function isOutboundDiscoveryPaused(
  opts: { db?: NetworkDbLike } = {},
): Promise<boolean> {
  return (await getOutboundDiscoveryPauseState(opts)).paused;
}
