/**
 * Network Search Feedback (Brief 274)
 *
 * Records the next-action a seeker takes on a Possible Connection:
 * refine / not-a-fit / save / intro-request / hide / watch /
 * invitation-candidate. Every transition OUT of Manual Search writes a
 * `networkSearchAuditEvents` row with actor, source result id, target
 * lifecycle state, and scrub decision (Brief 274 Lifecycle Boundary).
 *
 * Side-effect guard (Insight-180): `record_network_search_feedback`
 * REQUIRES a `stepRunId`. Without it (outside `DITTO_TEST_MODE`) no
 * feedback row, lifecycle change, or audit event is written.
 *
 * Hard boundaries:
 *  - Manual Search NEVER contacts anyone. `intro-request` is consent-gated
 *    until Brief 276's foundation exists — it degrades to "save proposal"
 *    and records intent only; it never emails, DMs, or invites.
 *  - `invitation-candidate` only queues a public, non-member result for
 *    Brief 279 review. It creates NO Discovery Profile, claim token,
 *    invite, email, or contact attempt.
 *  - `save` only writes the request/result association. The persisted
 *    proposal copy is already scrubbed; private/on-request request fields
 *    are never copied into seeker-facing surfaces.
 */

import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import type { NetworkDbLike } from "./network-kb-storage";

export const RECORD_NETWORK_SEARCH_FEEDBACK_TOOL_NAME =
  "record_network_search_feedback";

export interface RecordNetworkSearchFeedbackInput {
  db?: NetworkDbLike;
  actorId?: string | null;
  userId?: string | null;
  visitorSessionId?: string | null;
  stepRunId?: string | null;
  searchRunId: string;
  possibleConnectionId?: string | null;
  kind: networkSchema.NetworkSearchFeedbackKind;
  reasonText?: string | null;
  refinementText?: string | null;
  /** Active Request id for `save` / consent-gated `intro-request`. */
  requestId?: string | null;
  /** Brief 276 owns the consent foundation; false until it exists. */
  consentFoundationAvailable?: boolean;
  now?: Date;
}

export interface RecordNetworkSearchFeedbackResult {
  feedbackId: string;
  kind: networkSchema.NetworkSearchFeedbackKind;
  lifecycleState: networkSchema.NetworkPossibleConnectionLifecycle | null;
  /** true when intro-request was degraded to "save proposal". */
  consentGated: boolean;
  /** human-facing copy describing what happened. */
  notice: string;
}

const LIFECYCLE_BY_KIND: Partial<
  Record<
    networkSchema.NetworkSearchFeedbackKind,
    networkSchema.NetworkPossibleConnectionLifecycle
  >
> = {
  save: "saved-to-request",
  "invitation-candidate": "invitation-candidate",
  watch: "watched",
  hide: "hidden",
  "not-a-fit": "not-a-fit",
};

const AUDIT_BY_KIND: Record<
  networkSchema.NetworkSearchFeedbackKind,
  networkSchema.NetworkSearchAuditEvent
> = {
  refine: "refine",
  "not-a-fit": "not_a_fit",
  save: "save_to_request",
  "intro-request": "intro_request",
  hide: "hide",
  watch: "watch",
  "invitation-candidate": "invitation_candidate",
};

