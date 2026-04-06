/**
 * Ditto Web — Network API Auth Helper
 *
 * Shared authentication helpers for /api/v1/network/* routes.
 * - authenticateRequest: validates Bearer token, returns userId (any valid token)
 * - authenticateAdminRequest: validates Bearer token + admin role (admin-only routes)
 *
 * Provenance: Brief 088, Brief 090 (admin auth).
 */

import { NextResponse } from "next/server";

export type AuthResult =
  | { authenticated: true; userId: string; isAdmin: boolean }
  | { authenticated: false; response: NextResponse };

/**
 * Authenticate a request using Bearer token.
 * Returns userId + isAdmin on success, or a 401 NextResponse on failure.
 */
export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  const { validateToken } = await import("../../../src/engine/network-api-auth");
  const result = await validateToken(authHeader);

  if (!result) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  return { authenticated: true, userId: result.userId, isAdmin: result.isAdmin };
}

/**
 * Authenticate a request requiring admin privileges.
 * Returns 401 for missing/invalid tokens, 403 for non-admin tokens.
 */
export async function authenticateAdminRequest(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  const { validateToken } = await import("../../../src/engine/network-api-auth");
  const result = await validateToken(authHeader);

  if (!result) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  if (!result.isAdmin) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Forbidden: admin token required" },
        { status: 403 },
      ),
    };
  }

  return { authenticated: true, userId: result.userId, isAdmin: true };
}
