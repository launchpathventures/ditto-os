/**
 * Intro Follow-Up Scheduler (Brief 289)
 *
 * Runs from an existing scheduled process step. It does not introduce a new
 * scheduler primitive; callers pass the stepRunId minted by the scheduled run.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull, lte } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import { sendFollowUpEmail } from "./intro-followup-email";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export const RUN_INTRO_FOLLOW_UP_SCHEDULER_TOOL_NAME =
  "run_intro_follow_up_scheduler";

export interface RunIntroFollowUpSchedulerInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  now?: Date;
  send?: typeof sendFollowUpEmail;
  limit?: number;
}

export interface RunIntroFollowUpSchedulerResult {
  scanned: number;
  sent: number;
  blocked: number;
}

function dueAt(threadSentAt: Date, cadenceDays: number): Date {
  return new Date(
    threadSentAt.getTime() + cadenceDays * 24 * 60 * 60 * 1000,
  );
}

export async function runIntroFollowUpScheduler(
  input: RunIntroFollowUpSchedulerInput = {},
): Promise<RunIntroFollowUpSchedulerResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    RUN_INTRO_FOLLOW_UP_SCHEDULER_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const rows = await db
    .select()
    .from(networkSchema.introductions)
    .where(
      and(
        eq(networkSchema.introductions.state, "thread-sent"),
        isNull(networkSchema.introductions.feedbackRequestedAt),
        lte(networkSchema.introductions.threadSentAt, now),
      ),
    )
    .limit(input.limit ?? 50);

  const send = input.send ?? sendFollowUpEmail;
  let sent = 0;
  let blocked = 0;
  for (const intro of rows) {
    if (!intro.threadSentAt) continue;
    if (dueAt(intro.threadSentAt, intro.followUpCadenceDays).getTime() > now.getTime()) {
      continue;
    }
    for (const party of ["requester", "recipient"] as const) {
      const result = await send({
        db,
        stepRunId,
        introId: intro.id,
        party,
        now,
      });
      if (result.ok) sent += 1;
      else blocked += 1;
    }
    await db
      .update(networkSchema.introductions)
      .set({ feedbackRequestedAt: now, updatedAt: now })
      .where(eq(networkSchema.introductions.id, intro.id));
  }

  return { scanned: rows.length, sent, blocked };
}
