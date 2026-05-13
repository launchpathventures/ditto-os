export interface VisitorRateLimitInput {
  ip: string;
  fingerprint?: string | null;
  sessionId?: string | null;
  now?: number;
}

export type VisitorRateLimitResult =
  | { ok: true }
  | {
      blocked: true;
      reason: "session" | "ip";
      retryAfterSec: number;
    };

const SESSION_LIMIT = 30;
const IP_LIMIT = 200;
const WINDOW_MS = 60 * 60 * 1000;

interface Counter {
  count: number;
  resetAt: number;
}

const sessionCounters = new Map<string, Counter>();
const ipCounters = new Map<string, Counter>();

function stableKey(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function bumpCounter(
  map: Map<string, Counter>,
  key: string,
  limit: number,
  now: number,
): { ok: true } | { blocked: true; retryAfterSec: number } {
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (current.count >= limit) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { ok: true };
}

/**
 * In-memory v1 limiter for the public profile visitor surface. This mirrors the
 * process-os Charlie shape (per visitor + per IP) and should move to Redis when
 * public Network traffic is high enough for multi-instance enforcement.
 */
export async function checkVisitorRateLimit({
  ip,
  fingerprint,
  sessionId,
  now = Date.now(),
}: VisitorRateLimitInput): Promise<VisitorRateLimitResult> {
  const ipKey = stableKey(ip, "unknown-ip");
  const visitorKey = [
    stableKey(sessionId, "anonymous-session"),
    stableKey(fingerprint, "anonymous-fingerprint"),
  ].join(":");

  const session = bumpCounter(sessionCounters, visitorKey, SESSION_LIMIT, now);
  if ("blocked" in session) {
    return {
      blocked: true,
      reason: "session",
      retryAfterSec: session.retryAfterSec,
    };
  }

  const ipResult = bumpCounter(ipCounters, ipKey, IP_LIMIT, now);
  if ("blocked" in ipResult) {
    return {
      blocked: true,
      reason: "ip",
      retryAfterSec: ipResult.retryAfterSec,
    };
  }

  return { ok: true };
}

export function visitorRateLimitCopy(
  greeterName: string,
  result: Extract<VisitorRateLimitResult, { blocked: true }>,
): string {
  if (result.reason === "ip") {
    return `There's been a lot of traffic through ${greeterName} today. Try again in an hour?`;
  }
  return `I need a minute - we've covered a lot. Back in ${Math.ceil(result.retryAfterSec / 60)} min, where were we?`;
}

export function _resetVisitorRateLimitsForTesting(): void {
  sessionCounters.clear();
  ipCounters.clear();
}
