/**
 * Ditto — Magic Link Auth Endpoint (Brief 123)
 *
 * GET /chat/auth?token=xxx — serves an auto-submitting HTML form that
 * POSTs the token to itself. This avoids CSRF issues while allowing
 * clickable links in emails.
 *
 * POST /chat/auth — validates the magic link token, sets an httpOnly
 * session cookie, and redirects to /chat.
 *
 * Security:
 * - Token consumption happens on POST (not GET)
 * - httpOnly + secure + sameSite=lax cookie
 * - Single-use token consumption
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPublicBaseUrl } from "../../../lib/public-url";

export const runtime = "nodejs";

const CHAT_SESSION_COOKIE = "ditto_chat_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * GET /chat/auth?token=xxx — serves a small HTML page that auto-submits
 * a POST form with the token. This is what the magic link in emails points to.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/chat?error=missing_token", getPublicBaseUrl(request)));
  }

  // Serve auto-submitting form page
  const html = `<!DOCTYPE html>
<html>
<head><title>Redirecting...</title></head>
<body>
  <p style="text-align:center;margin-top:40vh;font-family:system-ui;color:#666">
    Taking you to your chat...
  </p>
  <form id="f" method="POST" action="/chat/auth">
    <input type="hidden" name="token" value="${escapeHtml(token)}" />
  </form>
  <script>document.getElementById('f').submit();</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * POST /chat/auth — validates token, sets cookie, redirects.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    const token = formData?.get("token")?.toString();

    if (!token) {
      return NextResponse.redirect(new URL("/chat?error=missing_token", getPublicBaseUrl(request)));
    }

    // Load env vars
    if (!process.env.ANTHROPIC_API_KEY && !process.env.MOCK_LLM) {
      try {
        const { config } = await import("dotenv");
        const path = await import("path");
        config({ path: path.resolve(process.cwd(), "../../.env") });
      } catch { /* env vars may be set via platform */ }
    }

    const { consumeMagicLink } = await import("../../../../../src/engine/magic-link");

    const result = await consumeMagicLink(token);

    if (!result) {
      return NextResponse.redirect(new URL("/chat?error=invalid_or_expired", getPublicBaseUrl(request)));
    }

    // Set httpOnly session cookie
    const cookieStore = await cookies();
    cookieStore.set(CHAT_SESSION_COOKIE, result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return NextResponse.redirect(new URL("/chat", getPublicBaseUrl(request)));
  } catch (error) {
    console.error("[/chat/auth] Error:", error);
    return NextResponse.redirect(new URL("/chat?error=server_error", getPublicBaseUrl(request)));
  }
}
