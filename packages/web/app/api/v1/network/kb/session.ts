import { and, eq, sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../../../../../../../src/db/network-db";

export interface NetworkLaneSession {
  sessionId: string;
  userId: string;
  actorId: string;
  email: string | null;
  context: "expert" | "client";
}

function syntheticEmail(sessionId: string): string {
  return `network-${sessionId}@ditto.local`;
}

export async function resolveNetworkLaneSession({
  sessionId,
  context,
  fallbackUserId,
}: {
  sessionId?: string | null;
  context: "expert" | "client";
  fallbackUserId?: string | null;
}): Promise<NetworkLaneSession | null> {
  const cleanSessionId = sessionId?.trim();
  if (!cleanSessionId) return null;

  const { db, schema } = await import("../../../../../../../src/db");
  const [session] = await db
    .select({
      authenticatedEmail: schema.chatSessions.authenticatedEmail,
      context: schema.chatSessions.context,
    })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.sessionId, cleanSessionId),
        eq(schema.chatSessions.context, context),
        sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
      ),
    )
    .limit(1);

  if (!session) {
    if (process.env.DITTO_TEST_MODE === "true" && fallbackUserId?.trim()) {
      const userId = fallbackUserId.trim();
      return {
        sessionId: cleanSessionId,
        userId,
        actorId: userId,
        email: null,
        context,
      };
    }
    return null;
  }

  const email = session.authenticatedEmail?.trim().toLowerCase() || syntheticEmail(cleanSessionId);
  const [user] = await networkDb
    .select({
      id: networkSchema.networkUsers.id,
      email: networkSchema.networkUsers.email,
    })
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.email, email))
    .limit(1);

  if (!user) return null;
  return {
    sessionId: cleanSessionId,
    userId: user.id,
    actorId: user.id,
    email: user.email,
    context,
  };
}

export async function hasTrustedNetworkLaneSession(
  sessionId: string | null,
  context: "expert" | "client",
): Promise<boolean> {
  return Boolean(await resolveNetworkLaneSession({ sessionId, context }));
}
