import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { networkDb } from "../../../../../src/db/network-db";
import { buildNetworkKbContext } from "../../../../../src/engine/network-kb-context";
import { ProfileChatClient } from "./profile-chat-client";

export const dynamic = "force-dynamic";

interface PeopleProfilePageProps {
  params: Promise<{ handle: string }>;
}

type NetworkUser = typeof networkSchema.networkUsers.$inferSelect;

function normalizeHandle(handle: string): string {
  return decodeURIComponent(handle).trim().toLowerCase();
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_NETWORK_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://ditto.partners"
  ).replace(/\/+$/, "");
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "them";
}

function fallbackCard(user: NetworkUser, handle: string): NetworkProfileCardBlock {
  const name = user.name || handle;
  const now = new Date().toISOString();
  return {
    type: "network-profile-card",
    handle,
    name,
    portraitUrl: null,
    cityLabel: null,
    oneLineRole: user.businessContext || "Working with Ditto",
    signalDots: [
      { id: "profile", label: "Profile", filled: true, color: "lavender" },
      { id: "fit", label: "Fit", filled: false, color: "mint" },
      { id: "edge", label: "Edge", filled: false, color: "canary" },
      { id: "open", label: "Open", filled: Boolean(user.wantsVisibility), color: "petal" },
    ],
    badges: [],
    narrativeMd: user.businessContext || `${name} has not filled out the public card yet.`,
    antiPersonaMd: null,
    greeterCuratedBy: user.personaAssignment === "mira" ? "mira" : "alex",
    lastUpdatedAt: user.updatedAt?.toISOString?.() ?? now,
    visibility: user.wantsVisibility ? "public" : "on-request",
    shareUrl: `${baseUrl()}/people/${handle}`,
    ogImageUrl: `${baseUrl()}/api/og/people/${handle}`,
  };
}

async function loadProfile(handle: string) {
  const [user] = await networkDb
    .select()
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.handle, handle))
    .limit(1);
  if (!user) return null;
  const card = user.card ?? fallbackCard(user, handle);
  const kb = await buildNetworkKbContext({
    userId: user.id,
    audience: "visitor",
  });
  return { user, card, kb };
}

function buildQuickStartPills(card: NetworkProfileCardBlock, facts: Array<{ factMd: string; visibility: string }>): string[] {
  const name = firstName(card.name);
  const differentiator = facts.find((fact) =>
    /\b(different|edge|strong|best|avoid|not|turn)\b/i.test(fact.factMd),
  );
  const publicHook = facts.find((fact) => fact.visibility === "public")?.factMd;
  const differentiatorText = differentiator
    ? `What makes ${name} different?`
    : publicHook
      ? `How does ${name} work?`
      : `Why talk to ${name}?`;

  return [
    `What is ${name} hunting?`,
    differentiatorText,
    `Is this a fit for me?`,
    `I'd like an intro.`,
  ];
}

export async function generateMetadata({ params }: PeopleProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(normalizeHandle(handle));
  if (!profile) {
    return {
      title: "Profile not found - Ditto",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${profile.card.name} - Ditto`,
    description: profile.card.oneLineRole,
    robots: profile.user.wantsVisibility
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title: `${profile.card.name} - Ditto`,
      description: profile.card.oneLineRole,
      images: [{ url: profile.card.ogImageUrl }],
    },
  };
}

export default async function PeopleProfilePage({ params }: PeopleProfilePageProps) {
  const { handle } = await params;
  const normalizedHandle = normalizeHandle(handle);
  const profile = await loadProfile(normalizedHandle);
  if (!profile) notFound();

  const greeterName = profile.card.greeterCuratedBy === "mira" ? "Mira" : "Alex";
  const userFirst = firstName(profile.card.name);
  const quickStartPills = buildQuickStartPills(profile.card, profile.kb.facts);

  return (
    <ProfileChatClient
      card={profile.card}
      handle={normalizedHandle}
      userId={profile.user.id}
      userName={profile.card.name}
      userFirst={userFirst}
      greeterName={greeterName}
      quickStartPills={quickStartPills}
    />
  );
}
