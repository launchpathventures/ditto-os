/**
 * github-action status decoder — Brief 218 §What Changes / AC #10.
 *
 * Pure helpers for the `github-action` branch of the status webhook. Only
 * fires when the runner config has `callback_mode='in-workflow' | 'in-workflow-secret'`
 * (default `webhook-only` is the canonical signal path; the kind-agnostic
 * `cloud-runner-fallback.ts` does the heavy lifting via `workflow_run` events).
 *
 * Bearer-acceptance + state-machine concerns are shared with the routine and
 * managed-agent decoders via the route at
 * `packages/web/app/api/v1/work-items/[id]/status/route.ts`. The kind-specific
 * bit here is forensic-grade kind isolation: this verifier filters on
 * `runnerKind = 'github-action'` so a routine- or managed-agent-bound
 * ephemeral token cannot satisfy a github-action webhook.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
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

/**
 * Brief 218 — perf parity with `routine.ts` (Brief 216 Reviewer fix). Filter
 * to active rows with a non-null hash in SQL — avoids bcrypt-comparing every
 * historical dispatch (cost 12 ≈ 250ms × N rows otherwise).
 */
const ACTIVE_DISPATCH_STATUSES = ["queued", "dispatched", "running"] as const;

export type GithubActionBearerSource = "ephemeral" | "project" | "none";

export interface GithubActionBearerCheckResult {
  ok: boolean;
  source: GithubActionBearerSource;
  /** Set when source is "ephemeral" — the dispatch the bearer was bound to. */
  dispatchId?: string;
}

/**
 * Try to verify a presented bearer against an active github-action dispatch's
 * `callback_token_hash` for the given work item. Filters on
 * `runnerKind = 'github-action'` so a routine- or managed-agent-bound
 * ephemeral token doesn't satisfy a github-action webhook (forensic-grade
 * auditability).
 */
export async function verifyGithubActionEphemeralCallbackToken(
  presented: string,
  workItemId: string,
  options: { db?: AnyDb } = {},
): Promise<GithubActionBearerCheckResult> {
  const dbImpl = (options.db ?? appDb) as AnyDb;
  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      hash: runnerDispatches.callbackTokenHash,
      runnerKind: runnerDispatches.runnerKind,
    })
    .from(runnerDispatches)
    .where(
      and(
        eq(runnerDispatches.workItemId, workItemId),
        eq(runnerDispatches.runnerKind, "github-action"),
        isNotNull(runnerDispatches.callbackTokenHash),
        inArray(runnerDispatches.status, [...ACTIVE_DISPATCH_STATUSES]),
      ),
    );

  for (const row of rows) {
    if (!row.hash) continue;
    // Defence-in-depth: SQL filter handles kind isolation, but keep the
    // in-loop check so a buggy SQL generator can't bypass it.
    if (row.runnerKind !== "github-action") continue;
    if (await bcrypt.compare(presented, row.hash)) {
      return { ok: true, source: "ephemeral", dispatchId: row.id };
    }
  }
  return { ok: false, source: "none" };
}

/**
 * Build a conversation inline-card description for a github-action state
 * callback. The webhook handler writes this into `activities.description`.
 */
export function describeGithubActionCallback(opts: {
  state: CloudRunnerCallbackState;
  prUrl?: string;
  error?: string;
  workflowRunUrl?: string | null;
}): string {
  switch (opts.state) {
    case "running":
      return opts.workflowRunUrl
        ? `GitHub Actions workflow running — ${opts.workflowRunUrl}`
        : "GitHub Actions workflow running";
    case "succeeded":
      return opts.prUrl
        ? `GitHub Actions workflow succeeded — PR opened: ${opts.prUrl}`
        : "GitHub Actions workflow succeeded";
    case "failed":
      return opts.error
        ? `GitHub Actions workflow failed — ${truncate(opts.error, 200)}`
        : "GitHub Actions workflow failed";
    case "cancelled":
      return "GitHub Actions workflow cancelled";
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export { cloudRunnerStateToDispatchStatus };
export type { CloudRunnerCallbackState };
