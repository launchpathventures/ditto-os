/**
 * Ditto — Journey Smoke Test Runner (Brief 112)
 *
 * Executes journey smoke tests (Brief 111), parses results,
 * creates/closes work items on failure/recovery, logs to activities,
 * and provides health status for admin and briefings.
 *
 * Triggered by pulse (daily) or on-demand via admin API.
 *
 * Provenance: CI/CD scheduled pipelines (pattern), Sentry auto-resolve (pattern).
 */

import { execFile } from "child_process";
import { db, schema } from "../db";
import { eq, desc, and, like } from "drizzle-orm";
import { randomUUID } from "crypto";

// ============================================================
// Types
// ============================================================

export interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  durationMs: number;
  turns?: Array<{ userMessage: string; alexReply: string }>;
}

export interface RunResult {
  runId: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  costCents: number;
  durationMs: number;
  tests: TestResult[];
  startedAt: Date;
  completedAt: Date;
}

export interface JourneyHealth {
  total: number;
  passing: number;
  failing: number;
  failingJourneys: string[];
  lastRunAt: Date | null;
  lastRunCostCents: number;
  lastRunDurationMs: number;
}

// ============================================================
// Constants
// ============================================================

const WORK_ITEM_PREFIX = "[smoke-test] ";
const TOTAL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MIN_HOURS_BETWEEN_RUNS = 24;

// ============================================================
// State (in-memory, non-blocking)
// ============================================================

let isRunning = false;
let latestResult: RunResult | null = null;

export function isSmokeTestRunning(): boolean {
  return isRunning;
}

// ============================================================
// Main runner
// ============================================================

/**
 * Run journey smoke tests by spawning a vitest subprocess.
 * Parses results, creates/closes work items, logs to activities.
 *
 * Returns the parsed results. Non-blocking — call via setImmediate from pulse.
 */
export async function runJourneySmokeTests(): Promise<RunResult> {
  if (isRunning) {
    throw new Error("Smoke tests already running");
  }

  isRunning = true;
  const startedAt = new Date();
  const runId = randomUUID();

  try {
    // Spawn vitest as subprocess
    const { stdout, stderr } = await spawnVitest();

    // Parse results from output
    const tests = parseVitestOutput(stdout, stderr);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Extract cost from output
    const costCents = extractCost(stdout);

    const result: RunResult = {
      runId,
      total: tests.length,
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
      skipped: 0,
      costCents,
      durationMs,
      tests,
      startedAt,
      completedAt,
    };

    // Process results: create/close work items
    await processResults(result);

    // Log to activities
    await logRun(result);

    latestResult = result;
    return result;
  } catch (err) {
    const completedAt = new Date();
    const errorResult: RunResult = {
      runId,
      total: 0,
      passed: 0,
      failed: 1,
      skipped: 0,
      costCents: 0,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      tests: [{
        testName: "runner",
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      }],
      startedAt,
      completedAt,
    };

    await logRun(errorResult);
    latestResult = errorResult;
    return errorResult;
  } finally {
    isRunning = false;
  }
}

// ============================================================
// Subprocess
// ============================================================

function spawnVitest(): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "node_modules/.bin/vitest",
      ["run", "src/engine/journey-smoke.test.ts", "--testTimeout", "120000", "--reporter=verbose"],
      {
        cwd: process.cwd(),
        timeout: TOTAL_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        // vitest returns exit code 1 on test failures — that's not an error for us
        resolve({ stdout: stdout || "", stderr: stderr || "" });
      },
    );

    // Handle spawn failure
    child.on("error", (err) => reject(err));
  });
}

// ============================================================
// Output parsing
// ============================================================

/**
 * Parse vitest verbose output into structured test results.
 * Extracts test names, pass/fail status, errors, and conversation logs.
 */
