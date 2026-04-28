/**
 * POST /api/test/seed-runner-pause — Brief 221 e2e helper.
 *
 * Test-only. Seeds a project + project_runner(s) + work_item + invokes
 * `pauseRunnerDispatchForApproval()` to mint a `/review/[token]` page in
 * the runner-dispatch-approval flavour. Returns the review URL so the
 * Playwright spec can open it.
 *
 * Guarded by MOCK_LLM=true OR NODE_ENV=test — 403 otherwise.
 *
 * Optional body (all fields optional):
 *   { runners?: Array<"local-mac-mini" | "claude-code-routine" | "claude-managed-agent" | "github-action">,
 *     trustTier?: "supervised" | "spot_checked" | "autonomous" | "critical",
 *     trustAction?: "pause" | "sample_pause" | "advance" | "sample_advance",
 *     forceCloud?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "test" && process.env.MOCK_LLM !== "true") {
    return NextResponse.json(
      { error: "Test seed endpoint only available in test mode" },
      { status: 403 },
    );
  }

  // Allow the seed to fall under DITTO_TEST_MODE so the dispatcher's
  // stepRunId guard accepts the seeded values.
  process.env.DITTO_TEST_MODE = "true";
  if (!process.env.REVIEW_PAGE_SECRET) {
    process.env.REVIEW_PAGE_SECRET = "test-secret";
  }

  const body = await request.json().catch(() => ({}));
  const runners = (body?.runners as string[] | undefined) ?? [
    "claude-code-routine",
    "claude-managed-agent",
  ];
  const trustTier = (body?.trustTier as string | undefined) ?? "supervised";
  const trustAction = (body?.trustAction as string | undefined) ?? "pause";

  try {
    const dbModule = await import("../../../../../../src/db");
    const { db, schema } = dbModule;
    dbModule.ensureSchema();
    const runnerPause = await import(
      "../../../../../../src/engine/harness-handlers/runner-pause"
    );

    // Pick stable IDs so re-runs are idempotent (the reset endpoint clears
    // tables before; here we upsert).
    const projectId = "proj_e2e_pause";
    const processId = "proc_e2e_pause";
    const processRunId = "run_e2e_pause";
    const stepRunId = "step_e2e_pause";
    const workItemId = "wi_e2e_pause";

    // Project (ON CONFLICT DO NOTHING via try-catch — Drizzle/SQLite has no
    // upsert primitive without unique constraints; for the e2e we accept
    // duplicate-key on a re-run if the reset endpoint wasn't called).
    await db
      .insert(schema.projects)
      .values({
        id: projectId,
        slug: "e2e-pause-project",
        name: "E2E Pause Project",
        githubRepo: "test/e2e-pause",
        harnessType: "catalyst",
        defaultRunnerKind: runners[0] as "claude-code-routine",
        fallbackRunnerKind: runners[1] as "claude-managed-agent" | undefined,
        status: "active",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.processes)
      .values({
        id: processId,
        name: "E2E Process",
        slug: "e2e-process",
        definition: { steps: [] },
      })
      .onConflictDoNothing();

    await db
      .insert(schema.processRuns)
      .values({
        id: processRunId,
        processId,
        triggeredBy: "e2e-fixture",
      })
      .onConflictDoNothing();

    await db
      .insert(schema.stepRuns)
      .values({
        id: stepRunId,
        processRunId,
        stepId: "s1",
        executorType: "ai-agent",
      })
      .onConflictDoNothing();

    for (const kind of runners) {
      await db
        .insert(schema.projectRunners)
        .values({
          projectId,
          kind: kind as "claude-code-routine",
          mode: kind === "local-mac-mini" ? "local" : "cloud",
          enabled: true,
          configJson:
            kind === "local-mac-mini"
              ? { deviceId: "dev_1" }
              : { endpoint_url: "https://example", bearer: "x" },
          credentialIds: [],
          lastHealthStatus: "healthy",
        })
        .onConflictDoNothing();
    }

    await db
      .insert(schema.workItems)
      .values({
        id: workItemId,
        type: "feature",
        status: "intake",
        content: "Add /healthz endpoint to agent-crm app router.",
        source: "system_generated",
        projectId,
        runnerModeRequired: null,
        context: { title: "Add /healthz endpoint" },
      })
      .onConflictDoNothing();

    const out = await runnerPause.pauseRunnerDispatchForApproval({
      stepRunId,
      workItemId,
      processRunId,
      trustTier: trustTier as
        | "supervised"
        | "spot_checked"
        | "autonomous"
        | "critical",
      trustAction: trustAction as
        | "pause"
        | "sample_pause"
        | "advance"
        | "sample_advance",
    });

    if (!out.ok) {
      return NextResponse.json({ error: out.reason }, { status: 500 });
    }
    if (out.kind !== "paused") {
      return NextResponse.json(
        { error: `Expected paused, got ${out.kind}` },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        reviewUrl: out.reviewUrl,
        reviewToken: out.reviewToken,
        eligibleKinds: out.eligibleKinds,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[/api/test/seed-runner-pause] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
