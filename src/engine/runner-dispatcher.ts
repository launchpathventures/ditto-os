/**
 * Runner Dispatcher — work-item-level dispatch primitive.
 *
 * Brief 215 §"What Changes" / file `runner-dispatcher.ts`. Calls `resolveChain`
 * for the ordered list of runner kinds, walks the chain via the in-process
 * registry, persists `runner_dispatches` rows per attempt, advances on
 * `failed`/`rate_limited`/`timed_out` per the state machine, writes a
 * `harness_decisions` row keyed on stepRunId per Insight-180.
 *
 * This brief's scope: register `local-mac-mini` only. Sub-briefs 216-218 add
 * cloud kinds to the registry; the dispatcher needs no changes.
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  resolveChain,
  transitionDispatch,
  type ProjectResolutionRef,
  type ProjectRunnerResolutionRef,
  type WorkItemRef,
  type WorkItemResolutionRef,
  type RunnerKind,
  type RunnerMode,
  type ProjectRef,
  type ProjectRunnerRef,
  type DispatchResult,
  type RunnerDispatchEvent,
  type RunnerDispatchStatus,
  kindToMode,
} from "@ditto/core";
import * as schema from "../db/schema";
import {
  projects,
  projectRunners,
  runnerDispatches,
  harnessDecisions,
  workItems,
  type RunnerKindValue,
  type RunnerHealthStatusValue,
} from "../db/schema";
import { db as appDb } from "../db";
import { getAdapter } from "./runner-registry";

type AnyDb = BetterSQLite3Database<typeof schema>;

const TEST_MODE = process.env.DITTO_TEST_MODE === "true";

export interface DispatchInput {
  /** Insight-180: required. Bypassed only in DITTO_TEST_MODE. */
  stepRunId: string;
  /** ID of the workItems row to dispatch. */
  workItemId: string;
  /**
   * The processRunId — passed through to harness_decisions for FK integrity.
   * The dispatcher does NOT make trust decisions; the trust gate runs upstream.
   */
  processRunId: string;
  /**
   * Trust tier + action recorded by the upstream gate. Brief 215 §Constraints
   * "Trust integration" — the resolver does NOT make trust decisions; the
   * caller passes through the upstream decision so we audit faithfully.
   */
  trustTier: "supervised" | "spot_checked" | "autonomous" | "critical";
  trustAction: "pause" | "advance" | "sample_pause" | "sample_advance";
}

export type DispatchOutcome =
  | {
      ok: true;
      dispatchId: string;
      runnerKind: RunnerKind;
      attemptIndex: number;
    }
  | {
      ok: false;
      reason: "noEligibleRunner" | "configMissing" | "modeFilteredEmpty" | "allAttemptsFailed";
      message: string;
      attempted: RunnerKind[];
    };

export interface DispatchDeps {
  /** Optional injection for tests — defaults to `appDb`. */
  db?: AnyDb;
}

/**
 * Dispatch a work item to a runner. Walks the resolved chain; persists one
 * `runner_dispatches` row per attempt; writes one `harness_decisions` row
 * keyed on stepRunId. Returns the first successful dispatch (or the chain-
 * failure error when nothing works).
 */
