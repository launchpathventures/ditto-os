/**
 * Brief 228 — Project Retrofitter handlers (autonomous + critical + spot_checked tiers).
 *
 * Wired into the system-agent registry by `src/engine/system-agents/index.ts`.
 * The `processes/project-retrofit.yaml` process invokes these via
 * `executor: script` + `config.systemAgent: project-retrofit-<step>`.
 *
 * Step decomposition (4 total — Brief 228 §AC #4 + #5):
 *
 *   1. generate-plan     — reads the project's analyser report from workItems,
 *                          composes a RetrofitPlan with 6 .ditto/ files,
 *                          computes content hashes, queries prior retrofit
 *                          for hashes, marks each file action as
 *                          'create' | 'update' | 'unchanged'. Writes plan to
 *                          step_runs.outputs (Insight-217 reader pattern).
 *   2. surface-plan      — writes a NEW workItems row with RetrofitPlanBlock
 *                          (type='feature', source='system_generated', the
 *                          block in `context`). Initial status='dispatched'
 *                          (will be reconciled by dispatch-write per the
 *                          trust-gate decision; AC #7 timing deviation
 *                          flagged in handoff).
 *   3. dispatch-write    — reads the trust-gate decision via
 *                          harness_decisions joined to stepRuns by stepRunId,
 *                          applies user-edit safety filtering, composes the
 *                          runner prompt + payload, invokes dispatchWorkItem
 *                          with the workItem id. Branches per trust action
 *                          per Brief 228 §Constraints.
 *   4. verify-commit     — reads dispatch result; updates RetrofitPlanBlock
 *                          + harness_decisions audit row with commitSha +
 *                          actuallyChangedFiles + commitUrl.
 *
 * Insight-180: every handler takes `_stepRunId` from inputs + rejects when
 * missing. Test mode (DITTO_TEST_MODE=true) bypasses the guard.
 *
 * Insight-215: `dispatch-write` is external-side-effecting (writes to user
 * repo via runner); `surface-plan` + `verify-commit` are internal-side-
 * effecting (DB writes only). Both regimes apply.
 *
 * Insight-217: each handler uses readPriorStepOutputs to read prior step
 * outputs from step_runs.outputs — the harness pipeline does NOT auto-merge.
 *
 * Provenance: Brief 228 §What Changes; Brief 226 handlers.ts shape;
 *   Insight-180 + Insight-212 + Insight-215 + Insight-217.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { readPriorStepOutputs as coreReadPriorStepOutputs } from "@ditto/core";
import { db, schema } from "../../db";
import type { StepExecutionResult } from "../step-executor";
import type {
  AnalyserReportBlock,
  RetrofitDispatchPayload,
  RetrofitFile,
  RetrofitPlan,
  RetrofitPlanBlock,
  TrustTier,
} from "@ditto/core";
import { composeRetrofitPrompt } from "./retrofit-prompt";

const GUARD_MESSAGE =
  "[retrofit] handler invoked without stepRunId — Insight-180 guard rejects (set DITTO_TEST_MODE=true to bypass in tests)";

/** Schema version of the `.ditto/` directory shape (ADR-043). Future versions
 *  ship a migrator; this brief writes v1 unconditionally. */
export const DITTO_SCHEMA_VERSION = 1;

/** Step ids — kept in one place so the YAML and aggregator code can't drift. */
export const RETROFIT_STEP_IDS = {
  generatePlan: "generate-plan",
  surfacePlan: "surface-plan",
  dispatchWrite: "dispatch-write",
  verifyCommit: "verify-commit",
} as const;

// ============================================================
// Shared helpers
// ============================================================

interface RetrofitContext {
  projectId: string;
  processRunId: string;
}

function isTestMode(): boolean {
  return process.env.DITTO_TEST_MODE === "true";
}

function rejectNoStepRunId(label: string): StepExecutionResult {
  return {
    outputs: { _placeholder: `${label}-rejected-no-stepRunId` },
    logs: [GUARD_MESSAGE],
  };
}

function readContext(inputs: Record<string, unknown>): {
  stepRunId: string | undefined;
  ctx: RetrofitContext;
} {
  const projectId = inputs.projectId as string | undefined;
  const processRunId = (inputs._processRunId ?? inputs.processRunId) as
    | string
    | undefined;
  const stepRunId = (inputs._stepRunId ?? inputs.stepRunId) as
    | string
    | undefined;
  if (!projectId) {
    throw new Error("[retrofit] handler requires `projectId` in run inputs");
  }
  if (!processRunId) {
    throw new Error(
      "[retrofit] handler requires `_processRunId` in run inputs (the harness pipeline injects this)",
    );
  }
  return {
    stepRunId,
    ctx: { projectId, processRunId },
  };
}

