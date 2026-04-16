/**
 * Trust State Computation — Phase 3a
 *
 * Computes trust metrics from existing harness data using a fixed sliding window.
 * No behavior changes — trust tiers remain static. Phase 3b adds tier dynamics.
 *
 * Signal sources (Insight-009 scoping):
 * - Human feedback: approve/edit/reject from `feedback` table (primary)
 * - Review pattern: pass/flag/retry from `harnessDecisions` table (supporting)
 * - Script/system: pass/fail from `stepRuns` table (supporting)
 *
 * Provenance:
 * - Fixed sliding window: Discourse TL3 (100-day rolling window)
 * - Multi-source signal weighting: Insight-009, OpenSSF Scorecard
 * - Event-sourced aggregation: Paperclip costEvents pattern
 */

import { db, schema } from "../db";
import { eq, desc, inArray, and } from "drizzle-orm";
import type { TrustTier, TrustSuggestionStatus } from "../db/schema";
import { SPOT_CHECK_RATE } from "./trust-constants";
import type { TrustMilestoneBlock, ActionDef } from "./content-blocks";
import { computeCorrectionRates, formatCorrectionEvidence } from "./harness-handlers/feedback-recorder";

// ============================================================
// Types
// ============================================================

export interface TrustState {
  // Window definition
  windowSize: number;
  runsInWindow: number;
  windowStart: Date | null;

  // Human feedback metrics (AC-8)
  humanReviews: number;
  approvals: number;
  edits: number;
  rejections: number;
  approvalRate: number;
  correctionRate: number;
  editSeverity: {
    formatting: number;
    correction: number;
    revision: number;
    rewrite: number;
  };

  // Automated signal metrics (AC-9)
  reviewPatternPasses: number;
  reviewPatternFlags: number;
  scriptPasses: number;
  scriptFailures: number;
  autoCheckPassRate: number;

  // Human-reviewer agreement (AC-10)
  humanAgreedWithFlag: number;
  humanOverrodeFlag: number;

  // Derived (AC-11)
  consecutiveCleanRuns: number;
  trend: "improving" | "stable" | "declining";
  lastRejectionRunId: string | null;

  // Sub-window metrics (last 10 runs — for downgrade triggers + upgrade checks)
  subWindowRejections: number;
  subWindowCorrectionRate: number;
  subWindowAutoCheckFailRate: number;

  // Grace period (Phase 3b)
  gracePeriodRemaining: number;

  // Meta
  computedAt: Date;
}

const DEFAULT_WINDOW_SIZE = 20;
const SUB_WINDOW_SIZE = 10;

// ============================================================
// Main computation (AC-7)
// ============================================================

/**
 * Compute trust state for a process by aggregating signals over a sliding window.
 *
 * AC-7: Aggregates signals from feedback + harnessDecisions + stepRuns
 *        over configured window (default 20 runs).
 */
