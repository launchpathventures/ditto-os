import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JobRequestCardBlock } from "@/lib/engine";
import { JobRequestCardInspectorModal } from "./job-request-card-inspector-modal";
import { JobRequestCardRenderer, JobRequestCardSurface } from "./job-request-card-renderer";

function fixture(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound with someone who can touch the CRM",
    referenceShape: "A contractor who set up sequences in their last role and touched the CRM.",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 booked discovery calls per week by day 30",
    budgetShape: {
      ballpark: "$8-12k/month, 3-month commitment",
      cadence: "monthly",
    },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  };
}

describe("JobRequestCardRenderer", () => {
  it("defaults to the operator audience and renders the internal trust artifact", () => {
    const html = renderToStaticMarkup(
      React.createElement(JobRequestCardRenderer, { card: fixture() }),
    );

    expect(html).toContain("Opportunity brief");
    expect(html).toContain("⌧");
    expect(html).toContain("Internal");
    expect(html).toContain("$8-12k/month, 3-month commitment");
    expect(html).toContain("Visible only to you");
    expect(html).toContain("How does this look to candidates?");
  });

  it("strips budget, cadence, anti-persona, and scout preference from candidate output", () => {
    const html = renderToStaticMarkup(
      React.createElement(JobRequestCardRenderer, { card: fixture(), audience: "candidate" }),
    );

    expect(html).toContain("Opportunity brief");
    expect(html).toContain("5 booked discovery calls per week");
    expect(html).not.toContain("$8-12k/month");
    expect(html).not.toContain("monthly");
    expect(html).not.toContain("pure copywriters");
    expect(html).not.toContain("Scan off-network");
    expect(html).not.toContain("Internal");
  });

  it("renders the side-by-side inspector modal when opened", () => {
    const card = fixture();
    const html = renderToStaticMarkup(
      React.createElement(JobRequestCardInspectorModal, {
        defaultOpen: true,
        operatorPreview: React.createElement(JobRequestCardSurface, {
          card,
          audience: "operator",
        }),
        candidatePreview: React.createElement(JobRequestCardSurface, {
          card,
          audience: "candidate",
        }),
      }),
    );

    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("Operator view");
    expect(html).toContain("Candidate view");
    expect(html).toContain("$8-12k/month, 3-month commitment");
  });
});
