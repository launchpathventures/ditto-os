/**
 * POST /api/v1/network/chat/warmup — proactive server-side warmup.
 * GET  /api/v1/network/chat/warmup — fast no-op that triggers compile only.
 *
 * Two responsibilities:
 *
 * 1) Front-load the dev-mode JIT compilation cost. The /persona and /stream
 *    handlers each pull in ~150-200 transitive engine modules (drizzle,
 *    network-chat engine, Anthropic SDK, dotenv, db). In dev Next.js
 *    compiles these lazily on the first POST, adding 5-10s of pure JIT to
 *    the visitor's first chat turn. By kicking the imports off at module
 *    load time AND running initLlm in the background, the warm cache is
 *    ready by the time the visitor finishes the preamble animation.
 *
 * 2) Pre-create the visitor's chat session DURING the preamble — when they
 *    tap a persona later, /persona is a fast metadata-only update and
 *    /stream skips its Turnstile + rate-limit gates entirely (the route
 *    handler trusts existing sessions). Net: ~700ms of Cloudflare RTT and
 *    a session-create round-trip both disappear from the user-visible path.
 *
 * Provenance: ditto-conversation hot path optimization (May 2026).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eagerly dispatch the heavy engine imports at module load. These are the
// same imports /persona and /stream pull in; once compiled, all three
// routes share the warm module cache.
const dbPromise = import("../../../../../../../../src/db");
const llmPromise = import("../../../../../../../../src/engine/llm");
const networkChatPromise = import(
  "../../../../../../../../src/engine/network-chat"
);
const turnstilePromise = import(
  "../../../../../../../../src/engine/turnstile"
);

// Side-effect: initialize the LLM client at module load. The first call
// to llm.initLlm() can take several hundred ms (constructing the SDK
// client, reading API keys from .env). Doing it here means the first
// real chat turn skips that cost.
const initialized = (async () => {
  try {
    const [llm] = await Promise.all([
      llmPromise,
      dbPromise,
      networkChatPromise,
      turnstilePromise,
    ]);
    if (!llm.isMockLlmMode()) {
      try {
        llm.initLlm();
      } catch {
        /* already initialized — fine */
      }
    }
  } catch {
    /* best-effort warmup; failures here don't block real requests */
  }
})();

// GET: lightweight ping that triggers route + module compilation only.
// Intended for the very first hit when the welcome page mounts.
export async function GET() {
  await initialized;
  return new NextResponse(null, { status: 204 });
}

// POST: optional session pre-creation.
// Pass `{ turnstileToken }` to mint a session during preamble so the
// later persona-pick is metadata-only (no Turnstile, no session-create).
export async function POST(request: Request) {
  await initialized;

  let sessionId: string | undefined;
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const { turnstileToken } = body as { turnstileToken?: string };

    if (turnstileToken) {
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

      const { verifyTurnstileToken } = await turnstilePromise;
      const turnstile = await verifyTurnstileToken(turnstileToken, ip);

      if (turnstile.ok) {
        const { hashIp, checkIpRateLimit, loadOrCreateSession } =
          await networkChatPromise;
        const ipHash = hashIp(ip);
        const ipAllowed = await checkIpRateLimit(ipHash);
        if (ipAllowed) {
          const created = await loadOrCreateSession(null, "front-door", ipHash);
          sessionId = created.sessionId;
        }
      }
    }
  } catch {
    /* warmup is best-effort; never fail the visitor's flow */
  }

  return NextResponse.json({ ok: true, ...(sessionId ? { sessionId } : {}) });
}
