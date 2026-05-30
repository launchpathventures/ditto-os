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
 * - `public`    — `/welcome`, `/network`, `/admin`, and `/people` are publicly routable;
 *                 `/` (root) bypasses auth so the front door can render.
 * - `workspace` — `/welcome`, `/admin`, and network admin APIs are hard-404'd
 *                 at the edge and are not in the public list; `/` falls
 *                 through to the auth check.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDeploymentMode } from "./lib/deployment";
import { getPublicBaseUrl } from "./lib/public-url";
import {
  REF_TOKEN_TTL_MS,
  SHARE_REF_COOKIE,
  signRefToken,
  verifyRefTokenForHost,
} from "./lib/signed-cookie";
import { TOMBSTONE_NEUTRAL_HTML } from "./lib/tombstone-page";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";
const SHARE_REF_CHANNELS = new Set([
  "linkedin",
  "x",
  "instagram",
  "email-signature",
  "website-badge",
  "badge",
]);

/**
 * Brief 284 — public profile tombstone check. Returns HTTP 410 + neutral HTML
 * for tombstoned subjects so the page never renders the claim flow or any
 * prior content. We fetch a lightweight JSON endpoint (Node.js runtime)
 * rather than hitting the network DB from Edge.
 *
 * Fail-open by design: if the tombstone-status fetch throws or returns a
 * non-OK status, this returns `null` and the request proceeds to normal
 * routing. The page-level `TombstoneFallback` in `people/[handle]/page.tsx`
 * re-checks `user.status` and `isSubjectTombstoned()` directly against the
 * network DB, so the page render is the authoritative gate. This middleware
 * exists only to short-circuit the render before the page assembles.
 */
async function tombstoneInterceptForProfilePath(
  request: NextRequest,
): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(/^\/people\/([^/]+)\/?$/);
  if (!match) return null;
  const handle = match[1];
  try {
    const statusUrl = new URL(
      `/api/v1/network/people/${handle}/tombstone-status`,
      request.nextUrl,
    );
    const response = await fetch(statusUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { tombstoned?: boolean };
    if (!data.tombstoned) return null;
    return new NextResponse(TOMBSTONE_NEUTRAL_HTML, {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return null;
  }
}

async function responseWithShareRefCookie(
  request: NextRequest,
): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(/^\/people\/([^/]+)\/?$/);
  if (!match) return null;
  const channel = request.nextUrl.searchParams.get("ref")?.trim();
  if (!channel || !SHARE_REF_CHANNELS.has(channel)) return null;
  const ph = decodeURIComponent(match[1]).trim().toLowerCase();
  if (!ph) return null;

  const response = NextResponse.next();
  const host = request.nextUrl.hostname;
  const domain = host === "ditto.partners" || host.endsWith(".ditto.partners")
    ? ".ditto.partners"
    : undefined;
  response.cookies.set({
    name: SHARE_REF_COOKIE,
    value: await signRefToken({ channel, ph, ts: Date.now() }),
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    domain,
    maxAge: Math.floor(REF_TOKEN_TTL_MS / 1000),
  });
  return response;
}

async function isValidWorkspaceReferralHandoff(request: NextRequest): Promise<boolean> {
  const { pathname, searchParams, hostname } = request.nextUrl;
  if (pathname !== "/welcome" && pathname !== "/network/request") return false;
  const token = searchParams.get("ditto_ref");
  if (!token) return false;
  const host = request.headers.get("x-forwarded-host") ?? hostname;
  return Boolean(await verifyRefTokenForHost(token, host));
}

/** Verify HMAC-signed session cookie (Edge-compatible via Web Crypto API). */
async function verifySessionCookie(cookieValue: string, ownerEmail: string): Promise<boolean> {
  const sepIdx = cookieValue.lastIndexOf("|");
  if (sepIdx === -1) return false;
  const email = cookieValue.substring(0, sepIdx);
  const sig = cookieValue.substring(sepIdx + 1);
  if (email.toLowerCase() !== ownerEmail.toLowerCase()) return false;

  const secret = process.env.SESSION_SECRET || process.env.NETWORK_AUTH_SECRET;
  if (!secret) return false;
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
  "/api/healthz",
  "/api/v1/network",
  "/api/v1/chat",
  "/api/v1/voice",
  "/api/v1/bridge/_dial",
  "/api/v1/workspace/request-link",
  "/api/v1/workspace/session",
  "/_next",
  "/favicon",
  "/review",
];

/** Additional public prefixes enabled only in `public` deployment mode. */
const PUBLIC_MODE_PREFIXES = ["/welcome", "/network", "/admin", "/people"];

/**
 * Prefixes that are hard-404'd in `workspace` mode — these surfaces are
 * not shipped on client deployments, not merely auth-gated.
 */
const WORKSPACE_MODE_BLOCKED_PREFIXES = ["/welcome", "/admin", "/api/v1/network/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = getDeploymentMode();
  const managedWorkspace = mode === "workspace" && (
    !!process.env.DITTO_NETWORK_URL || !!process.env.DITTO_WORKSPACE_USER_ID
  );
  const workspaceReferralHandoff =
    mode === "workspace" ? await isValidWorkspaceReferralHandoff(request) : false;

  // Hard-block surfaces that aren't shipped in workspace mode.
  if (
    mode === "workspace" &&
    isBlockedInWorkspaceMode(pathname) &&
    !workspaceReferralHandoff
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (mode === "public") {
    const tombstone = await tombstoneInterceptForProfilePath(request);
    if (tombstone) return tombstone;
    const shareRef = await responseWithShareRefCookie(request);
    if (shareRef) return shareRef;
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

  if (workspaceReferralHandoff) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.includes(".") && !pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Local/self-hosted dev without a Network link stays open. Managed
  // workspaces fail closed when auth env is incomplete.
  if (!process.env.WORKSPACE_OWNER_EMAIL) {
    if (managedWorkspace) {
      return new NextResponse("Workspace auth misconfigured", { status: 503 });
    }
    return NextResponse.next();
  }
  if (managedWorkspace && !process.env.SESSION_SECRET && !process.env.NETWORK_AUTH_SECRET) {
    return new NextResponse("Workspace auth misconfigured", { status: 503 });
  }

  // Check workspace session cookie — HMAC-signed value verified against owner email
  const sessionCookie = request.cookies.get(WORKSPACE_SESSION_COOKIE);
  if (
    sessionCookie?.value &&
    await verifySessionCookie(sessionCookie.value, process.env.WORKSPACE_OWNER_EMAIL!)
  ) {
    return NextResponse.next();
  }

  // No session — redirect to login. Use the public base URL so the Location
  // header doesn't leak the internal Docker bind (`0.0.0.0:8080`) — see
  // `./lib/public-url.ts` for the full rationale (Insight-234).
  const loginUrl = new URL("/login", getPublicBaseUrl(request));
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
