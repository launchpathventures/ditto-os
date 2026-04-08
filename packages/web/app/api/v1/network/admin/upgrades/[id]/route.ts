/**
 * GET /api/v1/network/admin/upgrades/:id — Get upgrade status by ID (admin-only).
 *
 * Returns the upgrade record with per-workspace results.
 * Use this to poll after POST /admin/upgrade returns the upgradeId.
 *
 * Provenance: Brief 091, Brief 100 (Railway migration).
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const { db, schema } = await import("../../../../../../../../../src/db");
    const { createWorkspaceUpgrader, createRailwayServiceClient, createHealthChecker } = await import(
      "../../../../../../../../../src/engine/workspace-upgrader"
    );
    const { createAlertSender } = await import(
      "../../../../../../../../../src/engine/workspace-alerts"
    );

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

    const status = await upgrader.getUpgradeStatus(id);

    if (!status) {
      return NextResponse.json(
        { error: "Upgrade not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error("[/api/v1/network/admin/upgrades/:id] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch upgrade status" },
      { status: 500 },
    );
  }
}