export function parseVitestOutput(stdout: string, stderr: string): TestResult[] {
  const results: TestResult[] = [];
  const combined = stdout + "\n" + stderr;

  // Match test result lines: ✓ or × followed by test name
  // vitest verbose format: " ✓ test name (123ms)" or " × test name (123ms)"
  const testPattern = /\s([✓×✗])\s(.+?)(?:\s\((\d+)\s?ms\))?$/gm;
  let match;

  while ((match = testPattern.exec(combined)) !== null) {
    const passed = match[1] === "✓";
    const testName = match[2].trim();
    const durationMs = match[3] ? parseInt(match[3], 10) : 0;

    // Skip non-journey test names (vitest internals, describe blocks)
    if (!testName || testName.startsWith("Journey Smoke Tests")) continue;

    const result: TestResult = {
      testName,
      passed,
      durationMs,
    };

    // Extract error for failed tests
    if (!passed) {
      const errorMatch = combined.match(
        new RegExp(`${testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?:AssertionError|Error):\\s*(.+?)\\n`),
      );
      if (errorMatch) {
        result.error = errorMatch[1].trim();
      }
    }

    // Extract conversation turns from [journey-chat] logs
    result.turns = extractConversationTurns(combined, testName);

    results.push(result);
  }

  // If no tests were parsed (vitest output format changed), create a single fallback
  if (results.length === 0 && combined.includes("Tests")) {
    const passMatch = combined.match(/(\d+)\s+passed/);
    const failMatch = combined.match(/(\d+)\s+failed/);
    const skipMatch = combined.match(/(\d+)\s+skipped/);

    if (passMatch || failMatch) {
      const passed = parseInt(passMatch?.[1] || "0", 10);
      const failed = parseInt(failMatch?.[1] || "0", 10);
      const skipped = parseInt(skipMatch?.[1] || "0", 10);

      if (passed > 0) {
        results.push({ testName: "journey-tests-aggregate", passed: true, durationMs: 0 });
      }
      if (failed > 0) {
        results.push({ testName: "journey-tests-aggregate", passed: false, error: `${failed} test(s) failed`, durationMs: 0 });
      }
    }
  }

  return results;
}

/**
 * Extract conversation turns from vitest output for a specific test.
 */
function extractConversationTurns(
  output: string,
  _testName: string,
): Array<{ userMessage: string; alexReply: string }> | undefined {
  const turns: Array<{ userMessage: string; alexReply: string }> = [];

  // Match [journey-chat] log lines
  const userPattern = /\[journey-chat\] User: (.+)/g;
  const alexPattern = /\[journey-chat\] Alex: (.+)/g;

  const userMessages: string[] = [];
  const alexReplies: string[] = [];

  let m;
  while ((m = userPattern.exec(output)) !== null) userMessages.push(m[1]);
  while ((m = alexPattern.exec(output)) !== null) alexReplies.push(m[1]);

  for (let i = 0; i < Math.min(userMessages.length, alexReplies.length); i++) {
    turns.push({ userMessage: userMessages[i], alexReply: alexReplies[i] });
  }

  return turns.length > 0 ? turns : undefined;
}

function extractCost(stdout: string): number {
  const costMatch = stdout.match(/Total LLM cost this test: \$([0-9.]+)/);
  return costMatch ? Math.round(parseFloat(costMatch[1]) * 100) : 0;
}

// ============================================================
// Work item management
// ============================================================

