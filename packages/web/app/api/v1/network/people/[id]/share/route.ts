import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { networkDb, isNetworkDbConnectionError } from "../../../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import {
  generateShareVariants,
  isShareChannel,
  type ShareChannel,
} from "../../../../../../../../../src/engine/generate-share-variants";
import { writeNetworkAuditEvent } from "../../../../../../../../../src/engine/network-audit";
import { checkRateLimit } from "../../../../../../../../../src/engine/network-abuse-controls";
import {
  applyApprovedPublicClaimsToCard,
  loadApprovedPublicMemberSignalClaims,
} from "../../../../../../../../../src/engine/member-signal-review";
import { resolveNetworkLaneSession } from "../../../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNetworkProfileCard(value: unknown): value is NetworkProfileCardBlock {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<NetworkProfileCardBlock>;
  return (
    card.type === "network-profile-card" &&
    typeof card.handle === "string" &&
    typeof card.name === "string" &&
    typeof card.oneLineRole === "string" &&
    typeof card.narrativeMd === "string" &&
    Array.isArray(card.signalDots) &&
    Array.isArray(card.badges)
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const handle = decodeURIComponent(id).trim().toLowerCase();
    const body = await request.json() as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    // Insight-239: validate the channel allow-list BEFORE any wrapper-run is
    // minted. Missing channel defaults to "linkedin" for Brief 260 callers
    // (the compact modal and Brief 254 call sites omit the field).
    // "website-badge" is in the allow-list (it is a valid ShareChannel); the
    // Studio UI never POSTs it, but a direct API caller may — the engine
    // short-circuits it to content-free static text. Auditing that request
    // (rate-limit slot + audit row) is intentional, not a leak.
    const channel: ShareChannel =
      body.channel === undefined ? "linkedin" : (body.channel as ShareChannel);
    if (body.channel !== undefined && !isShareChannel(body.channel)) {
      return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const session = await resolveNetworkLaneSession({
      sessionId,
      context: "expert",
      fallbackUserId: typeof body.userId === "string" ? body.userId : null,
    });
    if (!session) return NextResponse.json({ error: "expert_session_required" }, { status: 403 });

    const rateLimit = await checkRateLimit({
      limitName: "share-studio-variant",
      actor: { kind: "user", id: session.userId },
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

    const [user] = await networkDb
      .select()
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.handle, handle))
      .limit(1);
    if (!user?.card || user.id !== session.userId) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const kb = await networkDb
      .select({
        factMd: networkSchema.networkUserKbFacts.factMd,
        visibility: networkSchema.networkUserKbFacts.visibility,
        status: networkSchema.networkUserKbFacts.status,
        sourceLabel: networkSchema.networkUserKbFacts.sourceLabel,
      })
      .from(networkSchema.networkUserKbFacts)
      .where(eq(networkSchema.networkUserKbFacts.userId, user.id));

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-share",
      sessionId: session.sessionId,
      actorId: session.actorId,
    });
    const bodyCard = isNetworkProfileCard(body.card) && body.card.handle === handle ? body.card : null;
    const publicClaims = await loadApprovedPublicMemberSignalClaims({ userId: user.id });
    const card = applyApprovedPublicClaimsToCard(bodyCard ?? user.card, publicClaims);
    const variants = await generateShareVariants({
      stepRunId,
      card,
      channel,
      kb,
    });
    await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "share_studio_variant_generated",
      subjectType: "network_profile_share",
      subjectId: user.id,
      actorType: "user",
      actorId: session.actorId,
      reasonCode: "share_variants_generated",
      metadata: {
        handle,
        channel,
        variantKeys: Object.keys(variants),
        approvedPublicClaimCount: publicClaims.length,
      },
    });
    return NextResponse.json(variants);
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return NextResponse.json({ error: "network_db_unavailable" }, { status: 503 });
    }
    console.error("[/api/v1/network/people/:id/share] Error:", error);
    return NextResponse.json({ error: "share_variants_failed" }, { status: 500 });
  }
}
