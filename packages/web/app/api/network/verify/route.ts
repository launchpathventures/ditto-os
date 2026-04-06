/**
 * Ditto Web — Anti-Enumeration Verify Route (Brief 095)
 *
 * POST /api/network/verify — Uniform response regardless of hit/miss.
 * If found, sends verification email to the recipient's inbox silently.
 * Fixed-delay floor ensures constant timing.
 *
 * CRITICAL: This endpoint MUST return the same response and timing regardless
 * of whether the email is found. See src/engine/network-verify.ts for details.
 *
 * Provenance: Brief 095, ADR-025 (web front door endpoint).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email as string | undefined;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

    const { handleVerify } = await import(
      "../../../../../../src/engine/network-verify"
    );

    const result = await handleVerify(email, ip);

    if (result.rateLimited) {
      return NextResponse.json(result, { status: 429 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/network/verify] Error:", error);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }
}
