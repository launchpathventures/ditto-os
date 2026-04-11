/**
 * Ditto — Chat Session API (Brief 123)
 *
 * GET /api/v1/chat/session — reads the session cookie, returns session data
 * (messages, metadata, active process runs) for the /chat page.
 *
 * POST /api/v1/chat/session/request-link — accepts an email, sends a magic link.
 * Returns identical success message regardless of whether email exists (prevent enumeration).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const CHAT_SESSION_COOKIE = "ditto_chat_session";

async function loadEnv() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.MOCK_LLM) {
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }
  }
}

export async function GET() {
  try {
    await loadEnv();

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(CHAT_SESSION_COOKIE)?.value;

    if (!sessionId) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const { db, schema } = await import("../../../../../../../src/db");
    const { eq, and, sql, desc } = await import("drizzle-orm");

    // Load session
    const [session] = await db
      .select()
      .from(schema.chatSessions)
      .where(
        and(
          eq(schema.chatSessions.sessionId, sessionId),
          sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
        ),
      );

    if (!session || !session.authenticatedEmail) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    // Load active process runs for this user
    let statusMetrics = { contacted: 0, replied: 0, meetings: 0, nextAction: null as string | null };
    try {
      const { networkUsers, interactions, processRuns } = schema;

      // Find the network user
      const [networkUser] = await db
        .select()
        .from(networkUsers)
        .where(eq(networkUsers.email, session.authenticatedEmail))
        .limit(1);

      if (networkUser) {
        // Count interactions — push filters to DB (avoid loading all rows)
        const countByType = async (type: string) => {
          const rows = await db
            .select({ id: interactions.id })
            .from(interactions)
            .where(and(eq(interactions.userId, networkUser.id), eq(interactions.type, type as typeof interactions.type._.data)));
          return rows.length;
        };

        statusMetrics.contacted = await countByType("outreach_sent");
        statusMetrics.replied = await countByType("reply_received");

        // Meetings: two types
        const meetingScheduled = await countByType("meeting_scheduled");
        const meetingHeld = await countByType("meeting_held");
        statusMetrics.meetings = meetingScheduled + meetingHeld;

        // Find next scheduled action
        const [nextRun] = await db
          .select()
          .from(processRuns)
          .where(
            and(
              sql`json_extract(${processRuns.inputs}, '$.userId') = ${networkUser.id}`,
              sql`${processRuns.status} IN ('queued', 'running', 'waiting_review')`,
            ),
          )
          .orderBy(desc(processRuns.createdAt))
          .limit(1);

        if (nextRun) {
          statusMetrics.nextAction = `Process in progress`;
        }
      }
    } catch {
      // Status metrics are best-effort
    }

    return NextResponse.json({
      authenticated: true,
      email: session.authenticatedEmail,
      sessionId: session.sessionId,
      messages: session.messages,
      messageCount: session.messageCount,
      status: statusMetrics,
    });
  } catch (error) {
    console.error("[/api/v1/chat/session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
