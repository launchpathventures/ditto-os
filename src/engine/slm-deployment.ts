/**
 * Ditto — SLM Deployment Lifecycle
 *
 * Manages the lifecycle: candidate → evaluating → promoted → retired.
 * Retirement auto-triggers when production approval rate drifts >10%
 * below the pre-SLM baseline.
 *
 * Provenance: Brief 135/137.
 */

import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "../db/schema";
import type { SlmDeploymentStatus } from "../db/schema";

// ============================================================
// Types
// ============================================================

export interface SlmDeploymentRecord {
  id: string;
  processSlug: string;
  stepId: string;
  provider: string;
  model: string;
  status: SlmDeploymentStatus;
  trainingExportId: string | null;
  evalAccuracy: number | null;
  evalF1: number | null;
  evalExamples: number | null;
  productionRunCount: number;
  productionApprovalRate: number | null;
  baselineApprovalRate: number | null;
  retiredReason: string | null;
  createdAt: number;
  promotedAt: number | null;
  retiredAt: number | null;
}

/** Valid state transitions */
const VALID_TRANSITIONS: Record<SlmDeploymentStatus, SlmDeploymentStatus[]> = {
  candidate: ["evaluating", "retired"],
  evaluating: ["promoted", "retired"],
  promoted: ["retired"],
  retired: [], // terminal state
};

/** Minimum production runs before retirement drift check kicks in */
const RETIREMENT_MIN_RUNS = 50;

/** Maximum allowed drop in approval rate (absolute) before auto-retirement */
const RETIREMENT_DRIFT_THRESHOLD = 0.10;

/** Minimum eval accuracy for promotion */
const PROMOTION_EVAL_THRESHOLD = 0.95;

// ============================================================
// CRUD
// ============================================================

/**
 * Create a new SLM deployment candidate.
 */
export function createDeployment(
  db: BetterSQLite3Database<typeof schemaTypes>,
  opts: {
    processSlug: string;
    stepId: string;
    provider: string;
    model: string;
    trainingExportId?: string;
  },
): string {
  const id = crypto.randomUUID();
  db.run(sql`
    INSERT INTO slm_deployments (id, process_slug, step_id, provider, model, status, training_export_id, created_at)
    VALUES (${id}, ${opts.processSlug}, ${opts.stepId}, ${opts.provider}, ${opts.model}, 'candidate', ${opts.trainingExportId ?? null}, ${Date.now()})
  `);
  return id;
}

/**
 * Get a deployment by ID.
 */
export function getDeployment(
  db: BetterSQLite3Database<typeof schemaTypes>,
  deploymentId: string,
): SlmDeploymentRecord | null {
  const rows = db.all<SlmDeploymentRecord>(sql`
    SELECT
      id, process_slug AS "processSlug", step_id AS "stepId",
      provider, model, status, training_export_id AS "trainingExportId",
      eval_accuracy AS "evalAccuracy", eval_f1 AS "evalF1",
      eval_examples AS "evalExamples",
      production_run_count AS "productionRunCount",
      production_approval_rate AS "productionApprovalRate",
      baseline_approval_rate AS "baselineApprovalRate",
      retired_reason AS "retiredReason",
      created_at AS "createdAt", promoted_at AS "promotedAt",
      retired_at AS "retiredAt"
    FROM slm_deployments
    WHERE id = ${deploymentId}
  `);
  return rows[0] ?? null;
}

/**
 * Get the promoted deployment for a (process, step) pair, if any.
 */
