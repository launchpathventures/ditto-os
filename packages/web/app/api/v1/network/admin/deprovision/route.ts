/**
 * POST /api/v1/network/admin/deprovision — Deprovision a managed workspace (admin-only).
 *
 * Stops and destroys Fly Machine + Volume, revokes token, updates fleet registry.
 * Destructive — permanently deletes all workspace data.
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
    const { userId } = body as { userId?: string };

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required." },
        { status: 400 },
      );
    }

    const flyToken = process.env.FLY_API_TOKEN;
    const flyOrg = process.env.FLY_ORG;
    const flyRegion = process.env.FLY_REGION ?? "syd";

    if (!flyToken || !flyOrg) {
      return NextResponse.json(
        { error: "Server misconfigured: FLY_API_TOKEN and FLY_ORG are required." },
        { status: 500 },
      );
    }

    const { deprovisionWorkspace, createFlyClient } = await import(
      "../../../../../../../../src/engine/workspace-provisioner"
    );

    const flyClient = createFlyClient(flyToken);
    const result = await deprovisionWorkspace(userId, {
      flyClient,
      flyAppName: flyOrg,
      flyRegion,
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
