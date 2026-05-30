import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import type {
  IntroProposalCardBlock,
  IntroProposalCardState,
} from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brief 288 AC #18 — actions a workspace party can take on a Mira-proposed
// intro from their imported in-workspace card. The network deployment resolves
// the acting party (requester vs. recipient) from the bearer-token identity
// and re-validates against the party's allowed set before minting a wrapper
// run (Insight-239); this consumer-side allowlist is a fail-fast mirror so a
// malformed client action never triggers a cross-deployment round-trip.
const CONSENT_ACTIONS: ReadonlySet<string> = new Set([
  "approve",
  "decline",
  "not-now",
  "edit-and-approve",
]);

function isIntroProposalCardBlock(value: unknown): value is IntroProposalCardBlock {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "intro-proposal-card",
  );
}

/**
 * Local resolved state for a workspace-side consent action so a reload renders
 * the resolved card with NO Network round-trip (AC #18). Never regresses: a
 * decline/not-now is terminal; an approve advances exactly one step from
 * whichever side the imported card was awaiting. An action that does not apply
 * to the card's current state leaves it untouched.
 */
function nextLocalState(
  current: IntroProposalCardState,
  action: string,
): IntroProposalCardState {
  if (action === "decline") return "declined";
  if (action === "not-now") return "not-now";
  // approve | edit-and-approve
  if (current === "proposed") return "requester-approved";
  if (current === "recipient-asked") return "recipient-approved";
  return current;
}

/**
 * Persist the terminal/advanced state onto the imported inbox activity that
 * carries this intro-proposal-card. Idempotent: re-applying the same action
 * computes the same resolved state, and a later Network re-pull cannot regress
 * it because the import route is dedupe-keyed on delivery id and never
 * overwrites an existing activity row. Returns the resolved state, or null
 * when no imported card matches (the Network propagation is still attempted by
 * the caller — local mirroring is best-effort, not the source of truth).
 */
async function updateImportedIntroBlock(
  introId: string,
  action: string,
): Promise<IntroProposalCardState | null> {
  const { db, schema } = await import("../../../../../../../../src/db");
  const rows = await db
    .select({
      id: schema.activities.id,
      metadata: schema.activities.metadata,
      contentBlock: schema.activities.contentBlock,
      description: schema.activities.description,
    })
    .from(schema.activities)
    .where(eq(schema.activities.action, "workspace_inbox_delivery"))
    .orderBy(desc(schema.activities.createdAt))
    .limit(200);

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const blocks = Array.isArray(metadata.blocks) ? metadata.blocks : [];
    const blockIndex = blocks.findIndex(
      (candidate) =>
        isIntroProposalCardBlock(candidate) && candidate.introId === introId,
    );
    if (blockIndex === -1) continue;

    const existingBlock = blocks[blockIndex] as IntroProposalCardBlock;
    const resolvedState = nextLocalState(existingBlock.state, action);
    const nextBlock: IntroProposalCardBlock = {
      ...existingBlock,
      state: resolvedState,
    };
    const nextBlocks = blocks.map((candidate, index) =>
      index === blockIndex ? nextBlock : candidate,
    );
    const currentContentBlock = row.contentBlock as
      | IntroProposalCardBlock
      | null;
    const nextContentBlock =
      isIntroProposalCardBlock(currentContentBlock) &&
      currentContentBlock.introId === introId
        ? { ...currentContentBlock, state: resolvedState }
        : currentContentBlock;

    await db
      .update(schema.activities)
      .set({
        description: `${existingBlock.header} (${resolvedState})`,
        metadata: {
          ...metadata,
          blocks: nextBlocks,
          introState: resolvedState,
          introResolvedAt: new Date().toISOString(),
        },
        contentBlock: nextContentBlock as unknown as Record<
          string,
          unknown
        > | null,
      })
      .where(eq(schema.activities.id, row.id));
    return resolvedState;
  }
  return null;
}

/**
 * Propagate the terminal action back to `network.introductions` via the
 * existing wrapper-run write path (the network PATCH mints the step run
 * server-side; the workspace never supplies a stepRunId — Insight-232). Best
 * effort: a network outage must not lose the locally-persisted decision, which
 * a future pull-and-ack reconciliation can replay.
 */
async function notifyNetworkIntroConsent(payload: {
  introId: string;
  consentAction: string;
  edit: string | null;
  declineCategory: string | null;
}): Promise<void> {
  const url = process.env.DITTO_NETWORK_URL?.replace(/\/+$/, "");
  const token = process.env.DITTO_NETWORK_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/api/v1/network/intros`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      introId: payload.introId,
      consentAction: payload.consentAction,
      ...(payload.edit ? { edit: payload.edit } : {}),
      ...(payload.declineCategory
        ? { declineCategory: payload.declineCategory }
        : {}),
    }),
  }).catch(() => null);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const introId = typeof body.introId === "string" ? body.introId : "";
  const consentAction =
    typeof body.consentAction === "string" ? body.consentAction : "";
  if (!introId || !CONSENT_ACTIONS.has(consentAction)) {
    return NextResponse.json(
      { error: "invalid_intro_consent_action" },
      { status: 400 },
    );
  }
  const edit = typeof body.edit === "string" ? body.edit : null;
  const declineCategory =
    typeof body.declineCategory === "string" ? body.declineCategory : null;

  const resolvedState = await updateImportedIntroBlock(introId, consentAction);
  await notifyNetworkIntroConsent({
    introId,
    consentAction,
    edit,
    declineCategory,
  });
  return NextResponse.json({
    updated: resolvedState !== null,
    state: resolvedState,
  });
}
