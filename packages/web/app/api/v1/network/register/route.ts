/**
 * POST /api/v1/network/register — Workspace registration (protected).
 * Workspace announces itself to the Network (URL, capabilities).
 *
 * Provenance: Brief 088, ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { workspaceUrl, capabilities } = body as {
      workspaceUrl?: string;
      capabilities?: string[];
    };

    if (!workspaceUrl) {
      return NextResponse.json(
        { error: "workspaceUrl is required." },
        { status: 400 },
      );
    }

    // Update the network user's workspace info
    const { db, schema } = await import(
      "../../../../../../../src/db"
    );
    const { eq } = await import("drizzle-orm");

    // Find the network user for this userId
    const [networkUser] = await db
      .select()
      .from(schema.networkUsers)
      .where(eq(schema.networkUsers.id, auth.userId))
      .limit(1);

    if (networkUser) {
      await db
        .update(schema.networkUsers)
        .set({
          workspaceId: workspaceUrl,
          status: "workspace",
          updatedAt: new Date(),
        })
        .where(eq(schema.networkUsers.id, auth.userId));
    }

    return NextResponse.json({
      success: true,
      userId: auth.userId,
      workspaceUrl,
      capabilities: capabilities ?? [],
    });
  } catch (error) {
    console.error("[/api/v1/network/register] Error:", error);
    return NextResponse.json(
      { error: "Failed to register workspace." },
      { status: 500 },
    );
  }
}
