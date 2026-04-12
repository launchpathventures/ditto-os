/**
 * Ditto — Cloudflare Turnstile Verification
 *
 * Server-side verification of Turnstile tokens to prevent bot/agent spam
 * on the front door. Turnstile is Cloudflare's invisible CAPTCHA alternative —
 * free tier, no user friction.
 *
 * The frontend renders an invisible Turnstile widget that produces a token.
 * That token is sent with each chat request and verified here before the
 * LLM call proceeds.
 *
 * Provenance: Cloudflare Turnstile docs (https://developers.cloudflare.com/turnstile/)
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Turnstile token server-side.
 *
 * Returns true if:
 * - Turnstile is not configured (TURNSTILE_SECRET_KEY not set) — graceful degradation
 * - The token passes Cloudflare's verification
 *
 * Returns false if:
 * - Token is missing/empty and Turnstile IS configured
 * - Cloudflare rejects the token
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  ip?: string,
): Promise<{ ok: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Graceful degradation: if Turnstile isn't configured, allow all requests.
  // This lets local dev and staging work without Turnstile keys.
  // Also skip when using Cloudflare's testing secret key.
  if (!secretKey || secretKey.startsWith("1x000000000000000000000000000000")) {
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: "missing-token" };
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    });

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      console.error("[turnstile] Verification endpoint returned", res.status);
      // Fail open on Cloudflare outage — don't block real users
      return { ok: true };
    }

    const data = (await res.json()) as TurnstileVerifyResponse;

    if (!data.success) {
      const codes = data["error-codes"]?.join(", ") || "unknown";
      console.warn("[turnstile] Verification failed:", codes);
      return { ok: false, error: codes };
    }

    return { ok: true };
  } catch (err) {
    console.error("[turnstile] Verification error:", err);
    // Fail open — don't block users because of a network glitch
    return { ok: true };
  }
}