export async function computeTrustState(
  processId: string,
  windowSize: number = DEFAULT_WINDOW_SIZE,
): Promise<TrustState> {
  // Get the last N completed runs for this process
  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, processId))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(windowSize);

  const runIds = runs.map((r) => r.id);
  const runsInWindow = runs.length;
  const windowStart = runs.length > 0 ? runs[runs.length - 1].createdAt : null;

  // If no runs, return empty state
  if (runIds.length === 0) {
    return emptyTrustState(windowSize);
  }

  // Fetch all outputs for these runs (needed for feedback → run mapping)
  const outputsForRuns = await getOutputsForRuns(runIds);
  const outputToRunId = new Map(outputsForRuns.map((o) => [o.id, o.processRunId]));
  const outputToStepRunId = new Map(
    outputsForRuns.filter((o) => o.stepRunId).map((o) => [o.id, o.stepRunId!]),
  );

  // Fetch all feedback for outputs in these runs
  const feedbackRows = await getFeedbackForOutputs(outputsForRuns.map((o) => o.id));

  // Fetch all harness decisions for these runs
  const decisions = await getHarnessDecisionsForRuns(runIds);

  // Fetch all step runs for these runs
  const steps = await getStepRunsForRuns(runIds);

  // --- Human feedback metrics (AC-8) ---
  const humanReviews = feedbackRows.length;
  const approvals = feedbackRows.filter((f) => f.type === "approve").length;
  const edits = feedbackRows.filter((f) => f.type === "edit").length;
  const rejections = feedbackRows.filter((f) => f.type === "reject").length;
  const approvalRate = humanReviews > 0 ? approvals / humanReviews : 0;
  const correctionRate =
    humanReviews > 0 ? (edits + rejections) / humanReviews : 0;

  const editSeverity = {
    formatting: feedbackRows.filter(
      (f) => f.type === "edit" && f.editSeverity === "formatting",
    ).length,
    correction: feedbackRows.filter(
      (f) => f.type === "edit" && f.editSeverity === "correction",
    ).length,
    revision: feedbackRows.filter(
      (f) => f.type === "edit" && f.editSeverity === "revision",
    ).length,
    rewrite: feedbackRows.filter(
      (f) => f.type === "edit" && f.editSeverity === "rewrite",
    ).length,
  };

  // --- Automated signal metrics (AC-9) ---
  const reviewPatternPasses = decisions.filter(
    (d) => d.reviewResult === "pass",
  ).length;
  const reviewPatternFlags = decisions.filter(
    (d) => d.reviewResult === "flag",
  ).length;
  const scriptSteps = steps.filter((s) => s.executorType === "script");
  const scriptPasses = scriptSteps.filter(
    (s) => s.status === "approved",
  ).length;
  const scriptFailures = scriptSteps.filter(
    (s) => s.status === "failed",
  ).length;
  const autoCheckTotal =
    reviewPatternPasses + reviewPatternFlags + scriptFailures;
  const autoCheckPassRate =
    autoCheckTotal > 0 ? reviewPatternPasses / autoCheckTotal : 1;

  // --- Human-reviewer agreement (AC-10) ---
  // Find steps that were flagged by review pattern, then check human feedback.
  // Uses preloaded output→stepRunId mapping (fixes N+1 query).
  const flaggedStepRunIds = new Set(
    decisions.filter((d) => d.reviewResult === "flag").map((d) => d.stepRunId),
  );

  let humanAgreedWithFlag = 0;
  let humanOverrodeFlag = 0;

  for (const fb of feedbackRows) {
    const stepRunId = outputToStepRunId.get(fb.outputId);
    if (stepRunId && flaggedStepRunIds.has(stepRunId)) {
      if (fb.type === "edit" || fb.type === "reject") {
        humanAgreedWithFlag++;
      } else if (fb.type === "approve") {
        humanOverrodeFlag++;
      }
    }
  }

  // --- Derived metrics (AC-11) ---

  // Consecutive clean runs: count backwards from most recent
  const consecutiveCleanRuns = computeConsecutiveClean(runs, feedbackRows, outputToRunId);

  // Last rejection (uses preloaded output→run mapping)
  const lastRejection = feedbackRows.find((f) => f.type === "reject");
  const lastRejectionRunId = lastRejection
    ? (outputToRunId.get(lastRejection.outputId) ?? null)
    : null;

  // Trend: compare first-half vs second-half approval rates
  const trend = computeTrend(feedbackRows);

  // --- Sub-window metrics (last 10 runs) for AC-3 and AC-6 ---
  const subWindowRunIds = new Set(runs.slice(0, SUB_WINDOW_SIZE).map((r) => r.id));
  const subWindowOutputIds = outputsForRuns
    .filter((o) => subWindowRunIds.has(o.processRunId))
    .map((o) => o.id);
  const subWindowFeedback = feedbackRows.filter((f) =>
    subWindowOutputIds.includes(f.outputId),
  );
  const subWindowDecisions = decisions.filter((d) =>
    subWindowRunIds.has(d.processRunId),
  );

  const subWindowRejections = subWindowFeedback.filter(
    (f) => f.type === "reject",
  ).length;
  const subWindowHumanReviews = subWindowFeedback.length;
  const subWindowEdits = subWindowFeedback.filter(
    (f) => f.type === "edit",
  ).length;
  const subWindowCorrectionRate =
    subWindowHumanReviews > 0
      ? (subWindowEdits + subWindowRejections) / subWindowHumanReviews
      : 0;
  const subWindowReviewPasses = subWindowDecisions.filter(
    (d) => d.reviewResult === "pass",
  ).length;
  const subWindowReviewFlags = subWindowDecisions.filter(
    (d) => d.reviewResult === "flag",
  ).length;
  const subWindowScriptSteps = steps.filter(
    (s) => s.executorType === "script" && subWindowRunIds.has(s.processRunId),
  );
  const subWindowScriptFailures = subWindowScriptSteps.filter(
    (s) => s.status === "failed",
  ).length;
  const subWindowAutoTotal =
    subWindowReviewPasses + subWindowReviewFlags + subWindowScriptFailures;
  const subWindowAutoCheckFailRate =
    subWindowAutoTotal > 0
      ? (subWindowReviewFlags + subWindowScriptFailures) / subWindowAutoTotal
      : 0;

  // --- Grace period (Phase 3b) ---
  const gracePeriodRemaining = await computeGracePeriod(processId, runsInWindow, runs);

  return {
    windowSize,
    runsInWindow,
    windowStart,
    humanReviews,
    approvals,
    edits,
    rejections,
    approvalRate,
    correctionRate,
    editSeverity,
    reviewPatternPasses,
    reviewPatternFlags,
    scriptPasses,
    scriptFailures,
    autoCheckPassRate,
    humanAgreedWithFlag,
    humanOverrodeFlag,
    consecutiveCleanRuns,
    trend,
    lastRejectionRunId,
    subWindowRejections,
    subWindowCorrectionRate,
    subWindowAutoCheckFailRate,
    gracePeriodRemaining,
    computedAt: new Date(),
  };
}

/**
 * Compute trust state and cache it in processes.trustData.
 *
 * AC-13: Recomputed on every trust CLI call or after feedback is recorded.
 */
