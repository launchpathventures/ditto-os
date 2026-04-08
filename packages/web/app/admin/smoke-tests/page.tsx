"use client";

/**
 * Admin — Journey Smoke Tests (Brief 112)
 *
 * Shows journey test results with expandable conversation logs.
 * "Run Now" button triggers on-demand execution.
 *
 * Auth: requires admin token stored in localStorage.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  DollarSign,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface TestTurn {
  userMessage: string;
  alexReply: string;
}

interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  durationMs: number;
  turns?: TestTurn[];
}

interface RunResult {
  runId: string;
  total: number;
  passed: number;
  failed: number;
  costCents: number;
  durationMs: number;
  tests: TestResult[];
  startedAt: string;
  completedAt: string;
}

interface JourneyHealth {
  total: number;
  passing: number;
  failing: number;
  failingJourneys: string[];
  lastRunAt: string | null;
  lastRunCostCents: number;
  lastRunDurationMs: number;
}

interface SmokeTestData {
  health: JourneyHealth;
  latestResults: RunResult | null;
  isRunning: boolean;
}

// ============================================================
// Component
// ============================================================

const TOKEN_KEY = "ditto-admin-token";

export default function SmokeTestsPage() {
  const [data, setData] = useState<SmokeTestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/v1/network/admin/smoke-tests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10s while running
    const interval = setInterval(() => {
      if (data?.isRunning) fetchData();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchData, data?.isRunning]);

  const triggerRun = async () => {
    if (!token) return;
    setTriggering(true);
    try {
      await fetch("/api/v1/network/admin/smoke-tests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // Start polling for results
      setTimeout(fetchData, 3000);
      setTimeout(fetchData, 10000);
      setTimeout(fetchData, 30000);
    } catch {
      setError("Failed to trigger run");
    } finally {
      setTriggering(false);
    }
  };

  const toggleExpand = (testName: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(testName)) next.delete(testName);
      else next.add(testName);
      return next;
    });
  };

  if (!token) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary">Please log in from the admin dashboard first.</p>
        <Link href="/admin" className="mt-4 inline-block text-accent hover:underline">
          Go to Admin
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">{error}</p>
        <button onClick={fetchData} className="mt-2 text-accent hover:underline">Retry</button>
      </div>
    );
  }

  const health = data?.health;
  const results = data?.latestResults;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-text-secondary hover:text-text-primary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold">Journey Smoke Tests</h1>
        </div>
        <button
          onClick={triggerRun}
          disabled={triggering || data?.isRunning}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {data?.isRunning || triggering ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {data?.isRunning ? "Running..." : triggering ? "Starting..." : "Run Now"}
        </button>
      </div>

      {/* Health Summary */}
      {health && (
        <div className="mb-6 rounded-lg border border-border bg-surface-secondary p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`text-3xl font-bold ${health.failing > 0 ? "text-red-500" : "text-green-500"}`}>
                {health.passing}/{health.total}
              </span>
              <span className="text-text-secondary">journeys passing</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              {health.lastRunAt && (
                <>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(health.lastRunAt).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    ${(health.lastRunCostCents / 100).toFixed(4)}
                  </span>
                </>
              )}
            </div>
          </div>
          {health.failingJourneys.length > 0 && (
            <div className="mt-2 text-sm text-red-500">
              Failing: {health.failingJourneys.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Test Results */}
      {results && results.tests.length > 0 && (
        <div className="space-y-2">
          {results.tests.map((test) => (
            <div key={test.testName} className="rounded-lg border border-border">
              {/* Test header */}
              <button
                onClick={() => toggleExpand(test.testName)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary/50"
              >
                {test.passed ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                )}
                <span className="flex-1 text-sm font-medium">{test.testName}</span>
                <span className="text-xs text-text-secondary">
                  {test.durationMs > 0 ? `${(test.durationMs / 1000).toFixed(1)}s` : ""}
                </span>
                {test.turns && test.turns.length > 0 ? (
                  expandedTests.has(test.testName) ? (
                    <ChevronDown className="h-4 w-4 text-text-secondary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-secondary" />
                  )
                ) : null}
              </button>

              {/* Error */}
              {test.error && !expandedTests.has(test.testName) && (
                <div className="border-t border-border/50 px-4 py-2 text-sm text-red-500">
                  {test.error}
                </div>
              )}

              {/* Expanded: conversation log */}
              {expandedTests.has(test.testName) && (
                <div className="border-t border-border/50 bg-surface-secondary/30 px-4 py-3">
                  {test.error && (
                    <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                      {test.error}
                    </div>
                  )}
                  {test.turns && test.turns.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-text-secondary">Conversation Log</p>
                      {test.turns.map((turn, i) => (
                        <div key={i} className="space-y-1">
                          <div className="text-sm">
                            <span className="font-medium text-accent">User:</span>{" "}
                            <span className="text-text-primary">{turn.userMessage}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium text-green-600 dark:text-green-400">Alex:</span>{" "}
                            <span className="text-text-secondary">{turn.alexReply}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">No conversation log available for this test.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {(!results || results.tests.length === 0) && !loading && (
        <div className="rounded-lg border border-border p-8 text-center text-text-secondary">
          No smoke test results yet. Click "Run Now" to execute the first run.
        </div>
      )}
    </div>
  );
}
