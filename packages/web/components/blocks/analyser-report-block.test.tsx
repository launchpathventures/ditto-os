/**
 * AnalyserReportBlock renderer tests.
 *
 * Smoke renders the block server-side via React's renderToStaticMarkup so
 * we can assert section presence + recommendation surface without bringing
 * in a DOM testing harness for what's still a server-renderable shape.
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalyserReportBlock } from "@/lib/engine";
import { AnalyserReportBlockComponent } from "./analyser-report-block";

const baseReport = (
  overrides: Partial<AnalyserReportBlock> = {},
): AnalyserReportBlock => ({
  type: "analyser_report",
  entityType: "work_item",
  entityId: "wi-1",
  projectId: "p-1",
  atAGlance: {
    stack: ["TypeScript", "pnpm", "next.js"],
    metadata: ["main branch", "847 files", "12.3 MB"],
    looksLike: "mid-size org tooling, mature CI",
    nearestNeighbours: [
      {
        name: "linear-cli",
        url: "https://github.com/example/linear-cli",
        rationale: "Mid-size TS CLI with strong test discipline.",
      },
    ],
  },
  strengths: [
    { text: "Tests exist (vitest, 47 specs)", evidence: "vitest.config.ts" },
    { text: "CI green on main", evidence: ".github/workflows/ci.yml" },
  ],
  watchOuts: [{ text: "No CONTRIBUTING.md — onboarding ad-hoc" }],
  missing: [
    { text: "No deploy config", defaultAction: "Set deploy_target to 'manual' by default" },
  ],
  recommendation: {
    runner: {
      kind: "claude-code-routine",
      rationale: "TS / Node + tests + CI — proven path.",
      alternatives: [
        { kind: "local-mac-mini", rationale: "Sensitive data stays on your network." },
      ],
    },
    trustTier: {
      tier: "spot_checked",
      rationale: "Tests + CI present → sample-review changes.",
      alternatives: [
        { tier: "supervised", rationale: "Review every output until comfortable." },
      ],
    },
  },
  status: "submitted",
  ...overrides,
});

const renderReport = (block: AnalyserReportBlock): string =>
  renderToStaticMarkup(
    React.createElement(AnalyserReportBlockComponent, { block }),
  );

describe("AnalyserReportBlockComponent", () => {
  it("renders the at-a-glance + sections + CTA row", () => {
    const html = renderReport(baseReport());
    expect(html).toContain("TypeScript");
    expect(html).toContain("847 files");
    expect(html).toContain("mid-size org tooling, mature CI");
    expect(html).toContain("linear-cli");
    expect(html).toContain("Strengths");
    expect(html).toContain("Watch-outs");
    expect(html).toContain("Missing");
    expect(html).toContain("Tests exist");
    expect(html).toContain("Looks good — start the project");
    expect(html).toContain("Edit before starting");
    // The apostrophe in Don't is HTML-encoded by renderToStaticMarkup.
    expect(html).toMatch(/Don.+t onboard/);
  });

  it("marks the recommended runner + tier with data attribute", () => {
    const html = renderReport(baseReport());
    expect(html).toContain('data-test="runner-claude-code-routine"');
    expect(html).toContain('data-test="trust-spot_checked"');
    expect(html).toContain('data-recommended="true"');
  });

  it("renders a partial-success alert when detectorErrors are present", () => {
    const html = renderReport(
      baseReport({
        detectorErrors: [{ detector: "detect-build-system", message: "EBADF" }],
      }),
    );
    expect(html).toContain('data-test="analyser-detector-errors"');
    expect(html).toContain("detect-build-system");
  });

  it("hides empty Findings sections when arrays are empty", () => {
    const html = renderReport(
      baseReport({ strengths: [], watchOuts: [], missing: [] }),
    );
    expect(html).toContain("Looks good — start the project");
    expect(html).not.toContain("Strengths");
    expect(html).not.toContain("Watch-outs");
    expect(html).not.toContain("Missing");
  });

  it("hides nearestNeighbours row when the list is empty", () => {
    const html = renderReport(
      baseReport({
        atAGlance: { ...baseReport().atAGlance, nearestNeighbours: [] },
      }),
    );
    expect(html).not.toContain("Closest matches");
  });

  it("composes bundled component classes (block.findings + tone modifiers, dopt + recbadge)", () => {
    const html = renderReport(baseReport());
    // Strengths/Watch-outs/Missing surfaces use the .block.findings primitive
    // with tone modifiers (Brief 230 CRIT-3 — distinct from .block.evidence
    // kv-pair primitive).
    expect(html).toContain("block findings");
    expect(html).toContain("tone-positive");
    expect(html).toContain("tone-caution");
    expect(html).toContain("tone-negative");
    expect(html).toContain("finding-title");
    expect(html).toContain("finding-list");
    expect(html).toContain("finding-item");
    expect(html).toContain("finding-icon");
    // Decision pickers (runner + trust-tier) use .dopt + .recbadge.
    expect(html).toContain("dopt");
    expect(html).toContain("recbadge");
  });
});
