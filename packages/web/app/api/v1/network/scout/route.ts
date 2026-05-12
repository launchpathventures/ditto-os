import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { JobRequestCardBlock, ReviewCardBlock, SuggestedCandidate } from "@/lib/engine";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import {
  scoutOffNetwork,
  scrubScoutVisibleText,
} from "../../../../../../../src/engine/network-scout";
import { hasTrustedNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_FIELD_LENGTH = 2_000;
const MAX_BUDGET_FIELD_LENGTH = 500;
const MAX_SCOUT_REQUESTS_PER_HOUR = 12;
const SCOUT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SCOUT_CACHE_TTL_MS = 10 * 60 * 1000;

type ScoutStatus = "success" | "empty" | "cached";

interface ScoutResponsePayload {
  status: ScoutStatus;
  review: ReviewCardBlock;
  candidates: SuggestedCandidate[];
}

const scoutRateLimit = new Map<string, { count: number; resetAt: number }>();
const scoutCache = new Map<string, { expiresAt: number; payload: ScoutResponsePayload }>();

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isJobRequestCard(value: unknown): value is JobRequestCardBlock {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<JobRequestCardBlock>;
  return (
    card.type === "job-request-card" &&
    boundedString(card.jtbd, MAX_TEXT_FIELD_LENGTH) &&
    boundedString(card.referenceShape, MAX_TEXT_FIELD_LENGTH) &&
    boundedString(card.antiPersonaMd, MAX_TEXT_FIELD_LENGTH) &&
    boundedString(card.successCriteria, MAX_TEXT_FIELD_LENGTH) &&
    typeof card.budgetShape === "object" &&
    card.budgetShape != null &&
    boundedString(card.budgetShape.ballpark, MAX_BUDGET_FIELD_LENGTH) &&
    (
      card.budgetShape.cadence === "hourly" ||
      card.budgetShape.cadence === "monthly" ||
      card.budgetShape.cadence === "project"
    ) &&
    typeof card.scoutOptIn === "boolean" &&
    Array.isArray(card.suggestedCandidates) &&
    card.suggestedCandidates.length <= 10 &&
    (card.greeterCuratedBy === "alex" || card.greeterCuratedBy === "mira") &&
    (card.matchCuratedBy === "alex" || card.matchCuratedBy === "mira") &&
    boundedString(card.lastUpdatedAt, 100)
  );
}

function isSeedCandidate(value: unknown): value is SuggestedCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SuggestedCandidate>;
  return (
    boundedString(candidate.handle, 160) &&
    boundedString(candidate.name, 160) &&
    boundedString(candidate.oneLineRole, 280) &&
    boundedString(candidate.rationaleMd, 2_000) &&
    (candidate.fitConfidence === "high" ||
      candidate.fitConfidence === "medium" ||
      candidate.fitConfidence === "low") &&
    (candidate.source === "on-network" || candidate.source === "scouted") &&
    boundedString(candidate.computedAt, 100)
  );
}

function checkScoutRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = scoutRateLimit.get(key);
  if (!entry || entry.resetAt <= now) {
    scoutRateLimit.set(key, { count: 1, resetAt: now + SCOUT_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_SCOUT_REQUESTS_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

function privacyHash(card: JobRequestCardBlock): string {
  return createHash("sha256")
    .update(`${card.antiPersonaMd}\0${card.budgetShape.ballpark}`)
    .digest("hex");
}

function cacheKey(
  card: JobRequestCardBlock,
  seedCandidate: SuggestedCandidate | null,
  cacheScope: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      cacheScope,
      jtbd: card.jtbd,
      referenceShape: card.referenceShape,
      successCriteria: card.successCriteria,
      greeterCuratedBy: card.greeterCuratedBy,
      matchCuratedBy: card.matchCuratedBy,
      privacyHash: privacyHash(card),
      seed: seedCandidate
        ? {
            name: seedCandidate.name,
            oneLineRole: seedCandidate.oneLineRole,
            sourceUrl: seedCandidate.sourceUrl ?? null,
          }
        : null,
    }))
    .digest("hex");
}

