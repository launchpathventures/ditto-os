/**
 * Network Discovery route (Brief 279)
 *
 * GET  — admin list of queued/blocked claim-invite candidates.
 * POST — admin-gated discovery seed. The route mints the step run; any caller
 *        supplied `stepRunId` is rejected before discovery starts.
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { discoverPublicPeople } from "../../../../../../../src/engine/public-people-discovery";
import { checkRateLimit } from "../../../../../../../src/engine/network-abuse-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

function stringArray(value: unknown, maxItems = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringOrNull(item, 1_000))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

async function candidateRows(limit = 50) {
  const rows = await networkDb
    .select()
    .from(networkSchema.networkInvitationCandidates)
    .orderBy(desc(networkSchema.networkInvitationCandidates.createdAt))
    .limit(limit);
  const profiles = await networkDb.select().from(networkSchema.networkDiscoveredProfiles);
  const claims = await networkDb.select().from(networkSchema.networkDiscoveryClaims);
  return rows.map((candidate) => {
    const profile = profiles.find((row) => row.id === candidate.discoveryProfileId);
    return {
      ...candidate,
      profile: profile
        ? {
            id: profile.id,
            displayName: profile.displayName,
            headline: profile.headline,
            canonicalUrl: profile.canonicalUrl,
            sourceSummary: profile.sourceSummary,
            status: profile.status,
          }
        : null,
      claims: claims
        .filter((claim) => claim.discoveryProfileId === candidate.discoveryProfileId)
        .slice(0, 5)
        .map((claim) => ({
          id: claim.id,
          claimText: claim.claimText,
          evidenceSnippet: claim.evidenceSnippet,
          sourceLabel: claim.sourceLabel,
          sourceUrl: claim.sourceUrl,
          confidence: claim.confidence,
        })),
    };
  });
}

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);
    return NextResponse.json({ candidates: await candidateRows(limit) });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/discovery GET] Error:", error);
    return NextResponse.json({ error: "network_discovery_list_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const query = stringOrNull(body.query, 1_200);
    const requestId = stringOrNull(body.requestId, 200);
    const userProvidedUrls = stringArray(body.userProvidedUrls);
    if (!query && !requestId && userProvidedUrls.length === 0) {
      return NextResponse.json({ error: "discovery_seed_required" }, { status: 400 });
    }

    const rateLimit = await checkRateLimit({
      limitName: "network-search",
      actor: { kind: "user", id: auth.userId },
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: rateLimit.retryAfterSec },
        {
          status: 429,
          headers: { "retry-after": String(rateLimit.retryAfterSec) },
        },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-discovery",
      actorId: auth.userId,
    });
    const result = await discoverPublicPeople({
      stepRunId,
      actorId: auth.userId,
      query,
      requestId,
      segment: stringOrNull(body.segment, 200),
      watchId: stringOrNull(body.watchId, 200),
      userProvidedUrls,
      maxProfiles: typeof body.maxProfiles === "number" ? body.maxProfiles : undefined,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/discovery POST] Error:", error);
    const message = error instanceof Error ? error.message : "network_discovery_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
