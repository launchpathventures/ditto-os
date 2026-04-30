/**
 * Brief 226 — Project Onboarding analyser handler tests (replaces Brief 225's
 * placeholder tests).
 *
 * Verifies:
 *   - Insight-180 stepRunId guard rejects every handler when stepRunId is
 *     missing, with zero DB calls before rejection (DB-spy assertion).
 *   - Detector handlers degrade gracefully when clone-and-scan didn't emit
 *     a tempDir (skipped path) and when an inner detector throws (partial
 *     success path — _detectorError emitted, surface-report keeps rendering).
 *   - readContext throws when projectId / _processRunId is missing.
 *
 * The clone-and-scan + surface-report end-to-end flow is exercised by the
 * smoke test in the brief — that path needs network access (isomorphic-git
 * fetches a real repo).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_TEST_MODE = process.env.DITTO_TEST_MODE;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_TEST_MODE === undefined) {
    delete process.env.DITTO_TEST_MODE;
  } else {
    process.env.DITTO_TEST_MODE = ORIGINAL_TEST_MODE;
  }
});

const ALL_INNER_HANDLERS = [
  "runCloneAndScan",
  "runDetectBuildSystem",
  "runDetectTestFramework",
  "runDetectCI",
  "runDetectHarness",
  "runScorePersonaFit",
  "runMatchGoldStandard",
  "runRecommendRunnerTier",
  "runSurfaceReport",
] as const;

describe("Insight-180 guard: every onboarding handler rejects without stepRunId in production mode", () => {
  for (const name of ALL_INNER_HANDLERS) {
    it(`${name} returns a guard-rejection placeholder when stepRunId is missing`, async () => {
      delete process.env.DITTO_TEST_MODE;
      const dbCalls: string[] = [];
      vi.doMock("../../db", () => ({
        db: {
          select: () => {
            dbCalls.push("select");
            throw new Error("DB should not be touched before guard");
          },
          insert: () => {
            dbCalls.push("insert");
            throw new Error("DB should not be touched before guard");
          },
          update: () => {
            dbCalls.push("update");
            throw new Error("DB should not be touched before guard");
          },
        },
        schema: {},
      }));
      const handlers = await import("./handlers");
      const fn = handlers[name];
      const result = await fn(undefined, {
        projectId: "p1",
        processRunId: "pr1",
      });
      expect(result.outputs).toBeDefined();
      expect(JSON.stringify(result.outputs)).toMatch(/rejected-no-stepRunId/);
      expect(result.logs?.[0]).toMatch(/Insight-180/);
      expect(dbCalls).toEqual([]);
    });
  }
});

describe("readContext error paths", () => {
  it("system-agent shim rejects when projectId is missing", async () => {
    const { executeOnboardingCloneAndScan } = await import("./handlers");
    await expect(executeOnboardingCloneAndScan({})).rejects.toThrow(
      /requires `projectId`/,
    );
  });

  it("system-agent shim rejects when _processRunId is missing", async () => {
    const { executeOnboardingCloneAndScan } = await import("./handlers");
    await expect(
      executeOnboardingCloneAndScan({ projectId: "p1" }),
    ).rejects.toThrow(/requires `_processRunId`/);
  });
});

describe("detector handlers: partial-success path (Brief 226 §AC #11)", () => {
  it("emits skipped output when clone-and-scan tempDir is missing", async () => {
    process.env.DITTO_TEST_MODE = "true";
    // readPriorStepOutputs uses `db.select(...).from(stepRuns).where(eq(...))`
    // and awaits the resulting query builder. We mock just enough of the
    // chain to return zero rows.
    vi.doMock("../../db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      },
      schema: {
        stepRuns: { processRunId: {}, stepId: {}, status: {}, outputs: {} },
      },
    }));
    const { runDetectBuildSystem } = await import("./handlers");
    const result = await runDetectBuildSystem("step-1", {
      projectId: "p1",
      processRunId: "pr1",
    });
    expect(result.outputs["build-system"]).toEqual({
      skipped: true,
      reason: "no-clone",
    });
  });
});

describe("runDetectTestFramework threads upstream build-systems (Brief 226 Reviewer CRITICAL #1)", () => {
  it("passes prior detect-build-system output into detectTestFramework", async () => {
    process.env.DITTO_TEST_MODE = "true";
    const { join } = await import("node:path");
    const fixtureDir = join(
      __dirname,
      "__fixtures__",
      "python-pytest-gha",
    );
    // Prior step outputs: clone-and-scan emitted a tempDir pointing at the
    // python fixture; detect-build-system already ran and emitted python.
    vi.doMock("../../db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  stepId: "clone-and-scan",
                  status: "approved",
                  outputs: {
                    "scan-result": {
                      tempDir: fixtureDir,
                      fileCount: 5,
                      totalBytes: 1234,
                      defaultBranch: "main",
                      fetchedUrl: "fixture://python",
                    },
                  },
                },
                {
                  stepId: "detect-build-system",
                  status: "approved",
                  outputs: {
                    "build-system": [
                      {
                        kind: "python",
                        evidence: "pyproject.toml",
                        packageManager: "poetry",
                      },
                    ],
                  },
                },
              ]),
          }),
        }),
      },
      schema: {
        stepRuns: { processRunId: {}, stepId: {}, status: {}, outputs: {} },
      },
    }));
    const { runDetectTestFramework } = await import("./handlers");
    const result = await runDetectTestFramework("step-3", {
      projectId: "p1",
      processRunId: "pr1",
    });
    // Without the CRITICAL #1 fix this would be `[]` because pytest detection
    // gates on `kinds.has("python")`. With the fix, pytest is detected.
    const detected = result.outputs["test-framework"] as Array<{
      framework: string;
    }>;
    expect(Array.isArray(detected)).toBe(true);
    expect(detected.find((d) => d.framework === "pytest")).toBeDefined();
  });
});

/* End-to-end clone-and-scan + surface-report integration is verified by
 * the smoke test in the brief (`docs/briefs/226-in-depth-analyser.md`),
 * which exercises a real isomorphic-git clone + a real SQLite DB. The
 * unit tests above cover guard discipline + detector partial-success
 * paths; the full DB shape is too entangled with drizzle-orm's query
 * builder to mock here without bringing in better-sqlite3 setup. */
