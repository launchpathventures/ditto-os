/**
 * Brief 228 — Project Retrofitter handler tests.
 *
 * Verifies:
 *   - Insight-180 stepRunId guard rejects every handler when stepRunId is
 *     missing, with zero DB calls before rejection (DB-spy assertion).
 *   - composeRetrofitPlan produces 13 files (7 role-contracts + skills.json
 *     + tools.json + guidance.md + onboarding-report.md + version.txt + .gitignore).
 *   - Plan generator marks files as 'create' on first run, 'unchanged' when
 *     hash matches prior, 'update' when hash differs.
 *   - computeDispatchOutcome branches per trust action (advance / sample_advance /
 *     sample_pause / pause+canAutoAdvance=false / pause).
 *   - Idempotency: second run with all unchanged files produces zero dispatches.
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

const RETROFIT_HANDLER_NAMES = [
  "runGeneratePlan",
  "runSurfacePlan",
  "runDispatchWrite",
  "runVerifyCommit",
] as const;

describe("Insight-180 guard: every retrofitter handler rejects without stepRunId in production mode", () => {
  for (const name of RETROFIT_HANDLER_NAMES) {
    it(`${name} returns a guard-rejection placeholder when _stepRunId is missing`, async () => {
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
          transaction: () => {
            dbCalls.push("transaction");
            throw new Error("DB should not be touched before guard");
          },
        },
        schema: {},
      }));
      const handlers = await import("./retrofitter");
      const fn = handlers[name];
      const result = await fn({ projectId: "p1", _processRunId: "pr1" });
      expect(result.outputs).toBeDefined();
      expect(JSON.stringify(result.outputs)).toMatch(/rejected-no-stepRunId/);
      expect(result.logs?.[0]).toMatch(/Insight-180/);
      expect(dbCalls).toEqual([]);
    });
  }
});

describe("readContext error paths", () => {
  it("rejects when projectId is missing", async () => {
    process.env.DITTO_TEST_MODE = "true";
    const { runGeneratePlan } = await import("./retrofitter");
    await expect(runGeneratePlan({ _processRunId: "pr1" })).rejects.toThrow(
      /requires `projectId`/,
    );
  });

  it("rejects when _processRunId is missing", async () => {
    process.env.DITTO_TEST_MODE = "true";
    const { runGeneratePlan } = await import("./retrofitter");
    await expect(runGeneratePlan({ projectId: "p1" })).rejects.toThrow(
      /requires `_processRunId`/,
    );
  });
});

describe("composeRetrofitPlan", () => {
  const PROJECT = {
    id: "proj-1",
    slug: "my-project",
    defaultBranch: "main",
    defaultRunnerKind: "local-mac-mini",
    trustTier: "autonomous" as const,
  };

  const SAMPLE_REPORT = null; // No analyser report — generator should still produce a plan.

  it("produces 13 files (7 role-contracts + 6 directory artefacts)", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-1");
    expect(plan.files.length).toBe(13);
    const paths = plan.files.map((f) => f.path);
    // 7 role contracts
    expect(paths).toContain(".ditto/role-contracts/dev-pm.md");
    expect(paths).toContain(".ditto/role-contracts/dev-architect.md");
    expect(paths).toContain(".ditto/role-contracts/dev-builder.md");
    expect(paths).toContain(".ditto/role-contracts/dev-reviewer.md");
    expect(paths).toContain(".ditto/role-contracts/dev-documenter.md");
    expect(paths).toContain(".ditto/role-contracts/dev-researcher.md");
    expect(paths).toContain(".ditto/role-contracts/dev-designer.md");
    // 6 directory artefacts
    expect(paths).toContain(".ditto/skills.json");
    expect(paths).toContain(".ditto/tools.json");
    expect(paths).toContain(".ditto/guidance.md");
    expect(paths).toContain(".ditto/onboarding-report.md");
    expect(paths).toContain(".ditto/version.txt");
    expect(paths).toContain(".ditto/.gitignore");
  });

  it("marks all files as 'create' on first run (no prior hashes)", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-1");
    expect(plan.files.every((f) => f.action === "create")).toBe(true);
  });

  it("marks files as 'unchanged' when prior hash matches current", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    // First run to derive hashes.
    const firstPlan = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-1");
    const priorHashes = Object.fromEntries(
      firstPlan.files.map((f) => [f.path, f.contentHash]),
    );
    // Second run with same processRunId (same content) should produce identical hashes.
    const secondPlan = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-1", {
      byPath: priorHashes,
    });
    expect(secondPlan.files.every((f) => f.action === "unchanged")).toBe(true);
  });

  it("marks files as 'update' when prior hash differs", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-1", {
      byPath: {
        ".ditto/version.txt": "different-hash",
        ".ditto/guidance.md": "different-hash",
      },
    });
    const versionFile = plan.files.find((f) => f.path === ".ditto/version.txt");
    const guidanceFile = plan.files.find(
      (f) => f.path === ".ditto/guidance.md",
    );
    expect(versionFile?.action).toBe("update");
    expect(guidanceFile?.action).toBe("update");
    // Files without prior hash stay 'create'
    const skillsFile = plan.files.find((f) => f.path === ".ditto/skills.json");
    expect(skillsFile?.action).toBe("create");
  });

  it("changes content when processRunId changes (DO NOT EDIT header carries it)", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan1 = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-1");
    const plan2 = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-2");
    const v1 = plan1.files.find((f) => f.path === ".ditto/guidance.md");
    const v2 = plan2.files.find((f) => f.path === ".ditto/guidance.md");
    expect(v1?.contentHash).not.toBe(v2?.contentHash);
  });

  it("includes DO NOT EDIT header in regenerated markdown files", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan = composeRetrofitPlan(SAMPLE_REPORT, PROJECT, "run-abc");
    const guidance = plan.files.find((f) => f.path === ".ditto/guidance.md");
    expect(guidance?.content).toContain("DO NOT EDIT");
    expect(guidance?.content).toContain("run-abc");
  });

  it("respects the project's default branch", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan = composeRetrofitPlan(
      SAMPLE_REPORT,
      { ...PROJECT, defaultBranch: "develop" },
      "run-1",
    );
    expect(plan.branch).toBe("develop");
  });

  it("falls back to 'main' when defaultBranch is null", async () => {
    const { composeRetrofitPlan } = await import("./retrofitter");
    const plan = composeRetrofitPlan(
      SAMPLE_REPORT,
      { ...PROJECT, defaultBranch: null },
      "run-1",
    );
    expect(plan.branch).toBe("main");
  });
});

describe("computeDispatchOutcome — trust-tier branching", () => {
  const SAMPLE_PROJECT = {
    id: "proj-1",
    slug: "my-project",
    defaultBranch: "main",
    defaultRunnerKind: "local-mac-mini",
    trustTier: "autonomous" as const,
  };

  function makeBlock() {
    return {
      type: "retrofit_plan" as const,
      planId: "plan-1",
      projectId: "proj-1",
      processRunId: "run-1",
      files: [],
      runnerKind: "local-mac-mini",
      trustTier: "autonomous",
      status: "dispatched" as const,
    };
  }

  function makePlan() {
    return {
      planId: "plan-1",
      projectId: "proj-1",
      processRunId: "run-1",
      files: [
        {
          id: "f1",
          path: ".ditto/version.txt",
          content: "1\n",
          contentHash: "h1",
          contentPreview: "1",
          byteSize: 2,
          action: "create" as const,
        },
        {
          id: "f2",
          path: ".ditto/guidance.md",
          content: "# guidance\n",
          contentHash: "h2",
          contentPreview: "# guidance",
          byteSize: 11,
          action: "create" as const,
        },
      ],
      generatedAt: "2026-04-27T00:00:00Z",
      ditoSchemaVersion: 1,
      branch: "main",
    };
  }

  it("autonomous (advance) → status='dispatched', skipped=false", async () => {
    const { computeDispatchOutcome } = await import("./retrofitter");
    const out = computeDispatchOutcome({
      initialBlock: makeBlock(),
      decision: {
        trustTier: "autonomous",
        trustAction: "advance",
        canAutoAdvance: true,
        samplingHash: null,
      },
      plan: makePlan(),
      project: SAMPLE_PROJECT,
      workItemId: "wi-1",
      stepRunId: "sr-1",
    });
    expect(out.skipped).toBe(false);
    expect(out.block.status).toBe("dispatched");
  });

  it("spot_checked sample_advance → status='dispatched' + sampledFileIds populated", async () => {
    const { computeDispatchOutcome } = await import("./retrofitter");
    const out = computeDispatchOutcome({
      initialBlock: makeBlock(),
      decision: {
        trustTier: "spot_checked",
        trustAction: "sample_advance",
        canAutoAdvance: true,
        samplingHash: "deadbeef".repeat(8),
      },
      plan: makePlan(),
      project: SAMPLE_PROJECT,
      workItemId: "wi-1",
      stepRunId: "sr-1",
    });
    expect(out.skipped).toBe(false);
    expect(out.block.status).toBe("dispatched");
    expect(out.block.sampledFileIds?.length).toBeGreaterThan(0);
  });

  it("spot_checked sample_pause → status='pending-sample-review', skipped=true", async () => {
    const { computeDispatchOutcome } = await import("./retrofitter");
    const out = computeDispatchOutcome({
      initialBlock: makeBlock(),
      decision: {
        trustTier: "spot_checked",
        trustAction: "sample_pause",
        canAutoAdvance: true,
        samplingHash: "deadbeef".repeat(8),
      },
      plan: makePlan(),
      project: SAMPLE_PROJECT,
      workItemId: "wi-1",
      stepRunId: "sr-1",
    });
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("spot-checked-sample-required");
    expect(out.block.status).toBe("pending-sample-review");
    expect(out.block.sampledFileIds?.length).toBeGreaterThan(0);
  });

  it("critical (pause + canAutoAdvance=false) → status='rejected', skipped=true", async () => {
    const { computeDispatchOutcome } = await import("./retrofitter");
    const out = computeDispatchOutcome({
      initialBlock: makeBlock(),
      decision: {
        trustTier: "critical",
        trustAction: "pause",
        canAutoAdvance: false,
        samplingHash: null,
      },
      plan: makePlan(),
      project: SAMPLE_PROJECT,
      workItemId: "wi-1",
      stepRunId: "sr-1",
    });
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("critical-tier");
    expect(out.block.status).toBe("rejected");
    expect(out.block.failureReason).toMatch(/Critical-tier/);
  });

  it("supervised (pause + canAutoAdvance=true) → status='pending-review', skipped=true", async () => {
    const { computeDispatchOutcome } = await import("./retrofitter");
    const out = computeDispatchOutcome({
      initialBlock: makeBlock(),
      decision: {
        trustTier: "supervised",
        trustAction: "pause",
        canAutoAdvance: true,
        samplingHash: null,
      },
      plan: makePlan(),
      project: SAMPLE_PROJECT,
      workItemId: "wi-1",
      stepRunId: "sr-1",
    });
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("supervised-tier");
    expect(out.block.status).toBe("pending-review");
  });

  it("no decision row (production-error fallback) → treats as 'pause' (supervised path) — fails SAFE", async () => {
    // Reviewer MIN-4 fix: in production the trust-gate ALWAYS persists a
    // harness_decisions row before dispatch-write runs. A missing row is
    // an error; the safe failure mode is to NOT dispatch.
    const { computeDispatchOutcome } = await import("./retrofitter");
    const out = computeDispatchOutcome({
      initialBlock: makeBlock(),
      decision: null,
      plan: makePlan(),
      project: SAMPLE_PROJECT,
      workItemId: "wi-1",
      stepRunId: "sr-1",
    });
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("supervised-tier");
    expect(out.block.status).toBe("pending-review");
  });
});

// ============================================================
// Brief 232 — parseRunnerResponse reads from runner_dispatches.responseBody
// ============================================================
describe("parseRunnerResponse — Brief 232 responseBody channel", () => {
  it("reads {commitSha, actuallyChangedFiles, skippedFiles} from responseBody when present (AC #7)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "gh-action-12345", // non-hex; should NOT be used for commitSha
      responseBody: {
        commitSha: "abc1234def5678",
        actuallyChangedFiles: [".ditto/skills.json", ".ditto/version.txt"],
        skippedFiles: [".ditto/guidance.md (user-edited)"],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBe("abc1234def5678");
    expect(out!.actuallyChangedFiles).toEqual([
      ".ditto/skills.json",
      ".ditto/version.txt",
    ]);
    expect(out!.skippedFiles).toEqual([".ditto/guidance.md (user-edited)"]);
  });

  it("falls back to legacy hex-parse from externalRunId when responseBody is null (AC #8)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "7a3b1c9",
      responseBody: null,
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBe("7a3b1c9");
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("returns null commitSha + empty arrays when responseBody is null and externalRunId is non-hex (AC #9)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "gh-action-12345",
      responseBody: null,
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBeNull();
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("returns null commitSha + empty arrays when externalRunId is null too", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: null,
      responseBody: null,
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBeNull();
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("defensive: malformed responseBody (string) falls back to legacy path without throwing (AC #13)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "abc1234",
      // string sneaked past the wire boundary (e.g., legacy/historical row)
      responseBody: "garbage" as unknown as Record<string, unknown>,
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBe("abc1234"); // hex-parse legacy fallback fired
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("defensive: malformed responseBody (array) falls back to legacy path without throwing (AC #13)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "ghactionnumeric",
      responseBody: ["not", "an", "object"] as unknown as Record<
        string,
        unknown
      >,
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBeNull();
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("defensive: responseBody object with missing keys uses legacy hex-parse for commitSha and empty arrays (AC #13)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "abc1234def",
      responseBody: { wrongKey: 1 },
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBe("abc1234def"); // legacy fallback for missing commitSha
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("defensive: responseBody object with non-string array elements falls back to empty array", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: null,
      responseBody: {
        commitSha: "validsha",
        actuallyChangedFiles: ["a.md", 42, "b.md"], // mixed-type array
        skippedFiles: [true, false], // wrong types
      },
    });
    expect(out).not.toBeNull();
    expect(out!.commitSha).toBe("validsha");
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });

  it("returns explicit null commitSha when responseBody.commitSha is explicitly null (zero-files-written scenario)", async () => {
    const { parseRunnerResponse } = await import("./retrofitter");
    const out = parseRunnerResponse({
      externalRunId: "abc1234", // hex — would otherwise be commitSha
      responseBody: {
        commitSha: null, // runner explicitly says no commit was made
        actuallyChangedFiles: [],
        skippedFiles: [],
      },
    });
    expect(out).not.toBeNull();
    // The brief preserves legacy hex-fallback when responseBody.commitSha is
    // missing/wrong-type. An explicit `null` is treated the same way (since
    // typeof null === "object" — the type-check `typeof obj.commitSha === "string"`
    // returns false). Brief 228 MVP behaviour preserved.
    expect(out!.commitSha).toBe("abc1234");
    expect(out!.actuallyChangedFiles).toEqual([]);
    expect(out!.skippedFiles).toBeUndefined();
  });
});
