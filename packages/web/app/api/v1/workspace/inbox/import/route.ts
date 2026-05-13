import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { ContentBlock } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NetworkDelivery {
  id: string;
  kind: "forwarded_note" | "visitor_intro_request";
  blocks: ContentBlock[];
  createdAt: string;
}

function networkConfig(): { url: string; token: string } | null {
  const url = process.env.DITTO_NETWORK_URL?.replace(/\/+$/, "");
  const token = process.env.DITTO_NETWORK_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function summarizeDelivery(delivery: NetworkDelivery): string {
  const first = delivery.blocks[0];
  if (!first) return "Network inbox delivery";
  if (first.type === "authorization-request") return first.header;
  if (first.type === "record") return first.title;
  if (first.type === "text") return first.text.slice(0, 160);
  return `${delivery.kind} delivery`;
}

async function alreadyImported(deliveryId: string): Promise<boolean> {
  const { db, schema } = await import("../../../../../../../../src/db");
  const [existing] = await db
    .select({ id: schema.activities.id })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.action, "workspace_inbox_delivery"),
        eq(schema.activities.entityType, "network_workspace_delivery"),
        eq(schema.activities.entityId, deliveryId),
      ),
    )
    .limit(1);
  return Boolean(existing);
}

async function importDelivery(delivery: NetworkDelivery): Promise<"created" | "existing"> {
  if (await alreadyImported(delivery.id)) return "existing";
  const { db, schema } = await import("../../../../../../../../src/db");
  await db.insert(schema.activities).values({
    action: "workspace_inbox_delivery",
    description: summarizeDelivery(delivery),
    actorType: "network",
    actorId: process.env.DITTO_WORKSPACE_USER_ID ?? null,
    entityType: "network_workspace_delivery",
    entityId: delivery.id,
    metadata: {
      kind: delivery.kind,
      blocks: delivery.blocks,
      networkCreatedAt: delivery.createdAt,
    },
    contentBlock: delivery.blocks[0] ? delivery.blocks[0] as unknown as Record<string, unknown> : null,
  });
  return "created";
}

export async function POST() {
  const config = networkConfig();
  if (!config) {
    return NextResponse.json({ skipped: true, reason: "network_not_configured" });
  }

  const response = await fetch(`${config.url}/api/v1/network/workspace-deliveries?limit=50`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "network_delivery_fetch_failed", status: response.status },
      { status: 502 },
    );
  }

  const data = (await response.json()) as { deliveries?: NetworkDelivery[] };
  const deliveries = Array.isArray(data.deliveries) ? data.deliveries : [];
  const ackIds: string[] = [];
  let imported = 0;
  for (const delivery of deliveries) {
    if (
      typeof delivery.id !== "string" ||
      !Array.isArray(delivery.blocks) ||
      !["forwarded_note", "visitor_intro_request"].includes(delivery.kind)
    ) {
      continue;
    }
    const result = await importDelivery(delivery);
    ackIds.push(delivery.id);
    if (result === "created") imported += 1;
  }

  if (ackIds.length > 0) {
    await fetch(`${config.url}/api/v1/network/workspace-deliveries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: ackIds }),
    }).catch(() => null);
  }

  return NextResponse.json({
    imported,
    acknowledged: ackIds.length,
    deliveryIds: ackIds,
  });
}