export function getPromotedDeployment(
  db: BetterSQLite3Database<typeof schemaTypes>,
  processSlug: string,
  stepId: string,
): SlmDeploymentRecord | null {
  const rows = db.all<SlmDeploymentRecord>(sql`
    SELECT
      id, process_slug AS "processSlug", step_id AS "stepId",
      provider, model, status, training_export_id AS "trainingExportId",
      eval_accuracy AS "evalAccuracy", eval_f1 AS "evalF1",
      eval_examples AS "evalExamples",
      production_run_count AS "productionRunCount",
      production_approval_rate AS "productionApprovalRate",
      baseline_approval_rate AS "baselineApprovalRate",
      retired_reason AS "retiredReason",
      created_at AS "createdAt", promoted_at AS "promotedAt",
      retired_at AS "retiredAt"
    FROM slm_deployments
    WHERE process_slug = ${processSlug}
      AND step_id = ${stepId}
      AND status = 'promoted'
    ORDER BY promoted_at DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

// ============================================================
// State Transitions
// ============================================================

/**
 * Transition a deployment to a new status.
 * Enforces the state machine: candidate → evaluating → promoted (or retired at any stage).
 */
export function transitionDeployment(
  db: BetterSQLite3Database<typeof schemaTypes>,
  deploymentId: string,
  newStatus: SlmDeploymentStatus,
  opts?: { reason?: string; baselineApprovalRate?: number; humanApproved?: boolean },
): void {
  const deployment = getDeployment(db, deploymentId);
  if (!deployment) {
    throw new Error(`SLM deployment ${deploymentId} not found`);
  }

  const validNext = VALID_TRANSITIONS[deployment.status];
  if (!validNext.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${deployment.status} → ${newStatus}. ` +
      `Valid transitions from ${deployment.status}: ${validNext.join(", ") || "none (terminal)"}`,
    );
  }

  if (newStatus === "promoted") {
    // Promotion requires eval pass (>95%) AND explicit human approval
    if (deployment.evalAccuracy === null || deployment.evalAccuracy < PROMOTION_EVAL_THRESHOLD) {
      throw new Error(
        `Cannot promote: eval accuracy ${deployment.evalAccuracy ?? "not run"} ` +
        `is below threshold ${PROMOTION_EVAL_THRESHOLD}`,
      );
    }
    if (!opts?.humanApproved) {
      throw new Error(
        "Cannot promote: human approval required. Pass { humanApproved: true } to confirm.",
      );
    }

    db.run(sql`
      UPDATE slm_deployments
      SET status = 'promoted',
          promoted_at = ${Date.now()},
          baseline_approval_rate = ${opts?.baselineApprovalRate ?? null}
      WHERE id = ${deploymentId}
    `);
  } else if (newStatus === "retired") {
    db.run(sql`
      UPDATE slm_deployments
      SET status = 'retired',
          retired_at = ${Date.now()},
          retired_reason = ${opts?.reason ?? "manual"}
      WHERE id = ${deploymentId}
    `);
  } else {
    db.run(sql`
      UPDATE slm_deployments
      SET status = ${newStatus}
      WHERE id = ${deploymentId}
    `);
  }
}

// ============================================================
// Drift Detection + Auto-Retirement
// ============================================================

/**
 * Check if a promoted SLM should be auto-retired due to quality drift.
 *
 * Auto-retires if production approval rate drops >10% absolute below
 * the pre-SLM baseline for 50+ runs.
 *
 * @returns true if the deployment was retired
 */
export function checkAndRetireOnDrift(
  db: BetterSQLite3Database<typeof schemaTypes>,
  deploymentId: string,
): boolean {
  const deployment = getDeployment(db, deploymentId);
  if (!deployment || deployment.status !== "promoted") return false;
  if (deployment.baselineApprovalRate === null) return false;
  if (deployment.productionRunCount < RETIREMENT_MIN_RUNS) return false;
  if (deployment.productionApprovalRate === null) return false;

  const drift = deployment.baselineApprovalRate - deployment.productionApprovalRate;
  if (drift > RETIREMENT_DRIFT_THRESHOLD) {
    transitionDeployment(db, deploymentId, "retired", {
      reason: `Quality drift: production approval rate ${Math.round(deployment.productionApprovalRate * 100)}% ` +
        `is ${Math.round(drift * 100)}% below baseline ${Math.round(deployment.baselineApprovalRate * 100)}%`,
    });
    return true;
  }

  return false;
}

/**
 * Update production stats for a promoted deployment.
 * Called after each step run that used the SLM.
 */
export function updateProductionStats(
  db: BetterSQLite3Database<typeof schemaTypes>,
  deploymentId: string,
  approved: boolean,
): void {
  const deployment = getDeployment(db, deploymentId);
  if (!deployment || deployment.status !== "promoted") return;

  const newRunCount = deployment.productionRunCount + 1;
  const currentApproved = (deployment.productionApprovalRate ?? 0) * deployment.productionRunCount;
  const newApprovalRate = (currentApproved + (approved ? 1 : 0)) / newRunCount;

  db.run(sql`
    UPDATE slm_deployments
    SET production_run_count = ${newRunCount},
        production_approval_rate = ${newApprovalRate}
    WHERE id = ${deploymentId}
  `);
}
