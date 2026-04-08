/**
 * POST /api/v1/network/admin/provision — Provision a managed workspace (admin-only).
 *
 * Creates a Railway service + volume, generates a network token,
 * sets env vars, deploys, creates domain, waits for health check,
 * and records in fleet registry.
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
    const { userId, imageRef } = body as { userId?: string; imageRef?: string };

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required." },
        { status: 400 },
      );
    }

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
    const image = imageRef ?? process.env.DITTO_IMAGE_REF;
    const networkUrl = process.env.DITTO_NETWORK_URL ?? `https://${request.headers.get("host")}`;

    if (!railwayToken || !railwayProjectId || !image) {
      return NextResponse.json(
        { error: "Server misconfigured: RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, and DITTO_IMAGE_REF are required." },
        { status: 500 },
      );
    }

    const { provisionWorkspace, createRailwayClient } = await import(
      "../../../../../../../../src/engine/workspace-provisioner"
    );

    const railwayClient = createRailwayClient(railwayToken, railwayProjectId);
    const result = await provisionWorkspace(userId, {
      railwayClient,
      projectId: railwayProjectId,
      imageRef: image,
      networkUrl,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[/api/v1/network/admin/provision] Error:", error);
    return NextResponse.json(
      { error: `Provisioning failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 },
    );
  }
}
