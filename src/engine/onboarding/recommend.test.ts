/**
 * Brief 226 — recommendation heuristic tests.
 *
 * Mapping rules covered:
 *   - tests + CI + node → spot_checked + claude-code-routine
 *   - no tests / no CI → supervised + local-mac-mini
 *   - catalyst detected → claude-code-routine (fixed)
 *   - GitHub Actions only (no node) → github-action
 */

import { describe, it, expect } from "vitest";
import { recommendRunner, recommendTrustTier } from "./recommend";
import type { StackSignals } from "@ditto/core";

const baseline = (overrides: Partial<StackSignals> = {}): StackSignals => ({
  buildSystems: [],
  testFrameworks: [],
  ci: { provider: "none", workflowPaths: [] },
  harness: { flavours: ["none"], markers: [] },
  ...overrides,
});

describe("recommendRunner", () => {
  it("recommends claude-code-routine for node + tests + CI", () => {
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json" }],
      testFrameworks: [{ framework: "vitest", evidence: "vitest.config.ts" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
    });
    const r = recommendRunner(signals);
    expect(r.kind).toBe("claude-code-routine");
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  it("recommends local-mac-mini for no-tests-no-CI", () => {
    expect(recommendRunner(baseline()).kind).toBe("local-mac-mini");
  });

  it("recommends claude-code-routine when catalyst harness detected", () => {
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json" }],
      harness: { flavours: ["catalyst"], markers: [".catalyst"] },
    });
    expect(recommendRunner(signals).kind).toBe("claude-code-routine");
  });

  it("recommends github-action for non-node + GitHub Actions present", () => {
    const signals = baseline({
      buildSystems: [{ kind: "ruby", evidence: "Gemfile" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
    });
    expect(recommendRunner(signals).kind).toBe("github-action");
  });

  it("recommends local-mac-mini for very large node monorepos", () => {
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json" }],
      testFrameworks: [{ framework: "vitest", evidence: "vitest.config.ts" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
      fileCount: 12000,
    });
    expect(recommendRunner(signals).kind).toBe("local-mac-mini");
  });
});

describe("recommendTrustTier", () => {
  it("recommends spot_checked when tests + CI present", () => {
    const signals = baseline({
      testFrameworks: [{ framework: "vitest", evidence: "vitest.config.ts" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
    });
    expect(recommendTrustTier(signals).tier).toBe("spot_checked");
  });

  it("recommends supervised when no tests / no CI", () => {
    expect(recommendTrustTier(baseline()).tier).toBe("supervised");
  });

  it("alternative options always present", () => {
    expect(recommendTrustTier(baseline()).alternatives.length).toBeGreaterThan(0);
  });
});
