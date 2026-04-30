/**
 * Brief 226 — Project Onboarding analyser handlers (replaces Brief 225 placeholders).
 *
 * Wired into the system-agent registry by `src/engine/system-agents/index.ts`.
 * The `project-onboarding.yaml` process invokes these via `executor: script` +
 * `config.systemAgent: project-onboarding-<step>`.
 *
 * Step decomposition (9 total — Brief 226 §AC #2 + #4):
 *
 *   1. clone-and-scan          — isomorphic-git shallow clone to a temp dir;
 *                                emits cheap repo metadata (file count, size,
 *                                default branch). On failure: writes
 *                                harness_decisions error row + activities
 *                                row + flips workItem to blocked.
 *   2. detect-build-system     — pure detector over the cloned dir.
 *   3. detect-test-framework   — pure detector.
 *   4. detect-ci               — pure detector.
 *   5. detect-existing-harness — pure detector.
 *   6. score-persona-fit       — descriptor-only output (no persona names).
 *   7. match-gold-standard     — landscape-index lookup, graceful no-op
 *                                when the index is missing.
 *   8. recommend-runner-tier   — heuristic mapping per Brief 226 §Constraints.
 *   9. surface-report          — assembles the AnalyserReportBlock, writes
 *                                workItems.context + briefState='backlog' +
 *                                a populated harness_decisions audit row.
 *                                Cleanup runs in a try/finally inside this
 *                                step so the temp dir is removed on success
 *                                AND on parent-step throw (Insight-205 §7).
 *
 * Insight-180: every inner handler takes `stepRunId` as the first parameter +
 * rejects calls without it (DB-spy verifiable: zero DB calls before the
 * rejection). Test mode (`DITTO_TEST_MODE=true`) bypasses the guard.
 *
 * Detector handlers use a partial-success path (Brief 226 §Constraints +
 * §AC #11): a thrown detector emits `_detectorError` in its outputs but
 * does NOT block surface-report from rendering — the AlertBlock side-car
 * surfaces the failure to the user.
 *
 * Provenance: Brief 226 §What Changes; Brief 225 (placeholder shape this
 *   replaces); Insight-180; Insight-205 §6/§7 (analyser report + cleanup).
 */

import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as fsSync from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { readPriorStepOutputs as coreReadPriorStepOutputs } from "@ditto/core";
import { db, schema } from "../../db";
import type { StepExecutionResult } from "../step-executor";
import type { SystemAgentHandler } from "../system-agents";
import {
  detectBuildSystem,
} from "./detectors/build-system";
import {
  detectTestFramework,
} from "./detectors/test-framework";
import { detectCI } from "./detectors/ci";
import { detectHarness } from "./detectors/harness";
import { scorePersonaFit } from "./persona-fit";
import { matchGoldStandard } from "./gold-standard";
import { recommendRunner, recommendTrustTier } from "./recommend";
import { createAnalyserTempDir, cleanupAnalyserDir } from "./cleanup";
import type {
  AnalyserReportBlock,
  BuildSystemDetection,
  CIDetection,
  Finding,
  HarnessDetection,
  StackSignals,
  TestFrameworkDetection,
} from "@ditto/core";

const GUARD_MESSAGE =
  "[onboarding] handler invoked without stepRunId — Insight-180 guard rejects (set DITTO_TEST_MODE=true to bypass in tests)";

// Step IDs — kept in one place so the YAML and the surface-report aggregator
// can't drift. If the YAML ever renames a step, fix here too.
export const STEP_IDS = {
  cloneAndScan: "clone-and-scan",
  detectBuildSystem: "detect-build-system",
  detectTestFramework: "detect-test-framework",
  detectCI: "detect-ci",
  detectHarness: "detect-existing-harness",
  scorePersonaFit: "score-persona-fit",
  matchGoldStandard: "match-gold-standard",
  recommendRunnerTier: "recommend-runner-tier",
  surfaceReport: "surface-report",
} as const;

// ============================================================
// Shared helpers
// ============================================================

export interface OnboardingHandlerContext {
  projectId: string;
  processRunId: string;
}

function isTestMode(): boolean {
  return process.env.DITTO_TEST_MODE === "true";
}

/** Read context fields out of the runInputs passed to a system-agent handler.
 *  Throws when `projectId` or `_processRunId` is missing — every onboarding
 *  step needs both. */
