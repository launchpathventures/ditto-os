/**
 * Ditto — Workspace Magic Link Auth Callback (Brief 143)
 *
 * GET /login/auth?token=xxx — serves auto-submitting form (same pattern as /chat/auth)
 * POST /login/auth — validates token, sets workspace session cookie, redirects to /
 *
 * Security:
 * - Token consumption on POST (not GET)
 * - httpOnly + secure + sameSite=lax cookie
 * - Single-use token
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";

export const runtime = "nodejs";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** Sign the email with HMAC-SHA256 so the cookie can't be forged by guessing the email. */
function signSessionValue(email: string): string {
  const secret = process.env.SESSION_SECRET || process.env.NETWORK_AUTH_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for workspace auth");
  }
  const sig = createHmac("sha256", secret).update(email.toLowerCase()).digest("hex");
  return `${email.toLowerCase()}|${sig}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * GET /login/auth?token=xxx — serves auto-submitting form page.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const html = `<!DOCTYPE html>
<html>
<head><title>Signing in...</title></head>
<body>
  <p style="text-align:center;margin-top:40vh;font-family:system-ui;color:#666">
    Signing you in...
  </p>
  <form id="f" method="POST" action="/login/auth">
    <input type="hidden" name="token" value="${escapeHtml(token)}" />
  </form>
  <script>document.getElementById('f').submit();</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

/**
 * POST /login/auth — validates token, sets cookie, redirects.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    const token = formData?.get("token")?.toString();

    if (!token) {
      return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
    }

    const {
      consumeMagicLink,
      consumeWorkspaceBootstrapLoginToken,
      isWorkspaceBootstrapLoginToken,
    } = await import("../../../../../src/engine/magic-link");

    const result = isWorkspaceBootstrapLoginToken(token)
      ? await consumeWorkspaceBootstrapLoginToken(token, request.url)
      : await consumeMagicLink(token);

    if (!result) {
      return NextResponse.redirect(new URL("/login?error=invalid_or_expired", request.url));
    }

    // Verify this is a workspace magic link (sessionId starts with "workspace:")
    if (!result.sessionId.startsWith("workspace:") && !result.sessionId.startsWith("workspace-bootstrap:")) {
      return NextResponse.redirect(new URL("/login?error=invalid_token_type", request.url));
    }

    // Set workspace session cookie with HMAC-signed email to prevent forgery
    const cookieStore = await cookies();
    cookieStore.set(WORKSPACE_SESSION_COOKIE, signSessionValue(result.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("[/login/auth] Error:", error);
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}