async function readPriorStepOutputs(
  processRunId: string,
): Promise<Record<string, Record<string, unknown>>> {
  return coreReadPriorStepOutputs(
    processRunId,
    db as unknown as Parameters<typeof coreReadPriorStepOutputs>[1],
  );
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ============================================================
// .ditto/ template content (Brief 228 §Constraints + ADR-043)
// ============================================================

interface ProjectMeta {
  id: string;
  slug: string;
  defaultBranch: string | null;
  defaultRunnerKind: string | null;
  trustTier: TrustTier;
}

/** Header convention per ADR-043: every Ditto-regenerated file starts with
 *  a `# DO NOT EDIT — regenerated by Ditto retrofit (run <processRunId>)`
 *  comment as a secondary safety signal beyond hash-compare (Q3 resolution). */
function makeHeader(processRunId: string, format: "hash" | "slash" | "json"): string {
  const text = `DO NOT EDIT — regenerated by Ditto retrofit (run ${processRunId}). See ADR-043.`;
  switch (format) {
    case "hash":
      return `# ${text}\n`;
    case "slash":
      return `// ${text}\n`;
    case "json":
      // JSON has no comments — store the marker as a top-level $generatedBy field.
      return "";
  }
}

const ROLE_NAMES = [
  "dev-pm",
  "dev-architect",
  "dev-builder",
  "dev-reviewer",
  "dev-documenter",
  "dev-researcher",
  "dev-designer",
] as const;

function roleContractContent(role: string, project: ProjectMeta, processRunId: string): string {
  return [
    makeHeader(processRunId, "hash") + `# Role: ${role} (project: ${project.slug})`,
    "",
    `This is the project-context role-contract for \`${role}\` running on \`${project.slug}\`.`,
    "",
    `## Project metadata`,
    `- **Default branch:** \`${project.defaultBranch ?? "main"}\``,
    `- **Runner kind:** \`${project.defaultRunnerKind ?? "unset"}\``,
    `- **Trust tier:** \`${project.trustTier}\``,
    "",
    `## How to run`,
    "",
    `Mirror the upstream role contract at \`.claude/commands/${role}.md\` for the`,
    `full role definition. Project-specific build/test commands + branch naming`,
    `live in \`.ditto/guidance.md\`.`,
    "",
    `## Project-specific guidance`,
    "",
    `Refer to \`.ditto/guidance.md\` (sibling file) for build/test commands and`,
    `local conventions captured at retrofit time.`,
    "",
  ].join("\n");
}

function skillsJsonContent(processRunId: string): string {
  const body = {
    $generatedBy: `Ditto retrofit (run ${processRunId}). See ADR-043.`,
    version: DITTO_SCHEMA_VERSION,
    skills: [] as Array<{ name: string; scope: string; sourceCommit?: string }>,
  };
  return JSON.stringify(body, null, 2) + "\n";
}

function toolsJsonContent(processRunId: string): string {
  const body = {
    $generatedBy: `Ditto retrofit (run ${processRunId}). See ADR-043.`,
    version: DITTO_SCHEMA_VERSION,
    allowed: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    denied: [] as string[],
  };
  return JSON.stringify(body, null, 2) + "\n";
}

function guidanceMdContent(
  project: ProjectMeta,
  processRunId: string,
  report: AnalyserReportBlock | null,
): string {
  const buildCommands = report
    ? extractBuildCommands(report)
    : ["(build commands captured at retrofit time)"];
  const testCommands = report
    ? extractTestCommands(report)
    : ["(test commands captured at retrofit time)"];
  return [
    makeHeader(processRunId, "hash") + `# Project guidance: ${project.slug}`,
    "",
    `Project-specific guidance for agents working on \`${project.slug}\`.`,
    "",
    `## Build commands`,
    "",
    ...buildCommands.map((c) => `- \`${c}\``),
    "",
    `## Test commands`,
    "",
    ...testCommands.map((c) => `- \`${c}\``),
    "",
    `## Branch naming`,
    "",
    `Default branch: \`${project.defaultBranch ?? "main"}\`. Feature branches`,
    `follow the project's existing convention (see \`.git\` log for examples).`,
    "",
    `## Things that have surprised past contributors`,
    "",
    `(captured here as the project evolves — empty at first retrofit)`,
    "",
  ].join("\n");
}

function onboardingReportMdContent(
  processRunId: string,
  report: AnalyserReportBlock | null,
): string {
  if (!report) {
    return [
      makeHeader(processRunId, "hash") + `# Onboarding report`,
      "",
      `(no analyser report available at retrofit time)`,
      "",
    ].join("\n");
  }
  const ag = report.atAGlance;
  const findingsSection = (label: string, items: AnalyserReportBlock["strengths"]) => {
    if (items.length === 0) return [];
    return [
      `## ${label}`,
      "",
      ...items.map((f) => `- ${f.text}${f.evidence ? ` (${f.evidence})` : ""}`),
      "",
    ];
  };
  return [
    makeHeader(processRunId, "hash") + `# Onboarding report`,
    "",
    `Generated by Ditto's analyser at project connection.`,
    "",
    `## At a glance`,
    "",
    `**Stack:** ${ag.stack.join(", ") || "(none detected)"}`,
    "",
    `**Looks like:** ${ag.looksLike}`,
    "",
    ag.metadata.length ? `**Metadata:** ${ag.metadata.join(" · ")}` : "",
    "",
    ag.nearestNeighbours.length
      ? `**Closest matches:** ${ag.nearestNeighbours.map((n) => n.name).join(", ")}`
      : "",
    "",
    ...findingsSection("Strengths", report.strengths),
    ...findingsSection("Watch-outs", report.watchOuts),
    ...findingsSection("Missing", report.missing),
    `## Recommendation`,
    "",
    `**Runner:** \`${report.recommendation.runner.kind}\` — ${report.recommendation.runner.rationale}`,
    "",
    `**Trust tier:** \`${report.recommendation.trustTier.tier}\` — ${report.recommendation.trustTier.rationale}`,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function versionTxtContent(processRunId: string): string {
  // version.txt is a single-line file; the # DO NOT EDIT marker would break
  // simple integer parsing. Keep it minimal — the audit trail lives in the
  // commit message + harness_decisions.
  void processRunId;
  return `${DITTO_SCHEMA_VERSION}\n`;
}

function gitignoreContent(processRunId: string): string {
  return [
    makeHeader(processRunId, "hash") + `# .ditto/.gitignore`,
    "",
    `# Per-developer overrides (not yet supported — see ADR-043)`,
    `# .ditto/local/`,
    "",
    `# Cache files (not yet supported — see ADR-043)`,
    `# .ditto/cache/`,
    "",
  ].join("\n");
}

/** Best-effort extraction of build commands from analyser report. */
function extractBuildCommands(report: AnalyserReportBlock): string[] {
  const stack = report.atAGlance.stack;
  if (stack.includes("pnpm")) return ["pnpm install", "pnpm build"];
  if (stack.includes("npm") || stack.includes("Node.js"))
    return ["npm install", "npm run build"];
  if (stack.includes("yarn")) return ["yarn install", "yarn build"];
  if (stack.includes("Cargo") || stack.includes("Rust"))
    return ["cargo build"];
  if (stack.includes("Go")) return ["go build ./..."];
  if (stack.includes("Python")) return ["pip install -e ."];
  return ["(captured at retrofit time)"];
}

function extractTestCommands(report: AnalyserReportBlock): string[] {
  const stack = report.atAGlance.stack;
  if (stack.includes("pnpm")) return ["pnpm test"];
  if (stack.includes("Cargo") || stack.includes("Rust"))
    return ["cargo test"];
  if (stack.includes("Go")) return ["go test ./..."];
  if (stack.includes("pytest") || stack.includes("Python"))
    return ["pytest"];
  return ["(captured at retrofit time)"];
}

// ============================================================
// Plan generator
// ============================================================

interface PriorRunHashes {
  /** Map of repo-relative path → contentHash from the most recent prior retrofit. */
  byPath: Record<string, string>;
}

/** Read prior-retrofit hashes from the most recent succeeded
 *  `harness_decisions` row for this project's `verify-commit` step.
 *  Reviewer CRIT-2 fix: system processes (`project-retrofit`) carry
 *  `projectId` in `processRuns.inputs` (the runtime input the YAML declares
 *  at line 84-89); `processes.projectId` is null for system processes per
 *  the process loader. The filter joins through `processRuns.inputs.projectId`
 *  via SQLite `json_extract`. */
async function readPriorRunHashes(projectId: string): Promise<PriorRunHashes> {
  const rows = await db
    .select({
      reviewDetails: schema.harnessDecisions.reviewDetails,
    })
    .from(schema.harnessDecisions)
    .innerJoin(
      schema.stepRuns,
      eq(schema.harnessDecisions.stepRunId, schema.stepRuns.id),
    )
    .innerJoin(
      schema.processRuns,
      eq(schema.harnessDecisions.processRunId, schema.processRuns.id),
    )
    .innerJoin(
      schema.processes,
      eq(schema.processRuns.processId, schema.processes.id),
    )
    .where(
      and(
        eq(schema.stepRuns.stepId, RETROFIT_STEP_IDS.verifyCommit),
        eq(schema.processes.slug, "project-retrofit"),
        sql`json_extract(${schema.processRuns.inputs}, '$.projectId') = ${projectId}`,
      ),
    )
    .orderBy(desc(schema.harnessDecisions.createdAt))
    .limit(1);
  const reviewDetails = rows[0]?.reviewDetails as
    | { retrofit?: { fileHashes?: Record<string, string> } }
    | undefined;
  return { byPath: reviewDetails?.retrofit?.fileHashes ?? {} };
}

/** Compose a RetrofitPlan from analyser report + project metadata + prior-run hashes.
 *  Pure function (no DB / FS) for unit testability. */
export function composeRetrofitPlan(
  report: AnalyserReportBlock | null,
  project: ProjectMeta,
  processRunId: string,
  priorRunHashes: PriorRunHashes = { byPath: {} },
): RetrofitPlan {
  const planId = randomUUID();
  // projects.defaultBranch is notNull with default 'main' in schema.ts; the
  // ProjectMeta type allows null only for the test-fixture path that doesn't
  // seed defaultBranch. Fallback to 'main' there.
  const branch = project.defaultBranch ?? "main";

  // Build the 6 file types per Brief 224 §Architectural Decisions Captured.
  const draftFiles: Array<{ path: string; content: string }> = [];

  // 1. Role contracts (one per role)
  for (const role of ROLE_NAMES) {
    draftFiles.push({
      path: `.ditto/role-contracts/${role}.md`,
      content: roleContractContent(role, project, processRunId),
    });
  }

  // 2. skills.json
  draftFiles.push({
    path: ".ditto/skills.json",
    content: skillsJsonContent(processRunId),
  });

  // 3. tools.json
  draftFiles.push({
    path: ".ditto/tools.json",
    content: toolsJsonContent(processRunId),
  });

  // 4. guidance.md
  draftFiles.push({
    path: ".ditto/guidance.md",
    content: guidanceMdContent(project, processRunId, report),
  });

  // 5. onboarding-report.md
  draftFiles.push({
    path: ".ditto/onboarding-report.md",
    content: onboardingReportMdContent(processRunId, report),
  });

  // 6. version.txt
  draftFiles.push({
    path: ".ditto/version.txt",
    content: versionTxtContent(processRunId),
  });

  // 7. .gitignore
  draftFiles.push({
    path: ".ditto/.gitignore",
    content: gitignoreContent(processRunId),
  });

  // For each file: compute hash, determine action.
  const files: RetrofitFile[] = draftFiles.map((draft) => {
    const contentHash = sha256(draft.content);
    const priorHash = priorRunHashes.byPath[draft.path];
    let action: RetrofitFile["action"];
    if (!priorHash) {
      action = "create";
    } else if (priorHash === contentHash) {
      action = "unchanged";
    } else {
      action = "update";
    }
    return {
      id: randomUUID(),
      path: draft.path,
      content: draft.content,
      contentHash,
      contentPreview: draft.content.slice(0, 200),
      byteSize: Buffer.byteLength(draft.content),
      action,
    };
  });

  return {
    planId,
    projectId: project.id,
    processRunId,
    files,
    generatedAt: new Date().toISOString(),
    ditoSchemaVersion: DITTO_SCHEMA_VERSION,
    branch,
  };
}

// ============================================================
// Project metadata reader
// ============================================================

async function readProjectMeta(
  projectId: string,
  processRunId: string,
): Promise<ProjectMeta> {
  const projectRows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (projectRows.length === 0) {
    throw new Error(`[retrofit] project not found: ${projectId}`);
  }
  const project = projectRows[0];

  // Read trust tier from processRuns.trustTierOverride (set by parentTrustTier
  // on startProcessRun; Brief 228 §Constraints "Trust tier flow"). Default to
  // 'supervised' if no override (the safest tier).
  const runRows = await db
    .select({ trustTierOverride: schema.processRuns.trustTierOverride })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, processRunId))
    .limit(1);
  const trustTier: TrustTier =
    (runRows[0]?.trustTierOverride as TrustTier | null) ?? "supervised";

  return {
    id: project.id,
    slug: project.slug,
    defaultBranch: project.defaultBranch,
    defaultRunnerKind: project.defaultRunnerKind,
    trustTier,
  };
}

/** Load the analyser report from the most recent onboarding workItems row
 *  for this project. Returns null if no analyser report exists yet.
 *  Reviewer IMP-4: filter via JSON-path predicate on `context.analyserReport`
 *  so re-runs don't walk every retrofit row first. The retrofit's
 *  surface-plan rows carry `context.retrofitPlan` instead, so this filter
 *  correctly excludes them at SQL time. */
async function readAnalyserReport(
  projectId: string,
): Promise<AnalyserReportBlock | null> {
  const rows = await db
    .select({ context: schema.workItems.context })
    .from(schema.workItems)
    .where(
      and(
        eq(schema.workItems.projectId, projectId),
        eq(schema.workItems.type, "feature"),
        eq(schema.workItems.source, "system_generated"),
        sql`json_extract(${schema.workItems.context}, '$.analyserReport.type') = 'analyser_report'`,
      ),
    )
    .orderBy(desc(schema.workItems.createdAt))
    .limit(1);
  const ctx = rows[0]?.context as { analyserReport?: AnalyserReportBlock } | null;
  return ctx?.analyserReport ?? null;
}

// ============================================================
// Trust-gate decision reader
// ============================================================

interface TrustDecisionRow {
  trustTier: TrustTier;
  trustAction: "pause" | "advance" | "sample_pause" | "sample_advance";
  /** True when the gate emitted pause WITH canAutoAdvance=false (critical tier). */
  canAutoAdvance: boolean;
  samplingHash: string | null;
}

/** Read the trust-gate decision for a prior step in this run.
 *  AC #7/#8 originally specified `step_runs.reviewDetails.trustAction`, but
 *  step_runs has no reviewDetails column (it's on harness_decisions). The
 *  actual source is harness_decisions joined to stepRuns by stepRunId.
 *  Builder deviation flagged in handoff. */
async function readTrustDecision(
  processRunId: string,
  stepId: string,
): Promise<TrustDecisionRow | null> {
  const rows = await db
    .select({
      trustTier: schema.harnessDecisions.trustTier,
      trustAction: schema.harnessDecisions.trustAction,
      reviewDetails: schema.harnessDecisions.reviewDetails,
      samplingHash: schema.harnessDecisions.samplingHash,
    })
    .from(schema.harnessDecisions)
    .innerJoin(
      schema.stepRuns,
      eq(schema.harnessDecisions.stepRunId, schema.stepRuns.id),
    )
    .where(
      and(
        eq(schema.harnessDecisions.processRunId, processRunId),
        eq(schema.stepRuns.stepId, stepId),
      ),
    )
    .orderBy(desc(schema.harnessDecisions.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  // canAutoAdvance is mirrored from the gate's context but not persisted on
  // the row directly; derive from trustTier (critical → false; otherwise
  // true). The trust-gate sets canAutoAdvance=false ONLY for critical tier.
  return {
    trustTier: row.trustTier as TrustTier,
    trustAction: row.trustAction,
    canAutoAdvance: row.trustTier !== "critical",
    samplingHash: row.samplingHash,
  };
}

// ============================================================
// Step 1: generate-plan
// ============================================================

export async function runGeneratePlan(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const { stepRunId, ctx } = readContext(inputs);
  if (!stepRunId && !isTestMode()) {
    return rejectNoStepRunId(RETROFIT_STEP_IDS.generatePlan);
  }
  const project = await readProjectMeta(ctx.projectId, ctx.processRunId);
  const report = await readAnalyserReport(ctx.projectId);
  const priorRunHashes = await readPriorRunHashes(ctx.projectId);
  const plan = composeRetrofitPlan(
    report,
    project,
    ctx.processRunId,
    priorRunHashes,
  );
  return {
    outputs: {
      plan,
      hasAnalyserReport: report !== null,
      priorRunHashCount: Object.keys(priorRunHashes.byPath).length,
    },
    logs: [
      `[retrofit] generate-plan: project=${project.slug} files=${plan.files.length} ` +
        `actions={create:${plan.files.filter((f) => f.action === "create").length}, ` +
        `update:${plan.files.filter((f) => f.action === "update").length}, ` +
        `unchanged:${plan.files.filter((f) => f.action === "unchanged").length}}`,
    ],
  };
}

export async function executeRetrofitGeneratePlan(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  return runGeneratePlan(inputs);
}

// ============================================================
// Step 2: surface-plan
// ============================================================

export async function runSurfacePlan(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const { stepRunId, ctx } = readContext(inputs);
  if (!stepRunId && !isTestMode()) {
    return rejectNoStepRunId(RETROFIT_STEP_IDS.surfacePlan);
  }
  const prior = await readPriorStepOutputs(ctx.processRunId);
  const planOut = prior[RETROFIT_STEP_IDS.generatePlan]?.plan as
    | RetrofitPlan
    | undefined;
  if (!planOut) {
    throw new Error(
      `[retrofit] surface-plan: ${RETROFIT_STEP_IDS.generatePlan} output missing — pipeline drift`,
    );
  }
  const project = await readProjectMeta(ctx.projectId, ctx.processRunId);

  // Initial status: 'dispatched' as the optimistic starting point. The
  // dispatch-write step will reconcile based on the trust-gate decision
  // (flipping to 'pending-review' / 'pending-sample-review' / 'rejected'
  // as needed). This deviates from AC #7's literal text (which would have
  // surface-plan derive the status from the trust-gate decision) because
  // surface-plan can't read its OWN trust-gate decision until feedback-recorder
  // persists it AFTER step execution. The end state matches AC #7's intent;
  // the initial-status framing is a Builder deviation flagged in handoff.
  const block: RetrofitPlanBlock = {
    type: "retrofit_plan",
    planId: planOut.planId,
    projectId: project.id,
    processRunId: ctx.processRunId,
    files: planOut.files.map((f) => ({
      id: f.id,
      path: f.path,
      contentPreview: f.contentPreview,
      byteSize: f.byteSize,
      action: f.action,
    })),
    // RetrofitPlanBlock.runnerKind is typed `string` (per AnalyserReportBlock
    // convention — the RunnerKind enum lives in @ditto/core but the block
    // schema is enum-agnostic). When projects.defaultRunnerKind is null the
    // retrofit shouldn't have triggered — the confirm route's atomic three-
    // write commit (Brief 225) guarantees defaultRunnerKind is set before
    // status flips to 'active'. Falling back to a flag string ('unconfigured')
    // makes the unreachable case visible in the UI rather than failing
    // silently.
    runnerKind: project.defaultRunnerKind ?? "unconfigured",
    trustTier: project.trustTier,
    status: "dispatched",
  };

  const workItemId = randomUUID();
  const title = `Retrofit plan for ${project.slug}`;
  await db.insert(schema.workItems).values({
    id: workItemId,
    type: "feature",
    content: title,
    source: "system_generated",
    projectId: project.id,
    title,
    body: `Retrofit plan with ${planOut.files.length} files (${planOut.files.filter((f) => f.action !== "unchanged").length} to write).`,
    briefState: "backlog",
    context: { retrofitPlan: block } as Record<string, unknown>,
  });

  return {
    outputs: {
      "work-item-id": workItemId,
      "retrofit-plan-block": block,
    },
    logs: [
      `[retrofit] surface-plan: workItem=${workItemId} status=${block.status} tier=${block.trustTier}`,
    ],
  };
}

export async function executeRetrofitSurfacePlan(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  return runSurfacePlan(inputs);
}

// ============================================================
// Step 3: dispatch-write
// ============================================================

interface DispatchWriteOutcome {
  /** The workItem's RetrofitPlanBlock after this step's reconciliation. */
  block: RetrofitPlanBlock;
  /** When the dispatch happened, the dispatchId from runner-dispatcher. */
  dispatchId?: string;
  /** Trust action read from the surface-plan step's harness_decisions row. */
  trustAction?: TrustDecisionRow["trustAction"];
  /** True when dispatch was skipped (rejected / paused / blocked). */
  skipped: boolean;
  /** Reason for skip. */
  skipReason?: string;
}

export async function runDispatchWrite(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const { stepRunId, ctx } = readContext(inputs);
  if (!stepRunId && !isTestMode()) {
    return rejectNoStepRunId(RETROFIT_STEP_IDS.dispatchWrite);
  }

  const prior = await readPriorStepOutputs(ctx.processRunId);
  const plan = prior[RETROFIT_STEP_IDS.generatePlan]?.plan as
    | RetrofitPlan
    | undefined;
  const surfaceOut = prior[RETROFIT_STEP_IDS.surfacePlan];
  const initialBlock = surfaceOut?.["retrofit-plan-block"] as
    | RetrofitPlanBlock
    | undefined;
  const workItemId = surfaceOut?.["work-item-id"] as string | undefined;
  if (!plan || !initialBlock || !workItemId) {
    throw new Error(
      `[retrofit] dispatch-write: prior step outputs missing (plan/block/workItem)`,
    );
  }
  const project = await readProjectMeta(ctx.projectId, ctx.processRunId);

  // Read the trust-gate decision from the surface-plan step's
  // harness_decisions row.
  const decision = await readTrustDecision(
    ctx.processRunId,
    RETROFIT_STEP_IDS.surfacePlan,
  );

  // Determine outcome.
  const outcome = computeDispatchOutcome({
    initialBlock,
    decision,
    plan,
    project,
    workItemId,
    stepRunId: stepRunId ?? "test-mode-placeholder",
  });

  // Update the workItems row with the reconciled block.
  await db
    .update(schema.workItems)
    .set({
      context: { retrofitPlan: outcome.block } as Record<string, unknown>,
      updatedAt: new Date(),
      stateChangedAt: new Date(),
    })
    .where(eq(schema.workItems.id, workItemId));

  // Carry out the actual dispatch if the outcome requires it.
  if (!outcome.skipped) {
    const filesForDispatch = plan.files.filter(
      (f) => f.action !== "unchanged" && !outcome.block.skippedUserTouchedFiles?.includes(f.path),
    );
    if (filesForDispatch.length === 0) {
      // Nothing to dispatch — re-run idempotency case (no changes). Mark
      // committed with commitSha=null so the renderer surfaces "no changes
      // to retrofit" via the AlertBlock side-car.
      const idempotentBlock: RetrofitPlanBlock = {
        ...outcome.block,
        status: "committed",
        commitSha: undefined,
      };
      await db
        .update(schema.workItems)
        .set({
          context: { retrofitPlan: idempotentBlock } as Record<string, unknown>,
          updatedAt: new Date(),
          stateChangedAt: new Date(),
        })
        .where(eq(schema.workItems.id, workItemId));
      return {
        outputs: {
          "work-item-id": workItemId,
          "retrofit-plan-block": idempotentBlock,
          dispatched: false,
          idempotent: true,
        },
        logs: [
          `[retrofit] dispatch-write: idempotent — 0 files to write (all unchanged)`,
        ],
      };
    }

    // Compose the dispatch payload + prompt + invoke dispatchWorkItem.
    const payload: RetrofitDispatchPayload = {
      commitMessage: `chore(ditto): retrofit substrate v${plan.ditoSchemaVersion} (run ${ctx.processRunId})`,
      files: filesForDispatch.map((f) => ({
        path: f.path,
        content: f.content,
        contentHash: f.contentHash,
        action: f.action,
      })),
      branch: plan.branch,
      instructions:
        `Retrofit ${filesForDispatch.length} files into .ditto/. Trust tier: ${project.trustTier}. ` +
        `Sampled: ${outcome.block.sampledFileIds?.length ?? 0} file(s).`,
      processRunId: ctx.processRunId,
    };
    const { prompt, payloadKey } = composeRetrofitPrompt({
      payload,
      projectSlug: project.slug,
      ditoSchemaVersion: plan.ditoSchemaVersion,
    });

    // Update the workItem with the structured payload + prompt so the
    // dispatcher / runner can read them from context.
    await db
      .update(schema.workItems)
      .set({
        context: {
          retrofitPlan: outcome.block,
          [payloadKey]: payload,
          retrofitPrompt: prompt,
        } as Record<string, unknown>,
        updatedAt: new Date(),
        stateChangedAt: new Date(),
      })
      .where(eq(schema.workItems.id, workItemId));

    const { dispatchWorkItem } = await import("../runner-dispatcher");
    const dispatchOutcome = await dispatchWorkItem({
      stepRunId: stepRunId ?? "test-mode-placeholder",
      workItemId,
      processRunId: ctx.processRunId,
      trustTier: project.trustTier,
      trustAction: decision?.trustAction ?? "advance",
    });

    if (!dispatchOutcome.ok) {
      const failedBlock: RetrofitPlanBlock = {
        ...outcome.block,
        status: "failed",
        failureReason: `Dispatch failed: ${dispatchOutcome.message}`,
      };
      await db
        .update(schema.workItems)
        .set({
          context: {
            retrofitPlan: failedBlock,
            [payloadKey]: payload,
            retrofitPrompt: prompt,
          } as Record<string, unknown>,
          updatedAt: new Date(),
          stateChangedAt: new Date(),
        })
        .where(eq(schema.workItems.id, workItemId));
      return {
        outputs: {
          "work-item-id": workItemId,
          "retrofit-plan-block": failedBlock,
          dispatched: false,
          dispatchError: dispatchOutcome.reason,
        },
        logs: [`[retrofit] dispatch-write: dispatch failed (${dispatchOutcome.reason})`],
      };
    }

    return {
      outputs: {
        "work-item-id": workItemId,
        "retrofit-plan-block": outcome.block,
        dispatched: true,
        dispatchId: dispatchOutcome.dispatchId,
        runnerKind: dispatchOutcome.runnerKind,
        plannedFileHashes: Object.fromEntries(
          plan.files.map((f) => [f.path, f.contentHash]),
        ),
      },
      logs: [
        `[retrofit] dispatch-write: dispatched workItem=${workItemId} ` +
          `runner=${dispatchOutcome.runnerKind} dispatchId=${dispatchOutcome.dispatchId}`,
      ],
    };
  }

  // Skipped path — block is final for this run.
  return {
    outputs: {
      "work-item-id": workItemId,
      "retrofit-plan-block": outcome.block,
      dispatched: false,
      skipReason: outcome.skipReason ?? "unspecified",
    },
    logs: [
      `[retrofit] dispatch-write: skipped (${outcome.skipReason ?? "unspecified"}) — status=${outcome.block.status}`,
    ],
  };
}

export async function executeRetrofitDispatchWrite(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  return runDispatchWrite(inputs);
}

/** Pure function: given the initial block + the trust decision, decide what
 *  happens. Exposed for unit testability. */
export function computeDispatchOutcome(args: {
  initialBlock: RetrofitPlanBlock;
  decision: TrustDecisionRow | null;
  plan: RetrofitPlan;
  project: ProjectMeta;
  workItemId: string;
  stepRunId: string;
}): DispatchWriteOutcome {
  const { initialBlock, decision, plan, project } = args;

  // Default fallback when no decision row exists yet. Reviewer MIN-4:
  // in production, the trust-gate ALWAYS persists a harness_decisions row
  // for the surface-plan step before dispatch-write runs. If the row is
  // missing, something is wrong — fail SAFE by treating as 'pause' so
  // dispatch is blocked (status='pending-review'). Tests that exercise
  // a specific tier should pass an explicit decision row.
  const trustAction = decision?.trustAction ?? "pause";
  const canAutoAdvance = decision?.canAutoAdvance ?? true;

  // Critical tier — pause + canAutoAdvance=false.
  if (trustAction === "pause" && !canAutoAdvance) {
    return {
      block: {
        ...initialBlock,
        status: "rejected",
        failureReason:
          "Critical-tier projects must hand-author their .ditto/ substrate. See ADR-043.",
      },
      skipped: true,
      skipReason: "critical-tier",
      trustAction,
    };
  }

  // Supervised tier — pause without canAutoAdvance flag, treat as supervised.
  if (trustAction === "pause") {
    return {
      block: {
        ...initialBlock,
        status: "pending-review",
      },
      skipped: true,
      skipReason: "supervised-tier",
      trustAction,
    };
  }

  // Spot-checked + sample required — pause until /review/[token] approval.
  if (trustAction === "sample_pause") {
    const sampledFileIds = sampleFileIds(plan, decision?.samplingHash ?? null);
    return {
      block: {
        ...initialBlock,
        status: "pending-sample-review",
        sampledFileIds,
      },
      skipped: true,
      skipReason: "spot-checked-sample-required",
      trustAction,
    };
  }

  // Spot-checked + sample not required this run — dispatch all + populate
  // sampledFileIds for post-hoc audit.
  // Note: user-edit safety per Brief 228 §Constraints (Q3 resolution) is
  // RUNNER-SIDE — the prompt instructs the runner to compare on-disk
  // hashes and skip user-edited files; Ditto reads the result post-hoc
  // from runner_dispatches. The schema currently lacks a body channel for
  // the runner's structured response (Builder deviation D2 + Reviewer
  // IMP-1), so `skippedUserTouchedFiles` flows through as undefined at
  // Brief 228's MVP level — runner-side enforcement happens, but Ditto
  // can't surface the skip-list until a future schema-extension brief.
  if (trustAction === "sample_advance") {
    const sampledFileIds = sampleFileIds(plan, decision?.samplingHash ?? null);
    return {
      block: {
        ...initialBlock,
        status: "dispatched",
        sampledFileIds,
      },
      skipped: false,
      trustAction,
    };
  }

  // Autonomous tier — advance, dispatch all (user-edit safety is runner-side
  // per the comment above).
  return {
    block: {
      ...initialBlock,
      status: "dispatched",
    },
    skipped: false,
    trustAction,
  };
}

/** Sample N file ids deterministically from the plan using the trust-gate's
 *  samplingHash (or a fallback). Used for spot_checked tier to pick which
 *  files the user reviews. */
function sampleFileIds(plan: RetrofitPlan, samplingHash: string | null): string[] {
  const writeFiles = plan.files.filter((f) => f.action !== "unchanged");
  if (writeFiles.length === 0) return [];
  // Sample 25% of files (rounded up), minimum 1.
  const sampleCount = Math.max(1, Math.ceil(writeFiles.length * 0.25));
  if (!samplingHash) {
    // No hash available — sample first N deterministically.
    return writeFiles.slice(0, sampleCount).map((f) => f.id);
  }
  // Use samplingHash to seed which files are picked.
  const hashBytes = Buffer.from(samplingHash, "hex");
  const indices = new Set<number>();
  for (let i = 0; indices.size < sampleCount && i < hashBytes.length; i++) {
    indices.add(hashBytes[i] % writeFiles.length);
  }
  // If we still don't have enough (rare collisions), fill from the front.
  for (let i = 0; indices.size < sampleCount && i < writeFiles.length; i++) {
    indices.add(i);
  }
  return [...indices].sort((a, b) => a - b).map((idx) => writeFiles[idx].id);
}

// ============================================================
// Step 4: verify-commit
// ============================================================

export async function runVerifyCommit(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const { stepRunId, ctx } = readContext(inputs);
  if (!stepRunId && !isTestMode()) {
    return rejectNoStepRunId(RETROFIT_STEP_IDS.verifyCommit);
  }

  const prior = await readPriorStepOutputs(ctx.processRunId);
  const dispatchOut = prior[RETROFIT_STEP_IDS.dispatchWrite];
  const block = dispatchOut?.["retrofit-plan-block"] as
    | RetrofitPlanBlock
    | undefined;
  const workItemId = dispatchOut?.["work-item-id"] as string | undefined;
  const dispatched = dispatchOut?.dispatched as boolean | undefined;
  const dispatchId = dispatchOut?.dispatchId as string | undefined;
  const plannedFileHashes = (dispatchOut?.plannedFileHashes ?? {}) as Record<
    string,
    string
  >;
  if (!block || !workItemId) {
    throw new Error(
      `[retrofit] verify-commit: prior step outputs missing (block/workItem)`,
    );
  }

  // If not dispatched (skipped, rejected, idempotent, or failed at dispatch),
  // there's nothing to verify — block already has its final status.
  if (!dispatched || !dispatchId) {
    return {
      outputs: {
        "work-item-id": workItemId,
        "retrofit-plan-block": block,
        verified: false,
        reason: "not-dispatched",
      },
      logs: [
        `[retrofit] verify-commit: nothing to verify (status=${block.status})`,
      ],
    };
  }

  // Read the dispatch row to get the runner's response.
  const dispatchRows = await db
    .select()
    .from(schema.runnerDispatches)
    .where(eq(schema.runnerDispatches.id, dispatchId))
    .limit(1);
  const dispatch = dispatchRows[0];

  if (!dispatch) {
    const failedBlock: RetrofitPlanBlock = {
      ...block,
      status: "failed",
      failureReason: `Dispatch row not found: ${dispatchId}`,
    };
    await persistVerifyCommitResult({
      block: failedBlock,
      workItemId,
      stepRunId: stepRunId ?? "test-mode-placeholder",
      processRunId: ctx.processRunId,
      plannedFileHashes,
    });
    return {
      outputs: {
        "work-item-id": workItemId,
        "retrofit-plan-block": failedBlock,
        verified: false,
        reason: "dispatch-row-missing",
      },
      logs: [`[retrofit] verify-commit: dispatch row missing`],
    };
  }

  // Parse the runner's response. The runner returns
  // { commitSha, actuallyChangedFiles, skippedFiles? } per the prompt
  // template. Brief 232 added the `response_body` column on
  // `runner_dispatches` so this field is populated end-to-end via the
  // status webhook. Legacy hex-parse from `externalRunId` is retained
  // for rows where `responseBody` is null (pre-Brief-232 dispatches and
  // runners that haven't been re-templated yet).
  const runnerResponse = parseRunnerResponse(dispatch);

  if (dispatch.status === "succeeded" && runnerResponse) {
    const committedBlock: RetrofitPlanBlock = {
      ...block,
      status: "committed",
      commitSha: runnerResponse.commitSha ?? undefined,
      commitUrl: dispatch.externalUrl ?? undefined,
      skippedUserTouchedFiles: runnerResponse.skippedFiles?.length
        ? runnerResponse.skippedFiles
        : undefined,
    };
    await persistVerifyCommitResult({
      block: committedBlock,
      workItemId,
      stepRunId: stepRunId ?? "test-mode-placeholder",
      processRunId: ctx.processRunId,
      plannedFileHashes,
    });
    return {
      outputs: {
        "work-item-id": workItemId,
        "retrofit-plan-block": committedBlock,
        verified: true,
        commitSha: runnerResponse.commitSha,
      },
      logs: [
        `[retrofit] verify-commit: committed sha=${runnerResponse.commitSha ?? "(none — no changes)"} ` +
          `changed=${runnerResponse.actuallyChangedFiles.length} ` +
          `skipped=${runnerResponse.skippedFiles?.length ?? 0}`,
      ],
    };
  }

  // Dispatch failed or runner returned malformed response.
  const failedBlock: RetrofitPlanBlock = {
    ...block,
    status: "failed",
    failureReason: dispatch.errorReason ?? "Dispatch did not succeed",
  };
  await persistVerifyCommitResult({
    block: failedBlock,
    workItemId,
    stepRunId: stepRunId ?? "test-mode-placeholder",
    processRunId: ctx.processRunId,
    plannedFileHashes,
  });
  return {
    outputs: {
      "work-item-id": workItemId,
      "retrofit-plan-block": failedBlock,
      verified: false,
      reason: dispatch.errorReason ?? "dispatch-not-succeeded",
    },
    logs: [`[retrofit] verify-commit: dispatch failed (${dispatch.errorReason ?? "unknown"})`],
  };
}

export async function executeRetrofitVerifyCommit(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  return runVerifyCommit(inputs);
}

interface RunnerResponse {
  commitSha: string | null;
  actuallyChangedFiles: string[];
  skippedFiles?: string[];
}

/** Parse the runner's structured response from the dispatch row.
 *
 *  **Brief 232 — `responseBody` channel.** The runner POSTs its structured
 *  response `{ commitSha, actuallyChangedFiles, skippedFiles? }` via the
 *  status webhook (`/api/v1/work-items/:id/status`); the route persists it
 *  on the matched `runner_dispatches.response_body` row. This parser reads
 *  it back at verify-commit time.
 *
 *  Read order:
 *  1. `responseBody.commitSha / .actuallyChangedFiles / .skippedFiles` — the
 *     primary path. Validated defensively per field (Insight-017): wrong
 *     types fall through to the legacy/empty defaults rather than throw.
 *  2. Legacy hex-parse from `externalRunId` for `commitSha` only — preserves
 *     Brief 228 MVP behaviour for rows where `responseBody` is null
 *     (pre-Brief-232 dispatches; runners that haven't been re-templated
 *     yet to include `responseBody` in their callback POST).
 *
 *  `actuallyChangedFiles` defaults to `[]` and `skippedFiles` defaults to
 *  `undefined` when `responseBody` is null or malformed — those channels
 *  were unreachable before Brief 232, so this matches Brief 228's empty-
 *  array behaviour.
 */
export function parseRunnerResponse(
  dispatch: {
    externalRunId: string | null;
    responseBody?: Record<string, unknown> | unknown | null;
  },
): RunnerResponse | null {
  // 1. Primary path: read from responseBody when it exists and is an object.
  const body = dispatch.responseBody;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;

    let commitSha: string | null = null;
    if (typeof obj.commitSha === "string" && obj.commitSha.length > 0) {
      commitSha = obj.commitSha;
    } else if (
      dispatch.externalRunId &&
      /^[0-9a-f]{7,40}$/i.test(dispatch.externalRunId)
    ) {
      // responseBody object exists but commitSha is missing/wrong type — fall
      // through to legacy hex-parse for that one field.
      commitSha = dispatch.externalRunId;
    }

    const actuallyChangedFiles =
      Array.isArray(obj.actuallyChangedFiles) &&
      obj.actuallyChangedFiles.every((s) => typeof s === "string")
        ? (obj.actuallyChangedFiles as string[])
        : [];

    const skippedFiles =
      Array.isArray(obj.skippedFiles) &&
      obj.skippedFiles.every((s) => typeof s === "string") &&
      obj.skippedFiles.length > 0
        ? (obj.skippedFiles as string[])
        : undefined;

    return { commitSha, actuallyChangedFiles, skippedFiles };
  }

  // 2. Legacy fallback: no responseBody (or non-object). Hex-parse commitSha
  //    from externalRunId; default empty arrays.
  let commitSha: string | null = null;
  if (
    dispatch.externalRunId &&
    /^[0-9a-f]{7,40}$/i.test(dispatch.externalRunId)
  ) {
    commitSha = dispatch.externalRunId;
  }
  return {
    commitSha,
    actuallyChangedFiles: [],
    skippedFiles: undefined,
  };
}

/** Persist the verify-commit result: update the workItems row + UPDATE the
 *  existing harness_decisions row (written by dispatchWorkItem) with the
 *  reconciled trust details + planned file hashes (so the next retrofit can
 *  detect user edits). Brief 228 §Constraints "verify-commit handler UPDATES
 *  the existing harness_decisions row — does NOT INSERT a new one". */
async function persistVerifyCommitResult(args: {
  block: RetrofitPlanBlock;
  workItemId: string;
  stepRunId: string;
  processRunId: string;
  plannedFileHashes: Record<string, string>;
}): Promise<void> {
  await db
    .update(schema.workItems)
    .set({
      context: { retrofitPlan: args.block } as Record<string, unknown>,
      updatedAt: new Date(),
      stateChangedAt: new Date(),
    })
    .where(eq(schema.workItems.id, args.workItemId));

  // Find the dispatch-write step's harness_decisions row + UPDATE its
  // reviewDetails with the planned hashes (for next retrofit's user-edit
  // detection) + the commit metadata. Note: we look up by the
  // dispatch-write step's stepRunId, not the verify-commit step's.
  const dispatchStepRows = await db
    .select({ id: schema.stepRuns.id })
    .from(schema.stepRuns)
    .where(
      and(
        eq(schema.stepRuns.processRunId, args.processRunId),
        eq(schema.stepRuns.stepId, RETROFIT_STEP_IDS.dispatchWrite),
      ),
    )
    .orderBy(desc(schema.stepRuns.createdAt))
    .limit(1);
  const dispatchStepRunId = dispatchStepRows[0]?.id;
  if (!dispatchStepRunId) return;
  const decisionRows = await db
    .select()
    .from(schema.harnessDecisions)
    .where(eq(schema.harnessDecisions.stepRunId, dispatchStepRunId))
    .orderBy(desc(schema.harnessDecisions.createdAt))
    .limit(1);
  const decision = decisionRows[0];
  if (!decision) return;
  const existing = (decision.reviewDetails ?? {}) as Record<string, unknown>;
  await db
    .update(schema.harnessDecisions)
    .set({
      reviewDetails: {
        ...existing,
        retrofit: {
          status: args.block.status,
          commitSha: args.block.commitSha,
          commitUrl: args.block.commitUrl,
          skippedUserTouchedFiles: args.block.skippedUserTouchedFiles ?? [],
          fileHashes: args.plannedFileHashes,
          schemaVersion: DITTO_SCHEMA_VERSION,
        },
      } as Record<string, unknown>,
    })
    .where(eq(schema.harnessDecisions.id, decision.id));
}
