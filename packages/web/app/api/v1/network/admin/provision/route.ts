/**
 * POST /api/v1/network/admin/provision — Provision a managed workspace (admin-only).
 *
 * Creates a Fly.io Machine + Volume, generates a network token,
 * waits for deep health check, and records in fleet registry.
 *
 * Provenance: Brief 090, ADR-025.
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

    const flyToken = process.env.FLY_API_TOKEN;
    const flyOrg = process.env.FLY_ORG;
    const flyRegion = process.env.FLY_REGION ?? "syd";
    const image = imageRef ?? process.env.DITTO_IMAGE_REF;
    const networkUrl = process.env.DITTO_NETWORK_URL ?? `https://${request.headers.get("host")}`;

    if (!flyToken || !flyOrg || !image) {
      return NextResponse.json(
        { error: "Server misconfigured: FLY_API_TOKEN, FLY_ORG, and DITTO_IMAGE_REF are required." },
        { status: 500 },
      );
    }

    const { provisionWorkspace, createFlyClient } = await import(
      "../../../../../../../../src/engine/workspace-provisioner"
    );

    const flyClient = createFlyClient(flyToken);
    const result = await provisionWorkspace(userId, {
      flyClient,
      flyAppName: flyOrg,
      flyRegion,
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
