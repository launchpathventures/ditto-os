/**
 * Ditto Web — Network Intake Route
 *
 * POST /api/network/intake — Conversational intake for new visitors.
 * Visitor submits email (+ optional name, need). Ditto recognises existing
 * network participants or creates a new person record.
 *
 * Returns a welcome message from the assigned persona. The calling frontend
 * can then trigger a welcome email via AgentMail (or the response message
 * is sufficient for the web experience).
 *
 * Provenance: Brief 079/085 (web front door), Insight-151 (network is the front door).
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
      "../../../../../../src/engine/self-tools/network-tools"
    );

    const result = await startIntake(email, name, need);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/network/intake] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