export async function dispatchWorkItem(
  input: DispatchInput,
  deps: DispatchDeps = {}
): Promise<DispatchOutcome> {
  // Insight-180 guard — pre-DB-write rejection per Brief 215 AC #7.
  if (!input.stepRunId && !TEST_MODE) {
    throw new Error(
      "dispatchWorkItem requires stepRunId (Insight-180 guard). Set DITTO_TEST_MODE=true to bypass in tests."
    );
  }

  const db = (deps.db ?? appDb) as AnyDb;

  // Load the work item, project, project_runners.
  const workItemRows = await db
    .select()
    .from(workItems)
    .where(eq(workItems.id, input.workItemId))
    .limit(1);
  if (workItemRows.length === 0) {
    return {
      ok: false,
      reason: "configMissing",
      message: `Work item not found: ${input.workItemId}`,
      attempted: [],
    };
  }
  const workItemRow = workItemRows[0];

  // Brief 223 added `workItems.projectId` as a real FK column. Prefer the
  // real column; fall back to the legacy `context.projectId` shape only for
  // intake-flavored rows that pre-date Brief 223.
  const projectId =
    workItemRow.projectId ??
    (workItemRow.context as { projectId?: string } | null)?.projectId ??
    null;
  if (!projectId) {
    return {
      ok: false,
      reason: "configMissing",
      message: "Work item has no projectId — cannot resolve runner.",
      attempted: [],
    };
  }

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (projectRows.length === 0) {
    return {
      ok: false,
      reason: "configMissing",
      message: `Project not found: ${projectId}`,
      attempted: [],
    };
  }
  const projectRow = projectRows[0];

  const projectRunnerRows = await db
    .select()
    .from(projectRunners)
    .where(eq(projectRunners.projectId, projectId));

  // Build resolution refs.
  const projectRef: ProjectResolutionRef = {
    id: projectRow.id,
    defaultRunnerKind: (projectRow.defaultRunnerKind ?? null) as RunnerKind | null,
    fallbackRunnerKind: (projectRow.fallbackRunnerKind ?? null) as RunnerKind | null,
    runnerChain: (projectRow.runnerChain ?? null) as RunnerKind[] | null,
  };

  const workItemResRef: WorkItemResolutionRef = {
    id: workItemRow.id,
    runnerOverride: (workItemRow.runnerOverride ?? null) as RunnerKind | null,
    runnerModeRequired:
      (workItemRow.runnerModeRequired ?? null) as
        | "local"
        | "cloud"
        | "any"
        | null,
  };

  const projectRunnerResRefs: ProjectRunnerResolutionRef[] = projectRunnerRows.map((r) => ({
    projectId: r.projectId,
    kind: r.kind as RunnerKind,
    mode: r.mode as RunnerMode,
    enabled: r.enabled,
    lastHealthStatus: r.lastHealthStatus as RunnerHealthStatusValue,
  }));

  const resolved = resolveChain(workItemResRef, projectRef, projectRunnerResRefs);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.error.code,
      message: resolved.error.message,
      attempted: resolved.error.attempted,
    };
  }

  const chain = resolved.chain;
  const projectRunnersByKind = new Map(projectRunnerRows.map((r) => [r.kind as RunnerKind, r]));

  // Walk the chain. On rate_limited / timed_out / failed / dispatch error:
  // advance to the next kind. On success or terminal-other: stop.
  let attemptIndex = 0;
  for (const kind of chain) {
    const runnerRow = projectRunnersByKind.get(kind);
    if (!runnerRow) {
      attemptIndex++;
      continue;
    }

    const dispatchId = await persistQueuedDispatch(db, {
      workItemId: input.workItemId,
      projectId,
      runnerKind: kind,
      runnerMode: kindToMode(kind),
      attemptIndex,
      stepRunId: input.stepRunId,
    });

    let dispatchOutcome: DispatchResult | { errorReason: string } | null = null;
    try {
      const adapter = getAdapter(kind);
      const projectAdapterRef: ProjectRef = {
        id: projectRow.id,
        slug: projectRow.slug,
        githubRepo: projectRow.githubRepo,
        defaultRunnerKind: projectRow.defaultRunnerKind as RunnerKind | null,
        fallbackRunnerKind: projectRow.fallbackRunnerKind as RunnerKind | null,
        runnerChain: projectRow.runnerChain as RunnerKind[] | null,
      };
      const projectRunnerAdapterRef: ProjectRunnerRef = {
        id: runnerRow.id,
        projectId: runnerRow.projectId,
        kind: runnerRow.kind as RunnerKind,
        mode: runnerRow.mode as RunnerMode,
        configJson: runnerRow.configJson,
        credentialIds: runnerRow.credentialIds,
      };
      const workItemAdapterRef: WorkItemRef = {
        id: workItemRow.id,
        content: workItemRow.content,
        goalAncestry: (workItemRow.goalAncestry ?? []) as string[],
        context: (workItemRow.context ?? {}) as Record<string, unknown>,
      };
      dispatchOutcome = await adapter.execute(
        {
          stepRunId: input.stepRunId,
          processRunId: input.processRunId,
          dispatchId,
          trust: {
            trustTier: input.trustTier,
            trustAction: input.trustAction,
          },
        },
        workItemAdapterRef,
        projectAdapterRef,
        projectRunnerAdapterRef
      );
    } catch (e) {
      dispatchOutcome = {
        errorReason: e instanceof Error ? e.message : String(e),
      };
    }

    // Audit row — Insight-180 + Brief 215 AC #10.
    await persistHarnessDecision(db, {
      processRunId: input.processRunId,
      stepRunId: input.stepRunId,
      trustTier: input.trustTier,
      trustAction: input.trustAction,
      runnerKind: kind,
      runnerMode: kindToMode(kind),
      attemptIndex,
      externalRunId:
        dispatchOutcome && "externalRunId" in dispatchOutcome
          ? dispatchOutcome.externalRunId
          : null,
    });

    // Adapter threw before producing an externalRunId — transition `queued → failed`.
    if (dispatchOutcome && "errorReason" in dispatchOutcome && !("externalRunId" in dispatchOutcome)) {
      await transitionAndPersist(db, dispatchId, "queued", "fail", {
        errorReason: dispatchOutcome.errorReason ?? "unknown",
      });
      attemptIndex++;
      continue;
    }

    // Adapter returned a DispatchResult — walk the SM through queued → dispatched →
    // (running | terminal). Each transition goes through `transitionDispatch` so
    // the SM remains the single source of truth for legal status writes.
    if (dispatchOutcome && "externalRunId" in dispatchOutcome) {
      // queued → dispatched (we successfully called the runner's dispatch path).
      await transitionAndPersist(db, dispatchId, "queued", "dispatch", {
        externalRunId: dispatchOutcome.externalRunId,
        externalUrl: dispatchOutcome.externalUrl,
        startedAt: dispatchOutcome.startedAt,
      });

      const finalStatus = dispatchOutcome.finalStatus;
      if (!finalStatus) {
        // Async-pending — adapter handed off; webhook drives further transitions.
        // dispatched → running.
        await transitionAndPersist(db, dispatchId, "dispatched", "start", {});
        return { ok: true, dispatchId, runnerKind: kind, attemptIndex };
      }

      // Synchronously terminal. Some kinds (failed/rate_limited/timed_out) imply
      // the run never reached `running` — transition directly from `dispatched`.
      // Others (succeeded/cancelled) walk dispatched → running → terminal so
      // the audit trail records that work happened.
      const event = mapFinalStatusToEvent(finalStatus);
      if (finalStatus === "succeeded" || finalStatus === "cancelled") {
        await transitionAndPersist(db, dispatchId, "dispatched", "start", {});
        await transitionAndPersist(db, dispatchId, "running", event, {
          errorReason: dispatchOutcome.errorReason ?? null,
          finishedAt: new Date(),
        });
      } else {
        await transitionAndPersist(db, dispatchId, "dispatched", event, {
          errorReason: dispatchOutcome.errorReason ?? null,
          finishedAt: new Date(),
        });
      }

      // Chain-advancement on terminal failure modes.
      if (
        finalStatus === "rate_limited" ||
        finalStatus === "timed_out" ||
        finalStatus === "failed"
      ) {
        attemptIndex++;
        continue;
      }

      return { ok: true, dispatchId, runnerKind: kind, attemptIndex };
    }

    attemptIndex++;
  }

  return {
    ok: false,
    reason: "allAttemptsFailed",
    message:
      "All runners in the resolved chain failed or rate-limited. See runner_dispatches rows for per-attempt detail.",
    attempted: chain,
  };
}

