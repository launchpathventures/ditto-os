/**
 * POST /api/v1/network/chat/persona — Persona selection flow (Brief 152).
 *
 * Three actions:
 *  - action: "interview-start" — visitor tapped a card. Records the choice in
 *    session.personaId without committing (stage stays "interview"). Moves the
 *    previous persona's interview transcript to interviewTranscripts so it
 *    survives a switch.
 *  - action: "commit" — visitor pressed "Continue with <persona>". Locks the
 *    persona, flips stage to "main", copies the chosen interview transcript
 *    into the active messages so the main-stage prompt has continuity.
 *  - action: "reset" — visitor went back to the picker. Clears personaId,
 *    stage → "picker", preserves interviewTranscripts.
 *
 * All actions are idempotent and fire a funnel event for analytics.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PERSONAS = new Set(["alex", "mira"]);
const VALID_ACTIONS = new Set(["interview-start", "commit", "reset"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId: rawSessionId, personaId, action, turnstileToken } = body as {
      sessionId?: string | null;
      personaId?: string;
      action?: string;
      turnstileToken?: string;
    };

    if (!action || !VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (action !== "reset" && (!personaId || !VALID_PERSONAS.has(personaId))) {
      return NextResponse.json({ error: "Invalid personaId" }, { status: 400 });
    }
    // Brief 152: interview-start is allowed to run without a pre-existing session.
    // The picker no longer pre-warms a session (we ship canned intros), so the
    // first server round-trip happens when the visitor taps a card. Lazy-create
    // here so we skip an otherwise-wasted extra round-trip.
    if (action !== "interview-start" && !rawSessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const { db, schema } = await import("../../../../../../../../src/db");
    const { eq, sql, and } = await import("drizzle-orm");
    const { recordFunnelEvent, loadOrCreateSession, hashIp, checkIpRateLimit } = await import(
      "../../../../../../../../src/engine/network-chat"
    );

    let session: typeof schema.chatSessions.$inferSelect | null = null;
    if (rawSessionId) {
      const [existing] = await db
        .select()
        .from(schema.chatSessions)
        .where(
          and(
            eq(schema.chatSessions.sessionId, rawSessionId),
            sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
          ),
        );
      session = existing ?? null;
    }

    // Lazy-create for interview-start if we have no valid session.
    // This path is the visitor's first server touch (picker ships canned intros
    // with no round-trip), so it has to carry the same bot/abuse gates the
    // /stream route used to apply at session creation time: Turnstile + IP rate
    // limit. Existing-session callers skip both — they're gated by having a
    // session that was created through this same branch.
    if (!session && action === "interview-start") {
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

      const { verifyTurnstileToken } = await import(
        "../../../../../../../../src/engine/turnstile"
      );
      const turnstile = await verifyTurnstileToken(turnstileToken, ip);
      if (!turnstile.ok) {
        return NextResponse.json(
          { error: "Bot verification failed. Please refresh and try again." },
          { status: 403 },
        );
      }

      const ipHash = hashIp(ip);
      const ipAllowed = await checkIpRateLimit(ipHash);
      if (!ipAllowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
      }

      const created = await loadOrCreateSession(null, "front-door", ipHash);
      const [row] = await db
        .select()
        .from(schema.chatSessions)
        .where(eq(schema.chatSessions.sessionId, created.sessionId));
      session = row ?? null;
    }

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const sessionId = session.sessionId;

    const persona = personaId as "alex" | "mira" | undefined;
    const currentTranscripts: Partial<Record<"alex" | "mira", Array<{ role: string; content: string }>>> =
      (session.interviewTranscripts ?? {}) as Partial<Record<"alex" | "mira", Array<{ role: string; content: string }>>>;
    const currentMessages = (session.messages ?? []) as Array<{ role: string; content: string }>;

    if (action === "interview-start") {
      // Snapshot whatever messages were accumulated during the previous persona's
      // interview into interviewTranscripts (keyed by the OLD persona) so the
      // switch is non-destructive. Then load the new persona's prior transcript
      // (if any) into messages so a return visitor resumes where they left off.
      const nextTranscripts = { ...currentTranscripts };
      if (session.personaId && session.stage === "interview") {
        nextTranscripts[session.personaId as "alex" | "mira"] = currentMessages;
      }
      const resumed = persona ? (nextTranscripts[persona] ?? []) : [];

      await db
        .update(schema.chatSessions)
        .set({
          personaId: persona,
          stage: "interview",
          messages: resumed,
          interviewTranscripts: nextTranscripts,
          updatedAt: new Date(),
        })
        .where(eq(schema.chatSessions.sessionId, sessionId));

      await recordFunnelEvent(sessionId, "persona_interview_start", "front-door", {
        personaId: persona,
        switched: !!session.personaId && session.personaId !== persona,
        resumedTurns: resumed.length,
      });

      return NextResponse.json({
        ok: true,
        sessionId,
        personaId: persona,
        stage: "interview",
        resumedTurns: resumed.length,
      });
    }

    if (action === "commit") {
      // The visitor has picked this persona. Lock it, flip stage → "main",
      // keep the interview conversation as the opening context for the main
      // front door so it feels like a continuation.
      const nextTranscripts = { ...currentTranscripts };
      if (persona) {
        // Stash the current messages as the record of the interview we just ran
        nextTranscripts[persona] = currentMessages;
      }

      await db
        .update(schema.chatSessions)
        .set({
          personaId: persona,
          stage: "main",
          // messages stays as-is — the interview transcript IS the main conversation history.
          interviewTranscripts: nextTranscripts,
          updatedAt: new Date(),
        })
        .where(eq(schema.chatSessions.sessionId, sessionId));

      await recordFunnelEvent(sessionId, "persona_committed", "front-door", {
        personaId: persona,
        interviewTurns: currentMessages.length,
      });

      return NextResponse.json({
        ok: true,
        sessionId,
        personaId: persona,
        stage: "main",
        carriedOverTurns: currentMessages.length,
      });
    }

    // action === "reset"
    const nextTranscripts = { ...currentTranscripts };
    if (session.personaId && session.stage === "interview") {
      nextTranscripts[session.personaId as "alex" | "mira"] = currentMessages;
    }

    await db
      .update(schema.chatSessions)
      .set({
        personaId: null,
        stage: "picker",
        messages: [],
        interviewTranscripts: nextTranscripts,
        updatedAt: new Date(),
      })
      .where(eq(schema.chatSessions.sessionId, sessionId));

    await recordFunnelEvent(sessionId, "persona_reset", "front-door", {});

    return NextResponse.json({ ok: true, sessionId, stage: "picker" });
  } catch (err) {
    console.error("[/api/v1/network/chat/persona] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
