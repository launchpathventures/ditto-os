/**
 * Tests for SLM Readiness Scorer (Brief 136).
 *
 * Covers: readiness scoring at each threshold, purpose fit gating,
 * all 5 signals, recommendation derivation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scoreSlmReadiness, scoreAllSteps } from "./readiness-scorer";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { randomUUID } from "crypto";
import type { SlmReadinessThresholds } from "@ditto/core";

let db: TestDb;
let cleanup: () => void;

// Use lower thresholds for testing
const TEST_THRESHOLDS: SlmReadinessThresholds = {
  volumeReady: 10,
  volumeStrong: 50,
  consistencyReady: 0.90,
  consistencyStrong: 0.95,
  costMinCents: 0.5,
  costHighCents: 1.0,
  maxInputTokens: 2000,
  maxOutputTokens: 500,
};

function insertProcess(slug: string) {
  const id = randomUUID();
  db.insert(schema.processes).values({
    id,
    name: slug,
    slug,
    definition: {},
  }).run();
  return id;
}

function insertProcessRun(processId: string) {
  const id = randomUUID();
  db.insert(schema.processRuns).values({
    id,
    processId,
    triggeredBy: "test",
    status: "approved",
  }).run();
  return id;
}

function insertStepRuns(opts: {
  processRunId: string;
  stepId: string;
  count: number;
  approvedRatio?: number;
  model?: string;
  costCents?: number;
  tokensUsed?: number;
}) {
  const approvedRatio = opts.approvedRatio ?? 1.0;
  const approvedCount = Math.round(opts.count * approvedRatio);

  for (let i = 0; i < opts.count; i++) {
    db.insert(schema.stepRuns).values({
      id: randomUUID(),
      processRunId: opts.processRunId,
      stepId: opts.stepId,
      status: i < approvedCount ? "approved" : "rejected",
      executorType: "ai-agent",
      inputs: { query: `test input ${i}` },
      outputs: { result: `test output ${i}` },
      model: opts.model ?? "claude-haiku-4-5-20251001",
      tokensUsed: opts.tokensUsed ?? 100,
      costCents: opts.costCents ?? 1,
    }).run();
  }
}

beforeEach(() => {
  const result = createTestDb();
  db = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("scoreSlmReadiness", () => {
  it("returns not_ready when no data exists", () => {
    insertProcess("inbox-triage");

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);

    expect(score.score).toBe(0);
    expect(score.recommendation).toBe("not_ready");
    expect(score.signals.volume.count).toBe(0);
  });

  it("scores volume signal at different thresholds", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);

    // Insert enough for "ready" threshold (10)
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 15, costCents: 1 });

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(score.signals.volume.count).toBe(15);
    expect(score.signals.volume.score).toBe(15); // >= volumeReady
  });

  it("scores strong_candidate with high volume", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);

    // Insert enough for "strong" threshold (50)
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 60, costCents: 2 });

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(score.signals.volume.score).toBe(20); // >= volumeStrong
    expect(score.recommendation).toBe("strong_candidate");
  });

  it("scores consistency signal correctly", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);

    // 95% approval rate (96% actually)
    insertStepRuns({
      processRunId: runId,
      stepId: "classify",
      count: 50,
      approvedRatio: 0.96,
      costCents: 2,
    });

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(score.signals.consistency.approvalRate).toBeGreaterThan(0.95);
    expect(score.signals.consistency.score).toBe(20); // >= consistencyStrong
  });

  it("gates on purpose fit — only classification and extraction score > 0", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 20, costCents: 2 });

    // Classification — suitable
    const classificationScore = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(classificationScore.signals.purposeFit.isSlmSuitable).toBe(true);
    expect(classificationScore.signals.purposeFit.score).toBe(20);

    // Extraction — suitable
    const extractionScore = scoreSlmReadiness(db, "inbox-triage", "classify", "extraction", TEST_THRESHOLDS);
    expect(extractionScore.signals.purposeFit.isSlmSuitable).toBe(true);
    expect(extractionScore.signals.purposeFit.score).toBe(20);

    // Analysis — NOT suitable
    const analysisScore = scoreSlmReadiness(db, "inbox-triage", "classify", "analysis", TEST_THRESHOLDS);
    expect(analysisScore.signals.purposeFit.isSlmSuitable).toBe(false);
    expect(analysisScore.signals.purposeFit.score).toBe(0);
    expect(analysisScore.recommendation).toBe("not_ready"); // Hard gate

    // Writing — NOT suitable
    const writingScore = scoreSlmReadiness(db, "inbox-triage", "classify", "writing", TEST_THRESHOLDS);
    expect(writingScore.signals.purposeFit.isSlmSuitable).toBe(false);
    expect(writingScore.signals.purposeFit.score).toBe(0);

    // Conversation — NOT suitable
    const conversationScore = scoreSlmReadiness(db, "inbox-triage", "classify", "conversation", TEST_THRESHOLDS);
    expect(conversationScore.signals.purposeFit.isSlmSuitable).toBe(false);
    expect(conversationScore.signals.purposeFit.score).toBe(0);
  });

  it("scores cost impact signal", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 20, costCents: 2 });

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(score.signals.costImpact.currentAvgCostCents).toBe(2);
    expect(score.signals.costImpact.score).toBe(20); // >= costHighCents
  });

  it("scores structural simplicity signal", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    // Low token count — fits SLM constraints
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 20, tokensUsed: 100, costCents: 1 });

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(score.signals.structuralSimplicity.score).toBe(20); // Both input and output fit
  });

  it("derives correct recommendation levels", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);

    // Non-SLM purpose — never recommends regardless of volume
    insertStepRuns({ processRunId: runId, stepId: "step-analysis", count: 60, costCents: 5 });
    const analysisScore = scoreSlmReadiness(db, "inbox-triage", "step-analysis", "analysis", TEST_THRESHOLDS);
    expect(analysisScore.recommendation).toBe("not_ready");

    // Low volume, low cost, classification — approaching
    insertStepRuns({ processRunId: runId, stepId: "step-low", count: 2, costCents: 0 });
    const lowScore = scoreSlmReadiness(db, "inbox-triage", "step-low", "classification", TEST_THRESHOLDS);
    // volume=2 (score 3, >=10*0.1), consistency=20, purposeFit=20, cost=0, simplicity=20 = 63 → approaching
    expect(lowScore.recommendation).toBe("approaching");

    // Good volume — ready or strong
    insertStepRuns({ processRunId: runId, stepId: "step-mid", count: 15, costCents: 1 });
    const midScore = scoreSlmReadiness(db, "inbox-triage", "step-mid", "classification", TEST_THRESHOLDS);
    expect(["ready", "strong_candidate"]).toContain(midScore.recommendation);

    // High volume — strong candidate
    insertStepRuns({ processRunId: runId, stepId: "step-high", count: 60, costCents: 2 });
    const highScore = scoreSlmReadiness(db, "inbox-triage", "step-high", "classification", TEST_THRESHOLDS);
    expect(highScore.recommendation).toBe("strong_candidate");
  });

  it("estimates monthly cost savings", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 20, costCents: 5 });

    const score = scoreSlmReadiness(db, "inbox-triage", "classify", "classification", TEST_THRESHOLDS);
    expect(score.estimatedMonthlySavingsCents).toBeGreaterThan(0);
  });
});

describe("scoreAllSteps", () => {
  it("returns scores for all (process, step) pairs with data", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 20, costCents: 1 });
    insertStepRuns({ processRunId: runId, stepId: "extract", count: 15, costCents: 2 });

    const scores = scoreAllSteps(db, TEST_THRESHOLDS);
    expect(scores.length).toBeGreaterThanOrEqual(2);
  });

  it("filters out zero-score results", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    // Very few runs — might still score > 0 due to simplicity
    insertStepRuns({ processRunId: runId, stepId: "classify", count: 1, costCents: 0 });

    const scores = scoreAllSteps(db, TEST_THRESHOLDS);
    for (const score of scores) {
      expect(score.score).toBeGreaterThan(0);
    }
  });
});
