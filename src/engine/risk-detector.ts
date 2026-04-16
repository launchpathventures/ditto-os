/**
 * Ditto — Risk Detector
 *
 * Detects operational risks from engine data. MVP scope:
 * 1. Temporal risk — work items with no activity > threshold
 * 2. Data staleness risk — integration sources with stale polls
 * 3. Correction-pattern risk — processes with high correction rates
 *
 * Returns typed risk objects for the briefing assembler to weave
 * into narrative. Never surfaces as "risk" to users (Insight-073).
 *
 * Provenance: Insight-077 (risk detection first-class), Brief 043.
 */

import { db, schema } from "../db";
import { eq, desc, and, lt, or, inArray } from "drizzle-orm";
import { computeTrustState } from "./trust";
import { getPollingStatus } from "./process-io";

// ============================================================
// Types
// ============================================================

export type RiskType = "temporal" | "data_staleness" | "correction_pattern" | "stale_escalation" | "dependency_blockage";
export type RiskSeverity = "low" | "medium" | "high";

export interface DetectedRisk {
  type: RiskType;
  severity: RiskSeverity;
  entityId: string;
  entityLabel: string;
  /** Human-friendly detail for weaving into briefing narrative */
  detail: string;
  /** Raw data for the Self to reason with */
  data: Record<string, unknown>;
}

// ============================================================
// Configurable Thresholds
// ============================================================

export interface RiskThresholds {
  /** Days without activity before a work item is flagged */
  temporalInactiveDays: number;
  /** Hours since last successful poll before flagging data staleness */
  dataStalenessHours: number;
  /** Correction rate (0-1) above which a process is flagged */
  correctionRateBaseline: number;
  /** Minimum runs in window before correction pattern is meaningful */
  correctionMinRuns: number;
  /** Hours before an escalation (waiting_human/waiting_review) is considered stale (Brief 162, MP-7.3) */
  staleEscalationHours: number;
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  temporalInactiveDays: 3,
  dataStalenessHours: 48,
  correctionRateBaseline: 0.3,
  correctionMinRuns: 5,
  staleEscalationHours: 24,
};

// ============================================================
// Risk Detection
// ============================================================

/**
 * Detect temporal risks: work items with no activity beyond threshold.
 * "Wilson hasn't responded in 3 days" — aging items that need attention.
 */