function readContext(inputs: Record<string, unknown>): {
  stepRunId: string | undefined;
  ctx: OnboardingHandlerContext;
} {
  const projectId = inputs.projectId as string | undefined;
  const processRunId = (inputs._processRunId ?? inputs.processRunId) as
    | string
    | undefined;
  const stepRunId = (inputs._stepRunId ?? inputs.stepRunId) as
    | string
    | undefined;
  if (!projectId) {
    throw new Error("[onboarding] handler requires `projectId` in run inputs");
  }
  if (!processRunId) {
    throw new Error(
      "[onboarding] handler requires `_processRunId` in run inputs (the harness pipeline injects this)",
    );
  }
  return {
    stepRunId,
    ctx: { projectId, processRunId },
  };
}

function rejectNoStepRunId(label: string): StepExecutionResult {
  return {
    outputs: { _placeholder: `${label}-rejected-no-stepRunId` },
    logs: [GUARD_MESSAGE],
  };
}

/** Aggregate prior step outputs by stepId from the step_runs table.
 *  Brief 228 §AC #3 / Insight-217 absorption: extracted to
 *  `@ditto/core` `harness/step-output-reader.ts` for shared consumption
 *  across all multi-step pipelines (analyser + retrofitter + future).
 *  This thin wrapper preserves the local-app's `db` injection so the call
 *  sites in this file don't need refactoring. */
async function readPriorStepOutputs(
  processRunId: string,
): Promise<Record<string, Record<string, unknown>>> {
  return coreReadPriorStepOutputs(
    processRunId,
    db as unknown as Parameters<typeof coreReadPriorStepOutputs>[1],
  );
}

interface CloneAndScanResult {
  tempDir: string;
  fileCount: number;
  totalBytes: number;
  defaultBranch: string;
  fetchedUrl: string;
}

function readCloneResult(
  prior: Record<string, Record<string, unknown>>,
): CloneAndScanResult | undefined {
  const out = prior[STEP_IDS.cloneAndScan];
  if (!out) return undefined;
  const scanResult = out["scan-result"];
  if (!scanResult || typeof scanResult !== "object") return undefined;
  return scanResult as CloneAndScanResult;
}

/** Cheap recursive walk to build file-count + total-byte-size; bounded by a
 *  budget so a pathological clone can't OOM the engine. Skips `.git`,
 *  `node_modules`, build dirs. */
function summariseRepo(dir: string): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;
  const budget = { count: 50_000 };
  const walk = (current: string) => {
    if (budget.count <= 0) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (budget.count <= 0) return;
      budget.count -= 1;
      if (
        entry === ".git" ||
        entry === "node_modules" ||
        entry === "target" ||
        entry === "dist" ||
        entry === "build" ||
        entry === ".next"
      ) {
        continue;
      }
      const full = join(current, entry);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (s.isFile()) {
        fileCount += 1;
        totalBytes += s.size;
      }
    }
  };
  walk(dir);
  return { fileCount, totalBytes };
}

function buildGithubUrl(repo: string): string {
  if (repo.startsWith("http://") || repo.startsWith("https://")) return repo;
  if (repo.startsWith("git@github.com:")) {
    return `https://github.com/${repo.slice("git@github.com:".length).replace(/\.git$/, "")}`;
  }
  return `https://github.com/${repo.replace(/\.git$/, "")}`;
}

// ============================================================
// Step 1: clone-and-scan (was placeholder — now real)
// ============================================================

/**
 * Inner handler for the `clone-and-scan` step.
 *
 * Public repos: `git.clone({ depth: 1, singleBranch })` to a `mkdtemp` dir.
 * Private repos require GitHub OAuth which lands in a follow-on; for now
 * private clones surface as auth failure → AlertBlock.
 *
 * On failure: writes `harness_decisions` error row + a sibling `activities`
 * row (`actorType='analyser'`) + flips the project's workItem briefState to
 * `'blocked'`. Returns a non-throwing result with `error: { stage: 'clone' }`
 * so surface-report can still render the AlertBlock.
 */
