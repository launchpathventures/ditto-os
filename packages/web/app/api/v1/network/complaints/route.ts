/**
 * POST /api/v1/network/complaints — AgentMail complaint webhook (Brief 283).
 *
 * Sibling to `/network/inbound`: this route handles `message.complained`
 * only. It verifies Svix first, rejects caller-supplied stepRunId values,
 * checks Svix retry dedup, then atomically claims + handles with a
 * server-side Network lane step run.
 */

import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { networkDb } from "../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import {
  claimNetworkWebhookDelivery,
  hasActiveNetworkWebhookDelivery,
} from "../../../../../../../src/engine/network-webhook-dedup";
import {
  handleNetworkComplaint,
  type AgentMailComplaint,
} from "../../../../../../../src/engine/network-complaint-handler";
import type { NetworkDbLike } from "../../../../../../../src/engine/network-kb-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadRootEnv(): Promise<void> {
  try {
    const { config } = await import("dotenv");
    const path = await import("path");
    config({ path: path.resolve(process.cwd(), "../../.env") });
  } catch {
    // Platform env is sufficient in production.
  }
}

function svixHeaders(request: Request) {
  return {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };
}

function eventTypeOf(raw: Record<string, unknown>): string {
  return String(raw.event_type ?? raw.eventType ?? "");
}

function hasCallerStepRun(raw: Record<string, unknown>, request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.searchParams.has("stepRunId") ||
    Object.prototype.hasOwnProperty.call(raw, "stepRunId")
  );
}

function normalizeComplaint(raw: Record<string, unknown>): AgentMailComplaint | null {
  const complaint = raw.complaint;
  if (!complaint || typeof complaint !== "object") return null;
  const c = complaint as Record<string, unknown>;
  const recipients = Array.isArray(c.recipients)
    ? c.recipients.filter((value): value is string => typeof value === "string")
    : [];
  if (recipients.length === 0) return null;
  return {
    inboxId: String(c.inbox_id ?? c.inboxId ?? ""),
    threadId: String(c.thread_id ?? c.threadId ?? ""),
    messageId: String(c.message_id ?? c.messageId ?? ""),
    timestamp: String(c.timestamp ?? ""),
    type: String(c.type ?? ""),
    subType: String(c.sub_type ?? c.subType ?? ""),
    recipients,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  await loadRootEnv();
  const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[/api/v1/network/complaints] AGENTMAIL_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const headers = svixHeaders(request);
  try {
    new Webhook(webhookSecret).verify(rawBody, headers);
  } catch {
    console.warn("[/api/v1/network/complaints] Invalid or missing signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (hasCallerStepRun(payload, request)) {
    return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
  }

  const eventType = eventTypeOf(payload);
  if (eventType !== "message.complained") {
    return NextResponse.json({ error: "unsupported_event_type" }, { status: 400 });
  }

  const svixId = headers["svix-id"];
  if (!svixId) {
    return NextResponse.json({ error: "svix_id_required" }, { status: 400 });
  }
  if (await hasActiveNetworkWebhookDelivery(svixId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const complaint = normalizeComplaint(payload);
  if (!complaint) {
    return NextResponse.json({ error: "invalid_complaint_payload" }, { status: 400 });
  }

  const stepRunId = await createNetworkLaneStepRun({
    route: "network-complaint",
    sessionId: complaint.threadId || null,
    actorId: complaint.inboxId || null,
  });
  const handled = await networkDb.transaction(async (tx) => {
    const db = tx as unknown as NetworkDbLike;
    const claim = await claimNetworkWebhookDelivery({
      db,
      svixId,
      eventType,
      stepRunId,
    });
    if (!claim.claimed) return { duplicate: true as const };

    const result = await handleNetworkComplaint({
      db,
      stepRunId,
      svixId,
      complaint,
      sourceClass: stringOrNull(payload.source_class) ?? stringOrNull(payload.sourceClass) ?? "agentmail",
      segmentId: stringOrNull(payload.segment_id) ?? stringOrNull(payload.segmentId) ?? complaint.inboxId,
    });
    return { duplicate: false as const, result };
  });

  if (handled.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  return NextResponse.json({ ok: true, result: handled.result });
}
