/**
 * Ditto — Self Tool: Rerun Project Retrofit (Brief 228)
 *
 * Triggers a fresh `project-retrofit.yaml` invocation for the named project.
 * Idempotent per Insight-212 — re-runs that produce only `unchanged` files
 * complete with `commitSha=null` + an info AlertBlock side-car.
 *
 * Insight-180 guard: requires `stepRunId` — proves the call originates from
 * within harness pipeline step execution. Bypassed in `DITTO_TEST_MODE` so
 * unit tests can exercise the handler directly.
 *
 * Insight-215 internal-side-effecting regime: this tool itself only writes
 * a `process_runs` row (via `startProcessRun`); the actual writes to the
 * user's repo happen at the `dispatch-write` step inside the retrofit
 * pipeline (which carries its own real `stepRunId`).
 *
 * Provenance: Brief 228 §What Changes; Insight-180 step-run guard pattern;
 *   Brief 227 `promote-memory-scope.ts` shape.
 */

import { eq, desc, and, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import type { TrustTier } from "@ditto/core";
import type { DelegationResult } from "../self-delegation";

export const RERUN_PROJECT_RETROFIT_TOOL_NAME = "rerun_project_retrofit";

export interface RerunProjectRetrofitInput {
  /** ID or slug of the project to retrofit. */
  projectId: string;
  /**
   * Optional trust tier override. Defaults to the project's last-known tier
   * (read from the most recent prior `processRuns.trustTierOverride` for this
   * project's `project-retrofit` runs). If no prior exists, defaults to
   * `supervised` (the safest tier).
   */
  trustTier?: TrustTier;
  /**
   * Insight-180 invocation guard. Required outside of `DITTO_TEST_MODE`.
   */
  stepRunId?: string;
  /**
   * Optional actor identity (user email or session id) for activity audit.
   */
  actorId?: string;
}

export async function handleRerunProjectRetrofit(
  input: RerunProjectRetrofitInput,
): Promise<DelegationResult> {
  // Insight-180 guard — reject calls outside of harness pipeline step execution.
  if (!input.stepRunId && process.env.DITTO_TEST_MODE !== "true") {
    return {
      toolName: RERUN_PROJECT_RETROFIT_TOOL_NAME,
      success: false,
      output:
        "rerun_project_retrofit requires stepRunId — must be called from within step execution (Insight-180).",
    };
  }

  if (!input.projectId) {
    return {
      toolName: RERUN_PROJECT_RETROFIT_TOOL_NAME,
      success: false,
      output: "projectId is required.",
    };
  }

  // Resolve project by id OR slug.
  const projectRows = await db
    .select()
    .from(schema.projects)
    .limit(1)
    .where(eq(schema.projects.id, input.projectId));
  let project = projectRows[0];
  if (!project) {
    const slugRows = await db
      .select()
      .from(schema.projects)
      .limit(1)
      .where(eq(schema.projects.slug, input.projectId));
    project = slugRows[0];
  }
  if (!project) {
    return {
      toolName: RERUN_PROJECT_RETROFIT_TOOL_NAME,
      success: false,
      output: `Project not found: ${input.projectId}`,
    };
  }
  if (project.status !== "active") {
    return {
      toolName: RERUN_PROJECT_RETROFIT_TOOL_NAME,
      success: false,
      output: `Project ${project.slug} is not active (status=${project.status}). Retrofit requires an active project.`,
    };
  }

  // Resolve trust tier: explicit override > last-known > 'supervised'.
  // Reviewer CRIT-2 fix: filter via `processRuns.inputs.projectId` (system
  // processes carry projectId in inputs, NOT in `processes.projectId` —
  // which is null per the process loader).
  let trustTier: TrustTier = input.trustTier ?? "supervised";
  if (!input.trustTier) {
    const lastRunRows = await db
      .select({ trustTierOverride: schema.processRuns.trustTierOverride })
      .from(schema.processRuns)
      .innerJoin(
        schema.processes,
        eq(schema.processRuns.processId, schema.processes.id),
      )
      .where(
        and(
          eq(schema.processes.slug, "project-retrofit"),
          sql`json_extract(${schema.processRuns.inputs}, '$.projectId') = ${project.id}`,
        ),
      )
      .orderBy(desc(schema.processRuns.startedAt))
      .limit(1);
    const lastTier = lastRunRows[0]?.trustTierOverride as TrustTier | null;
    if (lastTier) trustTier = lastTier;
  }

  // Trigger the retrofit process.
  const { startProcessRun } = await import("../heartbeat");
  const runId = await startProcessRun(
    "project-retrofit",
    { projectId: project.id },
    "manual",
    { parentTrustTier: trustTier },
  );

  return {
    toolName: RERUN_PROJECT_RETROFIT_TOOL_NAME,
    success: true,
    output: `Retrofit queued for ${project.slug} (runId=${runId}, trustTier=${trustTier}).`,
    metadata: {
      projectId: project.id,
      projectSlug: project.slug,
      runId,
      trustTier,
      actorId: input.actorId,
    },
  };
}
