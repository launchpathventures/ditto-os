/**
 * POST /api/v1/network/admin/rollback — Trigger fleet-wide rollback (admin-only).
 *
 * Reverts the most recent upgrade. Each workspace is reverted to its own
 * pre-upgrade image (not a single global image).
 *
 * Provenance: Brief 091, AC17.
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
    const { createWorkspaceUpgrader, createFlyMachinesClient, createHealthChecker, UpgradeConflictError } = await import(
      "../../../../../../../../src/engine/workspace-upgrader"
    );
    const { createAlertSender } = await import(
      "../../../../../../../../src/engine/workspace-alerts"
    );

    const flyClient = createFlyMachinesClient({
      apiToken: process.env.FLY_API_TOKEN!,
      appName: process.env.FLY_APP_NAME || "ditto-ws",
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      flyClient,
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
