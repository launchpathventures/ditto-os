import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { NetworkCardOgFrame } from "@/components/network/card-silhouette";
import { networkDb } from "../../../../../src/db/network-db";
import {
  applyApprovedPublicClaimsToCard,
  loadApprovedPublicMemberSignalClaims,
} from "../../../../../src/engine/member-signal-review";

export const runtime = "nodejs";
export const alt = "Ditto network profile card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_NETWORK_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://ditto.partners"
  ).replace(/\/+$/, "");
}

function fallbackCard(handle: string): NetworkProfileCardBlock {
  const now = new Date().toISOString();
  return {
    type: "network-profile-card",
    handle,
    name: "Ditto Network",
    portraitUrl: null,
    cityLabel: "ditto.partners",
    oneLineRole: "Useful people, represented clearly",
    signalDots: [
      { id: "profile", label: "Profile", filled: true, color: "lavender" },
      { id: "fit", label: "Fit", filled: true, color: "mint" },
      { id: "edge", label: "Edge", filled: true, color: "canary" },
      { id: "open", label: "Open", filled: true, color: "petal" },
    ],
    badges: [{ label: "network", color: "lavender" }],
    narrativeMd: "A clearer way to *meet* the right person.",
    antiPersonaMd: "generic directories",
    greeterCuratedBy: "alex",
    lastUpdatedAt: now,
    visibility: "public",
    shareUrl: `${baseUrl()}/people/${handle}`,
    ogImageUrl: `${baseUrl()}/people/${handle}/opengraph-image`,
  };
}

async function loadCard(handle: string): Promise<NetworkProfileCardBlock> {
  const normalized = decodeURIComponent(handle).trim().toLowerCase();
  const [user] = await networkDb
    .select()
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.handle, normalized))
    .limit(1);
  if (!user?.card) return fallbackCard(normalized);
  const publicClaims = await loadApprovedPublicMemberSignalClaims({ userId: user.id });
  return {
    ...applyApprovedPublicClaimsToCard(user.card, publicClaims),
    shareUrl: `${baseUrl()}/people/${normalized}`,
    ogImageUrl: `${baseUrl()}/people/${normalized}/opengraph-image`,
  };
}

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const card = await loadCard(handle).catch(() => fallbackCard(handle));
  return new ImageResponse(<NetworkCardOgFrame card={card} />, {
    width: 1200,
    height: 630,
  });
}
