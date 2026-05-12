/**
 * Ditto Web — Front Door Chat Route (Brief 093)
 *
 * POST /api/v1/network/chat — Conversational endpoint for anonymous visitors.
 * Accepts { message, sessionId, context, returningEmail? }.
 * Returns { reply, sessionId, requestEmail?, emailCaptured?, done? }.
 *
 * This is a web front door endpoint (anonymous, public) distinct from the
 * authenticated Network API endpoints in ADR-025. Shares the /v1/network/ prefix
 * for consistency but requires no auth.
 *
 * Provenance: Brief 093, ADR-025 (versioned path), Formless.ai (conversational form pattern).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      message,
      sessionId,
      context,
      returningEmail,
      funnelMetadata,
      turnstileToken,
      ref,
      prospectId,
      introducerId,
      personaId,
    } = body as {
      message?: string;
      sessionId?: string | null;
      context?: string;
      returningEmail?: string;
      funnelMetadata?: Record<string, unknown>;
      turnstileToken?: string;
      ref?: string;
      prospectId?: string;
      introducerId?: string;
      personaId?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 },
      );
    }

    if (message.trim().length > 2000) {
      return NextResponse.json(
        { error: "Message too long. Keep it under 2000 characters." },
        { status: 400 },
      );
    }

    const validContexts = ["front-door", "referred", "expert", "client"];
    const chatContext = validContexts.includes(context ?? "")
      ? (context as "front-door" | "referred" | "expert" | "client")
      : "front-door";

    // Extract IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

    // Bot/abuse gates only skip when the session came from an already
    // verified front-door path. Brief 255 lane sessions are seeded without
    // Turnstile because they render a canned Q0 only; they must not become a
    // free pass into LLM turns.
    let trustedSession = false;
    if (sessionId) {
      const { db, schema } = await import("../../../../../../../src/db");
      const { eq, sql, and } = await import("drizzle-orm");
      const [existing] = await db
        .select({
          sessionId: schema.chatSessions.sessionId,
          context: schema.chatSessions.context,
        })
        .from(schema.chatSessions)
        .where(
          and(
            eq(schema.chatSessions.sessionId, sessionId),
            sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
          ),
        );
      trustedSession = !!existing && existing.context !== "expert" && existing.context !== "client";
    }

    if (!trustedSession) {
      const { verifyTurnstileToken } = await import("../../../../../../../src/engine/turnstile");
      const turnstile = await verifyTurnstileToken(turnstileToken, ip);
      if (!turnstile.ok) {
        return NextResponse.json(
          { error: "Bot verification failed. Please refresh and try again." },
          { status: 403 },
        );
      }
    }

    // Load env vars from root .env (Next.js may not have them in API routes)
    if (!process.env.ANTHROPIC_API_KEY && !process.env.MOCK_LLM) {
      try {
        const { config } = await import("dotenv");
        const path = await import("path");
        config({ path: path.resolve(process.cwd(), "../../.env") });
      } catch { /* env vars may be set via platform */ }
    }

    const [{ handleChatTurn }, { normalizePersonaId, resolveReferredLandingContext }, llm] = await Promise.all([
      import("../../../../../../../src/engine/network-chat"),
      import("../../../../../../../src/engine/referred-context"),
      import("../../../../../../../src/engine/llm"),
    ]);

    // Ensure LLM is initialized in this module context
    // (Next.js API routes load a separate instance from instrumentation)
    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }

    const safePersonaId = normalizePersonaId(personaId);
    const referredProspectId = prospectId ?? ref ?? null;
    const referredContext = chatContext === "referred"
      ? await resolveReferredLandingContext({
          prospectId: referredProspectId,
          introducerId: introducerId ?? null,
          personaId: safePersonaId,
        })
      : null;
    const referredMetadata = referredContext && referredContext.status !== "fallback"
      ? {
          prospectId: referredContext.prospectId,
          introducerId: referredContext.introducerId,
          personaId: referredContext.personaId,
          introducerFirstName: referredContext.introducerFirstName,
          learned: referredContext.learned,
        }
      : {
          ...(referredProspectId ? { prospectId: referredProspectId } : {}),
          ...(introducerId ? { introducerId } : {}),
          ...(safePersonaId ? { personaId: safePersonaId } : {}),
        };

    const result = await handleChatTurn(
      sessionId ?? null,
      message.trim(),
      chatContext,
      ip,
      returningEmail ?? null,
      { ...funnelMetadata, ...referredMetadata },
      undefined,
      safePersonaId ? { personaId: safePersonaId, promptMode: "main" } : undefined,
    );

    if (result.rateLimited) {
      return NextResponse.json(result, { status: 429 });
    }

    return NextResponse.json(
      referredContext ? { ...result, referredContext } : result,
    );
  } catch (error) {
    console.error("[/api/v1/network/chat] Error:", error);
    return NextResponse.json(
      {
        reply: "Sorry — something went wrong on my end. Drop your email and I'll reach out directly.",
        sessionId: null,
        requestEmail: true,
      },
      { status: 500 },
    );
  }
}
