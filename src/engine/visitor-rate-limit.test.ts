import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetVisitorRateLimitsForTesting,
  checkVisitorRateLimit,
  visitorRateLimitCopy,
} from "./visitor-rate-limit";

describe("visitor profile chat rate limit", () => {
  beforeEach(() => {
    _resetVisitorRateLimitsForTesting();
  });

  it("allows messages below the per-session cap", async () => {
    for (let i = 0; i < 30; i += 1) {
      await expect(
        checkVisitorRateLimit({
          ip: "203.0.113.10",
          fingerprint: "fp-a",
          sessionId: "session-a",
          now: 1_000,
        }),
      ).resolves.toEqual({ ok: true });
    }
  });

  it("blocks the 31st message for the same visitor session", async () => {
    for (let i = 0; i < 30; i += 1) {
      await checkVisitorRateLimit({
        ip: "203.0.113.10",
        fingerprint: "fp-a",
        sessionId: "session-a",
        now: 1_000,
      });
    }

    const result = await checkVisitorRateLimit({
      ip: "203.0.113.10",
      fingerprint: "fp-a",
      sessionId: "session-a",
      now: 1_000,
    });

    expect(result).toMatchObject({
      blocked: true,
      reason: "session",
      retryAfterSec: 3600,
    });
    if ("blocked" in result) {
      expect(visitorRateLimitCopy("Alex", result)).toContain("I need a minute");
    }
  });

  it("blocks by IP after the hourly IP cap and reports retry-after", async () => {
    for (let i = 0; i < 200; i += 1) {
      await checkVisitorRateLimit({
        ip: "203.0.113.20",
        fingerprint: `fp-${i}`,
        sessionId: `session-${i}`,
        now: 2_000,
      });
    }

    const result = await checkVisitorRateLimit({
      ip: "203.0.113.20",
      fingerprint: "fp-new",
      sessionId: "session-new",
      now: 2_000 + 15_000,
    });

    expect(result).toMatchObject({
      blocked: true,
      reason: "ip",
      retryAfterSec: 3585,
    });
  });
});