async function detectTemporalRisks(
  thresholds: RiskThresholds,
): Promise<DetectedRisk[]> {
  const cutoff = new Date(
    Date.now() - thresholds.temporalInactiveDays * 24 * 60 * 60 * 1000,
  );

  // Find active work items that haven't been updated since cutoff
  const staleItems = await db
    .select({
      id: schema.workItems.id,
      content: schema.workItems.content,
      status: schema.workItems.status,
      updatedAt: schema.workItems.updatedAt,
    })
    .from(schema.workItems)
    .where(
      and(
        or(
          eq(schema.workItems.status, "intake"),
          eq(schema.workItems.status, "routed"),
          eq(schema.workItems.status, "in_progress"),
          eq(schema.workItems.status, "waiting_human"),
        ),
        lt(schema.workItems.updatedAt, cutoff),
      ),
    );

  return staleItems.map((item) => {
    const updatedAt = item.updatedAt instanceof Date
      ? item.updatedAt
      : new Date(Number(item.updatedAt));
    const daysSinceUpdate = Math.floor(
      (Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    const severity: RiskSeverity =
      daysSinceUpdate > thresholds.temporalInactiveDays * 2 ? "high" : "medium";

    return {
      type: "temporal" as const,
      severity,
      entityId: item.id,
      entityLabel: item.content.slice(0, 80),
      detail: `No activity for ${daysSinceUpdate} days`,
      data: {
        daysSinceUpdate,
        lastUpdated: updatedAt.toISOString(),
        status: item.status,
      },
    };
  });
}

/**
 * Detect data staleness risks: integration sources that haven't polled recently.
 * Checks both active polling state and process source configs.
 */
async function detectDataStalenessRisks(
  thresholds: RiskThresholds,
): Promise<DetectedRisk[]> {
  const risks: DetectedRisk[] = [];

  // Check active polling status (in-memory state)
  const pollingStatus = getPollingStatus();
  const stalenessCutoff = new Date(Date.now() - thresholds.dataStalenessHours * 60 * 60 * 1000);

  for (const poller of pollingStatus) {
    if (poller.lastCheck && poller.lastCheck < stalenessCutoff) {
      const hoursSinceLastPoll = Math.floor(
        (Date.now() - poller.lastCheck.getTime()) / (60 * 60 * 1000),
      );
      risks.push({
        type: "data_staleness",
        severity: hoursSinceLastPoll > thresholds.dataStalenessHours * 2 ? "high" : "medium",
        entityId: poller.processSlug,
        entityLabel: poller.processSlug,
        detail: `Data is ${hoursSinceLastPoll} hours old`,
        data: {
          hoursSinceLastPoll,
          lastPollAt: poller.lastCheck.toISOString(),
          service: poller.service,
        },
      });
    }
  }

  // Also check processes with source config but no recent trigger-created runs
  const processesWithSource = await db
    .select({
      id: schema.processes.id,
      name: schema.processes.name,
      slug: schema.processes.slug,
      source: schema.processes.source,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  for (const proc of processesWithSource) {
    if (!proc.source) continue;
    const sourceConfig = proc.source as { service: string; intervalMs: number };
    if (!sourceConfig.service) continue;

    // Already covered by active polling check?
    if (pollingStatus.some((p) => p.processSlug === proc.slug)) continue;

    // Process has a source but no active polling — it's not being monitored
    risks.push({
      type: "data_staleness",
      severity: "low",
      entityId: proc.id,
      entityLabel: proc.name,
      detail: `Source configured (${sourceConfig.service}) but not actively polling`,
      data: { service: sourceConfig.service },
    });
  }

  return risks;
}

/**
 * Detect correction-pattern risks: processes with correction rates
 * exceeding baseline, suggesting systematic issues.
 * "Labour estimates trending low" — recurring corrections in a direction.
 */
async function detectCorrectionPatternRisks(
  thresholds: RiskThresholds,
): Promise<DetectedRisk[]> {
  const risks: DetectedRisk[] = [];

  // Get all active non-system processes
  const processes = await db
    .select({
      id: schema.processes.id,
      name: schema.processes.name,
      slug: schema.processes.slug,
      trustTier: schema.processes.trustTier,
    })
    .from(schema.processes)
    .where(eq(schema.processes.status, "active"));

  for (const proc of processes) {
    const trustState = await computeTrustState(proc.id);

    // Skip processes without enough data
    if (trustState.runsInWindow < thresholds.correctionMinRuns) continue;

    // Check correction rate against baseline
    if (trustState.correctionRate > thresholds.correctionRateBaseline) {
      // Also check for specific correction patterns from feedback
      const recentFeedback = await db
        .select({
          correctionPattern: schema.feedback.correctionPattern,
          patternConfidence: schema.feedback.patternConfidence,
        })
        .from(schema.feedback)
        .where(
          and(
            eq(schema.feedback.processId, proc.id),
            eq(schema.feedback.type, "edit"),
          ),
        )
        .orderBy(desc(schema.feedback.createdAt))
        .limit(10);

      const patterns = recentFeedback
        .filter((f) => f.correctionPattern)
        .map((f) => f.correctionPattern as string);

      const severity: RiskSeverity =
        trustState.correctionRate > thresholds.correctionRateBaseline * 2
          ? "high"
          : "medium";

      risks.push({
        type: "correction_pattern",
        severity,
        entityId: proc.id,
        entityLabel: proc.name,
        detail: patterns.length > 0
          ? `Correction rate ${Math.round(trustState.correctionRate * 100)}% — recurring: ${patterns[0]}`
          : `Correction rate ${Math.round(trustState.correctionRate * 100)}% (above ${Math.round(thresholds.correctionRateBaseline * 100)}% baseline)`,
        data: {
          correctionRate: trustState.correctionRate,
          runsInWindow: trustState.runsInWindow,
          patterns,
          trend: trustState.trend,
        },
      });
    }
  }

  return risks;
}

/**
 * Detect stale escalations: process runs waiting for human input/review
 * longer than the threshold (Brief 162, MP-7.3).
 *
 * "This has been waiting for your input for 2 days" — surfaces in briefing.
 */
async function detectStaleEscalationRisks(
  thresholds: RiskThresholds,
): Promise<DetectedRisk[]> {
  const cutoff = new Date(
    Date.now() - thresholds.staleEscalationHours * 60 * 60 * 1000,
  );

  // Note: processRuns lacks an updatedAt/status-transition column, so we use createdAt
  // as a proxy. This overestimates stale age by the execution duration before the run
  // entered waiting state. Conservative: flags earlier, not later. Revisit when processRuns
  // gains a status-transition timestamp.
  const staleRuns = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      status: schema.processRuns.status,
      currentStepId: schema.processRuns.currentStepId,
      createdAt: schema.processRuns.createdAt,
    })
    .from(schema.processRuns)
    .where(
      and(
        or(
          eq(schema.processRuns.status, "waiting_human"),
          eq(schema.processRuns.status, "waiting_review"),
        ),
        lt(schema.processRuns.createdAt, cutoff),
      ),
    );

  const risks: DetectedRisk[] = [];

  for (const run of staleRuns) {
    const [proc] = await db
      .select({ name: schema.processes.name })
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    const createdAt = run.createdAt instanceof Date
      ? run.createdAt
      : new Date(Number(run.createdAt));
    const hoursSinceUpdate = Math.floor(
      (Date.now() - createdAt.getTime()) / (60 * 60 * 1000),
    );
    const daysSinceUpdate = Math.floor(hoursSinceUpdate / 24);

    const severity: RiskSeverity =
      daysSinceUpdate >= 3 ? "high" :
        daysSinceUpdate >= 1 ? "medium" : "low";

    const waitType = run.status === "waiting_human" ? "your input" : "review";
    const ageLabel = daysSinceUpdate >= 1
      ? `${daysSinceUpdate} day${daysSinceUpdate !== 1 ? "s" : ""}`
      : `${hoursSinceUpdate} hours`;

    risks.push({
      type: "stale_escalation",
      severity,
      entityId: run.id,
      entityLabel: proc?.name ?? "Unknown process",
      detail: `Has been waiting for ${waitType} for ${ageLabel}`,
      data: {
        processRunId: run.id,
        processId: run.processId,
        status: run.status,
        currentStepId: run.currentStepId,
        hoursSinceUpdate,
        daysSinceUpdate,
        waitingSince: createdAt.toISOString(),
      },
    });
  }

  return risks;
}

/**
 * Detect cross-process dependency blockages (Brief 162, MP-7.4).
 *
 * When Process A depends on Process B's output and B has failed or is stale,
 * surface the blockage with the dependency chain.
 */
async function detectDependencyBlockageRisks(
  _thresholds: RiskThresholds,
): Promise<DetectedRisk[]> {
  const risks: DetectedRisk[] = [];

  const deps = await db
    .select()
    .from(schema.processDependencies);

  if (deps.length === 0) return risks;

  for (const dep of deps) {
    const [sourceRun] = await db
      .select({
        id: schema.processRuns.id,
        status: schema.processRuns.status,
        createdAt: schema.processRuns.createdAt,
      })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.processId, dep.sourceProcessId))
      .orderBy(desc(schema.processRuns.createdAt))
      .limit(1);

    if (!sourceRun) continue;

    const blockedStatuses = ["failed", "waiting_human", "waiting_review"];
    if (!blockedStatuses.includes(sourceRun.status)) continue;

    const [[sourceProc], [targetProc]] = await Promise.all([
      db.select({ name: schema.processes.name })
        .from(schema.processes)
        .where(eq(schema.processes.id, dep.sourceProcessId))
        .limit(1),
      db.select({ name: schema.processes.name })
        .from(schema.processes)
        .where(eq(schema.processes.id, dep.targetProcessId))
        .limit(1),
    ]);

    const createdAt = sourceRun.createdAt instanceof Date
      ? sourceRun.createdAt
      : new Date(Number(sourceRun.createdAt));
    const hoursSince = Math.floor(
      (Date.now() - createdAt.getTime()) / (60 * 60 * 1000),
    );

    const statusLabel = sourceRun.status === "failed" ? "failed" :
      sourceRun.status === "waiting_human" ? "waiting for input" : "waiting for review";
    const timeLabel = hoursSince >= 24
      ? `${Math.floor(hoursSince / 24)} day${Math.floor(hoursSince / 24) !== 1 ? "s" : ""} ago`
      : `${hoursSince}h ago`;

    risks.push({
      type: "dependency_blockage",
      severity: sourceRun.status === "failed" ? "high" : "medium",
      entityId: dep.targetProcessId,
      entityLabel: targetProc?.name ?? "Unknown process",
      detail: `Paused — waiting on ${sourceProc?.name ?? "upstream process"} (${statusLabel} ${timeLabel})`,
      data: {
        dependencyId: dep.id,
        sourceProcessId: dep.sourceProcessId,
        sourceProcessName: sourceProc?.name,
        targetProcessId: dep.targetProcessId,
        targetProcessName: targetProc?.name,
        outputName: dep.outputName,
        inputName: dep.inputName,
        sourceRunId: sourceRun.id,
        sourceRunStatus: sourceRun.status,
        hoursSinceUpdate: hoursSince,
      },
    });
  }

  return risks;
}

/**
 * Run all risk detectors and return combined results.
 * Sorted by severity (high first), then by type.
 */
export async function detectAllRisks(
  thresholds: Partial<RiskThresholds> = {},
): Promise<DetectedRisk[]> {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const [temporal, staleness, correction, staleEscalation, dependencyBlockage] = await Promise.all([
    detectTemporalRisks(config),
    detectDataStalenessRisks(config),
    detectCorrectionPatternRisks(config),
    detectStaleEscalationRisks(config),
    detectDependencyBlockageRisks(config),
  ]);

  const allRisks = [...temporal, ...staleness, ...correction, ...staleEscalation, ...dependencyBlockage];

  // Sort: high > medium > low
  const severityOrder: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  allRisks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return allRisks;
}
