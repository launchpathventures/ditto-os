/**
 * GET /api/v1/network/admin/upgrades — Upgrade history (admin-only).
 *
 * Returns all upgrade attempts with status, counts, and timestamps.
 * Query params: ?limit=20 (default)
 *
 * Provenance: Brief 091, Brief 100 (Railway migration).
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    const { db, schema } = await import("../../../../../../../../src/db");
    const { createWorkspaceUpgrader, createRailwayServiceClient, createHealthChecker } = await import(
      "../../../../../../../../src/engine/workspace-upgrader"
    );
    const { createAlertSender } = await import(
      "../../../../../../../../src/engine/workspace-alerts"
    );

    // Create a minimal upgrader just for history queries
    const railwayClient = createRailwayServiceClient({
      apiToken: process.env.RAILWAY_API_TOKEN || "",
      projectId: process.env.RAILWAY_PROJECT_ID || "",
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      railwayClient,
      healthChecker: createHealthChecker(),
      alertSender: createAlertSender(),
    });

    const history = await upgrader.getUpgradeHistory({ limit });

    return NextResponse.json({ upgrades: history });
  } catch (error) {
    console.error("[/api/v1/network/admin/upgrades] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch upgrade history" },
      { status: 500 },
    );
  }
}