export async function computeAndCacheTrustState(
  processId: string,
  windowSize: number = DEFAULT_WINDOW_SIZE,
): Promise<TrustState> {
  const state = await computeTrustState(processId, windowSize);

  await db
    .update(schema.processes)
    .set({
      trustData: state as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(schema.processes.id, processId));

  return state;
}

// ============================================================
// Helpers
// ============================================================

function emptyTrustState(windowSize: number): TrustState {
  return {
    windowSize,
    runsInWindow: 0,
    windowStart: null,
    humanReviews: 0,
    approvals: 0,
    edits: 0,
    rejections: 0,
    approvalRate: 0,
    correctionRate: 0,
    editSeverity: { formatting: 0, correction: 0, revision: 0, rewrite: 0 },
    reviewPatternPasses: 0,
    reviewPatternFlags: 0,
    scriptPasses: 0,
    scriptFailures: 0,
    autoCheckPassRate: 1,
    humanAgreedWithFlag: 0,
    humanOverrodeFlag: 0,
    consecutiveCleanRuns: 0,
    trend: "stable",
    lastRejectionRunId: null,
    subWindowRejections: 0,
    subWindowCorrectionRate: 0,
    subWindowAutoCheckFailRate: 0,
    gracePeriodRemaining: 0,
    computedAt: new Date(),
  };
}

async function getOutputsForRuns(runIds: string[]) {
  if (runIds.length === 0) return [];
  return db
    .select()
    .from(schema.processOutputs)
    .where(inArray(schema.processOutputs.processRunId, runIds));
}

async function getFeedbackForOutputs(outputIds: string[]) {
  if (outputIds.length === 0) return [];
  return db
    .select()
    .from(schema.feedback)
    .where(inArray(schema.feedback.outputId, outputIds))
    .orderBy(desc(schema.feedback.createdAt));
}

async function getHarnessDecisionsForRuns(runIds: string[]) {
  if (runIds.length === 0) return [];
  return db
    .select()
    .from(schema.harnessDecisions)
    .where(inArray(schema.harnessDecisions.processRunId, runIds));
}

async function getStepRunsForRuns(runIds: string[]) {
  if (runIds.length === 0) return [];
  return db
    .select()
    .from(schema.stepRuns)
    .where(inArray(schema.stepRuns.processRunId, runIds));
}

/**
 * Count consecutive clean runs from most recent backwards.
 * A run is "clean" if all its feedback is approve/auto_approve (no edits, no rejections).
 * Uses output→run mapping to properly count runs, not individual feedback entries.
 */
function computeConsecutiveClean(
  runs: { id: string }[],
  feedbackRows: { type: string; outputId: string }[],
  outputToRunId: Map<string, string>,
): number {
  // Build set of run IDs that have corrections
  const runsWithCorrections = new Set<string>();
  for (const fb of feedbackRows) {
    if (fb.type === "edit" || fb.type === "reject") {
      const runId = outputToRunId.get(fb.outputId);
      if (runId) runsWithCorrections.add(runId);
    }
  }

  // Runs are ordered by createdAt DESC (most recent first).
  // Count consecutive runs without corrections from the front.
  let count = 0;
  for (const run of runs) {
    if (runsWithCorrections.has(run.id)) break;
    count++;
  }
  return count;
}

/**
 * Compute trend by comparing first-half vs second-half approval rates.
 *
 * AC-11: improving if second-half > first-half by >5pp;
 *        declining if second-half < first-half by >5pp;
 *        stable otherwise.
 */
function computeTrend(
  feedbackRows: { type: string }[],
): "improving" | "stable" | "declining" {
  if (feedbackRows.length < 4) return "stable";

  const mid = Math.floor(feedbackRows.length / 2);
  // feedbackRows are ordered by createdAt DESC, so:
  // firstHalf = more recent, secondHalf = older (reversed for our calculation)
  const recentHalf = feedbackRows.slice(0, mid);
  const olderHalf = feedbackRows.slice(mid);

  const approvalRate = (rows: { type: string }[]) =>
    rows.length > 0
      ? rows.filter((f) => f.type === "approve").length / rows.length
      : 0;

  const recentRate = approvalRate(recentHalf);
  const olderRate = approvalRate(olderHalf);
  const diff = recentRate - olderRate;

  if (diff > 0.05) return "improving";
  if (diff < -0.05) return "declining";
  return "stable";
}

/**
 * Format trust state as human-readable CLI output.
 *
 * AC-12: Matches the wireframe format from the brief.
 */
export function formatTrustState(
  processName: string,
  trustTier: TrustTier,
  state: TrustState,
): string {
  const lines: string[] = [];

  lines.push(`Trust Data — ${processName} (${trustTier})`);
  lines.push("");
  lines.push(
    `  Window: last ${state.windowSize} runs (${state.runsInWindow} available)`,
  );
  lines.push("");

  // Human reviews
  lines.push(`  Human reviews:     ${state.humanReviews} total`);
  if (state.humanReviews > 0) {
    lines.push(
      `    Approved clean:  ${state.approvals} (${pct(state.approvalRate)})`,
    );
    const editParts: string[] = [];
    if (state.editSeverity.formatting > 0)
      editParts.push(`formatting: ${state.editSeverity.formatting}`);
    if (state.editSeverity.correction > 0)
      editParts.push(`correction: ${state.editSeverity.correction}`);
    if (state.editSeverity.revision > 0)
      editParts.push(`revision: ${state.editSeverity.revision}`);
    if (state.editSeverity.rewrite > 0)
      editParts.push(`rewrite: ${state.editSeverity.rewrite}`);
    const editDetail =
      editParts.length > 0 ? ` (${editParts.join(", ")})` : "";
    lines.push(`    Edited:          ${state.edits}${editDetail}`);
    lines.push(`    Rejected:        ${state.rejections}`);
  }
  lines.push("");

  // Automated checks
  const totalAutoChecks =
    state.reviewPatternPasses + state.reviewPatternFlags;
  lines.push(`  Automated checks:  ${totalAutoChecks > 0 ? `${state.runsInWindow} runs` : "none"}`);
  if (totalAutoChecks > 0) {
    lines.push(
      `    Review pass:     ${state.reviewPatternPasses} (${pct(state.reviewPatternPasses / totalAutoChecks)})`,
    );
    lines.push(`    Review flag:     ${state.reviewPatternFlags}`);
  }
  if (state.scriptPasses + state.scriptFailures > 0) {
    const scriptTotal = state.scriptPasses + state.scriptFailures;
    lines.push(
      `    Script pass:     ${state.scriptPasses}/${scriptTotal} (${pct(state.scriptPasses / scriptTotal)})`,
    );
  }
  lines.push("");

  // Human-reviewer agreement
  if (state.humanAgreedWithFlag + state.humanOverrodeFlag > 0) {
    lines.push(`  Reviewer agreement:`);
    lines.push(`    Agreed w/ flag:  ${state.humanAgreedWithFlag}`);
    lines.push(`    Overrode flag:   ${state.humanOverrodeFlag}`);
    lines.push("");
  }

  // Derived
  lines.push(
    `  Correction rate:   ${pct(state.correctionRate)} (${state.edits + state.rejections} of ${state.humanReviews})`,
  );
  lines.push(`  Consecutive clean: ${state.consecutiveCleanRuns} runs`);
  const trendSymbol =
    state.trend === "improving"
      ? "improving ↑"
      : state.trend === "declining"
        ? "declining ↓"
        : "stable →";
  lines.push(`  Trend:             ${trendSymbol}`);

  return lines.join("\n");
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// ============================================================
// Phase 3b: Upgrade Eligibility (AC-2, AC-3, AC-4)
// ============================================================

const GRACE_PERIOD_RUNS = 5;
const GRACE_SAFETY_VALVE_RATE = 0.5;

export interface UpgradeCondition {
  name: string;
  threshold: string;
  actual: string;
  passed: boolean;
}

export interface UpgradeEligibility {
  eligible: boolean;
  conditions: UpgradeCondition[];
  targetTier: TrustTier | null;
}

/**
 * Check upgrade eligibility for a process.
 *
 * AC-2: Evaluates all conjunctive conditions for the next tier.
 * AC-3: supervised → spot_checked conditions.
 * AC-4: spot_checked → autonomous conditions.
 *
 * Critical tier never upgrades. Autonomous has no next tier.
 */
export function checkUpgradeEligibility(
  currentTier: TrustTier,
  state: TrustState,
  runsAtCurrentTier: number,
): UpgradeEligibility {
  if (currentTier === "critical" || currentTier === "autonomous") {
    return { eligible: false, conditions: [], targetTier: null };
  }

  if (currentTier === "supervised") {
    return checkSupervisedToSpotChecked(state);
  }

  return checkSpotCheckedToAutonomous(state, runsAtCurrentTier);
}

/**
 * AC-3: supervised → spot_checked
 * - ≥10 runs in window
 * - ≥85% approval rate
 * - 0 rejections in last 10 runs
 * - ≥90% auto-check pass rate
 * - Correction trend not increasing
 */
function checkSupervisedToSpotChecked(state: TrustState): UpgradeEligibility {
  const conditions: UpgradeCondition[] = [
    {
      name: "Minimum runs",
      threshold: "≥ 10",
      actual: String(state.runsInWindow),
      passed: state.runsInWindow >= 10,
    },
    {
      name: "Approval rate",
      threshold: "≥ 85%",
      actual: pct(state.approvalRate),
      passed: state.approvalRate >= 0.85,
    },
    {
      name: "No rejections in last 10",
      threshold: "0",
      actual: String(state.subWindowRejections),
      passed: state.subWindowRejections === 0,
    },
    {
      name: "Auto-check pass rate",
      threshold: "≥ 90%",
      actual: pct(state.autoCheckPassRate),
      passed: state.autoCheckPassRate >= 0.9,
    },
    {
      name: "Correction trend",
      threshold: "Not increasing",
      actual: state.trend,
      passed: state.trend !== "declining",
    },
  ];

  return {
    eligible: conditions.every((c) => c.passed),
    conditions,
    targetTier: "spot_checked",
  };
}

/**
 * AC-4: spot_checked → autonomous
 * - ≥20 runs at spot_checked
 * - ≥95% sampled approval rate
 * - ≤5% correction rate
 * - 0 rejections in window
 * - 100% auto-check pass rate
 * - 0 rewrites in window
 */
function checkSpotCheckedToAutonomous(
  state: TrustState,
  runsAtCurrentTier: number,
): UpgradeEligibility {
  const conditions: UpgradeCondition[] = [
    {
      name: "Runs at spot_checked",
      threshold: "≥ 20",
      actual: String(runsAtCurrentTier),
      passed: runsAtCurrentTier >= 20,
    },
    {
      name: "Approval rate (sampled)",
      threshold: "≥ 95%",
      actual: pct(state.approvalRate),
      passed: state.approvalRate >= 0.95,
    },
    {
      name: "Correction rate",
      threshold: "≤ 5%",
      actual: pct(state.correctionRate),
      passed: state.correctionRate <= 0.05,
    },
    {
      name: "No rejections",
      threshold: "0",
      actual: String(state.rejections),
      passed: state.rejections === 0,
    },
    {
      name: "Auto-check pass rate",
      threshold: "100%",
      actual: pct(state.autoCheckPassRate),
      passed: state.autoCheckPassRate >= 1.0,
    },
    {
      name: "No rewrites",
      threshold: "0",
      actual: String(state.editSeverity.rewrite),
      passed: state.editSeverity.rewrite === 0,
    },
  ];

  return {
    eligible: conditions.every((c) => c.passed),
    conditions,
    targetTier: "autonomous",
  };
}

// ============================================================
// Phase 3b: Downgrade Triggers (AC-5, AC-6)
// ============================================================

export interface DowngradeTrigger {
  name: string;
  threshold: string;
  actual: string;
}

export interface DowngradeCheck {
  triggered: boolean;
  triggers: DowngradeTrigger[];
}

/**
 * Check downgrade triggers for a process.
 *
 * AC-5: Evaluates disjunctive conditions.
 * AC-6: correction rate >30% in last 10, any rejection, auto-check failure >20% in last 10.
 *
 * supervised and critical never downgrade.
 */
export function checkDowngradeTriggers(
  currentTier: TrustTier,
  state: TrustState,
): DowngradeCheck {
  if (currentTier === "supervised" || currentTier === "critical") {
    return { triggered: false, triggers: [] };
  }

  const triggers: DowngradeTrigger[] = [];

  // AC-6: "correction rate >30% in last 10 runs"
  if (state.subWindowCorrectionRate > 0.3) {
    triggers.push({
      name: "Correction rate spike (last 10)",
      threshold: "> 30%",
      actual: pct(state.subWindowCorrectionRate),
    });
  }

  // AC-6: "any rejection" (in full window — any rejection is a trigger)
  if (state.rejections > 0) {
    triggers.push({
      name: "Rejection detected",
      threshold: "0",
      actual: String(state.rejections),
    });
  }

  // AC-6: "auto-check failure >20% in last 10 runs"
  if (state.subWindowAutoCheckFailRate > 0.2) {
    triggers.push({
      name: "Auto-check failure rate (last 10)",
      threshold: "> 20%",
      actual: pct(state.subWindowAutoCheckFailRate),
    });
  }

  return {
    triggered: triggers.length > 0,
    triggers,
  };
}

// ============================================================
// Phase 3b: Grace Period (AC-7)
// ============================================================

/**
 * Compute grace period remaining by counting runs since last upgrade.
 *
 * AC-7: 5 runs after any upgrade. Grace suppresses downgrades
 * unless correction rate exceeds 50% (safety valve).
 */
async function computeGracePeriod(
  processId: string,
  _runsInWindow: number,
  runs: { id: string; createdAt: Date }[],
): Promise<number> {
  // Find the most recent upgrade (tier change with actor='human' — acceptances)
  const [lastUpgrade] = await db
    .select()
    .from(schema.trustChanges)
    .where(
      and(
        eq(schema.trustChanges.processId, processId),
        eq(schema.trustChanges.actor, "human"),
      ),
    )
    .orderBy(desc(schema.trustChanges.createdAt))
    .limit(1);

  if (!lastUpgrade) return 0;

  // Count runs after the upgrade timestamp
  const runsSinceUpgrade = runs.filter(
    (r) => r.createdAt > lastUpgrade.createdAt,
  ).length;

  return Math.max(0, GRACE_PERIOD_RUNS - runsSinceUpgrade);
}

/**
 * Check if grace period safety valve is triggered.
 *
 * AC-7: Immediate downgrade if correction rate exceeds 50% during grace.
 */
export function isGraceSafetyValveTriggered(state: TrustState): boolean {
  return state.gracePeriodRemaining > 0 && state.correctionRate > GRACE_SAFETY_VALVE_RATE;
}

// ============================================================
// Phase 3b: Runs at Current Tier
// ============================================================

/**
 * Count runs since the process was last upgraded to its current tier.
 * If no trust change exists, counts all runs (original tier).
 */
export async function countRunsAtCurrentTier(
  processId: string,
  currentTier: TrustTier,
): Promise<number> {
  // Find the most recent change TO the current tier
  const [lastChange] = await db
    .select()
    .from(schema.trustChanges)
    .where(
      and(
        eq(schema.trustChanges.processId, processId),
        eq(schema.trustChanges.toTier, currentTier),
      ),
    )
    .orderBy(desc(schema.trustChanges.createdAt))
    .limit(1);

  if (!lastChange) {
    // No change record — count all runs
    const allRuns = await db
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.processId, processId));
    return allRuns.length;
  }

  // Count runs after the tier change
  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, processId));

  return runs.filter((r) => r.createdAt > lastChange.createdAt).length;
}

