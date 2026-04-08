/**
 * POST /api/v1/network/admin/deprovision — Deprovision a managed workspace (admin-only).
 *
 * Deletes Railway service (cascades volume), revokes token, updates fleet registry.
 * Destructive — permanently deletes all workspace data.
 *
 * Provenance: Brief 090, Brief 100 (Railway migration), ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { checkRateLimit } = await import(
      "../../../../../../../../src/engine/workspace-provisioner"
    );

    if (!checkRateLimit(auth.userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 requests per minute." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { userId } = body as { userId?: string };

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required." },
        { status: 400 },
      );
    }

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;

    if (!railwayToken || !railwayProjectId) {
      return NextResponse.json(
        { error: "Server misconfigured: RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID are required." },
        { status: 500 },
      );
    }

    const { deprovisionWorkspace, createRailwayClient } = await import(
      "../../../../../../../../src/engine/workspace-provisioner"
    );

    const railwayClient = createRailwayClient(railwayToken, railwayProjectId);
    const result = await deprovisionWorkspace(userId, {
      railwayClient,
      projectId: railwayProjectId,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[/api/v1/network/admin/deprovision] Error:", error);
    return NextResponse.json(
      { error: `Deprovisioning failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 },
    );
  }
}
