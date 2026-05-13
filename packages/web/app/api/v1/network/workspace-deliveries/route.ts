import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";
import {
  listPendingWorkspaceInboxDeliveries,
  markWorkspaceInboxDeliveriesImported,
} from "../../../../../../../src/engine/workspace-inbox-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean)
    .slice(0, 100);
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const deliveries = await listPendingWorkspaceInboxDeliveries({
    userId: auth.userId,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return NextResponse.json({
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      kind: delivery.kind,
      blocks: delivery.blocks,
      createdAt: delivery.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = cleanIds(body.ids);
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids_required" }, { status: 400 });
  }

  const imported = await markWorkspaceInboxDeliveriesImported({
    userId: auth.userId,
    ids,
  });
  return NextResponse.json({ imported });
}
