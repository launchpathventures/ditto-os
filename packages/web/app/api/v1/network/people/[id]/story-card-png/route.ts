/**
 * GET /api/v1/network/people/:id/story-card-png — Brief 290 (Q6).
 *
 * Mirrors card-png/route.ts but renders the canonical silhouette at the
 * Instagram-story 1080×1920 portrait via `NetworkCardOgFrame storyMode`.
 * Same load path (loadCard → applyApprovedPublicClaimsToCard) and the same
 * in-memory rate-limit pattern as card-png (substrate swap deferred per the
 * Brief 290 non-goals; tracked as a follow-up).
 */

import * as React from "react";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { NetworkCardOgFrame } from "@/components/network/card-silhouette";
import { networkDb, isNetworkDbConnectionError } from "../../../../../../../../../src/db/network-db";
import {
  applyApprovedPublicClaimsToCard,
  loadApprovedPublicMemberSignalClaims,
} from "../../../../../../../../../src/engine/member-signal-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_DOWNLOADS_PER_WINDOW = 60;
const downloadRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = downloadRateLimit.get(key);
  if (!entry || entry.resetAt <= now) {
    downloadRateLimit.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_DOWNLOADS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

function ipKey(request: Request, id: string): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  return `${ip}:${id}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const handle = decodeURIComponent(id).trim().toLowerCase();
    if (!checkRateLimit(ipKey(request, handle))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const [user] = await networkDb
      .select()
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.handle, handle))
      .limit(1);
    if (!user?.card) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    const publicClaims = await loadApprovedPublicMemberSignalClaims({ userId: user.id });
    const card = applyApprovedPublicClaimsToCard(user.card, publicClaims);
    const response = new ImageResponse(
      React.createElement(NetworkCardOgFrame, { card, storyMode: true }),
      { width: 1080, height: 1920 },
    );
    response.headers.set("Content-Disposition", `attachment; filename="ditto-story-${handle}.png"`);
    // Deterministic per (handle, approved public claims). A modest public
    // cache cuts repeat Satori 1080×1920 renders; SWR keeps it fresh after
    // a claim change without a cold render on the next request.
    response.headers.set(
      "Cache-Control",
      "public, max-age=3600, stale-while-revalidate=86400",
    );
    return response;
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return NextResponse.json({ error: "network_db_unavailable" }, { status: 503 });
    }
    console.error("[/api/v1/network/people/:id/story-card-png] Error:", error);
    return NextResponse.json({ error: "story_card_png_failed" }, { status: 500 });
  }
}
