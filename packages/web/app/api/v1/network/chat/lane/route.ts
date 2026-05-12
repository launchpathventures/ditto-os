import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_SESSION_COOKIE = "ditto_chat_session";

async function readAuthenticatedEmailFromSession(
  sessionId: string | null,
): Promise<string | null> {
  if (!sessionId) return null;

  const { db, schema } = await import("../../../../../../../../src/db");
  const { and, eq, sql } = await import("drizzle-orm");
  const [session] = await db
    .select({ authenticatedEmail: schema.chatSessions.authenticatedEmail })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.sessionId, sessionId),
        sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
      ),
    );

  return session?.authenticatedEmail?.trim().toLowerCase() || null;
}

async function readAuthenticatedEmailFromRequest(
  sourceSessionId: string | null,
): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieSessionId = cookieStore.get(CHAT_SESSION_COOKIE)?.value ?? null;

  const cookieEmail = await readAuthenticatedEmailFromSession(cookieSessionId);
  if (cookieEmail) return cookieEmail;

  return readAuthenticatedEmailFromSession(sourceSessionId);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      mode: rawMode,
      sessionId: rawSessionId,
      sourceSessionId: rawSourceSessionId,
    } = body as {
      mode?: string | null;
      sessionId?: string | null;
      sourceSessionId?: string | null;
    };
    const mode = typeof rawMode === "string" ? rawMode : null;
    const sessionId = typeof rawSessionId === "string" ? rawSessionId : null;
    const sourceSessionId =
      typeof rawSourceSessionId === "string" ? rawSourceSessionId : null;

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

    const {
      checkNetworkLaneOpenRateLimit,
      hashIp,
      initializeNetworkLaneSession,
      normalizeNetworkLaneContext,
    } = await import("../../../../../../../../src/engine/network-chat");

    const ipHash = hashIp(ip);
    const laneAllowed = await checkNetworkLaneOpenRateLimit(ipHash);
    if (!laneAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const authenticatedEmail = await readAuthenticatedEmailFromRequest(
      sourceSessionId,
    );
    const result = await initializeNetworkLaneSession(
      sessionId,
      normalizeNetworkLaneContext(mode),
      ip,
      { authenticatedEmail },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/v1/network/chat/lane] Error:", error);
    return NextResponse.json(
      { error: "Could not open this network lane." },
      { status: 500 },
    );
  }
}