// ============================================================
// Phase 3b: Tier Change Execution (AC-8, AC-9, AC-10, AC-11)
// ============================================================

/**
 * Execute a tier change: update process, record in trustChanges, log activity.
 *
 * AC-11: All tier changes recorded in trustChanges with full audit trail.
 */
export async function executeTierChange(params: {
  processId: string;
  fromTier: TrustTier;
  toTier: TrustTier;
  reason: string;
  actor: "human" | "system";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Update process trust tier
  await db
    .update(schema.processes)
    .set({
      trustTier: params.toTier,
      updatedAt: new Date(),
    })
    .where(eq(schema.processes.id, params.processId));

  // Record in immutable trust changes log
  await db.insert(schema.trustChanges).values({
    processId: params.processId,
    fromTier: params.fromTier,
    toTier: params.toTier,
    reason: params.reason,
    actor: params.actor,
    metadata: params.metadata ?? {},
  });

  // Determine direction
  const tierRank: Record<string, number> = { critical: 0, supervised: 1, spot_checked: 2, autonomous: 3 };
  const isDowngrade = (tierRank[params.toTier] ?? 0) < (tierRank[params.fromTier] ?? 0);

  // Brief 160 MP-5.2: Generate downgrade explanation milestone block
  let milestoneBlock: TrustMilestoneBlock | undefined;
  if (params.actor === "system" && isDowngrade) {
    const [process] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, params.processId))
      .limit(1);

    const triggers = (params.metadata?.triggers as DowngradeTrigger[]) ?? [];

    milestoneBlock = generateDowngradeExplanation({
      processName: process?.name ?? params.processId,
      fromTier: params.fromTier,
      toTier: params.toTier,
      triggers,
      processId: params.processId,
    });
  }

  // Activity log — include milestone block for briefing retrieval (Brief 160)
  await db.insert(schema.activities).values({
    action: "trust.tier_change",
    actorType: params.actor,
    entityType: "process",
    entityId: params.processId,
    metadata: {
      fromTier: params.fromTier,
      toTier: params.toTier,
      reason: params.reason,
      ...(milestoneBlock ? { milestoneBlock } : {}),
    },
  });

  // Recompute and cache trust state
  await computeAndCacheTrustState(params.processId);

  // Brief 108 AC8: Notify admin on system-initiated downgrades
  if (params.actor === "system" && isDowngrade) {
    const [process] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, params.processId))
      .limit(1);

    const triggers = (params.metadata?.triggers as Array<{ name: string; threshold: string; actual: string }>) ?? [];

    // Fire and forget — don't block trust evaluation on notification delivery
    import("./notify-admin").then(({ notifyAdminOfDowngrade }) =>
      notifyAdminOfDowngrade({
        userName: "Network user", // Process-level — no single user context available here
        processName: process?.name ?? params.processId,
        fromTier: params.fromTier,
        toTier: params.toTier,
        reason: params.reason,
        triggers,
      }).catch((err) => console.error("[trust] Admin notification failed:", err)),
    );
  }
}