export async function runCloneAndScan(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode()) return rejectNoStepRunId("clone-and-scan");

  const [project] = await db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      githubRepo: schema.projects.githubRepo,
      defaultBranch: schema.projects.defaultBranch,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, ctx.projectId))
    .limit(1);
  if (!project) {
    return {
      outputs: {},
      logs: [`[onboarding] clone-and-scan: project ${ctx.projectId} not found`],
    };
  }
  if (!project.githubRepo) {
    await recordCloneError(ctx, stepRunId, project.id, project.slug, {
      reason: "missing-github-repo",
      message: "Project has no githubRepo configured.",
    });
    return {
      outputs: {
        "clone-error": {
          stage: "clone",
          reason: "missing-github-repo",
          message: "Project has no githubRepo configured.",
        },
      },
      logs: [
        `[onboarding] clone-and-scan: project ${project.slug} has no githubRepo`,
      ],
    };
  }

  const url = buildGithubUrl(project.githubRepo);
  const tempDir = createAnalyserTempDir();
  const branch = project.defaultBranch ?? "main";

  try {
    await git.clone({
      fs: fsSync,
      http,
      url,
      dir: tempDir,
      ref: branch,
      singleBranch: true,
      depth: 1,
    });
  } catch (err) {
    cleanupAnalyserDir(tempDir);
    const message = err instanceof Error ? err.message : String(err);
    const reason = inferCloneFailureReason(message);
    await recordCloneError(ctx, stepRunId, project.id, project.slug, {
      reason,
      message,
    });
    return {
      outputs: {
        "clone-error": { stage: "clone", reason, message },
      },
      logs: [
        `[onboarding] clone-and-scan failed for ${project.slug} (${reason}): ${message}`,
      ],
    };
  }

  const { fileCount, totalBytes } = summariseRepo(tempDir);
  const result: CloneAndScanResult = {
    tempDir,
    fileCount,
    totalBytes,
    defaultBranch: branch,
    fetchedUrl: url,
  };
  return {
    outputs: { "scan-result": result },
    logs: [
      `[onboarding] clone-and-scan ok for ${project.slug}: ${fileCount} files, ${totalBytes} bytes (${tempDir})`,
    ],
  };
}

function inferCloneFailureReason(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("authentication") || m.includes("401") || m.includes("authorization required")) {
    return "auth";
  }
  if (m.includes("404") || m.includes("not found")) return "not-found";
  if (m.includes("could not resolve") || m.includes("getaddrinfo") || m.includes("enotfound")) {
    return "network";
  }
  if (m.includes("timeout") || m.includes("timed out")) return "timeout";
  return "other";
}

async function recordCloneError(
  ctx: OnboardingHandlerContext,
  stepRunId: string | undefined,
  projectId: string,
  projectSlug: string,
  err: { reason: string; message: string },
): Promise<void> {
  // (a) harness_decisions audit row — both processRunId and stepRunId NOT
  // NULL, both available at clone-step entry (Brief 226 §Constraints fix).
  if (stepRunId) {
    try {
      await db.insert(schema.harnessDecisions).values({
        processRunId: ctx.processRunId,
        stepRunId,
        trustTier: "supervised",
        trustAction: "advance",
        reviewPattern: [],
        reviewResult: "skip",
        reviewDetails: {
          stage: "clone",
          error: err,
          projectSlug,
        },
      });
    } catch (insertErr) {
      console.warn(
        `[onboarding] failed to insert harness_decisions for clone error: ${insertErr instanceof Error ? insertErr.message : insertErr}`,
      );
    }
  }

  // (b) sibling activities row — actorType lives here, not on harness_decisions
  // (Brief 226 §Constraints CRITICAL #2 fix).
  try {
    await db.insert(schema.activities).values({
      action: "analyser_clone_failed",
      description: `Clone failed for ${projectSlug}: ${err.reason}`,
      actorType: "analyser",
      entityType: "project",
      entityId: projectId,
      metadata: {
        stage: "clone",
        reason: err.reason,
        message: err.message,
        projectSlug,
      },
    });
  } catch (activityErr) {
    console.warn(
      `[onboarding] failed to insert activities row for clone error: ${activityErr instanceof Error ? activityErr.message : activityErr}`,
    );
  }

  // (c) defensive belt-and-braces: if a prior successful run had created a
  // backlog onboarding workItem and a retry now fails clone, flip its
  // briefState to blocked. On the first-attempt failure path this is a
  // benign no-op (the workItem doesn't exist yet); surface-report's
  // first-write path inserts it with briefState='blocked' instead. Brief
  // 226 Reviewer IMPORTANT #1.
  try {
    await db
      .update(schema.workItems)
      .set({
        briefState: "blocked",
        updatedAt: new Date(),
        stateChangedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workItems.projectId, projectId),
          eq(schema.workItems.source, "system_generated"),
        ),
      );
  } catch (updateErr) {
    console.warn(
      `[onboarding] failed to flip workItem to blocked: ${updateErr instanceof Error ? updateErr.message : updateErr}`,
    );
  }
}

