/**
 * Network Privacy Export Bundle (Brief 284, R-Q6)
 *
 * Assembles the per-subject export payload for `/api/v1/network/privacy/export`.
 * The bundle is transient — produced on demand, streamed in the route response,
 * never persisted to durable storage. No `ArtifactBlock`, no signed-URL upload.
 *
 * Snapshot semantics (parent §Concurrent export/delete race contract):
 *   - The bundle assembler accepts a `snapshotAt` timestamp and filters rows
 *     created before that moment, so a delete arriving mid-assembly cannot
 *     retroactively redact data the snapshot already saw.
 *   - Each row is checked against `isSubjectTombstoned` before inclusion. If
 *     the subject becomes tombstoned between snapshot-time and per-row check,
 *     the row is skipped and counted in `skippedTombstoned`.
 */

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import {
  isSubjectTombstoned,
  type NetworkTombstoneSubjectType,
} from "./network-tombstones";

export type NetworkExportSubjectType = NetworkTombstoneSubjectType;

export interface AssembleExportBundleInput {
  db?: NetworkDbLike;
  subjectType: NetworkExportSubjectType;
  subjectId: string;
  /** Snapshot horizon — rows with `created_at > snapshotAt` are excluded so a
   *  late-arriving write cannot alter what the export reports. Defaults to now. */
  snapshotAt?: Date;
}

export interface ExportBundleSection<Row> {
  table: string;
  rows: Row[];
}

export interface NetworkExportBundle {
  subjectType: NetworkExportSubjectType;
  subjectId: string;
  snapshotAt: string;
  skippedTombstoned: number;
  sections: Record<string, ExportBundleSection<Record<string, unknown>>>;
}

