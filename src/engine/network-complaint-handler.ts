/**
 * Network Complaint Handler (Brief 283)
 *
 * Pure handler for AgentMail `message.complained` events. The HTTP route owns
 * Svix verification and wrapper-run minting; this module owns suppression and
 * source/segment auto-pause.
 */

import { and, eq, gte, like } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import {
  hashSuppressionIdentifier,
  recordNetworkSuppression,
  type RecordNetworkSuppressionResult,
} from "./network-suppression";
import { writeNetworkAuditEvent } from "./network-audit";

export interface AgentMailComplaint {
  inboxId: string;
  threadId: string;
  messageId: string;
  timestamp: string;
  type: string;
  subType: string;
  recipients: string[];
}

export interface HandleNetworkComplaintInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  svixId?: string | null;
  complaint: AgentMailComplaint;
  sourceClass?: string | null;
  segmentId?: string | null;
  threshold?: number;
  windowMs?: number;
  now?: Date;
}

export interface HandleNetworkComplaintResult {
  recipientCount: number;
  createdSuppressions: number;
  complaintEventsRecorded: number;
  suppressionResults: RecordNetworkSuppressionResult[];
  sourceClass: string;
  segmentId: string;
  sourceComplaintCount: number;
  segmentComplaintCount: number;
  sourcePaused: boolean;
  segmentPaused: boolean;
}

export const DEFAULT_COMPLAINT_THRESHOLD = 3;
export const DEFAULT_COMPLAINT_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeCounterToken(value: string, fallback: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return clean || fallback;
}

function uniqueEmails(recipients: string[]): string[] {
  const emails = new Set<string>();
  for (const value of recipients) {
    const match = value.match(/<([^>]+)>/);
    const email = (match ? match[1] : value).trim().toLowerCase();
    if (email.includes("@")) emails.add(email);
  }
  return [...emails];
}

async function complaintCount(
  db: NetworkDbLike,
  sourcePattern: { exact?: string; prefix?: string },
  windowStart: Date,
): Promise<number> {
  const rows = await db
    .select({ id: networkSchema.networkAuditEvents.id })
    .from(networkSchema.networkAuditEvents)
    .where(
      and(
        eq(networkSchema.networkAuditEvents.eventClass, "complaint"),
        eq(networkSchema.networkAuditEvents.subjectType, "agentmail_complaint_event"),
        sourcePattern.exact
          ? like(networkSchema.networkAuditEvents.subjectId, `${sourcePattern.exact}:%`)
          : like(networkSchema.networkAuditEvents.subjectId, `${sourcePattern.prefix}%`),
        gte(networkSchema.networkAuditEvents.createdAt, windowStart),
      ),
    );
  return rows.length;
}

async function recordComplaintEventAudit(input: {
  db: NetworkDbLike;
  rootDir?: string;
  stepRunId: string;
  recipient: string;
  sourceClass: string;
  segmentId: string;
  segmentKey: string;
  svixId?: string | null;
  complaint: AgentMailComplaint;
  now: Date;
}): Promise<void> {
  const recipientHash = hashSuppressionIdentifier(input.recipient, "email");
  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "complaint",
    subjectType: "agentmail_complaint_event",
    subjectId: `${input.segmentKey}:${recipientHash}:${input.svixId ?? input.complaint.messageId}`,
    actorType: "system",
    reasonCode: "complaint",
    metadata: {
      recipientHash,
      sourceClass: input.sourceClass,
      segmentId: input.segmentId,
      svixId: input.svixId ?? null,
      inboxId: input.complaint.inboxId,
      threadId: input.complaint.threadId,
      messageId: input.complaint.messageId,
      complaintType: input.complaint.type,
      complaintSubType: input.complaint.subType,
    },
    now: input.now,
  });
}

export async function handleNetworkComplaint(
  input: HandleNetworkComplaintInput,
): Promise<HandleNetworkComplaintResult> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "handle_network_complaint",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const threshold = input.threshold ?? DEFAULT_COMPLAINT_THRESHOLD;
  const windowMs = input.windowMs ?? DEFAULT_COMPLAINT_WINDOW_MS;
  const windowStart = new Date(now.getTime() - windowMs);
  const sourceClass = normalizeCounterToken(input.sourceClass ?? "agentmail", "agentmail");
  const segmentId = normalizeCounterToken(
    input.segmentId ?? input.complaint.inboxId ?? "global",
    "global",
  );
  const segmentKey = `${sourceClass}:${segmentId}`;
  const recipients = uniqueEmails(input.complaint.recipients);
  const suppressionResults: RecordNetworkSuppressionResult[] = [];

  for (const recipient of recipients) {
    await recordComplaintEventAudit({
      db,
      rootDir: input.rootDir,
      stepRunId,
      recipient,
      sourceClass,
      segmentId,
      segmentKey,
      svixId: input.svixId ?? null,
      complaint: input.complaint,
      now,
    });
    suppressionResults.push(
      await recordNetworkSuppression({
        db,
        rootDir: input.rootDir,
        stepRunId,
        identifier: recipient,
        identifierKind: "email",
        scope: "global",
        reason: "complaint",
        source: segmentKey,
        now,
      }),
    );
  }

  const sourceComplaintCount = await complaintCount(
    db,
    { prefix: `${sourceClass}:` },
    windowStart,
  );
  const segmentComplaintCount = await complaintCount(
    db,
    { exact: segmentKey },
    windowStart,
  );

  let sourcePaused = false;
  let segmentPaused = false;
  if (sourceComplaintCount >= threshold) {
    const result = await recordNetworkSuppression({
      db,
      rootDir: input.rootDir,
      stepRunId,
      identifier: sourceClass,
      identifierKind: "source",
      scope: "global",
      reason: "source-pause",
      source: sourceClass,
      now,
    });
    sourcePaused = result.created || result.row.reason === "source-pause";
  }
  if (segmentComplaintCount >= threshold) {
    const result = await recordNetworkSuppression({
      db,
      rootDir: input.rootDir,
      stepRunId,
      identifier: segmentKey,
      identifierKind: "segment",
      scope: "global",
      reason: "segment-pause",
      source: segmentKey,
      now,
    });
    segmentPaused = result.created || result.row.reason === "segment-pause";
  }

  return {
    recipientCount: recipients.length,
    createdSuppressions: suppressionResults.filter((result) => result.created).length,
    complaintEventsRecorded: recipients.length,
    suppressionResults,
    sourceClass,
    segmentId,
    sourceComplaintCount,
    segmentComplaintCount,
    sourcePaused,
    segmentPaused,
  };
}