export const executeOnboardingCloneAndScan: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runCloneAndScan(stepRunId, ctx);
};

// ============================================================
// Steps 2-5: Detector handlers (build-system, test-framework, ci, harness)
// ============================================================

interface DetectorRun<T> {
  ok: true;
  value: T;
}
interface DetectorErr {
  ok: false;
  detector: string;
  message: string;
}
type DetectorOutcome<T> = DetectorRun<T> | DetectorErr;

function safeDetect<T>(
  detector: string,
  fn: () => T,
): DetectorOutcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return {
      ok: false,
      detector,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Shared scaffolding for the four detectors. Reads tempDir from
 *  clone-and-scan; when missing (clone failed earlier), emits an empty
 *  detector output so surface-report still renders. */
async function runDetector<T>(
  label: string,
  outputKey: string,
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
  detect: (tempDir: string) => T,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode()) return rejectNoStepRunId(label);
  const prior = await readPriorStepOutputs(ctx.processRunId);
  const clone = readCloneResult(prior);
  if (!clone || !clone.tempDir) {
    return {
      outputs: { [outputKey]: { skipped: true, reason: "no-clone" } },
      logs: [`[onboarding] ${label} skipped — clone result missing`],
    };
  }
  const outcome = safeDetect(label, () => detect(clone.tempDir));
  if (!outcome.ok) {
    return {
      outputs: {
        [outputKey]: {
          _detectorError: { detector: outcome.detector, message: outcome.message },
        },
      },
      logs: [
        `[onboarding] ${label} threw — recording detectorError; surface-report renders partial: ${outcome.message}`,
      ],
    };
  }
  return {
    outputs: { [outputKey]: outcome.value },
    logs: [`[onboarding] ${label} ok`],
  };
}

export async function runDetectBuildSystem(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  return runDetector("detect-build-system", "build-system", stepRunId, ctx, (dir) =>
    detectBuildSystem(dir),
  );
}

export async function runDetectTestFramework(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode())
    return rejectNoStepRunId("detect-test-framework");
  const prior = await readPriorStepOutputs(ctx.processRunId);
  const clone = readCloneResult(prior);
  if (!clone || !clone.tempDir) {
    return {
      outputs: { "test-framework": { skipped: true, reason: "no-clone" } },
      logs: ["[onboarding] detect-test-framework skipped — clone result missing"],
    };
  }
  // Thread the upstream detect-build-system findings into the test-framework
  // detector — language-specific paths (pytest, rspec, cargo-test, go-test,
  // phpunit, junit) all gate on the build-system kinds. Brief 226 Reviewer
  // CRITICAL #1: passing [] would dead-code those paths in production.
  const buildSystems = readDetectorPayload<BuildSystemDetection[]>(
    prior[STEP_IDS.detectBuildSystem],
    "build-system",
    [],
  );
  const outcome = safeDetect("detect-test-framework", () =>
    detectTestFramework(clone.tempDir, buildSystems),
  );
  if (!outcome.ok) {
    return {
      outputs: {
        "test-framework": {
          _detectorError: { detector: outcome.detector, message: outcome.message },
        },
      },
      logs: [
        `[onboarding] detect-test-framework threw — recording detectorError: ${outcome.message}`,
      ],
    };
  }
  return {
    outputs: { "test-framework": outcome.value },
    logs: [`[onboarding] detect-test-framework ok`],
  };
}

export async function runDetectCI(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  return runDetector("detect-ci", "ci", stepRunId, ctx, (dir) => detectCI(dir));
}

export async function runDetectHarness(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  return runDetector(
    "detect-existing-harness",
    "existing-harness",
    stepRunId,
    ctx,
    (dir) => detectHarness(dir),
  );
}

