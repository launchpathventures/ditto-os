import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { PreviewPane } from "./preview-pane";

describe("PreviewPane", () => {
  it("renders the expert placeholder branch", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "expert" }),
    );
    expect(html).toContain("Profile");
    expect(html).toContain("Hunting next thing");
  });

  it("renders the client placeholder branch", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "client" }),
    );
    expect(html).toContain("Opportunity brief");
    expect(html).toContain("Need the right person");
  });

  it("renders the live expert profile card preview", () => {
    const card: NetworkProfileCardBlock = {
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

    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "expert", profileCard: card, profileProgress: 6 }),
    );

    expect(html).toContain("Tap to see your card");
    expect(html).toContain("Tim Green");
    expect(html).toContain("still asking Tim");
  });

  it("renders a null-mode ghost placeholder", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: null }),
    );
    expect(html).toContain("Profile");
  });
});