function sanitizeCandidate(candidate: SuggestedCandidate, card: JobRequestCardBlock): SuggestedCandidate | null {
  if (candidate.source !== "scouted" || !candidate.sourceUrl) return null;
  const name = scrubScoutVisibleText(candidate.name, card);
  const oneLineRole = scrubScoutVisibleText(candidate.oneLineRole, card);
  const sourceLabel = candidate.sourceLabel
    ? scrubScoutVisibleText(candidate.sourceLabel, card)
    : undefined;
  if ([name, oneLineRole, sourceLabel].some((value) => value?.includes("[private]"))) {
    return null;
  }
  return {
    ...candidate,
    handle: candidate.handle.startsWith("scouted:") ? candidate.handle : `scouted:${candidate.handle}`,
    name,
    oneLineRole,
    rationaleMd: scrubScoutVisibleText(candidate.rationaleMd, card),
    sourceLabel,
    sourceSnippet: candidate.sourceSnippet
      ? scrubScoutVisibleText(candidate.sourceSnippet, card)
      : undefined,
  };
}

function sanitizePayload(
  payload: ScoutResponsePayload,
  card: JobRequestCardBlock,
  stepRunId: string,
  status: ScoutStatus = payload.status,
): ScoutResponsePayload | null {
  const candidates = payload.candidates.flatMap((candidate) => {
    const clean = sanitizeCandidate(candidate, card);
    return clean ? [clean] : [];
  });
  if (candidates.length === 0 && payload.candidates.length > 0) return null;
  return {
    status,
    review: {
      ...payload.review,
      processRunId: stepRunId,
      outputText:
        status === "cached" && candidates.length > 0
          ? `Found ${candidates.length} source-backed off-network lead${candidates.length === 1 ? "" : "s"} from cache.`
          : payload.review.outputText,
    },
    candidates,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.stepRunId) {
      return NextResponse.json(
        { error: "step_run_bypass_rejected" },
        { status: 400 },
      );
    }
    if (!isJobRequestCard(body.jobRequestCard)) {
      return NextResponse.json(
        { error: "invalid_job_request_card" },
        { status: 400 },
      );
    }

    const jobRequestCard = body.jobRequestCard;
    const seedCandidate = isSeedCandidate(body.seedCandidate) ? body.seedCandidate : null;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const trustedSession = await hasTrustedNetworkLaneSession(sessionId, "client");
    const rateLimitKey = trustedSession ? `session:${sessionId}` : `ip:${ip}`;
    const cacheScope = trustedSession && sessionId ? `session:${sessionId}` : `ip:${ip}`;

    if (!trustedSession) {
      const { verifyTurnstileToken } = await import(
        "../../../../../../../src/engine/turnstile"
      );
      const turnstile = await verifyTurnstileToken(
        typeof body.turnstileToken === "string" ? body.turnstileToken : null,
        ip,
      );
      if (!turnstile.ok) {
        return NextResponse.json(
          { error: "bot_verification_failed" },
          { status: 403 },
        );
      }
    }

    if (!checkScoutRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-scout",
      sessionId,
      actorId: sessionId,
    });
    const key = cacheKey(jobRequestCard, seedCandidate, cacheScope);
    const cached = scoutCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      const sanitizedCached = sanitizePayload(
        cached.payload,
        jobRequestCard,
        stepRunId,
        "cached",
      );
      if (sanitizedCached) {
        return NextResponse.json(sanitizedCached);
      }
      scoutCache.delete(key);
    }

    const result = await scoutOffNetwork({
      jobRequestCard,
      seedCandidate,
      stepRunId,
    });
    const payload = sanitizePayload(
      {
        status: result.candidates.length > 0 ? "success" : "empty",
        review: result.review,
        candidates: result.candidates,
      },
      jobRequestCard,
      stepRunId,
    ) ?? {
      status: "empty",
      review: {
        ...result.review,
        outputText:
          "No source-backed off-network candidates were returned after private-field scrubbing.",
      },
      candidates: [],
    };
    scoutCache.set(key, {
      expiresAt: Date.now() + SCOUT_CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/scout] Error:", error);
    return NextResponse.json(
      { error: "network_scout_failed" },
      { status: 500 },
    );
  }
}
