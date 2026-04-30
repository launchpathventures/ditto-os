/**
 * Ditto — Workspace Session API (Brief 143)
 *
 * GET /api/v1/workspace/session — reads workspace session cookie,
 * returns auth status.
 *
 * DELETE /api/v1/workspace/session — clears the session cookie (logout).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

export async function GET() {
  // Local-dev / CI mode: when WORKSPACE_OWNER_EMAIL is unset, workspace auth
  // is disabled (mirrors the gating pattern in `/api/v1/projects` and
  // siblings — see `checkWorkspaceAuth`). Return authenticated so the admin
  // surfaces render without requiring the magic-link login.
  if (!process.env.WORKSPACE_OWNER_EMAIL) {
    return NextResponse.json({ authenticated: true, email: "dev@local" });
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(WORKSPACE_SESSION_COOKIE);

  if (!session?.value) {
    return NextResponse.json({ authenticated: false });
  }

  // Cookie value is "email|hmac_signature" — extract just the email
  const sepIdx = session.value.lastIndexOf("|");
  const email = sepIdx !== -1 ? session.value.substring(0, sepIdx) : session.value;

  return NextResponse.json({
    authenticated: true,
    email,
  });
}

/**
 * DELETE /api/v1/workspace/session — logout (clear cookie).
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(WORKSPACE_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