/**
 * Create an upgrade suggestion.
 *
 * AC-8: Creates trustSuggestions row with status 'pending' and full evidence.
 */
export async function createUpgradeSuggestion(params: {
  processId: string;
  currentTier: TrustTier;
  suggestedTier: TrustTier;
  conditions: UpgradeCondition[];
}): Promise<string> {
  // Check if there's a previous rejected/dismissed suggestion for re-offer linking
  const [previousSuggestion] = await db
    .select()
    .from(schema.trustSuggestions)
    .where(
      and(
        eq(schema.trustSuggestions.processId, params.processId),
        eq(schema.trustSuggestions.suggestedTier, params.suggestedTier),
      ),
    )
    .orderBy(desc(schema.trustSuggestions.createdAt))
    .limit(1);

  const [suggestion] = await db
    .insert(schema.trustSuggestions)
    .values({
      processId: params.processId,
      currentTier: params.currentTier,
      suggestedTier: params.suggestedTier,
      evidence: params.conditions,
      status: "pending",
      previousSuggestionId: previousSuggestion?.id ?? null,
    })
    .returning();

  await db.insert(schema.activities).values({
    action: "trust.upgrade_suggested",
    actorType: "system",
    entityType: "process",
    entityId: params.processId,
    metadata: {
      suggestionId: suggestion.id,
      currentTier: params.currentTier,
      suggestedTier: params.suggestedTier,
    },
  });

  return suggestion.id;
}

/**
 * Get the pending upgrade suggestion for a process, if any.
 */
export async function getPendingSuggestion(processId: string) {
  const [suggestion] = await db
    .select()
    .from(schema.trustSuggestions)
    .where(
      and(
        eq(schema.trustSuggestions.processId, processId),
        eq(schema.trustSuggestions.status, "pending"),
      ),
    )
    .orderBy(desc(schema.trustSuggestions.createdAt))
    .limit(1);

  return suggestion ?? null;
}

/**
 * Accept an upgrade suggestion.
 *
 * AC-9: Updates trustTier, records in trustChanges, marks suggestion accepted.
 */
