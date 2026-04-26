/**
 * Managed-Agent status decoder — Brief 217 §What Changes / AC #10.
 *
 * Pure helpers for the `claude-managed-agent` branch of the status webhook.
 * Only fires when `callback_mode='in-prompt'` is configured (polling-primary
 * is the default; the polling cron + GitHub fallback do the heavy lifting).
 *
 * Bearer-acceptance + state-machine concerns are shared with the routine
 * decoder via the route at `packages/web/app/api/v1/work-items/[id]/status/route.ts`.
 * The kind-specific bit here is forensic-grade kind isolation: this verifier
 * filters on `runnerKind = 'claude-managed-agent'` so a routine-bound
 * ephemeral token cannot satisfy a managed-agent webhook.
 */

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as appDb } from "../../db";
import * as schema from "../../db/schema";
import { runnerDispatches } from "../../db/schema";
import {
  cloudRunnerStateToDispatchStatus,
  type CloudRunnerCallbackState,
} from "@ditto/core";

type AnyDb = BetterSQLite3Database<typeof schema>;

export type ManagedAgentBearerSource = "ephemeral" | "project" | "none";

export interface ManagedAgentBearerCheckResult {
  ok: boolean;
  source: ManagedAgentBearerSource;
  /** Set when source is "ephemeral" — the dispatch the bearer was bound to. */
  dispatchId?: string;
}

/**
 * Try to verify a presented bearer against an active managed-agent dispatch's
 * `callback_token_hash` for the given work item. Filters on
 * `runnerKind = 'claude-managed-agent'` so a routine-bound ephemeral token
 * doesn't satisfy a managed-agent webhook (forensic-grade auditability).
 */
export async function verifyManagedAgentEphemeralCallbackToken(
  presented: string,
  workItemId: string,
  options: { db?: AnyDb } = {},
): Promise<ManagedAgentBearerCheckResult> {
  const dbImpl = (options.db ?? appDb) as AnyDb;
  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      hash: runnerDispatches.callbackTokenHash,
      runnerKind: runnerDispatches.runnerKind,
    })
    .from(runnerDispatches)
    .where(eq(runnerDispatches.workItemId, workItemId));

  for (const row of rows) {
    if (!row.hash) continue;
    if (row.runnerKind !== "claude-managed-agent") continue;
    if (await bcrypt.compare(presented, row.hash)) {
      return { ok: true, source: "ephemeral", dispatchId: row.id };
    }
  }
  return { ok: false, source: "none" };
}

/**
 * Build a conversation inline-card description for a managed-agent state
 * callback. The webhook handler writes this into `activities.description`.
 */
export function describeManagedAgentCallback(opts: {
  state: CloudRunnerCallbackState;
  prUrl?: string;
  error?: string;
  externalUrl?: string | null;
}): string {
  switch (opts.state) {
    case "running":
      return opts.externalUrl
        ? `Managed Agent running — ${opts.externalUrl}`
        : "Managed Agent running";
    case "succeeded":
      return opts.prUrl
        ? `Managed Agent completed — PR opened: ${opts.prUrl}`
        : "Managed Agent completed";
    case "failed":
      return opts.error
        ? `Managed Agent failed — ${truncate(opts.error, 200)}`
        : "Managed Agent failed";
    case "cancelled":
      return "Managed Agent session cancelled";
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export { cloudRunnerStateToDispatchStatus };
export type { CloudRunnerCallbackState };