export const executeOnboardingDetectBuildSystem: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runDetectBuildSystem(stepRunId, ctx);
};
export const executeOnboardingDetectTestFramework: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runDetectTestFramework(stepRunId, ctx);
};
export const executeOnboardingDetectCI: SystemAgentHandler = async (inputs) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runDetectCI(stepRunId, ctx);
};
export const executeOnboardingDetectHarness: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runDetectHarness(stepRunId, ctx);
};

// ============================================================
// Step 6-8: Scoring + recommendation handlers
// ============================================================

/** Build a StackSignals object from the step-output map produced upstream. */
function assembleSignals(
  prior: Record<string, Record<string, unknown>>,
): StackSignals {
  const clone = readCloneResult(prior);
  const buildSystems = readDetectorPayload<BuildSystemDetection[]>(
    prior[STEP_IDS.detectBuildSystem],
    "build-system",
    [],
  );
  const testFrameworks = readDetectorPayload<TestFrameworkDetection[]>(
    prior[STEP_IDS.detectTestFramework],
    "test-framework",
    [],
  );
  const ci = readDetectorPayload<CIDetection>(
    prior[STEP_IDS.detectCI],
    "ci",
    { provider: "none", workflowPaths: [] },
  );
  const harness = readDetectorPayload<HarnessDetection>(
    prior[STEP_IDS.detectHarness],
    "existing-harness",
    { flavours: ["none"], markers: [] },
  );
  return {
    buildSystems,
    testFrameworks,
    ci,
    harness,
    fileCount: clone?.fileCount,
    totalBytes: clone?.totalBytes,
    defaultBranch: clone?.defaultBranch,
  };
}

function readDetectorPayload<T>(
  out: Record<string, unknown> | undefined,
  key: string,
  fallback: T,
): T {
  if (!out) return fallback;
  const payload = out[key];
  if (!payload) return fallback;
  if (typeof payload === "object" && payload !== null && "_detectorError" in payload) {
    return fallback;
  }
  if (typeof payload === "object" && payload !== null && "skipped" in payload) {
    return fallback;
  }
  return payload as T;
}

export async function runScorePersonaFit(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode()) return rejectNoStepRunId("score-persona-fit");
  const prior = await readPriorStepOutputs(ctx.processRunId);
  const signals = assembleSignals(prior);
  const fit = scorePersonaFit(signals);
  return {
    outputs: { "persona-fit": fit },
    logs: [`[onboarding] score-persona-fit → ${fit.descriptor}`],
  };
}

export async function runMatchGoldStandard(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode()) return rejectNoStepRunId("match-gold-standard");
  const prior = await readPriorStepOutputs(ctx.processRunId);
  const signals = assembleSignals(prior);
  const matches = matchGoldStandard(signals);
  return {
    outputs: { "gold-standard": matches },
    logs: [`[onboarding] match-gold-standard → ${matches.length} matches`],
  };
}

export async function runRecommendRunnerTier(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode())
    return rejectNoStepRunId("recommend-runner-tier");
  const prior = await readPriorStepOutputs(ctx.processRunId);
  const signals = assembleSignals(prior);
  const runner = recommendRunner(signals);
  const trustTier = recommendTrustTier(signals);
  return {
    outputs: { recommendation: { runner, trustTier } },
    logs: [
      `[onboarding] recommend-runner-tier → runner=${runner.kind} tier=${trustTier.tier}`,
    ],
  };
}

export const executeOnboardingScorePersonaFit: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runScorePersonaFit(stepRunId, ctx);
};
export const executeOnboardingMatchGoldStandard: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runMatchGoldStandard(stepRunId, ctx);
};
export const executeOnboardingRecommendRunnerTier: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runRecommendRunnerTier(stepRunId, ctx);
};

// ============================================================
// Step 9: surface-report (assembles the AnalyserReportBlock; runs cleanup)
// ============================================================

