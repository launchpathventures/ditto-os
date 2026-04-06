/**
 * POST /api/v1/network/admin/upgrade — Trigger fleet-wide workspace upgrade (admin-only).
 *
 * Body: { imageRef: string, maxFailures?: number }
 * Returns: { upgradeId: string } immediately. Upgrade runs in the background.
 * Poll GET /api/v1/network/admin/upgrades/:id for status.
 *
 * Returns 409 if an upgrade is already in progress.
 *
 * Provenance: Brief 091, AC16.
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { imageRef, maxFailures } = body;

    if (!imageRef || typeof imageRef !== "string") {
      return NextResponse.json(
        { error: "imageRef is required" },
        { status: 400 },
      );
    }

    const { db, schema } = await import("../../../../../../../../src/db");
    const { createWorkspaceUpgrader, createFlyMachinesClient, createHealthChecker } = await import(
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

    // Start upgrade in background — returns upgradeId immediately (AC16)
    const { upgradeId } = await upgrader.startUpgradeFleet({
      imageRef,
      maxFailures: maxFailures ?? undefined,
      triggeredBy: "api",
    });

    return NextResponse.json({ upgradeId, status: "in_progress" }, { status: 202 });
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

    console.error("[/api/v1/network/admin/upgrade] Error:", error);
    return NextResponse.json(
      { error: "Failed to start upgrade" },
      { status: 500 },
    );
  }
}
