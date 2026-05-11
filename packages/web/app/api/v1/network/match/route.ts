import { NextResponse } from "next/server";
import type { JobRequestCardBlock } from "@/lib/engine";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_FIELD_LENGTH = 2_000;
const MAX_BUDGET_FIELD_LENGTH = 500;
const MAX_MATCH_REQUESTS_PER_HOUR = 20;
const MATCH_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const matchRateLimit = new Map<string, { count: number; resetAt: number }>();

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
    card.suggestedCandidates.length <= 5 &&
    (card.greeterCuratedBy === "alex" || card.greeterCuratedBy === "mira") &&
    (card.matchCuratedBy === "alex" || card.matchCuratedBy === "mira") &&
    boundedString(card.lastUpdatedAt, 100)
  );
}

function checkMatchRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = matchRateLimit.get(key);
  if (!entry || entry.resetAt <= now) {
    matchRateLimit.set(key, { count: 1, resetAt: now + MATCH_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_MATCH_REQUESTS_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

async function hasTrustedClientSession(sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  const { db, schema } = await import("../../../../../../../src/db");
  const { and, eq, sql } = await import("drizzle-orm");
  const [session] = await db
    .select({ context: schema.chatSessions.context })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.sessionId, sessionId),
        sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
      ),
    )
    .limit(1);
  return session?.context === "client";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      jobRequestCard?: unknown;
      sessionId?: unknown;
      turnstileToken?: unknown;
    };
    if (!isJobRequestCard(body.jobRequestCard)) {
      return NextResponse.json(
        { error: "invalid_job_request_card" },
        { status: 400 },
      );
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const trustedSession = await hasTrustedClientSession(sessionId);
    const rateLimitKey = trustedSession ? `session:${sessionId}` : `ip:${ip}`;

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

    if (!checkMatchRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429 },
      );
    }

    const { matchOnNetwork } = await import(
      "../../../../../../../src/engine/network-match"
    );
    const candidates = await matchOnNetwork(body.jobRequestCard, {
      sampleLimit: 200,
    });

    return NextResponse.json(candidates);
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/match] Error:", error);
    return NextResponse.json(
      { error: "network_match_failed" },
      { status: 500 },
    );
  }
}
