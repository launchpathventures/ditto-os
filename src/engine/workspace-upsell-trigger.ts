import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import { composeWorkspaceUpsell, workspaceUpsellDeclineLabel } from "./network-upsell-copy";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export interface WorkspaceUpsellResult {
  fired: boolean;
  copy: string | null;
  declineLabel: string;
  row: typeof networkSchema.networkSessionUpsellLog.$inferSelect | null;
}

function isUniqueConflict(error: unknown): boolean {
  const err = error as { code?: unknown; constraint?: unknown; constraint_name?: unknown; message?: unknown };
  if (err.code !== "23505") return false;
  return [err.constraint, err.constraint_name, err.message].some(
    (value) => typeof value === "string" && value.includes("network_session_upsell_log_user_trigger"),
  );
}

export async function maybeFireWorkspaceUpsell({
  db = networkDb,
  stepRunId,
  userId,
  trigger,
  handle,
  now = new Date(),
}: {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  userId: string;
  trigger: networkSchema.NetworkUpsellTrigger;
  handle?: string | null;
  now?: Date;
}): Promise<WorkspaceUpsellResult> {
  requireNetworkStepRunId(stepRunId, "workspace_upsell_trigger", {
    rejectWebDirect: true,
  });
  const cleanUserId = userId.trim();
  if (!cleanUserId) {
    throw new Error("workspace_upsell_trigger requires userId");
  }

  const [existing] = await db
    .select()
    .from(networkSchema.networkSessionUpsellLog)
    .where(
      and(
        eq(networkSchema.networkSessionUpsellLog.userId, cleanUserId),
        eq(networkSchema.networkSessionUpsellLog.trigger, trigger),
      ),
    )
    .limit(1);
  const declineLabel = workspaceUpsellDeclineLabel(trigger);
  if (existing) {
    return { fired: false, copy: null, declineLabel, row: existing };
  }

  try {
    const [row] = await db
      .insert(networkSchema.networkSessionUpsellLog)
      .values({
        userId: cleanUserId,
        trigger,
        firedAt: now,
      })
      .returning();
    return {
      fired: true,
      copy: composeWorkspaceUpsell({ trigger, handle }),
      declineLabel,
      row,
    };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    return { fired: false, copy: null, declineLabel, row: null };
  }
}
