/**
 * POST /api/v1/network/admin/rollback — Trigger fleet-wide rollback (admin-only).
 *
 * Reverts the most recent upgrade. Each workspace is reverted to its own
 * pre-upgrade image (not a single global image).
 *
 * Provenance: Brief 091, Brief 100 (Railway migration).
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { db, schema } = await import("../../../../../../../../src/db");
    const { createWorkspaceUpgrader, createRailwayServiceClient, createHealthChecker, UpgradeConflictError } = await import(
      "../../../../../../../../src/engine/workspace-upgrader"
    );
    const { createAlertSender } = await import(
      "../../../../../../../../src/engine/workspace-alerts"
    );

    const railwayClient = createRailwayServiceClient({
      apiToken: process.env.RAILWAY_API_TOKEN!,
      projectId: process.env.RAILWAY_PROJECT_ID!,
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      railwayClient,
      healthChecker: createHealthChecker(),
      alertSender: createAlertSender(process.env.DITTO_ALERT_WEBHOOK_URL),
    });

    const result = await upgrader.rollbackFleet({
      triggeredBy: "api",
    });

    return NextResponse.json(result);
  } catch (error) {
    const { UpgradeConflictError } = await import(
      "../../../../../../../../src/engine/workspace-upgrader"
    );

    if (error instanceof UpgradeConflictError) {
      return NextResponse.json(
        { error: "An upgrade is already in progress" },
        { status: 409 },
      );
    }

    console.error("[/api/v1/network/admin/rollback] Error:", error);
    return NextResponse.json(
      { error: "Failed to start rollback" },
      { status: 500 },
    );
  }
}
