/**
 * Routine status decoder — Brief 216 §What Changes.
 *
 * Pure helpers for the `claude-code-routine` branch of the status webhook.
 * The route at `packages/web/app/api/v1/work-items/[id]/status/route.ts`
 * delegates here for routine-specific concerns:
 *
 *   - Per-dispatch ephemeral callback token verification (the route still
 *     accepts the long-lived `projects.runnerBearerHash` for non-prompt-
 *     composing runners; this helper is the ephemeral path).
 *   - Conversation inline-card description text.
 *   - The state-mapping table from §D9 (re-exported from @ditto/core).
 *
 * Engine-product layer — couples to DB. The route is the only consumer.
 */

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as appDb } from "../../db";
import * as schema from "../../db/schema";
import { runnerDispatches } from "../../db/schema";
import {
  routineStateToDispatchStatus,
  type RoutineCallbackState,
} from "@ditto/core";

type AnyDb = BetterSQLite3Database<typeof schema>;

export type RoutineBearerSource = "ephemeral" | "project" | "none";

export interface RoutineBearerCheckResult {
  ok: boolean;
  source: RoutineBearerSource;
  /** Set when source is "ephemeral" — the dispatch the bearer was bound to. */
  dispatchId?: string;
}

/**
 * Try to verify the presented bearer against an active dispatch's
 * `callback_token_hash` for the given work item. Returns the matching
 * dispatch id when verified.
 *
 * Lookup order: ephemeral first (more specific), caller falls back to
 * project bearer.
 */
export async function verifyEphemeralCallbackToken(
  presented: string,
  workItemId: string,
  options: { db?: AnyDb } = {},
): Promise<RoutineBearerCheckResult> {
  const dbImpl = (options.db ?? appDb) as AnyDb;
  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      hash: runnerDispatches.callbackTokenHash,
    })
    .from(runnerDispatches)
    .where(eq(runnerDispatches.workItemId, workItemId));

  for (const row of rows) {
    if (!row.hash) continue;
    if (await bcrypt.compare(presented, row.hash)) {
      return { ok: true, source: "ephemeral", dispatchId: row.id };
    }
  }
  return { ok: false, source: "none" };
}

/**
 * Build a conversation inline-card description for a routine-state callback.
 * The webhook handler writes this into `activities.description`.
 */
export function describeRoutineCallback(opts: {
  state: RoutineCallbackState;
  prUrl?: string;
  error?: string;
  externalUrl?: string | null;
}): string {
  switch (opts.state) {
    case "running":
      return opts.externalUrl
        ? `Routine session running — ${opts.externalUrl}`
        : "Routine session running";
    case "succeeded":
      return opts.prUrl
        ? `Routine completed — PR opened: ${opts.prUrl}`
        : "Routine completed";
    case "failed":
      return opts.error
        ? `Routine failed — ${truncate(opts.error, 200)}`
        : "Routine failed";
    case "cancelled":
      return "Routine session cancelled";
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** Re-export the state-mapping helper from core so the route has one import. */
export { routineStateToDispatchStatus };
export type { RoutineCallbackState };
