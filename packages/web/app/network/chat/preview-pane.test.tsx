import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JobRequestCardBlock, NetworkProfileCardBlock } from "@/lib/engine";
import { mobileEditPrompt, PreviewPane, previewPaneOpacity } from "./preview-pane";

function profileCard(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "Turns founder networks into warm pipeline",
    signalDots: [
      { id: "uvp", label: "Value", filled: true, color: "petal" },
      { id: "fit", label: "Fit", filled: true, color: "mint" },
    ],
    badges: [{ label: "Introductions", color: "canary" }],
    narrativeMd: "I help founders turn latent trust into *warm commercial paths*.",
    antiPersonaMd: null,
    greeterCuratedBy: "alex",
    lastUpdatedAt: new Date().toISOString(),
    visibility: "on-request",
    shareUrl: "/people/timhgreen",
    ogImageUrl: "/api/v1/network/og/timhgreen",
  };
}

function jobRequestCard(): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound with someone who can touch the CRM",
    referenceShape: "A contractor set up sequences and cleaned the CRM.",
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
  };
}

describe("PreviewPane", () => {
  it("calculates the committed client and expert opacity table", () => {
    expect(previewPaneOpacity("client", 1)).toBe(0.48);
    expect(previewPaneOpacity("client", 6)).toBeCloseTo(0.48 + (5 / 6) * 0.52, 5);
    expect(previewPaneOpacity("client", 7)).toBe(1);
    expect(previewPaneOpacity("client", 8)).toBe(1);
    expect(previewPaneOpacity("expert", 1)).toBe(0.48);
    expect(previewPaneOpacity("expert", 6)).toBe(1);
    expect(previewPaneOpacity("expert", 7)).toBe(1);
    expect(previewPaneOpacity(null, 3)).toBe(1);
  });

  it("renders the expert placeholder branch", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "expert" }),
    );
    expect(html).toContain("Live profile card");
    expect(html).toContain("Card preview builds here");
  });

  it("renders the client placeholder branch", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "client" }),
    );
    expect(html).toContain("Live opportunity brief");
    expect(html).toContain("Brief preview builds here");
    expect(html).toContain("Open brief preview");
  });

  it("renders the live expert profile card preview", () => {
    const card = profileCard();

    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "expert", profileCard: card, profileProgress: 6 }),
    );

    expect(html).toContain("Open card preview");
    expect(html).toContain("Tim Green");
    expect(html).toContain("still asking Tim");
    expect(html).toContain("Draft card");
  });

  it("renders the live client job-request preview", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, {
        mode: "client",
        jobRequestCard: jobRequestCard(),
        profileProgress: 6,
      }),
    );

    expect(html).toContain("Open brief preview");
    expect(html).toContain("outbound with someone who can touch the CRM");
    expect(html).toContain("$8-12k/month, 3-month commitment");
    expect(html).toContain("opacity:0.913");
  });

  it("renders mobile tap-to-edit chips without inline form fields", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, {
        mode: "client",
        jobRequestCard: jobRequestCard(),
        mobileInitiallyOpen: true,
      }),
    );

    expect(html).toContain("Edit outcome");
    expect(html).toContain("Edit budget");
    expect(html).toContain("min-h-11");
    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("aria-modal=\"true\"");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(mobileEditPrompt("budget")).toBe("Want to change the budget? Tell me what it should be.");
  });

  it("renders a null-mode ghost placeholder", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: null }),
    );
    expect(html).toContain("Live profile card");
  });
});
