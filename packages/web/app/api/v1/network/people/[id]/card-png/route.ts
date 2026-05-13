import * as React from "react";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { NetworkCardOgFrame } from "@/components/network/card-silhouette";
import { networkDb, isNetworkDbConnectionError } from "../../../../../../../../../src/db/network-db";

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
    const response = new ImageResponse(
      React.createElement(NetworkCardOgFrame, { card: user.card }),
      { width: 1200, height: 630 },
    );
    response.headers.set("Content-Disposition", `attachment; filename="ditto-card-${handle}.png"`);
    return response;
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return NextResponse.json({ error: "network_db_unavailable" }, { status: 503 });
    }
    console.error("[/api/v1/network/people/:id/card-png] Error:", error);
    return NextResponse.json({ error: "card_png_failed" }, { status: 500 });
  }
}