function buildFindings(signals: StackSignals): {
  strengths: Finding[];
  watchOuts: Finding[];
  missing: Finding[];
} {
  const strengths: Finding[] = [];
  const watchOuts: Finding[] = [];
  const missing: Finding[] = [];

  if (signals.testFrameworks.length > 0) {
    const labels = signals.testFrameworks.map((t) => t.framework).join(", ");
    strengths.push({
      text: `Tests exist (${labels})`,
      evidence: signals.testFrameworks.map((t) => t.evidence).join(", "),
    });
  } else {
    missing.push({
      text: "No automated tests detected",
      defaultAction: "Trust tier defaults to supervised until tests + CI exist.",
    });
  }

  if (signals.ci.provider !== "none") {
    strengths.push({
      text: `CI configured (${signals.ci.provider})`,
      evidence: signals.ci.workflowPaths.slice(0, 2).join(", "),
    });
  } else {
    missing.push({
      text: "No CI configuration found",
      defaultAction: "Plan to wire CI before earning autonomy.",
    });
  }

  const harnessMarkers = signals.harness.markers;
  if (harnessMarkers.length > 0) {
    strengths.push({
      text: `Existing harness markers: ${signals.harness.flavours.filter((f) => f !== "none").join(", ")}`,
      evidence: harnessMarkers.join(", "),
    });
  } else {
    watchOuts.push({
      text: "No existing AI / agent harness markers",
      defaultAction: "Retrofit will add `.ditto/` substrate (sub-brief #3).",
    });
  }

  if (signals.buildSystems.length === 0) {
    watchOuts.push({
      text: "No recognised build system",
      evidence: "no package.json / Cargo.toml / pyproject.toml / etc.",
    });
  } else if (signals.buildSystems.length > 1) {
    watchOuts.push({
      text: "Polyglot repo — multiple build systems present",
      evidence: signals.buildSystems.map((b) => b.kind).join(", "),
    });
  }

  return { strengths, watchOuts, missing };
}

