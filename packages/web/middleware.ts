/**
 * Ditto — Workspace Auth Middleware (Brief 143)
 *
 * Checks for `ditto_workspace_session` cookie on workspace routes.
 * Redirects to /login if missing. Allows public routes through:
 * - /welcome, /welcome/* — public front door (public mode only)
 * - /chat, /chat/* — has its own auth (Brief 123)
 * - /login, /login/* — login flow itself
 * - /admin, /admin/* — has its own auth (Brief 090), public mode only
 * - /api/v1/network/* — Bearer token auth (Brief 088)
 * - /api/v1/chat/* — cookie auth (Brief 123)
 * - /api/v1/workspace/request-link — must be accessible to send magic link
 * - /setup — initial setup page
 * - /_next/*, /favicon.ico, etc. — static assets
 *
 * When WORKSPACE_OWNER_EMAIL is not set (local dev), all routes pass through
 * without auth (AC11).
 *
 * Deployment mode (see ../lib/deployment.ts):
 * - `public`    — `/welcome` and `/admin` are publicly routable; `/` (root)
 *                 bypasses auth so the front door can render.
 * - `workspace` — `/welcome` and `/admin` are hard-404'd at the edge and are
 *                 not in the public list; `/` falls through to the auth check.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDeploymentMode } from "./lib/deployment";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

/** Verify HMAC-signed session cookie (Edge-compatible via Web Crypto API). */
async function verifySessionCookie(cookieValue: string, ownerEmail: string): Promise<boolean> {
  const sepIdx = cookieValue.lastIndexOf("|");
  if (sepIdx === -1) {
    // Legacy unsigned cookie — treat as email-only (backwards compat for existing sessions)
    return cookieValue.toLowerCase() === ownerEmail.toLowerCase();
  }
  const email = cookieValue.substring(0, sepIdx);
  const sig = cookieValue.substring(sepIdx + 1);
  if (email.toLowerCase() !== ownerEmail.toLowerCase()) return false;

  const secret = process.env.SESSION_SECRET || process.env.WORKSPACE_OWNER_EMAIL || "ditto-workspace";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(email.toLowerCase()));
  const expectedSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return sig === expectedSig;
}

/** Routes that are always accessible without workspace auth (all modes). */
const BASE_PUBLIC_PREFIXES = [
  "/chat",
  "/login",
  "/setup",
  "/api/v1/network",
  "/api/v1/chat",
  "/api/v1/voice",
  "/api/v1/workspace/request-link",
  "/api/v1/workspace/session",
  "/_next",
  "/favicon",
  "/review",
];

/** Additional public prefixes enabled only in `public` deployment mode. */
const PUBLIC_MODE_PREFIXES = ["/welcome", "/admin"];

/**
 * Prefixes that are hard-404'd in `workspace` mode — these surfaces are
 * not shipped on client deployments, not merely auth-gated.
 */
const WORKSPACE_MODE_BLOCKED_PREFIXES = ["/welcome", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = getDeploymentMode();

  // AC11: No WORKSPACE_OWNER_EMAIL = local dev, skip auth entirely.
  // Deployment-mode blocking still applies so local runs match prod shape:
  // if you're running locally with DITTO_DEPLOYMENT=workspace (the default),
  // /welcome and /admin will 404 even without WORKSPACE_OWNER_EMAIL set.
  // To exercise those surfaces locally, set DITTO_DEPLOYMENT=public.
  if (!process.env.WORKSPACE_OWNER_EMAIL) {
    if (mode === "workspace" && isBlockedInWorkspaceMode(pathname)) {
      return new NextResponse("Not Found", { status: 404 });
    }
    return NextResponse.next();
  }

  // Hard-block surfaces that aren't shipped in workspace mode.
  if (mode === "workspace" && isBlockedInWorkspaceMode(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Root ("/") is public in public mode so the front door can render to
  // unauthenticated visitors. Exact-match only — `startsWith("/")` would
  // match everything.
  if (mode === "public" && pathname === "/") {
    return NextResponse.next();
  }

  // Allow public routes through
  const publicPrefixes =
    mode === "public"
      ? [...BASE_PUBLIC_PREFIXES, ...PUBLIC_MODE_PREFIXES]
      : BASE_PUBLIC_PREFIXES;
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.includes(".") && !pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Check workspace session cookie — HMAC-signed value verified against owner email
  const sessionCookie = request.cookies.get(WORKSPACE_SESSION_COOKIE);
  if (
    sessionCookie?.value &&
    await verifySessionCookie(sessionCookie.value, process.env.WORKSPACE_OWNER_EMAIL!)
  ) {
    return NextResponse.next();
  }

  // No session — redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

/** True if the path is a surface we refuse to ship in workspace mode. */
function isBlockedInWorkspaceMode(pathname: string): boolean {
  return WORKSPACE_MODE_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