export async function acceptUpgradeSuggestion(
  suggestionId: string,
  comment?: string,
): Promise<void> {
  const [suggestion] = await db
    .select()
    .from(schema.trustSuggestions)
    .where(eq(schema.trustSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion || suggestion.status !== "pending") {
    throw new Error(`No pending suggestion found: ${suggestionId}`);
  }

  // Mark suggestion as accepted
  await db
    .update(schema.trustSuggestions)
    .set({
      status: "accepted" as TrustSuggestionStatus,
      decidedAt: new Date(),
      decidedBy: "human",
      decisionComment: comment ?? null,
    })
    .where(eq(schema.trustSuggestions.id, suggestionId));

  // Execute tier change
  await executeTierChange({
    processId: suggestion.processId,
    fromTier: suggestion.currentTier as TrustTier,
    toTier: suggestion.suggestedTier as TrustTier,
    reason: `Upgrade accepted: ${suggestion.currentTier} → ${suggestion.suggestedTier}`,
    actor: "human",
    metadata: { suggestionId, comment },
  });
}

/**
 * Reject an upgrade suggestion.
 *
 * AC-10: Marks suggestion as rejected; re-evaluation happens after next window.
 */
export async function rejectUpgradeSuggestion(
  suggestionId: string,
  comment?: string,
): Promise<void> {
  const [suggestion] = await db
    .select()
    .from(schema.trustSuggestions)
    .where(eq(schema.trustSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion || suggestion.status !== "pending") {
    throw new Error(`No pending suggestion found: ${suggestionId}`);
  }

  await db
    .update(schema.trustSuggestions)
    .set({
      status: "rejected" as TrustSuggestionStatus,
      decidedAt: new Date(),
      decidedBy: "human",
      decisionComment: comment ?? null,
    })
    .where(eq(schema.trustSuggestions.id, suggestionId));

  await db.insert(schema.activities).values({
    action: "trust.upgrade_rejected",
    actorType: "human",
    entityType: "process",
    entityId: suggestion.processId,
    metadata: { suggestionId, comment },
  });
}

/**
 * Dismiss a pending suggestion (e.g., when downgrade takes precedence).
 *
 * AC-7a: If a downgrade trigger fires while an upgrade suggestion is pending,
 * the suggestion is marked 'dismissed'.
 */
export async function dismissPendingSuggestion(
  processId: string,
  reason: string,
): Promise<void> {
  const pending = await getPendingSuggestion(processId);
  if (!pending) return;

  await db
    .update(schema.trustSuggestions)
    .set({
      status: "dismissed" as TrustSuggestionStatus,
      decidedAt: new Date(),
      decidedBy: "system",
      decisionComment: reason,
    })
    .where(eq(schema.trustSuggestions.id, pending.id));
}

/**
 * Override an auto-downgrade: restore previous tier.
 *
 * AC-12: Reverses auto-downgrade, records override, escalation after 3.
 */
export async function overrideDowngrade(
  processId: string,
  reason?: string,
): Promise<{ escalationWarning: boolean; consecutiveOverrides: number }> {
  // Find the most recent system downgrade
  const [lastDowngrade] = await db
    .select()
    .from(schema.trustChanges)
    .where(
      and(
        eq(schema.trustChanges.processId, processId),
        eq(schema.trustChanges.actor, "system"),
      ),
    )
    .orderBy(desc(schema.trustChanges.createdAt))
    .limit(1);

  if (!lastDowngrade) {
    throw new Error("No system downgrade found to override");
  }

  // Count consecutive overrides by looking at trust changes
  const recentChanges = await db
    .select()
    .from(schema.trustChanges)
    .where(eq(schema.trustChanges.processId, processId))
    .orderBy(desc(schema.trustChanges.createdAt))
    .limit(10);

  // Count consecutive override→downgrade pairs
  let consecutiveOverrides = 0;
  for (const change of recentChanges) {
    const meta = change.metadata as Record<string, unknown> | null;
    if (meta && meta.isOverride) {
      consecutiveOverrides++;
    } else if (change.actor === "system") {
      // Found a system downgrade that wasn't overridden yet — stop counting
      break;
    } else {
      break;
    }
  }

  // Execute the override (restore previous tier)
  await executeTierChange({
    processId,
    fromTier: lastDowngrade.toTier as TrustTier,
    toTier: lastDowngrade.fromTier as TrustTier,
    reason: reason
      ? `Override: ${reason}`
      : "Human override of auto-downgrade",
    actor: "human",
    metadata: {
      isOverride: true,
      overriddenDowngradeId: lastDowngrade.id,
      consecutiveOverrides: consecutiveOverrides + 1,
    },
  });

  const totalOverrides = consecutiveOverrides + 1;
  return {
    escalationWarning: totalOverrides >= 3,
    consecutiveOverrides: totalOverrides,
  };
}

// ============================================================
// Phase 3b: Trust Simulation (AC-13)
// ============================================================

export interface SimulationResult {
  tier: TrustTier;
  totalRuns: number;
  wouldBeReviewed: number;
  wouldNotBeReviewed: number;
  unreviewedResults: {
    passedAutoChecks: number;
    hadReviewFlags: number;
    neededCorrection: number;
  };
  reviewedResults: {
    approvedClean: number;
    edited: number;
    rejected: number;
  };
  missedCorrections: number;
}

/**
 * Simulate what would have happened at a different trust tier.
 *
 * AC-13: Replays sampling decisions using existing samplingHash data.
 * For supervised→spot_checked simulation, reuses hashes from harnessDecisions.
 */
export async function computeSimulation(
  processId: string,
  simulatedTier: TrustTier,
  windowSize: number = DEFAULT_WINDOW_SIZE,
): Promise<SimulationResult> {
  // Get runs in window
  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, processId))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(windowSize);

  const runIds = runs.map((r) => r.id);

  if (runIds.length === 0) {
    return emptySimulation(simulatedTier);
  }

  // Get harness decisions for sampling hash replay
  const decisions = await getHarnessDecisionsForRuns(runIds);

  // Get outputs + feedback for correction detection
  const outputs = await getOutputsForRuns(runIds);
  const outputIds = outputs.map((o) => o.id);
  const feedbackRows = await getFeedbackForOutputs(outputIds);

  // Build output→feedback map
  const feedbackByOutput = new Map<string, { type: string; editSeverity?: string | null }[]>();
  for (const fb of feedbackRows) {
    const existing = feedbackByOutput.get(fb.outputId) ?? [];
    existing.push({ type: fb.type, editSeverity: fb.editSeverity });
    feedbackByOutput.set(fb.outputId, existing);
  }

  // Build stepRun→output map (for mapping decisions to feedback)
  const outputByStepRun = new Map<string, string>();
  for (const o of outputs) {
    if (o.stepRunId) outputByStepRun.set(o.stepRunId, o.id);
  }

  let wouldBeReviewed = 0;
  let wouldNotBeReviewed = 0;
  let passedAutoChecks = 0;
  let hadReviewFlags = 0;
  let neededCorrection = 0;
  let approvedClean = 0;
  let edited = 0;
  let rejected = 0;

  for (const decision of decisions) {
    const reviewed = wouldBeReviewedAtTier(
      simulatedTier,
      decision.samplingHash,
      decision.reviewResult,
    );

    const outputId = outputByStepRun.get(decision.stepRunId);
    const fbs = outputId ? feedbackByOutput.get(outputId) ?? [] : [];
    const hasCorrection = fbs.some((f) => f.type === "edit" || f.type === "reject");

    if (reviewed) {
      wouldBeReviewed++;
      const cleanApprove = fbs.some((f) => f.type === "approve");
      const hasEdit = fbs.some((f) => f.type === "edit");
      const hasReject = fbs.some((f) => f.type === "reject");
      if (hasReject) rejected++;
      else if (hasEdit) edited++;
      else if (cleanApprove) approvedClean++;
    } else {
      wouldNotBeReviewed++;
      if (decision.reviewResult === "pass") passedAutoChecks++;
      if (decision.reviewResult === "flag") hadReviewFlags++;
      if (hasCorrection) neededCorrection++;
    }
  }

  return {
    tier: simulatedTier,
    totalRuns: decisions.length,
    wouldBeReviewed,
    wouldNotBeReviewed,
    unreviewedResults: {
      passedAutoChecks,
      hadReviewFlags,
      neededCorrection,
    },
    reviewedResults: {
      approvedClean,
      edited,
      rejected,
    },
    missedCorrections: neededCorrection,
  };
}

