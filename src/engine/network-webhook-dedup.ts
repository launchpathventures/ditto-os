/**
 * Network webhook idempotency (Brief 283).
 *
 * Svix retries are expected. This helper claims a webhook delivery id for a
 * TTL window so duplicate complaint events do not replay suppression/counter
 * writes.
 */

import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";

export const WEBHOOK_DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ClaimWebhookDeliveryInput {
  db?: NetworkDbLike;
  rootDir?: string;
  svixId: string;
  eventType: string;
  stepRunId?: unknown;
  ttlMs?: number;
  now?: Date;
}

export interface ClaimWebhookDeliveryResult {
  claimed: boolean;
  duplicate: boolean;
  expiresAt: Date;
}

function requireNonEmpty(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`claim_webhook_delivery requires ${label}`);
  return clean;
}

export async function claimNetworkWebhookDelivery(
  input: ClaimWebhookDeliveryInput,
): Promise<ClaimWebhookDeliveryResult> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "claim_network_webhook_delivery",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? WEBHOOK_DEDUP_TTL_MS));
  const svixId = requireNonEmpty(input.svixId, "svixId");
  const eventType = requireNonEmpty(input.eventType, "eventType");

  const [active] = await db
    .select()
    .from(networkSchema.networkWebhookDeliveries)
    .where(
      eq(networkSchema.networkWebhookDeliveries.svixId, svixId),
    )
    .limit(1);

  if (active && active.expiresAt > now) {
    return { claimed: false, duplicate: true, expiresAt: active.expiresAt };
  }

  if (active) {
    await db
      .update(networkSchema.networkWebhookDeliveries)
      .set({ eventType, stepRunId, expiresAt, createdAt: now })
      .where(eq(networkSchema.networkWebhookDeliveries.svixId, svixId));
    return { claimed: true, duplicate: false, expiresAt };
  }

  const [inserted] = await db
    .insert(networkSchema.networkWebhookDeliveries)
    .values({ svixId, eventType, stepRunId, expiresAt, createdAt: now })
    .onConflictDoNothing()
    .returning({ svixId: networkSchema.networkWebhookDeliveries.svixId });

  if (!inserted) {
    const [row] = await db
      .select()
      .from(networkSchema.networkWebhookDeliveries)
      .where(
        eq(networkSchema.networkWebhookDeliveries.svixId, svixId),
      )
      .limit(1);
    return {
      claimed: false,
      duplicate: true,
      expiresAt: row?.expiresAt ?? expiresAt,
    };
  }

  return { claimed: true, duplicate: false, expiresAt };
}

export async function hasActiveNetworkWebhookDelivery(
  svixId: string,
  input: { db?: NetworkDbLike; now?: Date } = {},
): Promise<boolean> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const [row] = await db
    .select()
    .from(networkSchema.networkWebhookDeliveries)
    .where(
      eq(networkSchema.networkWebhookDeliveries.svixId, svixId),
    )
    .limit(1);
  return Boolean(row && row.expiresAt > now);
}
