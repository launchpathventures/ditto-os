/**
 * Network Audit Substrate (Brief 282)
 *
 * Decision-level audit rows for privacy, source-policy, suppression, admin,
 * invite, complaint, and delete events. This is intentionally separate from
 * lane-step JSONL provenance; the only linkage is `stepRunId`.
 */

import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import {
  isServerMintedNetworkLaneStepRunId,
  requireServerMintedNetworkLaneStepRunId,
} from "./network-step-run";

export type NetworkAuditEventClass = networkSchema.NetworkAuditEventClass;
export type NetworkAuditActorType = networkSchema.NetworkAuditActorType;

export const NETWORK_AUDIT_EVENT_CLASSES =
  networkSchema.networkAuditEventClassValues;

const AUDIT_EVENT_CLASS_SET = new Set<string>(NETWORK_AUDIT_EVENT_CLASSES);
const AUDIT_ACTOR_TYPE_SET = new Set<string>(
  networkSchema.networkAuditActorTypeValues,
);

export interface WriteNetworkAuditEventInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  eventClass: NetworkAuditEventClass;
  subjectType: string;
  subjectId: string;
  actorType: NetworkAuditActorType;
  actorId?: string | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}

export type NetworkAuditEventRow =
  typeof networkSchema.networkAuditEvents.$inferSelect;

export async function isValidNetworkAuditStepRunId(
  stepRunId: unknown,
  opts: { rootDir?: string } = {},
): Promise<boolean> {
  return isServerMintedNetworkLaneStepRunId(stepRunId, opts);
}

async function requireAuditStepRunId(
  stepRunId: unknown,
  opts: { rootDir?: string } = {},
): Promise<string> {
  return requireServerMintedNetworkLaneStepRunId(
    stepRunId,
    "write_network_audit_event",
    opts,
  );
}

function requireKnownValue(
  set: Set<string>,
  value: string,
  label: string,
): void {
  if (!set.has(value)) {
    throw new Error(`write_network_audit_event received unknown ${label}: ${value}`);
  }
}

function requireNonEmpty(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) {
    throw new Error(`write_network_audit_event requires ${label}`);
  }
  return clean;
}

export async function writeNetworkAuditEvent(
  input: WriteNetworkAuditEventInput,
): Promise<NetworkAuditEventRow> {
  const stepRunId = await requireAuditStepRunId(input.stepRunId, {
    rootDir: input.rootDir,
  });
  requireKnownValue(AUDIT_EVENT_CLASS_SET, input.eventClass, "eventClass");
  requireKnownValue(AUDIT_ACTOR_TYPE_SET, input.actorType, "actorType");

  const db = input.db ?? networkDb;
  const [row] = await db
    .insert(networkSchema.networkAuditEvents)
    .values({
      eventClass: input.eventClass,
      subjectType: requireNonEmpty(input.subjectType, "subjectType"),
      subjectId: requireNonEmpty(input.subjectId, "subjectId"),
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      reasonCode: input.reasonCode ?? null,
      metadata: input.metadata ?? null,
      stepRunId,
      prevHash: null,
      createdAt: input.now ?? new Date(),
    })
    .returning();

  return row;
}