async function processResults(result: RunResult): Promise<void> {
  for (const test of result.tests) {
    const workItemContent = `${WORK_ITEM_PREFIX}${test.testName}`;

    if (!test.passed) {
      // Check if work item already exists
      const existing = await db
        .select()
        .from(schema.workItems)
        .where(
          and(
            like(schema.workItems.content, `%${workItemContent}%`),
            eq(schema.workItems.type, "task"),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        // Create work item for failure
        await db.insert(schema.workItems).values({
          content: `${workItemContent} failed: ${test.error || "unknown error"}`,
          type: "task",
          status: "intake",
          context: {
            source: "smoke-test",
            testName: test.testName,
            error: test.error,
            runId: result.runId,
          },
        });
        console.log(`[smoke-test] Created work item for failing test: ${test.testName}`);
      }
    } else {
      // Auto-close: find open work items for this test and close them
      const openItems = await db
        .select()
        .from(schema.workItems)
        .where(
          and(
            like(schema.workItems.content, `%${workItemContent}%`),
            eq(schema.workItems.type, "task"),
          ),
        );

      for (const item of openItems) {
        if (item.status !== "completed") {
          await db
            .update(schema.workItems)
            .set({
              status: "completed",
              context: {
                ...(item.context as Record<string, unknown> || {}),
                autoRecovered: true,
                recoveredAt: new Date().toISOString(),
                recoveredInRun: result.runId,
              },
              updatedAt: new Date(),
            })
            .where(eq(schema.workItems.id, item.id));
          console.log(`[smoke-test] Auto-closed work item for recovered test: ${test.testName}`);
        }
      }
    }
  }
}

// ============================================================
// Activity logging
// ============================================================

async function logRun(result: RunResult): Promise<void> {
  await db.insert(schema.activities).values({
    action: "smoke_test.run",
    actorType: "system",
    entityType: "system",
    entityId: result.runId,
    metadata: {
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      costCents: result.costCents,
      durationMs: result.durationMs,
      tests: result.tests.map((t) => ({
        testName: t.testName,
        passed: t.passed,
        error: t.error,
        durationMs: t.durationMs,
        turns: t.turns,
      })),
    },
  });
}

// ============================================================
// Health & results queries
// ============================================================

/**
 * Get current journey health — for briefings and admin dashboard.
 */
export async function getJourneyHealth(): Promise<JourneyHealth> {
  // Find the latest smoke test run from activities
  const [latestActivity] = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.action, "smoke_test.run"))
    .orderBy(desc(schema.activities.createdAt))
    .limit(1);

  if (!latestActivity) {
    return {
      total: 0,
      passing: 0,
      failing: 0,
      failingJourneys: [],
      lastRunAt: null,
      lastRunCostCents: 0,
      lastRunDurationMs: 0,
    };
  }

  const meta = latestActivity.metadata as Record<string, unknown>;
  const tests = (meta.tests || []) as Array<{ testName: string; passed: boolean }>;

  return {
    total: (meta.total as number) || 0,
    passing: (meta.passed as number) || 0,
    failing: (meta.failed as number) || 0,
    failingJourneys: tests.filter((t) => !t.passed).map((t) => t.testName),
    lastRunAt: latestActivity.createdAt,
    lastRunCostCents: (meta.costCents as number) || 0,
    lastRunDurationMs: (meta.durationMs as number) || 0,
  };
}

/**
 * Get detailed results from the latest run — for admin drill-down.
 */
export async function getLatestRunResults(): Promise<RunResult | null> {
  // Return in-memory result if available (most recent)
  if (latestResult) return latestResult;

  // Otherwise, reconstruct from DB
  const [latestActivity] = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.action, "smoke_test.run"))
    .orderBy(desc(schema.activities.createdAt))
    .limit(1);

  if (!latestActivity) return null;

  const meta = latestActivity.metadata as Record<string, unknown>;
  return {
    runId: latestActivity.entityId || "unknown",
    total: (meta.total as number) || 0,
    passed: (meta.passed as number) || 0,
    failed: (meta.failed as number) || 0,
    skipped: 0,
    costCents: (meta.costCents as number) || 0,
    durationMs: (meta.durationMs as number) || 0,
    tests: (meta.tests as TestResult[]) || [],
    startedAt: latestActivity.createdAt,
    completedAt: latestActivity.createdAt,
  };
}

// ============================================================
// Pulse integration
// ============================================================

/**
 * Check if smoke tests should run (24h since last run).
 * Called from pulse tick — triggers async execution.
 */
export async function checkAndRunSmokeTests(): Promise<boolean> {
  if (isRunning) return false;

  const [lastRun] = await db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.action, "smoke_test.run"))
    .orderBy(desc(schema.activities.createdAt))
    .limit(1);

  if (lastRun) {
    const hoursSinceLastRun = (Date.now() - lastRun.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastRun < MIN_HOURS_BETWEEN_RUNS) {
      return false;
    }
  }

  // Trigger async (non-blocking)
  setImmediate(async () => {
    try {
      const result = await runJourneySmokeTests();
      console.log(`[smoke-test] Daily run complete: ${result.passed}/${result.total} passed, $${(result.costCents / 100).toFixed(4)} cost`);
    } catch (err) {
      console.error("[smoke-test] Daily run failed:", err);
    }
  });

  return true;
}
