/**
 * GET /api/v1/network/chat/config — Lightweight config for the front door.
 * Returns test mode flag so the frontend knows whether to clear localStorage.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Load env vars from root .env
  if (!process.env.DITTO_TEST_MODE) {
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }
  }

  return NextResponse.json({
    testMode: process.env.DITTO_TEST_MODE === "true",
  });
}
