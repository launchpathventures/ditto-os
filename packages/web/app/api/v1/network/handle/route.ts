import { NextResponse } from "next/server";
import { networkDb } from "../../../../../../../src/db/network-db";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import * as networkSchema from "@ditto/core/db/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClaimHandleBody {
  sessionId?: string | null;
  name?: string | null;
  handle?: string | null;
  card?: unknown;
  wantsVisibility?: boolean;
  triggerUpsell?: boolean;
}

type HandleClaimReason = "empty" | "too-short" | "invalid-format" | "reserved" | "taken";

function syntheticEmail(sessionId: string): string {
  return `network-${sessionId}@ditto.local`;
}

function isUniqueHandleConflict(error: unknown): boolean {
  const err = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  if (err.code !== "23505") return false;

  return [err.constraint, err.constraint_name, err.message].some(
    (value) => typeof value === "string" && value.includes("network_users_handle"),
  );
}

const CARD_COLORS = new Set(["petal", "mint", "canary", "lavender"]);
const CARD_VISIBILITY = new Set(["public", "on-request", "off"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function sanitizeNetworkProfileCard(value: unknown): NetworkProfileCardBlock | null {
  if (!isRecord(value) || value.type !== "network-profile-card") return null;

  const portraitUrl = stringOrNull(value.portraitUrl);
  const cityLabel = stringOrNull(value.cityLabel);
  const antiPersonaMd = stringOrNull(value.antiPersonaMd);
  if (portraitUrl === undefined || cityLabel === undefined || antiPersonaMd === undefined) {
    return null;
  }

  const handle = value.handle;
  const name = value.name;
  const oneLineRole = value.oneLineRole;
  const narrativeMd = value.narrativeMd;
  const lastUpdatedAt = value.lastUpdatedAt;
  const shareUrl = value.shareUrl;
  const ogImageUrl = value.ogImageUrl;
  if (
    typeof handle !== "string" ||
    typeof name !== "string" ||
    typeof oneLineRole !== "string" ||
    typeof narrativeMd !== "string" ||
    typeof lastUpdatedAt !== "string" ||
    typeof shareUrl !== "string" ||
    typeof ogImageUrl !== "string" ||
    !handle.trim() ||
    !name.trim() ||
    !oneLineRole.trim() ||
    !narrativeMd.trim() ||
    !lastUpdatedAt.trim() ||
    !shareUrl.trim() ||
    !ogImageUrl.trim()
  ) {
    return null;
  }

  if (value.greeterCuratedBy !== "alex" && value.greeterCuratedBy !== "mira") return null;
  if (typeof value.visibility !== "string" || !CARD_VISIBILITY.has(value.visibility)) return null;
  if (!Array.isArray(value.signalDots) || value.signalDots.length === 0) return null;
  if (!Array.isArray(value.badges)) return null;

  const signalDots = value.signalDots.slice(0, 6).map((dot) => {
    if (!isRecord(dot)) return null;
    if (typeof dot.id !== "string" || typeof dot.label !== "string") return null;
    if (typeof dot.filled !== "boolean") return null;
    if (typeof dot.color !== "string" || !CARD_COLORS.has(dot.color)) return null;
    return {
      id: dot.id,
      label: dot.label,
      filled: dot.filled,
      color: dot.color as NetworkProfileCardBlock["signalDots"][number]["color"],
    };
  });
  if (signalDots.some((dot) => dot === null)) return null;

  const badges = value.badges.slice(0, 3).map((badge) => {
    if (!isRecord(badge) || typeof badge.label !== "string") return null;
    if (badge.color !== undefined && (typeof badge.color !== "string" || !CARD_COLORS.has(badge.color))) {
      return null;
    }
    return {
      label: badge.label,
      ...(badge.color
        ? { color: badge.color as NetworkProfileCardBlock["badges"][number]["color"] }
        : {}),
    };
  });
  if (badges.some((badge) => badge === null)) return null;

  return {
    type: "network-profile-card",
    handle: handle.trim(),
    name: name.trim(),
    portraitUrl,
    cityLabel,
    oneLineRole: oneLineRole.trim(),
    signalDots: signalDots as NetworkProfileCardBlock["signalDots"],
    badges: badges as NetworkProfileCardBlock["badges"],
    narrativeMd: narrativeMd.trim(),
    antiPersonaMd: antiPersonaMd?.trim() || null,
    greeterCuratedBy: value.greeterCuratedBy,
    lastUpdatedAt: lastUpdatedAt.trim(),
    visibility: value.visibility as NetworkProfileCardBlock["visibility"],
    shareUrl: shareUrl.trim(),
    ogImageUrl: ogImageUrl.trim(),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ClaimHandleBody;
    const sessionId = body.sessionId?.trim() || null;
    const card = sanitizeNetworkProfileCard(body.card);
    const requestedHandle = body.handle?.trim() || card?.handle || "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 },
      );
    }
    if (!requestedHandle) {
      return NextResponse.json(
        { error: "handle is required." },
        { status: 400 },
      );
    }
    if (!card) {
      return NextResponse.json(
        { error: "valid network profile card is required." },
        { status: 400 },
      );
    }

    const [
      { db, schema },
      { and, eq, sql },
      { suggestHandleAlternatives, validateHandle },
      { createNetworkLaneStepRun },
      { maybeFireWorkspaceUpsell },
    ] = await Promise.all([
      import("../../../../../../../src/db"),
      import("drizzle-orm"),
      import("../../../../../../../src/engine/handle-claim"),
      import("../../../../../../../src/engine/network-step-run"),
      import("../../../../../../../src/engine/workspace-upsell-trigger"),
    ]);

    const [session] = await db
      .select({
        authenticatedEmail: schema.chatSessions.authenticatedEmail,
      })
      .from(schema.chatSessions)
      .where(
        and(
          eq(schema.chatSessions.sessionId, sessionId),
          eq(schema.chatSessions.context, "expert"),
          sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
        ),
      );
    if (!session) {
      return NextResponse.json(
        { error: "A valid expert lane session is required before claiming a handle." },
        { status: 403 },
      );
    }

    const email = session?.authenticatedEmail?.trim().toLowerCase() || syntheticEmail(sessionId);

    const [currentUser] = await networkDb
      .select({
        id: networkSchema.networkUsers.id,
        email: networkSchema.networkUsers.email,
        handle: networkSchema.networkUsers.handle,
      })
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.email, email));

    const userId = currentUser?.id ?? sessionId ?? email;
    let persistedUserId = currentUser?.id ?? null;

    async function availableAlternatives(seed: string, count = 2): Promise<string[]> {
      const blocked = new Set<string>([seed]);
      const alternatives: string[] = [];
      while (alternatives.length < count && blocked.size < 30) {
        const [candidate] = suggestHandleAlternatives(seed, blocked, 1);
        if (!candidate) break;

        const [taken] = await networkDb
          .select({ id: networkSchema.networkUsers.id })
          .from(networkSchema.networkUsers)
          .where(eq(networkSchema.networkUsers.handle, candidate))
          .limit(1);
        blocked.add(candidate);
        if (!taken || taken.id === currentUser?.id) {
          alternatives.push(candidate);
        }
      }
      return alternatives;
    }

    const validation = validateHandle(requestedHandle);

    if (!validation.ok) {
      const seed = validation.normalized || userId;
      return NextResponse.json(
        {
          ok: false,
          reason: validation.reason ?? "invalid-format",
          alternatives: await availableAlternatives(seed),
        },
        { status: 409 },
      );
    }

    const handle = validation.normalized;
    const [handleOwner] = await networkDb
      .select({ id: networkSchema.networkUsers.id })
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.handle, handle))
      .limit(1);
    if (handleOwner && handleOwner.id !== currentUser?.id) {
      const alternatives = await availableAlternatives(handle);
      return NextResponse.json(
        {
          ok: false,
          reason: "taken" satisfies HandleClaimReason,
          alternatives,
        },
        { status: 409 },
      );
    }

    const shareUrl = `https://ditto.partners/people/${handle}`;
    const cardToPersist: NetworkProfileCardBlock = {
      ...card,
      handle,
      shareUrl,
      ogImageUrl: card.ogImageUrl || `${shareUrl}/opengraph-image`,
      visibility: body.wantsVisibility ? "public" : card.visibility,
    };
    const values = {
      name: body.name?.trim() || card.name,
      handle,
      wantsVisibility: Boolean(body.wantsVisibility),
      card: cardToPersist,
      updatedAt: new Date(),
    };

    try {
      if (currentUser) {
        await networkDb
          .update(networkSchema.networkUsers)
          .set(values)
          .where(eq(networkSchema.networkUsers.id, currentUser.id));
        persistedUserId = currentUser.id;
      } else {
        const [inserted] = await networkDb
          .insert(networkSchema.networkUsers)
          .values({
            email,
            ...values,
          })
          .returning({ id: networkSchema.networkUsers.id });
        persistedUserId = inserted.id;
      }
    } catch (error) {
      if (isUniqueHandleConflict(error)) {
        return NextResponse.json(
          {
            ok: false,
            reason: "taken" satisfies HandleClaimReason,
            alternatives: await availableAlternatives(handle),
          },
          { status: 409 },
        );
      }
      throw error;
    }

    let upsell:
      | { fired: boolean; copy: string | null; declineLabel: string }
      | null = null;
    if (body.triggerUpsell === true && persistedUserId) {
      const stepRunId = await createNetworkLaneStepRun({
        route: "network-handle-upsell",
        sessionId,
        actorId: persistedUserId,
      });
      upsell = await maybeFireWorkspaceUpsell({
        stepRunId,
        userId: persistedUserId,
        trigger: "expert-q6",
        handle,
      });
    }

    return NextResponse.json({
      ok: true,
      handle,
      shareUrl,
      card: cardToPersist,
      upsell: upsell?.fired ?? false,
      upsellCopy: upsell?.copy ?? null,
      upsellDeclineLabel: upsell?.declineLabel ?? null,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      console.error(
        "[/api/v1/network/handle] network DB unavailable:",
        error,
      );
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/handle] Error:", error);
    return NextResponse.json(
      { error: "Could not claim that handle." },
      { status: 500 },
    );
  }
}
