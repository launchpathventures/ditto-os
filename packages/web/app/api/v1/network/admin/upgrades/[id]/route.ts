/**
 * GET /api/v1/network/admin/upgrades/:id — Get upgrade status by ID (admin-only).
 *
 * Returns the upgrade record with per-workspace results.
 * Use this to poll after POST /admin/upgrade returns the upgradeId.
 *
 * Provenance: Brief 091, AC16 (status polling).
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
    const { createWorkspaceUpgrader, createFlyMachinesClient, createHealthChecker } = await import(
      "../../../../../../../../../src/engine/workspace-upgrader"
    );
    const { createAlertSender } = await import(
      "../../../../../../../../../src/engine/workspace-alerts"
    );

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
