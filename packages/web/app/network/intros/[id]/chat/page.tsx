/**
 * Chat refinement surface (Brief 288 AC #14).
 *
 * Lands the reviewer (requester or recipient) from a magic-link email.
 * Verifies the signed token server-side, fetches the introduction row,
 * extracts the IntroProposalCardBlock from the transcript, builds the
 * state log from row timestamps (no new block type per D2), and renders
 * the client-side affordances.
 *
 * Token failure → renders an error frame (no DB read).
 * Intro/party mismatch → renders an error frame (no state write).
 */

import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "@engine/../db/network-db";
import type {
  IntroProposalCardBlock,
  IntroProposalCardState,
} from "@engine/content-blocks";
import {
  parseIntroMagicLinkToken,
  scrubProposalCardForRecipient,
} from "@engine/intro-proposal";
import { IntroChatClient } from "./intro-chat-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Review intro — Ditto",
  description: "Approve or decline a Mira-proposed introduction.",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isProposalCardBlock(value: unknown): value is IntroProposalCardBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "intro-proposal-card"
  );
}

function ErrorFrame({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 sm:px-8">
      <section className="mx-auto max-w-3xl space-y-3">
        <p className="text-sm font-medium text-neutral-500">Ditto Network</p>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="text-sm text-neutral-600">{message}</p>
      </section>
    </main>
  );
}

export default async function IntroChatPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;
  const token = firstParam(search.token);
  const partyParam = firstParam(search.party);
  const actionParam = firstParam(search.action);
  const feedbackParam = firstParam(search.feedback);

  if (!token) {
    return (
      <ErrorFrame
        title="This link is missing its token"
        message="Open the link from your most recent intro email."
      />
    );
  }

  const payload = parseIntroMagicLinkToken(token);
  if (!payload) {
    return (
      <ErrorFrame
        title="This link has expired or is invalid"
        message="Magic links are valid for 24 hours. Reply to the original email and we'll send a fresh one."
      />
    );
  }
  if (payload.introId !== id) {
    return (
      <ErrorFrame
        title="Link doesn't match this intro"
        message="Open the link from the intro email you intended to review."
      />
    );
  }

  const party = payload.party;
  if (partyParam && partyParam !== party) {
    return (
      <ErrorFrame
        title="Link party mismatch"
        message="This link was issued to a different party."
      />
    );
  }

  const rows = await networkDb
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return (
      <ErrorFrame
        title="Intro not found"
        message="This proposal may have been withdrawn."
      />
    );
  }

  const transcript = Array.isArray(row.transcript) ? row.transcript : [];
  const block = transcript.find(isProposalCardBlock);
  if (!block) {
    return (
      <ErrorFrame
        title="This intro is missing its proposal card"
        message="Ask Mira to regenerate the proposal — the surface can't render without one."
      />
    );
  }

  const stateLog: { state: IntroProposalCardState; at: string; byParty: "requester" | "recipient" | null }[] = [];
  if (row.createdAt) {
    stateLog.push({
      state: "proposed",
      at: row.createdAt.toISOString(),
      byParty: null,
    });
  }
  if (row.requesterApprovedAt) {
    stateLog.push({
      state: "requester-approved",
      at: row.requesterApprovedAt.toISOString(),
      byParty: "requester",
    });
  }
  if (row.recipientApprovedAt) {
    stateLog.push({
      state: "recipient-approved",
      at: row.recipientApprovedAt.toISOString(),
      byParty: "recipient",
    });
  }
  if (row.threadSentAt) {
    stateLog.push({
      state: "thread-sent",
      at: row.threadSentAt.toISOString(),
      byParty: null,
    });
  }

  const initialAction =
    actionParam === "approve" ||
    actionParam === "decline" ||
    actionParam === "not-now" ||
    actionParam === "edit-and-approve"
      ? actionParam
      : null;
  const initialFeedback =
    feedbackParam === "outcome:useful" ||
    feedbackParam === "outcome:not-useful" ||
    feedbackParam === "outcome:no-outcome-yet"
      ? feedbackParam
      : null;

  const feedbackRows = await networkDb
    .select()
    .from(networkSchema.networkIntroFeedback)
    .where(eq(networkSchema.networkIntroFeedback.introId, id))
    .limit(20);

  // Forward-safety (Brief 288 AC #11 / B4): the recipient must never receive
  // the owner-side card. antiPersonaMd on any embedded network-profile-card is
  // owner-only; scrub it before this surface renders for the recipient party.
  // Requester sees the unscrubbed card (it's their own proposal).
  const ownerSafeBlock = block as IntroProposalCardBlock;
  const renderedBlock =
    party === "recipient"
      ? scrubProposalCardForRecipient(ownerSafeBlock)
      : ownerSafeBlock;

  return (
    <IntroChatClient
      introId={id}
      token={token}
      party={party}
      initialAction={initialAction}
      block={renderedBlock}
      stateLog={stateLog}
      initialState={(row.state as IntroProposalCardState) ?? renderedBlock.state}
      initialFeedback={initialFeedback}
      priorFeedback={feedbackRows.map((feedback) => ({
        id: feedback.id,
        party: feedback.party,
        classifiedCategory: feedback.classifiedCategory,
        outcomeClass: feedback.outcomeClass,
        freeText: feedback.freeText,
        createdAt: feedback.createdAt.toISOString(),
      }))}
    />
  );
}
