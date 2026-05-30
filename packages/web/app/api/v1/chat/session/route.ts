/**
 * Ditto — Chat Session API (Brief 123, reconciled with workspace auth in Brief 280)
 *
 * GET /api/v1/chat/session — bootstraps the `/chat` workspace Self surface.
 *
 * Identity resolution (Brief 280): the authenticated workspace owner is the
 * Self-home user even without a `ditto_chat_session` cookie. We resolve the
 * workspace identity from the `ditto_workspace_session` cookie (or the
 * local-dev bypass) FIRST, and fall back to the Brief 123 `ditto_chat_session`
 * magic-link session for public/returning continuity. A Brief 123 session is
 * still loaded when present so persisted message history survives reloads.
 *
 * This reads the workspace session cookie directly — it does NOT self-HTTP to
 * `/api/v1/workspace/session` (Brief 280 constraint). The cookie-parse +
 * case-insensitive owner match mirrors `checkWorkspaceAuth` in
 * `/api/v1/projects` and the GET in `/api/v1/workspace/session`; the HMAC is
 * verified at magic-link login time (`/login/auth`), not on every read.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const CHAT_SESSION_COOKIE = "ditto_chat_session";
const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function loadEnv() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.MOCK_LLM) {
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }
  }
}

/**
 * Resolve the authenticated workspace owner's email, or null.
 * - Local-dev / CI: `WORKSPACE_OWNER_EMAIL` unset disables workspace auth
 *   and the owner is `dev@local` (mirrors `/api/v1/workspace/session` GET).
 * - Otherwise: parse `email|hmac` from the cookie and require a
 *   case-insensitive match against `WORKSPACE_OWNER_EMAIL`.
 */
function resolveWorkspaceEmail(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string | null {
  const owner = process.env.WORKSPACE_OWNER_EMAIL;
  if (!owner) return "dev@local";
  const raw = cookieStore.get(WORKSPACE_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const sepIdx = raw.lastIndexOf("|");
  const email = sepIdx === -1 ? raw : raw.substring(0, sepIdx);
  return email.toLowerCase() === owner.toLowerCase() ? email : null;
}

export async function GET() {
  try {
    await loadEnv();

    const cookieStore = await cookies();
    const workspaceEmail = resolveWorkspaceEmail(cookieStore);
    const chatSessionId = cookieStore.get(CHAT_SESSION_COOKIE)?.value;

    // Nothing to authenticate as — preserve the Brief 123 unauthenticated
    // path so public/magic-link users still see the email-request form.
    if (!workspaceEmail && !chatSessionId) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const { db, schema } = await import("../../../../../../../src/db");
    const { eq, and, sql, desc } = await import("drizzle-orm");

    // Load the Brief 123 magic-link session if a cookie is present, for
    // persisted-history continuity (not required when workspace-authed).
    let chatSession:
      | {
          sessionId: string;
          authenticatedEmail: string | null;
          messages: unknown;
          messageCount: number | null;
        }
      | undefined;
    if (chatSessionId) {
      const [row] = await db
        .select()
        .from(schema.chatSessions)
        .where(
          and(
            eq(schema.chatSessions.sessionId, chatSessionId),
            sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
          ),
        );
      if (row?.authenticatedEmail) chatSession = row;
    }

    const email = workspaceEmail ?? chatSession?.authenticatedEmail ?? null;
    if (!email) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    // Status metrics — best-effort, keyed on the resolved email.
    const statusMetrics = {
      contacted: 0,
      replied: 0,
      meetings: 0,
      nextAction: null as string | null,
    };
    try {
      const { networkUsers, interactions, processRuns } = schema;

      const [networkUser] = await db
        .select()
        .from(networkUsers)
        .where(eq(networkUsers.email, email))
        .limit(1);

      if (networkUser) {
        const countByType = async (type: string) => {
          const rows = await db
            .select({ id: interactions.id })
            .from(interactions)
            .where(
              and(
                eq(interactions.userId, networkUser.id),
                eq(interactions.type, type as typeof interactions.type._.data),
              ),
            );
          return rows.length;
        };

        statusMetrics.contacted = await countByType("outreach_sent");
        statusMetrics.replied = await countByType("reply_received");

        const meetingScheduled = await countByType("meeting_scheduled");
        const meetingHeld = await countByType("meeting_held");
        statusMetrics.meetings = meetingScheduled + meetingHeld;

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
      // Status metrics are best-effort.
    }

    return NextResponse.json({
      authenticated: true,
      email,
      sessionId: chatSession?.sessionId,
      messages: chatSession?.messages ?? [],
      messageCount: chatSession?.messageCount ?? 0,
      status: statusMetrics,
    });
  } catch (error) {
    console.error("[/api/v1/chat/session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