/**
 * Determine if a step would be reviewed at a given tier.
 * Replays the trust gate logic for simulation.
 */
function wouldBeReviewedAtTier(
  tier: TrustTier,
  samplingHash: string | null,
  reviewResult: string,
): boolean {
  switch (tier) {
    case "supervised":
    case "critical":
      return true;
    case "spot_checked": {
      if (reviewResult === "flag") return true;
      if (!samplingHash) return true; // No hash = assume reviewed
      const value = parseInt(samplingHash.slice(0, 8), 16) / 0xffffffff;
      return value < SPOT_CHECK_RATE;
    }
    case "autonomous":
      return reviewResult === "flag";
  }
}

// ============================================================
// Trust Milestone Blocks (Brief 160 MP-5.1 + MP-5.2)
// ============================================================

/**
 * Generate a trust upgrade celebration block.
 *
 * MP-5.1: Dedicated ContentBlock for trust milestone with evidence narrative,
 * distinct from regular suggestions. Includes accept/reject actions.
 *
 * Provenance: Discourse TL3 milestone notifications (pattern).
 */
export function generateUpgradeCelebration(params: {
  processName: string;
  currentTier: TrustTier;
  suggestedTier: TrustTier;
  state: TrustState;
  suggestionId: string;
}): TrustMilestoneBlock {
  const { processName, currentTier, suggestedTier, state, suggestionId } = params;

  // Build evidence narrative from concrete metrics
  const evidenceParts: string[] = [];
  evidenceParts.push(
    `${Math.round(state.approvalRate * 100)}% accurate over ${state.runsInWindow} runs`,
  );
  if (state.correctionRate > 0) {
    evidenceParts.push(`correction rate dropped to ${Math.round(state.correctionRate * 100)}%`);
  } else {
    evidenceParts.push("zero corrections needed");
  }
  if (state.consecutiveCleanRuns > 0) {
    evidenceParts.push(`${state.consecutiveCleanRuns} clean runs in a row`);
  }

  const tierLabels: Record<string, string> = {
    supervised: "supervised",
    spot_checked: "spot-checked",
    autonomous: "autonomous",
    critical: "critical",
  };

  const whatChanges = suggestedTier === "spot_checked"
    ? "I'd check in on about 1 in 5 outputs instead of every one."
    : "Only flagged outputs would come to you — everything else flows automatically.";

  const evidence = `${evidenceParts.join(", ")}. ${whatChanges}`;

  const actions: ActionDef[] = [
    {
      id: `trust-accept-${suggestionId}`,
      label: "Sounds good, let's do it",
      style: "primary",
      payload: { action: "trust_accept", suggestionId },
    },
    {
      id: `trust-reject-${suggestionId}`,
      label: "Not yet, keep checking everything",
      style: "secondary",
      payload: { action: "trust_reject", suggestionId },
    },
  ];

  return {
    type: "trust_milestone",
    milestoneType: "upgrade",
    processName,
    fromTier: tierLabels[currentTier] ?? currentTier,
    toTier: tierLabels[suggestedTier] ?? suggestedTier,
    evidence,
    actions,
  };
}

/**
 * Generate a trust downgrade explanation block.
 *
 * MP-5.2: Human-readable explanation with specific patterns that triggered
 * the downgrade. Warm tone, not punitive.
 *
 * Provenance: Discourse TL3 milestone notifications (pattern).
 */
export function generateDowngradeExplanation(params: {
  processName: string;
  fromTier: TrustTier;
  toTier: TrustTier;
  triggers: DowngradeTrigger[];
  processId: string;
}): TrustMilestoneBlock {
  const { processName, fromTier, toTier, triggers, processId } = params;

  const tierLabels: Record<string, string> = {
    supervised: "supervised",
    spot_checked: "spot-checked",
    autonomous: "autonomous",
    critical: "critical",
  };

  // Build warm explanation from triggers
  const explanationParts: string[] = [];
  for (const trigger of triggers) {
    if (trigger.name.includes("Correction rate")) {
      explanationParts.push("the last few outputs needed more corrections than usual");
    } else if (trigger.name.includes("Rejection")) {
      explanationParts.push("a recent output needed to be redone");
    } else if (trigger.name.includes("Auto-check")) {
      explanationParts.push("automated checks flagged some quality issues");
    } else {
      explanationParts.push(trigger.name.toLowerCase());
    }
  }

  const explanation = explanationParts.length > 0
    ? `I noticed ${explanationParts.join(" and ")} — so I'll check in more often until things settle back down.`
    : "I'll check in more often until things settle back down.";

  // Build evidence from trigger details
  const evidenceParts = triggers.map(
    (t) => `${t.name}: ${t.actual} (threshold: ${t.threshold})`,
  );
  const evidence = evidenceParts.join("; ");

  const actions: ActionDef[] = [
    {
      id: `trust-override-${processId}`,
      label: "These were edge cases — keep the previous level",
      style: "secondary",
      payload: { action: "trust_override", processId },
    },
  ];

  return {
    type: "trust_milestone",
    milestoneType: "downgrade",
    processName,
    fromTier: tierLabels[fromTier] ?? fromTier,
    toTier: tierLabels[toTier] ?? toTier,
    evidence,
    explanation,
    actions,
  };
}

