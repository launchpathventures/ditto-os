/**
 * POST /api/v1/network/intake — Conversational intake (public, no auth).
 * Moved from /api/network/intake per ADR-025 versioning requirement.
 *
 * Provenance: Brief 085/088.
 */

import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INTAKE_PER_IP_PER_HOUR = 10;
const ipIntakeCounts = new Map<string, { count: number; resetAt: number }>();

function checkIntakeRateLimit(ip: string): boolean {
  const salt = process.env.IP_HASH_SALT || "ditto-default-salt";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");
  const now = Date.now();
  const entry = ipIntakeCounts.get(ipHash);

  if (!entry || now > entry.resetAt) {
    ipIntakeCounts.set(ipHash, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= MAX_INTAKE_PER_IP_PER_HOUR) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    if (!checkIntakeRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { email, name, need } = body as {
      email?: string;
      name?: string;
      need?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    const { startIntake } = await import(
      "../../../../../../../src/engine/self-tools/network-tools"
    );

    const result = await startIntake(email, name, need);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/v1/network/intake] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
