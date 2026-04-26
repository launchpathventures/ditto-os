/**
 * Runner poll cron — Brief 217 §What Changes (cross-runner).
 *
 * Periodic worker that walks non-terminal `runner_dispatches` rows for kinds
 * registered in `pollCadenceMs` (engine-core), calls each row's adapter
 * `status()` per its kind cadence, and persists state transitions via the
 * shared state machine.
 *
 * Cross-application of Insight-180: this cron is NOT a side-effecting function
 * — it OBSERVES external state and reflects it locally. The Anthropic-side
 * `archive` call invoked on terminal-state rows IS side-effecting but is
 * gated by the dispatch already having a `stepRunId` audit row written at
 * execute-time. No additional `stepRunId` parameter needed on the cron.
 *
 * Idempotency: each tick calls the state machine's `transition()`; illegal
 * transitions return an Error which is logged and swallowed. The state
 * machine guarantees terminal-state rows are not re-transitioned.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  pollableKinds,
  getPollCadenceMs,
  transitionDispatch,
  type RunnerKind,
  type RunnerDispatchEvent,
  type RunnerDispatchStatus,
  type RunnerAdapter,
} from "@ditto/core";

import { db as appDb } from "../db";
import * as schema from "../db/schema";
import { runnerDispatches } from "../db/schema";
import { getAdapter, hasAdapter } from "./runner-registry";

type AnyDb = BetterSQLite3Database<typeof schema>;

const POLLABLE_STATUSES: ReadonlyArray<RunnerDispatchStatus> = [
  "queued",
  "dispatched",
  "running",
];

export interface PollOptions {
  db?: AnyDb;
  /** Override for tests — adapter resolution. */
  adapterFor?: (kind: RunnerKind) => RunnerAdapter | null;
  /** Override for tests — clock for cadence checks. */
  now?: () => Date;
}

export interface PollOutcome {
  dispatchId: string;
  kind: RunnerKind;
  result: "skipped" | "polled" | "error" | "no-adapter";
  transitioned?: { from: RunnerDispatchStatus; to: RunnerDispatchStatus };
  errorMessage?: string;
}

export async function runRunnerPollTick(
  options: PollOptions = {},
): Promise<PollOutcome[]> {
  const dbImpl = options.db ?? appDb;
  const adapterFor =
    options.adapterFor ??
    ((kind: RunnerKind) => (hasAdapter(kind) ? getAdapter(kind) : null));
  const now = options.now ?? (() => new Date());

  const kinds = pollableKinds();
  if (kinds.length === 0) return [];

  const rows = await dbImpl
    .select({
      id: runnerDispatches.id,
      runnerKind: runnerDispatches.runnerKind,
      status: runnerDispatches.status,
      externalRunId: runnerDispatches.externalRunId,
      startedAt: runnerDispatches.startedAt,
      createdAt: runnerDispatches.createdAt,
      finishedAt: runnerDispatches.finishedAt,
    })
    .from(runnerDispatches)
    .where(
      and(
        inArray(runnerDispatches.runnerKind, [...kinds]),
        inArray(runnerDispatches.status, [...POLLABLE_STATUSES]),
      ),
    );

  const outcomes: PollOutcome[] = [];

  for (const row of rows) {
    const kind = row.runnerKind as RunnerKind;
    const cadence = getPollCadenceMs(kind);
    if (cadence === null) continue;

    const adapter = adapterFor(kind);
    if (!adapter) {
      outcomes.push({ dispatchId: row.id, kind, result: "no-adapter" });
      continue;
    }

    const lastTouch =
      row.finishedAt ?? row.startedAt ?? row.createdAt ?? new Date(0);
    if (now().getTime() - lastTouch.getTime() < cadence) {
      outcomes.push({ dispatchId: row.id, kind, result: "skipped" });
      continue;
    }

    if (!row.externalRunId) {
      outcomes.push({ dispatchId: row.id, kind, result: "skipped" });
      continue;
    }

    let snapshot;
    try {
      snapshot = await adapter.status(row.id, row.externalRunId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[runner-poll-cron] adapter.status threw for ${kind}/${row.id}:`,
        e,
      );
      outcomes.push({
        dispatchId: row.id,
        kind,
        result: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const event = inferEvent(row.status as RunnerDispatchStatus, snapshot.status);
    if (!event) {
      outcomes.push({ dispatchId: row.id, kind, result: "polled" });
      continue;
    }
    const tr = transitionDispatch(row.status as RunnerDispatchStatus, event);
    if (!tr.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[runner-poll-cron] illegal transition for ${kind}/${row.id} from ${row.status} via ${event}: ${tr.reason}`,
      );
      outcomes.push({ dispatchId: row.id, kind, result: "polled" });
      continue;
    }

    const updates: Record<string, unknown> = { status: tr.to };
    if (
      event === "succeed" ||
      event === "fail" ||
      event === "cancel" ||
      event === "timeout" ||
      event === "rate_limit"
    ) {
      updates.finishedAt = now();
    }
    if (event === "start" && !row.startedAt) {
      updates.startedAt = now();
    }
    if (snapshot.errorReason) {
      updates.errorReason = snapshot.errorReason;
    }
    if (snapshot.externalUrl) {
      updates.externalUrl = snapshot.externalUrl;
    }

    try {
      await dbImpl
        .update(runnerDispatches)
        .set(updates)
        .where(eq(runnerDispatches.id, row.id));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[runner-poll-cron] DB update failed for ${kind}/${row.id}:`,
        e,
      );
      outcomes.push({
        dispatchId: row.id,
        kind,
        result: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    outcomes.push({
      dispatchId: row.id,
      kind,
      result: "polled",
      transitioned: { from: row.status as RunnerDispatchStatus, to: tr.to },
    });
  }

  return outcomes;
}

function inferEvent(
  current: RunnerDispatchStatus,
  reported: RunnerDispatchStatus,
): RunnerDispatchEvent | null {
  if (current === reported) return null;
  switch (reported) {
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
    case "running":
      return current === "dispatched" ? "start" : null;
    case "dispatched":
      return current === "queued" ? "dispatch" : null;
    default:
      return null;
  }
}

// ============================================================
// setInterval-style runner (boot path)
// ============================================================

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startRunnerPollCron(
  options: PollOptions & { tickIntervalMs?: number } = {},
): void {
  if (pollTimer) return;
  const cadences = pollableKinds()
    .map((k) => getPollCadenceMs(k) ?? 0)
    .filter((n) => n > 0);
  const baseInterval =
    options.tickIntervalMs ?? (cadences.length > 0 ? Math.min(...cadences) : 30_000);
  pollTimer = setInterval(() => {
    runRunnerPollTick(options).catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[runner-poll-cron] tick threw:", e);
    });
  }, baseInterval);
}

export function stopRunnerPollCron(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