export async function assembleExportBundle(
  input: AssembleExportBundleInput,
): Promise<NetworkExportBundle> {
  const db = input.db ?? networkDb;
  const snapshotAt = input.snapshotAt ?? new Date();
  const sections: NetworkExportBundle["sections"] = {};
  let skippedTombstoned = 0;

  switch (input.subjectType) {
    case "member-signal": {
      if (await isSubjectTombstoned("member-signal", input.subjectId, { db })) {
        skippedTombstoned += 1;
        break;
      }
      const signals = await db
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(
          and(
            eq(networkSchema.networkMemberSignals.id, input.subjectId),
            lte(networkSchema.networkMemberSignals.createdAt, snapshotAt),
          ),
        );
      sections["network_member_signals"] = { table: "network_member_signals", rows: signals };
      const sources = await db
        .select()
        .from(networkSchema.networkSignalSources)
        .where(
          and(
            eq(networkSchema.networkSignalSources.memberSignalId, input.subjectId),
            lte(networkSchema.networkSignalSources.createdAt, snapshotAt),
          ),
        );
      sections["network_signal_sources"] = { table: "network_signal_sources", rows: sources };
      const claims = await db
        .select()
        .from(networkSchema.networkSignalClaims)
        .where(
          and(
            eq(networkSchema.networkSignalClaims.memberSignalId, input.subjectId),
            lte(networkSchema.networkSignalClaims.createdAt, snapshotAt),
          ),
        );
      sections["network_signal_claims"] = { table: "network_signal_claims", rows: claims };
      break;
    }
    case "request": {
      if (await isSubjectTombstoned("request", input.subjectId, { db })) {
        skippedTombstoned += 1;
        break;
      }
      const requests = await db
        .select()
        .from(networkSchema.networkJobRequests)
        .where(
          and(
            eq(networkSchema.networkJobRequests.id, input.subjectId),
            lte(networkSchema.networkJobRequests.createdAt, snapshotAt),
          ),
        );
      sections["network_job_requests"] = { table: "network_job_requests", rows: requests };
      const audit = await db
        .select()
        .from(networkSchema.networkRequestAuditEvents)
        .where(
          and(
            eq(networkSchema.networkRequestAuditEvents.requestId, input.subjectId),
            lte(networkSchema.networkRequestAuditEvents.createdAt, snapshotAt),
          ),
        );
      sections["network_request_audit_events"] = {
        table: "network_request_audit_events",
        rows: audit,
      };
      break;
    }
    case "public-profile": {
      if (await isSubjectTombstoned("public-profile", input.subjectId, { db })) {
        skippedTombstoned += 1;
        break;
      }
      const users = await db
        .select()
        .from(networkSchema.networkUsers)
        .where(
          and(
            eq(networkSchema.networkUsers.id, input.subjectId),
            lte(networkSchema.networkUsers.createdAt, snapshotAt),
          ),
        );
      sections["network_users"] = { table: "network_users", rows: users };

      const signals = await db
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(
          and(
            eq(networkSchema.networkMemberSignals.userId, input.subjectId),
            lte(networkSchema.networkMemberSignals.createdAt, snapshotAt),
          ),
        );
      const filteredSignals: typeof signals = [];
      for (const signal of signals) {
        if (await isSubjectTombstoned("member-signal", signal.id, { db })) {
          skippedTombstoned += 1;
          continue;
        }
        filteredSignals.push(signal);
      }
      sections["network_member_signals"] = {
        table: "network_member_signals",
        rows: filteredSignals,
      };

      const sources = await db
        .select()
        .from(networkSchema.networkSignalSources)
        .where(
          and(
            eq(networkSchema.networkSignalSources.userId, input.subjectId),
            lte(networkSchema.networkSignalSources.createdAt, snapshotAt),
          ),
        );
      sections["network_signal_sources"] = { table: "network_signal_sources", rows: sources };

      const claims = await db
        .select()
        .from(networkSchema.networkSignalClaims)
        .where(
          and(
            eq(networkSchema.networkSignalClaims.userId, input.subjectId),
            lte(networkSchema.networkSignalClaims.createdAt, snapshotAt),
          ),
        );
      sections["network_signal_claims"] = { table: "network_signal_claims", rows: claims };

      const requests = await db
        .select()
        .from(networkSchema.networkJobRequests)
        .where(
          and(
            eq(networkSchema.networkJobRequests.userId, input.subjectId),
            lte(networkSchema.networkJobRequests.createdAt, snapshotAt),
          ),
        );
      const filteredRequests: typeof requests = [];
      for (const req of requests) {
        if (await isSubjectTombstoned("request", req.id, { db })) {
          skippedTombstoned += 1;
          continue;
        }
        filteredRequests.push(req);
      }
      sections["network_job_requests"] = {
        table: "network_job_requests",
        rows: filteredRequests,
      };

      const watch = await db
        .select()
        .from(networkSchema.networkPossibleConnections)
        .where(
          and(
            eq(networkSchema.networkPossibleConnections.userId, input.subjectId),
            lte(networkSchema.networkPossibleConnections.createdAt, snapshotAt),
          ),
        );
      sections["network_possible_connections"] = {
        table: "network_possible_connections",
        rows: watch,
      };

      const intros = await db
        .select()
        .from(networkSchema.introductions)
        .where(
          and(
            eq(networkSchema.introductions.requesterUserId, input.subjectId),
            lte(networkSchema.introductions.createdAt, snapshotAt),
          ),
        );
      sections["introductions_requested"] = {
        table: "introductions",
        rows: intros,
      };

      const introsReceived = await db
        .select()
        .from(networkSchema.introductions)
        .where(
          and(
            eq(networkSchema.introductions.targetUserId, input.subjectId),
            lte(networkSchema.introductions.createdAt, snapshotAt),
          ),
        );
      sections["introductions_received"] = {
        table: "introductions",
        rows: introsReceived,
      };

      const forwarded = await db
        .select()
        .from(networkSchema.networkForwardedNotes)
        .where(
          and(
            eq(networkSchema.networkForwardedNotes.userId, input.subjectId),
            lte(networkSchema.networkForwardedNotes.createdAt, snapshotAt),
          ),
        );
      sections["network_forwarded_notes"] = {
        table: "network_forwarded_notes",
        rows: forwarded,
      };

      const kb = await db
        .select()
        .from(networkSchema.networkUserKbDocuments)
        .where(
          and(
            eq(networkSchema.networkUserKbDocuments.userId, input.subjectId),
            lte(networkSchema.networkUserKbDocuments.createdAt, snapshotAt),
          ),
        );
      sections["network_user_kb_documents"] = {
        table: "network_user_kb_documents",
        rows: kb,
      };
      break;
    }
    case "discovery-profile": {
      if (await isSubjectTombstoned("discovery-profile", input.subjectId, { db })) {
        skippedTombstoned += 1;
        break;
      }
      const profiles = await db
        .select()
        .from(networkSchema.networkDiscoveredProfiles)
        .where(
          and(
            eq(networkSchema.networkDiscoveredProfiles.id, input.subjectId),
            lte(networkSchema.networkDiscoveredProfiles.createdAt, snapshotAt),
          ),
        );
      sections["network_discovered_profiles"] = {
        table: "network_discovered_profiles",
        rows: profiles,
      };

      const claims = await db
        .select()
        .from(networkSchema.networkDiscoveryClaims)
        .where(
          and(
            eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, input.subjectId),
            lte(networkSchema.networkDiscoveryClaims.createdAt, snapshotAt),
          ),
        );
      sections["network_discovery_claims"] = {
        table: "network_discovery_claims",
        rows: claims,
      };

      const sourceIds = Array.from(new Set(claims.map((claim) => claim.sourceId)));
      const sourceAssociation = sql`${networkSchema.networkDiscoverySources.metadata}->>'discoveryProfileId' = ${input.subjectId}`;
      const sourcePredicate = sourceIds.length > 0
        ? or(
            inArray(networkSchema.networkDiscoverySources.id, sourceIds),
            sourceAssociation,
          )
        : sourceAssociation;
      const sources = await db
        .select()
        .from(networkSchema.networkDiscoverySources)
        .where(
          and(
            sourcePredicate,
            lte(networkSchema.networkDiscoverySources.createdAt, snapshotAt),
          ),
        );
      sections["network_discovery_sources"] = {
        table: "network_discovery_sources",
        rows: sources,
      };

      const candidates = await db
        .select()
        .from(networkSchema.networkInvitationCandidates)
        .where(
          and(
            eq(networkSchema.networkInvitationCandidates.discoveryProfileId, input.subjectId),
            lte(networkSchema.networkInvitationCandidates.createdAt, snapshotAt),
          ),
        );
      sections["network_invitation_candidates"] = {
        table: "network_invitation_candidates",
        rows: candidates,
      };

      const events = await db
        .select()
        .from(networkSchema.networkInvitationEvents)
        .where(
          and(
            eq(networkSchema.networkInvitationEvents.discoveryProfileId, input.subjectId),
            lte(networkSchema.networkInvitationEvents.createdAt, snapshotAt),
          ),
        );
      sections["network_invitation_events"] = {
        table: "network_invitation_events",
        rows: events,
      };

      const tokens = await db
        .select()
        .from(networkSchema.networkClaimTokens)
        .where(
          and(
            eq(networkSchema.networkClaimTokens.discoveryProfileId, input.subjectId),
            lte(networkSchema.networkClaimTokens.createdAt, snapshotAt),
          ),
        );
      sections["network_claim_tokens"] = {
        table: "network_claim_tokens",
        rows: tokens,
      };
      break;
    }
  }

  return {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    snapshotAt: snapshotAt.toISOString(),
    skippedTombstoned,
    sections: sections as Record<string, ExportBundleSection<Record<string, unknown>>>,
  };
}
