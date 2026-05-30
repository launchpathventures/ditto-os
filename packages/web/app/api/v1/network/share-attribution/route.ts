import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb, withNetworkDbAvailability } from "../../../../../../../src/db/network-db";
import { checkRateLimit } from "../../../../../../../src/engine/network-abuse-controls";
import { writeNetworkAuditEvent } from "../../../../../../../src/engine/network-audit";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { SHARE_REF_COOKIE, signRefToken, verifyRefToken } from "../../../../../lib/signed-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set(["land", "convert"]);
const VALID_CHANNELS = new Set([
  "linkedin",
  "x",
  "instagram",
  "email-signature",
  "website-badge",
  "badge",
]);

function visitorIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

function opaqueHash(value: string, label: string): string {
  return createHash("sha256")
    .update(`network-share-attribution:${label}:${value.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

function cleanString(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function postHandler(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
    return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
  }

  const action = cleanString(body.action, 40);
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const channel = cleanString(body.channel, 80);
  if (!channel || !VALID_CHANNELS.has(channel)) {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  const ph = cleanString(body.ph, 200);
  if (!ph) {
    return NextResponse.json({ error: "profile_handle_required" }, { status: 400 });
  }
  const shareRef = await verifyRefToken(cookieValue(request, SHARE_REF_COOKIE) ?? "");
  if (!shareRef || shareRef.channel !== channel || shareRef.ph !== ph) {
    return NextResponse.json({ error: "share_ref_required" }, { status: 400 });
  }

  const ip = visitorIp(request);
  const ipHash = opaqueHash(ip, `ip:${ph}`);
  const rateLimit = await checkRateLimit({
    limitName: "share-attribution",
    actor: { kind: "ip", id: `${ph}:${ipHash}` },
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterSec: rateLimit.retryAfterSec },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSec) },
      },
    );
  }

  const now = new Date();
  const token = await signRefToken({ channel, ph, ts: now.getTime() });
  const stepRunId = await createNetworkLaneStepRun({
    route: "network-share-attribution",
    sessionId: cleanString(body.sessionId, 200) ?? `visitor:${ipHash}`,
    actorId: `visitor:${ipHash}`,
  });

  if (action === "convert") {
    const visitorSid = cleanString(body.visitorSid ?? body.sessionId, 200);
    const visitorSidHash = visitorSid ? opaqueHash(visitorSid, "visitor-sid") : null;
    const ctaTarget = cleanString(body.ctaTarget, 80);
    await networkDb.insert(networkSchema.networkShareAttribution).values({
      profileHandle: ph,
      channel,
      action,
      visitorSidHash,
      ts: now,
      createdAt: now,
    });
    await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "share_attribution_recorded",
      subjectType: "network_profile_share",
      subjectId: ph,
      actorType: "visitor",
      actorId: `visitor:${ipHash}`,
      reasonCode: "visitor_cta_clicked",
      metadata: {
        channel,
        ctaTarget,
      },
    });
  }

  return NextResponse.json({ ok: true, dittoRef: token });
}

export const POST = withNetworkDbAvailability(postHandler);
