/**
 * Admin Smoke Tests API (Brief 112)
 *
 * GET  — returns latest journey health + detailed results
 * POST — triggers an on-demand smoke test run (admin auth required)
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const {
      getJourneyHealth,
      getLatestRunResults,
      isSmokeTestRunning,
    } = await import(
      "../../../../../../../src/engine/smoke-test-runner"
    );

    const [health, latestResults] = await Promise.all([
      getJourneyHealth(),
      getLatestRunResults(),
    ]);

    return NextResponse.json({
      health,
      latestResults,
      isRunning: isSmokeTestRunning(),
    });
  } catch (err) {
    console.error("[admin-smoke-tests] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch smoke test data" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { runJourneySmokeTests, isSmokeTestRunning } = await import(
      "../../../../../../../src/engine/smoke-test-runner"
    );

    if (isSmokeTestRunning()) {
      return NextResponse.json(
        { error: "Smoke tests already running" },
        { status: 409 },
      );
    }

    // Trigger async — don't wait for completion
    setImmediate(async () => {
      try {
        await runJourneySmokeTests();
      } catch (err) {
        console.error("[admin-smoke-tests] On-demand run failed:", err);
      }
    });

    return NextResponse.json({ status: "started", message: "Smoke tests triggered. Refresh to see results." });
  } catch (err) {
    console.error("[admin-smoke-tests] Error triggering run:", err);
    return NextResponse.json(
      { error: "Failed to trigger smoke tests" },
      { status: 500 },
    );
  }
}
