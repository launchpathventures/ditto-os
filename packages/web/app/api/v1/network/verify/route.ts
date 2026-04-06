/**
 * POST /api/v1/network/verify — Anti-enumeration verify (public, no auth).
 * Uniform response. Fixed-delay floor. Brief 095.
 *
 * Provenance: Brief 095, ADR-025 versioning.
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
      "../../../../../../../src/engine/network-verify"
    );

    const result = await handleVerify(email, ip);

    if (result.rateLimited) {
      return NextResponse.json(result, { status: 429 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/v1/network/verify] Error:", error);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }
}
