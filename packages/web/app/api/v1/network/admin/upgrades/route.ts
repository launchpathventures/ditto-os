/**
 * GET /api/v1/network/admin/upgrades — Upgrade history (admin-only).
 *
 * Returns all upgrade attempts with status, counts, and timestamps.
 * Query params: ?limit=20 (default)
 *
 * Provenance: Brief 091, AC18.
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
    const { createWorkspaceUpgrader, createFlyMachinesClient, createHealthChecker } = await import(
      "../../../../../../../../src/engine/workspace-upgrader"
    );
    const { createAlertSender } = await import(
      "../../../../../../../../src/engine/workspace-alerts"
    );

    // Create a minimal upgrader just for history queries
    const flyClient = createFlyMachinesClient({
      apiToken: process.env.FLY_API_TOKEN || "",
      appName: process.env.FLY_APP_NAME || "ditto-ws",
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      flyClient,
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
