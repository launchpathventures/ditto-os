import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, inArray } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { emitNetworkEvent } from "./network-events";
import { requireNetworkStepRunId } from "./network-step-run";
import type { ContentBlock } from "./content-blocks";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export interface QueueWorkspaceInboxDeliveryInput {
  db?: NetworkDbHandle;
  userId: string;
  kind: networkSchema.NetworkWorkspaceDeliveryKind;
  blocks: ContentBlock[];
  stepRunId?: string | null;
  dedupeKey?: string | null;
  now?: Date;
}

export interface QueueWorkspaceInboxDeliveryResult {
  delivery: typeof networkSchema.networkWorkspaceDeliveries.$inferSelect;
  eventId: number;
}

export async function queueWorkspaceInboxDelivery({
  db = networkDb,
  userId,
  kind,
  blocks,
  stepRunId,
  dedupeKey,
  now = new Date(),
}: QueueWorkspaceInboxDeliveryInput): Promise<QueueWorkspaceInboxDeliveryResult> {
  requireNetworkStepRunId(stepRunId, "workspace_inbox_delivery", { rejectWebDirect: true });
  if (blocks.length === 0) {
    throw new Error("workspace_inbox_delivery requires at least one block");
  }

  if (dedupeKey) {
    const [existing] = await db
      .select()
      .from(networkSchema.networkWorkspaceDeliveries)
      .where(
        and(
          eq(networkSchema.networkWorkspaceDeliveries.userId, userId),
          eq(networkSchema.networkWorkspaceDeliveries.dedupeKey, dedupeKey),
        ),
      )
      .limit(1);
    if (existing) {
      const eventId = emitNetworkEvent(userId, "workspace_blocks_push", {
        viewSlug: "inbox",
        mode: "append",
        deliveryId: existing.id,
        blocks: existing.blocks,
      });
      return { delivery: existing, eventId };
    }
  }

  const [delivery] = await db
    .insert(networkSchema.networkWorkspaceDeliveries)
    .values({
      userId,
      kind,
      blocks,
      dedupeKey: dedupeKey ?? null,
      sourceStepRunId: stepRunId ?? null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const eventId = emitNetworkEvent(userId, "workspace_blocks_push", {
    viewSlug: "inbox",
    mode: "append",
    deliveryId: delivery.id,
    blocks: delivery.blocks,
  });

  return { delivery, eventId };
}

export async function listPendingWorkspaceInboxDeliveries({
  db = networkDb,
  userId,
  limit = 50,
}: {
  db?: NetworkDbHandle;
  userId: string;
  limit?: number;
}): Promise<Array<typeof networkSchema.networkWorkspaceDeliveries.$inferSelect>> {
  return db
    .select()
    .from(networkSchema.networkWorkspaceDeliveries)
    .where(
      and(
        eq(networkSchema.networkWorkspaceDeliveries.userId, userId),
        eq(networkSchema.networkWorkspaceDeliveries.status, "pending"),
      ),
    )
    .limit(limit);
}

export async function markWorkspaceInboxDeliveriesImported({
  db = networkDb,
  userId,
  ids,
  now = new Date(),
}: {
  db?: NetworkDbHandle;
  userId: string;
  ids: string[];
  now?: Date;
}): Promise<number> {
  const cleanIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (cleanIds.length === 0) return 0;

  const rows = await db
    .update(networkSchema.networkWorkspaceDeliveries)
    .set({
      status: "imported",
      importedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(networkSchema.networkWorkspaceDeliveries.userId, userId),
        inArray(networkSchema.networkWorkspaceDeliveries.id, cleanIds),
      ),
    )
    .returning({ id: networkSchema.networkWorkspaceDeliveries.id });
  return rows.length;
}