export async function recordNetworkSearchFeedback(
  input: RecordNetworkSearchFeedbackInput,
): Promise<RecordNetworkSearchFeedbackResult> {
  // Side-effect guard FIRST — before any row write.
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    RECORD_NETWORK_SEARCH_FEEDBACK_TOOL_NAME,
  );
  const db = input.db ?? networkDb;
  const actorId = input.actorId ?? input.userId ?? input.visitorSessionId ?? null;

  if (!input.searchRunId) {
    throw new Error("record_network_search_feedback requires searchRunId");
  }

  // Load the target proposal (when one is targeted) to read its key/source.
  let connection:
    | (typeof networkSchema.networkPossibleConnections.$inferSelect)
    | null = null;
  if (input.possibleConnectionId) {
    const [row] = await db
      .select()
      .from(networkSchema.networkPossibleConnections)
      .where(
        eq(
          networkSchema.networkPossibleConnections.id,
          input.possibleConnectionId,
        ),
      )
      .limit(1);
    connection = row ?? null;
    if (!connection) {
      throw new Error("possible_connection_not_found");
    }
  }

  // Validate boundary-sensitive transitions.
  if (input.kind === "invitation-candidate") {
    if (!connection) {
      throw new Error("invitation-candidate requires a target possible connection");
    }
    if (connection.isDittoMember) {
      throw new Error("invitation-candidate is only valid for off-network, non-member results");
    }
  }
  if ((input.kind === "save" || input.kind === "invitation-candidate") && !connection) {
    throw new Error(`${input.kind} requires a target possible connection`);
  }

  const consentGated =
    input.kind === "intro-request" && !input.consentFoundationAvailable;

  // intro-request without a consent foundation degrades to "save proposal".
  let lifecycleState: networkSchema.NetworkPossibleConnectionLifecycle | null =
    LIFECYCLE_BY_KIND[input.kind] ?? null;
  if (input.kind === "intro-request" && consentGated && connection) {
    lifecycleState = input.requestId ? "saved-to-request" : connection.lifecycleState;
  }

  const proposalKey =
    (connection?.metadata as { proposalKey?: string } | null)?.proposalKey ?? null;

  const [feedback] = await db
    .insert(networkSchema.networkSearchFeedback)
    .values({
      searchRunId: input.searchRunId,
      possibleConnectionId: input.possibleConnectionId ?? null,
      actorId,
      stepRunId,
      kind: input.kind,
      reasonText: input.reasonText ?? null,
      refinementText: input.refinementText ?? null,
      metadata: {
        proposalKey,
        requestId: input.requestId ?? null,
        consentGated,
      },
    })
    .returning({ id: networkSchema.networkSearchFeedback.id });

  let before: Record<string, unknown> | null = null;
  if (connection && lifecycleState && lifecycleState !== connection.lifecycleState) {
    before = { lifecycleState: connection.lifecycleState };
    await db
      .update(networkSchema.networkPossibleConnections)
      .set({
        lifecycleState,
        savedToRequestId:
          input.kind === "save" ? input.requestId ?? null : connection.savedToRequestId,
        updatedAt: input.now ?? new Date(),
      })
      .where(
        eq(
          networkSchema.networkPossibleConnections.id,
          connection.id,
        ),
      );
  }

  await db.insert(networkSchema.networkSearchAuditEvents).values({
    searchRunId: input.searchRunId,
    possibleConnectionId: input.possibleConnectionId ?? null,
    eventType: AUDIT_BY_KIND[input.kind],
    actorId,
    stepRunId,
    targetLifecycleState: lifecycleState,
    scrubDecision: {
      // The persisted proposal copy is already scrubbed; saving copies no
      // private/on-request request fields into seeker-facing surfaces.
      privateFieldsCopied: false,
      scrubApplied: connection?.scrubApplied ?? false,
    },
    before,
    after: {
      kind: input.kind,
      requestId: input.requestId ?? null,
      consentGated,
    },
  });

  return {
    feedbackId: feedback.id,
    kind: input.kind,
    lifecycleState,
    consentGated,
    notice: noticeForKind(input.kind, consentGated),
  };
}

function noticeForKind(
  kind: networkSchema.NetworkSearchFeedbackKind,
  consentGated: boolean,
): string {
  switch (kind) {
    case "refine":
      return "Got it — I'll factor that into the next pass.";
    case "not-a-fit":
      return "Noted. I'll keep that off the table for this search.";
    case "save":
      return "Saved to your request.";
    case "intro-request":
      return consentGated
        ? "I've saved this proposal. I'll only reach out once you've set up how introductions should work."
        : "Routing this into the introduction flow — no one is contacted without consent.";
    case "hide":
      return "Hidden from this search.";
    case "watch":
      return "I'll keep watch and resurface this if it gets stronger.";
    case "invitation-candidate":
      return "Queued for review as someone we might invite later. No outreach happens now.";
    default:
      return "Recorded.";
  }
}