function emptySimulation(tier: TrustTier): SimulationResult {
  return {
    tier,
    totalRuns: 0,
    wouldBeReviewed: 0,
    wouldNotBeReviewed: 0,
    unreviewedResults: { passedAutoChecks: 0, hadReviewFlags: 0, neededCorrection: 0 },
    reviewedResults: { approvedClean: 0, edited: 0, rejected: 0 },
    missedCorrections: 0,
  };
}

// ============================================================
// Phase 3b: Format helpers for CLI display
// ============================================================

export function formatUpgradeSuggestion(
  processName: string,
  suggestion: {
    suggestedTier: string;
    evidence: Array<{ name: string; threshold: string; actual: string; passed: boolean }>;
  },
  state: TrustState,
  /** Brief 159 MP-4.4: Optional correction rate evidence narrative */
  correctionEvidence?: string | null,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  ┌─────────────────────────────────────────────┐");
  lines.push("  │  UPGRADE SUGGESTION                         │");
  lines.push("  │                                             │");
  lines.push(`  │  Eligible for: ${suggestion.suggestedTier.padEnd(29)}│`);
  lines.push("  │                                             │");
  lines.push("  │  Evidence:                                  │");
  for (const cond of suggestion.evidence) {
    const mark = cond.passed ? "✓" : "✗";
    const line = `   ${mark} ${cond.name}: ${cond.actual} (${cond.threshold})`;
    lines.push(`  │${line.padEnd(45)}│`);
  }
  // Brief 159 MP-4.4: Correction rate evidence narrative
  if (correctionEvidence) {
    lines.push("  │                                             │");
    lines.push("  │  Learning effect:                           │");
    // Wrap long evidence lines
    const words = correctionEvidence.split(" ");
    let currentLine = "   ";
    for (const word of words) {
      if ((currentLine + word).length > 43) {
        lines.push(`  │${currentLine.padEnd(45)}│`);
        currentLine = "   " + word + " ";
      } else {
        currentLine += word + " ";
      }
    }
    if (currentLine.trim().length > 0) {
      lines.push(`  │${currentLine.padEnd(45)}│`);
    }
  }
  lines.push("  │                                             │");
  lines.push("  │  What changes:                              │");
  if (suggestion.suggestedTier === "spot_checked") {
    lines.push("  │   You'd review ~20% of outputs (1 in 5).   │");
    lines.push("  │   Automated checks continue on all outputs. │");
  } else if (suggestion.suggestedTier === "autonomous") {
    lines.push("  │   Only flagged outputs come to you.         │");
    lines.push("  │   Automated checks continue on all outputs. │");
  }
  lines.push("  │                                             │");
  lines.push("  │  Safety net:                                │");
  lines.push("  │   Auto-downgrade if correction rate > 30%.  │");
  lines.push("  │                                             │");
  lines.push(`  │  Run: pnpm cli trust accept ${processName.slice(0, 14).padEnd(14)} │`);
  lines.push(`  │  Or:  pnpm cli trust reject ${processName.slice(0, 14).padEnd(14)} │`);
  lines.push(`  │  Or:  pnpm cli trust ${processName.slice(0, 10)} --simulate  │`);
  lines.push("  └─────────────────────────────────────────────┘");
  return lines.join("\n");
}

/**
 * Fetch correction rate evidence for a process.
 * Brief 159 MP-4.4: Used by trust CLI and suggestion display.
 * Non-blocking — returns null on error.
 */
export async function getCorrectionEvidence(processId: string): Promise<string | null> {
  try {
    const rates = await computeCorrectionRates(processId);
    return formatCorrectionEvidence(rates);
  } catch {
    return null;
  }
}

export function formatDowngradeAlert(
  processName: string,
  fromTier: string,
  toTier: string,
  triggers: DowngradeTrigger[],
): string {
  const lines: string[] = [];
  lines.push(`  ⚠ TRUST DOWNGRADE: ${fromTier} → ${toTier}`);
  lines.push("");
  lines.push("  What happened:");
  for (const trigger of triggers) {
    lines.push(`    ${trigger.name}: ${trigger.actual} (threshold: ${trigger.threshold})`);
  }
  lines.push("");
  lines.push("  You now review every output.");
  lines.push("");
  lines.push(`  Override: pnpm cli trust override ${processName}`);
  lines.push("  (You believe these were edge cases — monitoring continues at previous tier)");
  return lines.join("\n");
}

export function formatSimulation(result: SimulationResult): string {
  const lines: string[] = [];
  lines.push(`Simulation: What if this process had been at ${result.tier}?`);
  lines.push("");
  lines.push(`  Analyzing last ${result.totalRuns} runs...`);
  lines.push("");
  lines.push(`  ${result.wouldNotBeReviewed} runs would NOT have been reviewed by you`);
  lines.push("  Of those:");
  lines.push(`    ✓ ${result.unreviewedResults.passedAutoChecks} passed all automated checks`);
  lines.push(`    ⚠ ${result.unreviewedResults.hadReviewFlags} had review flags`);
  lines.push(`    ✗ ${result.unreviewedResults.neededCorrection} had issues needing your correction`);
  lines.push("");
  lines.push(`  ${result.wouldBeReviewed} runs WOULD have been sampled for your review`);
  lines.push("  Of those:");
  lines.push(`    ✓ ${result.reviewedResults.approvedClean} approved clean`);
  lines.push(`    ✓ ${result.reviewedResults.edited} edited`);
  lines.push(`    ✗ ${result.reviewedResults.rejected} rejected`);
  lines.push("");
  if (result.missedCorrections === 0) {
    lines.push("  Result: No corrections would have been missed.");
  } else {
    lines.push(`  Result: ${result.missedCorrections} correction(s) would have been missed.`);
  }
  return lines.join("\n");
}
