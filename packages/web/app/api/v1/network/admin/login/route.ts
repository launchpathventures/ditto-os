/**
 * POST /api/v1/network/admin/login — Admin login with username/password.
 *
 * Checks credentials against ADMIN_USERNAME and ADMIN_PASSWORD env vars.
 * On success, creates (or reuses) an admin API token and returns it.
 * The token is used for subsequent admin API calls.
 *
 * Set ADMIN_USERNAME and ADMIN_PASSWORD in Railway (or .env).
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time string comparison that does not leak length.
 * HMAC both inputs to fixed-length digests, then compare.
 */
function safeCompare(a: string, b: string): boolean {
  const key = "credential-compare";
  const hmacA = createHmac("sha256", key).update(a).digest();
  const hmacB = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required." },
        { status: 400 },
      );
    }

    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      console.error("[admin/login] ADMIN_USERNAME or ADMIN_PASSWORD not configured.");
      return NextResponse.json(
        { error: "Admin login not configured." },
        { status: 500 },
      );
    }

    // Timing-safe comparison to prevent timing attacks
    const usernameMatch = safeCompare(username, expectedUsername);
    const passwordMatch = safeCompare(password, expectedPassword);

    if (!usernameMatch || !passwordMatch) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 },
      );
    }

    // Credentials valid — find or create an admin token
    const { createToken, listTokens } = await import(
      "../../../../../../../../src/engine/network-api-auth"
    );

    // Check for existing active admin token
    const tokens = await listTokens();
    const existingAdmin = tokens.find(
      (t) => t.isAdmin && !t.revokedAt && t.userId === "admin",
    );

    if (existingAdmin) {
      // Can't recover the original token from hash — create a new one
      // (The existing one stays valid too, no harm)
    }

    // Create a fresh admin token for this session
    const { token } = await createToken("admin", { isAdmin: true });

    return NextResponse.json({ token });
  } catch (error) {
    console.error("[admin/login] Error:", error);
    return NextResponse.json(
      { error: "Login failed." },
      { status: 500 },
    );
  }
}
