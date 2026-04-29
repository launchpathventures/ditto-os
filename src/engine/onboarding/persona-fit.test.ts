/**
 * Brief 226 — persona-fit scoring tests.
 *
 * Critical: descriptor strings NEVER expose internal persona-shape labels
 * (Brief 226 §Constraints — IMPORTANT #8 type-system enforcement).
 */

import { describe, it, expect } from "vitest";
import { scorePersonaFit } from "./persona-fit";
import type { StackSignals } from "@ditto/core";

const baseline = (overrides: Partial<StackSignals> = {}): StackSignals => ({
  buildSystems: [],
  testFrameworks: [],
  ci: { provider: "none", workflowPaths: [] },
  harness: { flavours: ["none"], markers: [] },
  ...overrides,
});

describe("scorePersonaFit", () => {
  it("returns mid-size org tooling, mature CI for TS+tests+CI", () => {
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json", packageManager: "pnpm" }],
      testFrameworks: [{ framework: "vitest", evidence: "vitest.config.ts" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
    });
    expect(scorePersonaFit(signals).descriptor).toBe(
      "mid-size org tooling, mature CI",
    );
  });

  it("returns AI-aware descriptor when claude harness markers present", () => {
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json", packageManager: "pnpm" }],
      testFrameworks: [{ framework: "vitest", evidence: "vitest.config.ts" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
      harness: { flavours: ["claude-md"], markers: ["CLAUDE.md"] },
    });
    expect(scorePersonaFit(signals).descriptor).toBe(
      "AI-driven product code, mature CI, agent-aware",
    );
  });

  it("returns team-output descriptor for tests-but-no-CI", () => {
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json" }],
      testFrameworks: [{ framework: "jest", evidence: "jest.config.js" }],
    });
    expect(scorePersonaFit(signals).descriptor).toBe(
      "team-output review with quality gating",
    );
  });

  it("returns scripting descriptor for python+pytest", () => {
    const signals = baseline({
      buildSystems: [{ kind: "python", evidence: "pyproject.toml" }],
      testFrameworks: [{ framework: "pytest", evidence: "pyproject.toml" }],
    });
    expect(scorePersonaFit(signals).descriptor).toBe(
      "data / scripting toolchain, test-backed",
    );
  });

  it("returns glue-script descriptor for empty repo", () => {
    expect(scorePersonaFit(baseline()).descriptor).toBe(
      "five-script glue repo, no test harness yet",
    );
  });

  it("returns fallback descriptor when nothing matches strongly", () => {
    const signals = baseline({
      buildSystems: [{ kind: "java", evidence: "pom.xml" }],
    });
    expect(scorePersonaFit(signals).descriptor).toBe(
      "small project, no clear stack signature",
    );
  });

  it("type-system enforcement: returned descriptor never matches internal-label pattern", () => {
    const matrix: StackSignals[] = [
      baseline(),
      baseline({ buildSystems: [{ kind: "node", evidence: "package.json" }] }),
      baseline({
        buildSystems: [{ kind: "python", evidence: "pyproject.toml" }],
        testFrameworks: [{ framework: "pytest", evidence: "pyproject.toml" }],
      }),
      baseline({
        buildSystems: [
          { kind: "node", evidence: "package.json" },
          { kind: "rust", evidence: "Cargo.toml" },
        ],
      }),
    ];
    const internalLabelPattern = /-shaped\b/i;
    for (const signals of matrix) {
      const { descriptor } = scorePersonaFit(signals);
      expect(descriptor).not.toMatch(internalLabelPattern);
      expect(descriptor).not.toContain("Jordan");
      expect(descriptor).not.toContain("Lisa");
      expect(descriptor).not.toContain("Nadia");
      expect(descriptor).not.toContain("Rob");
    }
  });
});
