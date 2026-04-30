/**
 * Brief 228 — RetrofitPlanBlock renderer tests.
 *
 * Smoke renders the block server-side via React's renderToStaticMarkup so we
 * can assert section presence per status state without a DOM testing harness
 * (mirrors the Brief 226 AnalyserReportBlock test pattern). Brief 228 ships
 * 5 surfaceable status states + a supervised-tier placeholder; Brief 229
 * extends with the per-file approval surface.
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RetrofitPlanBlock, RetrofitPlanStatus } from "@/lib/engine";
import { RetrofitPlanBlockComponent } from "./retrofit-plan-block";

const baseBlock = (overrides: Partial<RetrofitPlanBlock> = {}): RetrofitPlanBlock => ({
  type: "retrofit_plan",
  planId: "plan-1",
  projectId: "proj-1",
  processRunId: "run-1",
  files: [
    {
      id: "f1",
      path: ".ditto/version.txt",
      contentPreview: "1\n",
      byteSize: 2,
      action: "create",
    },
    {
      id: "f2",
      path: ".ditto/guidance.md",
      contentPreview: "# Project guidance",
      byteSize: 1234,
      action: "update",
    },
    {
      id: "f3",
      path: ".ditto/skills.json",
      contentPreview: '{"version":1}',
      byteSize: 50,
      action: "unchanged",
    },
  ],
  runnerKind: "local-mac-mini",
  trustTier: "autonomous",
  status: "dispatched",
  ...overrides,
});

const STATUS_LABELS: Record<RetrofitPlanStatus, string> = {
  "pending-review": "Per-file review pending",
  "pending-sample-review": "Sample review pending",
  "partially-approved": "Partially approved",
  dispatched: "Dispatching",
  committed: "Committed",
  rejected: "Rejected",
  failed: "Failed",
};

describe("RetrofitPlanBlockComponent", () => {
  it("always renders the title 'Retrofit plan' + the runner + tier", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, { block: baseBlock() }),
    );
    expect(html).toContain("Retrofit plan");
    expect(html).toContain("local-mac-mini");
    expect(html).toContain("autonomous");
  });

  it("lists every file's path + byte size + action descriptor", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, { block: baseBlock() }),
    );
    expect(html).toContain(".ditto/version.txt");
    expect(html).toContain(".ditto/guidance.md");
    expect(html).toContain(".ditto/skills.json");
    // 3 file count summary
    expect(html).toMatch(/1 create/);
    expect(html).toMatch(/1 update/);
    expect(html).toMatch(/1 unchanged/);
  });

  it("renders the 'dispatched' status — in-flight indicator", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({ status: "dispatched" }),
      }),
    );
    expect(html).toContain(STATUS_LABELS.dispatched);
    expect(html).toMatch(/Runner is executing/);
  });

  it("renders the 'committed' status with commit SHA + view-diff CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({
          status: "committed",
          commitSha: "abc123def456789",
          commitUrl: "https://github.com/example/repo/commit/abc123",
        }),
      }),
    );
    expect(html).toContain(STATUS_LABELS.committed);
    expect(html).toMatch(/abc123def456/); // first 12 chars
    expect(html).toContain("View diff in repo");
  });

  it("renders the 'committed' (no-changes idempotent) status with info side-car", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({ status: "committed", commitSha: undefined }),
      }),
    );
    expect(html).toContain(STATUS_LABELS.committed);
    expect(html).toMatch(/No changes to retrofit/);
  });

  it("renders the 'rejected' status with hand-author CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({
          status: "rejected",
          trustTier: "critical",
          failureReason:
            "Critical-tier projects must hand-author their .ditto/ substrate. See ADR-043.",
        }),
      }),
    );
    expect(html).toContain(STATUS_LABELS.rejected);
    expect(html).toMatch(/hand-author/);
    expect(html).toContain("Read about hand-authoring .ditto/");
  });

  it("renders the 'failed' status with reason + Re-run CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({
          status: "failed",
          failureReason: "Dispatch failed: network unreachable",
        }),
      }),
    );
    expect(html).toContain(STATUS_LABELS.failed);
    expect(html).toMatch(/Dispatch failed/);
    expect(html).toMatch(/network unreachable/);
    expect(html).toContain("Re-run retrofit");
  });

  it("renders the 'pending-sample-review' status with sampled-files callout", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({
          status: "pending-sample-review",
          trustTier: "spot_checked",
          sampledFileIds: ["f1"], // sample 1 file
        }),
      }),
    );
    expect(html).toContain(STATUS_LABELS["pending-sample-review"]);
    expect(html).toMatch(/Sample review needed/);
    // Sampled file appears
    expect(html).toContain(".ditto/version.txt");
    // Section header showing 'Sampled files'
    expect(html).toMatch(/Sampled files/);
  });

  it("renders the 'pending-review' (supervised) status with placeholder + escalation CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({
          status: "pending-review",
          trustTier: "supervised",
        }),
      }),
    );
    expect(html).toContain(STATUS_LABELS["pending-review"]);
    expect(html).toMatch(/Brief 229/);
    expect(html).toContain("Escalate to autonomous");
  });

  it("surfaces skippedUserTouchedFiles count in the evidence card", () => {
    const html = renderToStaticMarkup(
      React.createElement(RetrofitPlanBlockComponent, {
        block: baseBlock({
          status: "committed",
          commitSha: "abc123",
          skippedUserTouchedFiles: [".ditto/guidance.md"],
        }),
      }),
    );
    expect(html).toMatch(/Skipped \(user-edited\)/);
    expect(html).toMatch(/1 file/);
  });
});