// ============================================================
// Persistence helpers — narrow Drizzle inserts/updates
// ============================================================

async function persistQueuedDispatch(
  db: AnyDb,
  row: {
    workItemId: string;
    projectId: string;
    runnerKind: RunnerKind;
    runnerMode: RunnerMode;
    attemptIndex: number;
    stepRunId: string;
  }
): Promise<string> {
  const inserted = await db
    .insert(runnerDispatches)
    .values({
      workItemId: row.workItemId,
      projectId: row.projectId,
      runnerKind: row.runnerKind as RunnerKindValue,
      runnerMode: row.runnerMode,
      attemptIndex: row.attemptIndex,
      stepRunId: row.stepRunId,
      status: "queued",
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

/**
 * SM-driven status transition. Calls `transitionDispatch(from, event)`, throws
 * on illegal transitions (the dispatcher has the only writer to status — an
 * illegal transition is a bug, not a runtime input). Persists the resulting
 * status atomically with optional row-shape updates (externalRunId, etc.).
 */
async function transitionAndPersist(
  db: AnyDb,
  dispatchId: string,
  from: RunnerDispatchStatus,
  event: RunnerDispatchEvent,
  set: {
    externalRunId?: string | null;
    externalUrl?: string | null;
    startedAt?: Date;
    finishedAt?: Date | null;
    errorReason?: string | null;
  }
): Promise<RunnerDispatchStatus> {
  const result = transitionDispatch(from, event);
  if (!result.ok) {
    throw new Error(
      `Runner-dispatcher attempted illegal SM transition: ${from} + ${event} (${result.reason})`
    );
  }
  const updateValues: Record<string, unknown> = { status: result.to };
  if (set.externalRunId !== undefined) updateValues.externalRunId = set.externalRunId;
  if (set.externalUrl !== undefined) updateValues.externalUrl = set.externalUrl;
  if (set.startedAt !== undefined) updateValues.startedAt = set.startedAt;
  if (set.finishedAt !== undefined) updateValues.finishedAt = set.finishedAt;
  if (set.errorReason !== undefined) updateValues.errorReason = set.errorReason;
  await db
    .update(runnerDispatches)
    .set(updateValues)
    .where(eq(runnerDispatches.id, dispatchId));
  return result.to;
}

function mapFinalStatusToEvent(
  status: NonNullable<DispatchResult["finalStatus"]>
): RunnerDispatchEvent {
  switch (status) {
    case "succeeded":
      return "succeed";
    case "failed":
      return "fail";
    case "timed_out":
      return "timeout";
    case "rate_limited":
      return "rate_limit";
    case "cancelled":
      return "cancel";
  }
}

async function persistHarnessDecision(
  db: AnyDb,
  row: {
    processRunId: string;
    stepRunId: string;
    trustTier: DispatchInput["trustTier"];
    trustAction: DispatchInput["trustAction"];
    runnerKind: RunnerKind;
    runnerMode: RunnerMode;
    attemptIndex: number;
    externalRunId: string | null;
  }
): Promise<void> {
  // `reviewPattern: ["runner-dispatch"]` discriminates dispatcher-written
  // rows from review-gate rows so callers can filter without parsing
  // `reviewDetails`. M2 from Brief 215 review.
  await db.insert(harnessDecisions).values({
    processRunId: row.processRunId,
    stepRunId: row.stepRunId,
    trustTier: row.trustTier,
    trustAction: row.trustAction,
    reviewPattern: ["runner-dispatch"],
    reviewResult: "skip",
    reviewDetails: {
      runner: {
        runnerKind: row.runnerKind,
        runnerMode: row.runnerMode,
        externalRunId: row.externalRunId,
        attemptIndex: row.attemptIndex,
      },
    },
  });
}
