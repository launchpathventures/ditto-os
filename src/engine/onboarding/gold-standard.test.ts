/**
 * Brief 226 — gold-standard match tests.
 *
 * Index-missing path is the MVP-mode default; index-present path validates
 * scoring. The DITTO_LANDSCAPE_INDEX_PATH env var lets a test point at a
 * fixture without touching the real docs/landscape-index.json.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchGoldStandard, resetGoldStandardCache } from "./gold-standard";
import type { StackSignals } from "@ditto/core";

const baseline = (overrides: Partial<StackSignals> = {}): StackSignals => ({
  buildSystems: [],
  testFrameworks: [],
  ci: { provider: "none", workflowPaths: [] },
  harness: { flavours: ["none"], markers: [] },
  ...overrides,
});

let scratchDir: string | null = null;

beforeEach(() => {
  resetGoldStandardCache();
});

afterEach(() => {
  if (scratchDir) {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    scratchDir = null;
  }
  delete process.env.DITTO_LANDSCAPE_INDEX_PATH;
  resetGoldStandardCache();
});

describe("matchGoldStandard", () => {
  it("returns empty array when the index file does not exist (MVP graceful path)", () => {
    process.env.DITTO_LANDSCAPE_INDEX_PATH = "/tmp/this-does-not-exist-226-gs";
    const result = matchGoldStandard(baseline());
    expect(result).toEqual([]);
  });

  it("returns the top entries by stack-signal overlap when index is populated", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "ditto-gs-test-"));
    const path = join(scratchDir, "landscape-index.json");
    writeFileSync(
      path,
      JSON.stringify([
        {
          name: "linear-cli",
          url: "https://github.com/example/linear-cli",
          stackSignals: ["node", "vitest", "github-actions"],
          oneLineRationale: "Mid-size TS CLI with strong test discipline.",
        },
        {
          name: "ruby-saas",
          url: "https://github.com/example/ruby-saas",
          stackSignals: ["ruby", "rspec"],
          oneLineRationale: "Ruby SaaS reference with RSpec backbone.",
        },
        {
          name: "polyglot-mono",
          url: "https://github.com/example/poly",
          stackSignals: ["node", "rust", "github-actions"],
          oneLineRationale: "Polyglot example using GitHub Actions.",
        },
      ]),
    );
    process.env.DITTO_LANDSCAPE_INDEX_PATH = path;
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json" }],
      testFrameworks: [{ framework: "vitest", evidence: "vitest.config.ts" }],
      ci: { provider: "github-actions", workflowPaths: [".github/workflows/ci.yml"] },
    });
    const result = matchGoldStandard(signals);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe("linear-cli");
  });

  it("returns empty array when index is corrupt JSON (degrade gracefully)", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "ditto-gs-test-"));
    const path = join(scratchDir, "landscape-index.json");
    writeFileSync(path, "{ this is not valid json");
    process.env.DITTO_LANDSCAPE_INDEX_PATH = path;
    const result = matchGoldStandard(baseline());
    expect(result).toEqual([]);
  });

  it("filters out entries with zero overlap", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "ditto-gs-test-"));
    const path = join(scratchDir, "landscape-index.json");
    writeFileSync(
      path,
      JSON.stringify([
        {
          name: "rust-only",
          url: "x",
          stackSignals: ["rust", "cargo-test"],
          oneLineRationale: "...",
        },
      ]),
    );
    process.env.DITTO_LANDSCAPE_INDEX_PATH = path;
    const signals = baseline({
      buildSystems: [{ kind: "node", evidence: "package.json" }],
    });
    expect(matchGoldStandard(signals)).toEqual([]);
  });
});
