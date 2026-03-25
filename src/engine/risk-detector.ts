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

export type RiskType = "temporal" | "data_staleness" | "correction_pattern";
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
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  temporalInactiveDays: 3,
  dataStalenessHours: 48,
  correctionRateBaseline: 0.3,
  correctionMinRuns: 5,
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
 * Run all risk detectors and return combined results.
 * Sorted by severity (high first), then by type.
 */
export async function detectAllRisks(
  thresholds: Partial<RiskThresholds> = {},
): Promise<DetectedRisk[]> {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const [temporal, staleness, correction] = await Promise.all([
    detectTemporalRisks(config),
    detectDataStalenessRisks(config),
    detectCorrectionPatternRisks(config),
  ]);

  const allRisks = [...temporal, ...staleness, ...correction];

  // Sort: high > medium > low
  const severityOrder: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  allRisks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return allRisks;
}
