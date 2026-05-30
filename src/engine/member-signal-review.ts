import { and, eq, inArray } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@ditto/core";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import type { NetworkDbLike } from "./network-kb-storage";

export const UPDATE_MEMBER_SIGNAL_CLAIM_TOOL_NAME = "update_member_signal_claim";

type SignalClaim = typeof networkSchema.networkSignalClaims.$inferSelect;
type SignalVisibility = networkSchema.NetworkSignalClaimVisibility;

export type MemberSignalClaimAction =
  | "approve"
  | "edit"
  | "hide"
  | "delete"
  | "visibility";

export interface UpdateMemberSignalClaimInput {
  db?: NetworkDbLike;
  userId: string;
  claimId: string;
  action: MemberSignalClaimAction;
  claimText?: string | null;
  visibility?: SignalVisibility | null;
  stepRunId?: string | null;
  actorId?: string | null;
  now?: Date;
}

function eventTypeForAction(action: MemberSignalClaimAction): networkSchema.NetworkSignalReviewEventType {
  if (action === "approve") return "claim_approved";
  if (action === "edit") return "claim_edited";
  if (action === "hide") return "claim_hidden";
  if (action === "delete") return "claim_hidden";
  return "claim_visibility_changed";
}

function visibleClaimsOnly(claims: SignalClaim[]): SignalClaim[] {
  return claims.filter(
    (claim) =>
      claim.visibility === "public" &&
      (claim.approvalState === "approved" || claim.approvalState === "edited"),
  );
}

export async function updateMemberSignalClaim(
  input: UpdateMemberSignalClaimInput,
): Promise<SignalClaim | null> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const stepRunId = requireNetworkStepRunId(input.stepRunId, "update_member_signal_claim");
  const [before] = await db
    .select()
    .from(networkSchema.networkSignalClaims)
    .where(
      and(
        eq(networkSchema.networkSignalClaims.id, input.claimId),
        eq(networkSchema.networkSignalClaims.userId, input.userId),
      ),
    )
    .limit(1);
  if (!before) return null;

  const next: Partial<typeof networkSchema.networkSignalClaims.$inferInsert> = {
    updatedAt: now,
  };
  if (input.action === "approve") {
    next.approvalState = "approved";
    if (input.visibility) next.visibility = input.visibility;
  }
  if (input.action === "edit") {
    const text = input.claimText?.trim();
    if (!text) throw new Error("Edited Member Signal claim requires claimText");
    next.claimText = text;
    next.approvalState = "edited";
    if (input.visibility) next.visibility = input.visibility;
  }
  if (input.action === "hide") {
    next.approvalState = "hidden";
    next.visibility = "hidden";
  }
  if (input.action === "delete") {
    next.approvalState = "rejected";
    next.visibility = "hidden";
    next.metadata = {
      ...(before.metadata ?? {}),
      deletedAt: now.toISOString(),
      deletedByActorId: input.actorId ?? null,
    };
  }
  if (input.action === "visibility") {
    if (!input.visibility) throw new Error("Member Signal visibility update requires visibility");
    next.visibility = input.visibility;
  }

  const [updated] = await db
    .update(networkSchema.networkSignalClaims)
    .set(next)
    .where(eq(networkSchema.networkSignalClaims.id, before.id))
    .returning();

  await db.insert(networkSchema.networkSignalReviewEvents).values({
    memberSignalId: before.memberSignalId,
    claimId: before.id,
    userId: input.userId,
    eventType: eventTypeForAction(input.action),
    actorId: input.actorId ?? null,
    stepRunId,
    before: {
      claimText: before.claimText,
      visibility: before.visibility,
      approvalState: before.approvalState,
    },
    after: {
      claimText: updated.claimText,
      visibility: updated.visibility,
      approvalState: updated.approvalState,
    },
    createdAt: now,
  });

  if (updated.visibility === "public" && (updated.approvalState === "approved" || updated.approvalState === "edited")) {
    await db
      .update(networkSchema.networkMemberSignals)
      .set({
        status: "published",
        approvedAt: now,
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(networkSchema.networkMemberSignals.id, updated.memberSignalId));
  }

  return updated;
}

export async function loadApprovedPublicMemberSignalClaims({
  db = networkDb,
  userId,
}: {
  db?: NetworkDbLike;
  userId: string;
}): Promise<SignalClaim[]> {
  const claims = await db
    .select()
    .from(networkSchema.networkSignalClaims)
    .where(
      and(
        eq(networkSchema.networkSignalClaims.userId, userId),
        eq(networkSchema.networkSignalClaims.visibility, "public"),
        inArray(networkSchema.networkSignalClaims.approvalState, ["approved", "edited"]),
      ),
    );
  return visibleClaimsOnly(claims);
}

function claimBySection(claims: SignalClaim[], section: networkSchema.NetworkSignalClaimSection): SignalClaim | null {
  return claims.find((claim) => claim.section === section) ?? null;
}

function compactClaim(value: string, max = 150): string {
  const clean = value.replace(/^inferred by Ditto:\s*/i, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function applyApprovedPublicClaimsToCard(
  card: NetworkProfileCardBlock,
  claims: SignalClaim[],
): NetworkProfileCardBlock {
  const publicClaims = visibleClaimsOnly(claims);
  if (publicClaims.length === 0) return card;

  const knownFor = claimBySection(publicClaims, "knownFor");
  const canHelpWith = claimBySection(publicClaims, "canHelpWith");
  const proof = claimBySection(publicClaims, "proof");
  const currentFocus = claimBySection(publicClaims, "currentFocus");
  const sourceSummary = claimBySection(publicClaims, "sourceSummary");
  const narrativeLines = [knownFor, canHelpWith, currentFocus, proof]
    .filter((claim): claim is SignalClaim => Boolean(claim))
    .map((claim) => `- ${compactClaim(claim.claimText, 220)} (${claim.sourceLabel})`);

  return {
    ...card,
    oneLineRole: compactClaim(knownFor?.claimText || canHelpWith?.claimText || card.oneLineRole, 110),
    narrativeMd: narrativeLines.length > 0
      ? narrativeLines.join("\n")
      : card.narrativeMd,
    antiPersonaMd: claimBySection(publicClaims, "notAFitFor")?.claimText ?? card.antiPersonaMd,
    badges: [
      ...(canHelpWith ? [{ label: "can help", color: "mint" as const }] : []),
      ...(proof ? [{ label: "proof", color: "canary" as const }] : []),
      ...(sourceSummary ? [{ label: "sourced", color: "lavender" as const }] : []),
    ].slice(0, 3),
    lastUpdatedAt: new Date(
      Math.max(...publicClaims.map((claim) => claim.updatedAt?.getTime?.() ?? Date.now())),
    ).toISOString(),
    visibility: "public",
  };
}