function buildAnalyserReport(args: {
  workItemId: string;
  projectId: string;
  signals: StackSignals;
  fit: { descriptor: string };
  goldStandard: AnalyserReportBlock["atAGlance"]["nearestNeighbours"];
  recommendation: AnalyserReportBlock["recommendation"];
  detectorErrors: AnalyserReportBlock["detectorErrors"];
}): AnalyserReportBlock {
  const stack: string[] = [];
  for (const b of args.signals.buildSystems) {
    stack.push(b.kind);
    if (b.packageManager) stack.push(b.packageManager);
  }
  for (const t of args.signals.testFrameworks) stack.push(t.framework);
  if (args.signals.ci.provider !== "none") stack.push(args.signals.ci.provider);

  const metadata: string[] = [];
  if (args.signals.defaultBranch)
    metadata.push(`${args.signals.defaultBranch} branch`);
  if (typeof args.signals.fileCount === "number")
    metadata.push(`${args.signals.fileCount} files`);
  if (typeof args.signals.totalBytes === "number")
    metadata.push(`${formatBytes(args.signals.totalBytes)}`);

  const findings = buildFindings(args.signals);

  return {
    type: "analyser_report",
    entityType: "work_item",
    entityId: args.workItemId,
    projectId: args.projectId,
    atAGlance: {
      stack,
      metadata,
      looksLike: args.fit.descriptor,
      nearestNeighbours: args.goldStandard,
    },
    strengths: findings.strengths,
    watchOuts: findings.watchOuts,
    missing: findings.missing,
    recommendation: args.recommendation,
    status: "submitted",
    detectorErrors: args.detectorErrors,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function collectDetectorErrors(
  prior: Record<string, Record<string, unknown>>,
): Array<{ detector: string; message: string }> {
  const errors: Array<{ detector: string; message: string }> = [];
  for (const stepId of [
    STEP_IDS.detectBuildSystem,
    STEP_IDS.detectTestFramework,
    STEP_IDS.detectCI,
    STEP_IDS.detectHarness,
  ]) {
    const out = prior[stepId];
    if (!out) continue;
    for (const value of Object.values(out)) {
      if (
        value &&
        typeof value === "object" &&
        "_detectorError" in value
      ) {
        const detail = (value as Record<string, unknown>)._detectorError as {
          detector: string;
          message: string;
        };
        if (detail) errors.push(detail);
      }
    }
  }
  return errors;
}

function readCloneError(
  prior: Record<string, Record<string, unknown>>,
): { stage: string; reason: string; message: string } | undefined {
  const out = prior[STEP_IDS.cloneAndScan];
  if (!out) return undefined;
  const err = out["clone-error"];
  if (!err || typeof err !== "object") return undefined;
  return err as { stage: string; reason: string; message: string };
}

export async function runSurfaceReport(
  stepRunId: string | undefined,
  ctx: OnboardingHandlerContext,
): Promise<StepExecutionResult> {
  if (!stepRunId && !isTestMode()) return rejectNoStepRunId("surface-report");

  const prior = await readPriorStepOutputs(ctx.processRunId);
  const clone = readCloneResult(prior);
  const cloneError = readCloneError(prior);

  try {
    const [project] = await db
      .select({ id: schema.projects.id, slug: schema.projects.slug })
      .from(schema.projects)
      .where(eq(schema.projects.id, ctx.projectId))
      .limit(1);
    if (!project) {
      return {
        outputs: {},
        logs: [`[onboarding] surface-report: project ${ctx.projectId} not found`],
      };
    }

    // Find or create the onboarding workItem (Brief 225 placeholder is fully
    // REPLACED — both versions don't coexist at runtime per Brief 226 §AC #7).
    const existing = await db
      .select({ id: schema.workItems.id })
      .from(schema.workItems)
      .where(
        and(
          eq(schema.workItems.projectId, project.id),
          eq(schema.workItems.source, "system_generated"),
        ),
      )
      .limit(1);

    let workItemId: string;

    if (cloneError) {
      // Clone failed — recordCloneError already wrote harness_decisions /
      // activities. Make sure a workItem exists in briefState='blocked' for
      // the chat-col Server Component to render the AlertBlock against. On
      // retry-against-existing-row, flip the row's briefState to blocked
      // even if a prior successful run had left it in 'backlog' (Brief 226
      // dev-review MEDIUM #2 fix).
      const blockedBody = `Clone failed: ${cloneError.message}`;
      const blockedTitle = `Onboarding report for ${project.slug}`;
      if (existing.length > 0) {
        workItemId = existing[0].id;
        await db
          .update(schema.workItems)
          .set({
            title: blockedTitle,
            body: blockedBody,
            briefState: "blocked",
            updatedAt: new Date(),
            stateChangedAt: new Date(),
          })
          .where(eq(schema.workItems.id, workItemId));
      } else {
        const inserted = await db
          .insert(schema.workItems)
          .values({
            type: "feature",
            content: blockedTitle,
            source: "system_generated",
            projectId: project.id,
            title: blockedTitle,
            body: blockedBody,
            briefState: "blocked",
          })
          .returning({ id: schema.workItems.id });
        workItemId = inserted[0].id;
      }
      return {
        outputs: {
          "report-work-item-id": workItemId,
          "clone-error": cloneError,
        },
        logs: [
          `[onboarding] surface-report: clone failed (${cloneError.reason}) — workItem=${workItemId} marked blocked`,
        ],
      };
    }

    const signals = assembleSignals(prior);
    // Brief 226 dev-review MEDIUM #5: defensive fallbacks recompute scoring
    // inline if the upstream step output is missing. Log when this fires —
    // a missing step output usually indicates the YAML lost a step or the
    // step crashed without writing outputs. Silent recovery would hide that.
    const fitOut = prior[STEP_IDS.scorePersonaFit]?.["persona-fit"] as
      | { descriptor: string }
      | undefined;
    if (!fitOut) {
      console.warn(
        `[onboarding] surface-report: ${STEP_IDS.scorePersonaFit} output missing, recomputing inline (process_run=${ctx.processRunId})`,
      );
    }
    const fit = fitOut ?? scorePersonaFit(signals);

    const goldOut = prior[STEP_IDS.matchGoldStandard]?.["gold-standard"] as
      | AnalyserReportBlock["atAGlance"]["nearestNeighbours"]
      | undefined;
    if (!goldOut) {
      console.warn(
        `[onboarding] surface-report: ${STEP_IDS.matchGoldStandard} output missing, recomputing inline (process_run=${ctx.processRunId})`,
      );
    }
    const gold = goldOut ?? matchGoldStandard(signals);

    const recommendationOut = prior[STEP_IDS.recommendRunnerTier]?.recommendation as
      | AnalyserReportBlock["recommendation"]
      | undefined;
    if (!recommendationOut) {
      console.warn(
        `[onboarding] surface-report: ${STEP_IDS.recommendRunnerTier} output missing, recomputing inline (process_run=${ctx.processRunId})`,
      );
    }
    const recommendation =
      recommendationOut ?? {
        runner: recommendRunner(signals),
        trustTier: recommendTrustTier(signals),
      };
    const detectorErrors = collectDetectorErrors(prior);

    const title = `Onboarding report for ${project.slug}`;

    // Brief 226 dev-review MEDIUM #1 — collapse the INSERT-then-UPDATE
    // pattern into a single statement so workItems.context is never
    // observably null between the two writes. Strategy: pre-allocate the
    // workItem id, build the report against the pre-allocated id, then
    // INSERT (or UPDATE existing row) with `context` populated in one go.
    workItemId = existing.length > 0 ? existing[0].id : randomUUID();
    const finalReport = buildAnalyserReport({
      workItemId,
      projectId: project.id,
      signals,
      fit,
      goldStandard: gold,
      recommendation,
      detectorErrors,
    });
    const body = buildMarkdownBody(finalReport);

    if (existing.length > 0) {
      await db
        .update(schema.workItems)
        .set({
          title,
          body,
          briefState: "backlog",
          context: { analyserReport: finalReport } as Record<string, unknown>,
          updatedAt: new Date(),
          stateChangedAt: new Date(),
        })
        .where(eq(schema.workItems.id, workItemId));
    } else {
      await db.insert(schema.workItems).values({
        id: workItemId,
        type: "feature",
        content: title,
        source: "system_generated",
        projectId: project.id,
        title,
        body,
        briefState: "backlog",
        context: { analyserReport: finalReport } as Record<string, unknown>,
      });
    }

    if (stepRunId) {
      await db.insert(schema.harnessDecisions).values({
        processRunId: ctx.processRunId,
        stepRunId,
        trustTier: "supervised",
        trustAction: "advance",
        reviewPattern: [],
        reviewResult: detectorErrors.length === 0 ? "pass" : "flag",
        reviewDetails: { analyserReport: finalReport, workItemId },
      });
    }

    return {
      outputs: {
        "report-work-item-id": workItemId,
        "analyser-report": finalReport,
      },
      logs: [
        `[onboarding] surface-report wrote analyser report for ${project.slug} (workItem=${workItemId}, detectorErrors=${detectorErrors.length})`,
      ],
    };
  } finally {
    // Cleanup the clone dir on success AND on parent throw (Brief 226
    // §Constraints — try/finally + cleanup-on-boot).
    cleanupAnalyserDir(clone?.tempDir);
  }
}

function buildMarkdownBody(report: AnalyserReportBlock): string {
  const lines: string[] = [];
  lines.push(`**At a glance**`);
  if (report.atAGlance.stack.length)
    lines.push(`Stack: ${report.atAGlance.stack.join(", ")}`);
  if (report.atAGlance.metadata.length)
    lines.push(`${report.atAGlance.metadata.join(" · ")}`);
  if (report.atAGlance.looksLike)
    lines.push(`Looks like: ${report.atAGlance.looksLike}`);
  if (report.atAGlance.nearestNeighbours.length) {
    lines.push(
      `Closest matches: ${report.atAGlance.nearestNeighbours.map((n) => n.name).join(", ")}`,
    );
  }
  const renderList = (label: string, items: Finding[]) => {
    if (!items.length) return;
    lines.push(``);
    lines.push(`**${label}**`);
    for (const f of items) {
      const ev = f.evidence ? ` _(${f.evidence})_` : "";
      lines.push(`- ${f.text}${ev}`);
    }
  };
  renderList("Strengths", report.strengths);
  renderList("Watch-outs", report.watchOuts);
  renderList("Missing", report.missing);
  lines.push(``);
  lines.push(`**Recommendation**`);
  lines.push(
    `Runner: \`${report.recommendation.runner.kind}\` — ${report.recommendation.runner.rationale}`,
  );
  lines.push(
    `Trust tier: \`${report.recommendation.trustTier.tier}\` — ${report.recommendation.trustTier.rationale}`,
  );
  if (report.detectorErrors && report.detectorErrors.length) {
    lines.push(``);
    lines.push(
      `_Detector partial failures: ${report.detectorErrors.map((e) => e.detector).join(", ")}_`,
    );
  }
  return lines.join("\n");
}

export const executeOnboardingSurfaceReport: SystemAgentHandler = async (
  inputs,
) => {
  const { stepRunId, ctx } = readContext(inputs);
  return runSurfaceReport(stepRunId, ctx);
};
