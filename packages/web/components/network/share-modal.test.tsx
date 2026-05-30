import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { NetworkCardOgFrame, NetworkCardSilhouette } from "./card-silhouette";
import { ShareModal } from "./share-modal";
import { buildWebsiteBadgeSnippet } from "./website-badge-snippet";

function card(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "operator for founder-led B2B teams",
    signalDots: [{ id: "value", label: "Value", filled: true, color: "canary" }],
    badges: [{ label: "RevOps", color: "canary" }],
    narrativeMd: "I *untangle* sales motion.",
    antiPersonaMd: "pure copywriting briefs",
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-13T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/people/timhgreen",
    ogImageUrl: "https://ditto.partners/people/timhgreen/opengraph-image",
  };
}

describe("Network share modal", () => {
  it("renders the required modal structure and default LOUD live preview", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareModal, {
        card: card(),
        open: true,
        onOpenChange: () => {},
        initialVariants: {
          quiet: "quiet https://ditto.partners/people/timhgreen",
          loud: "edited loud overlay https://ditto.partners/people/timhgreen",
          ask: "ask https://ditto.partners/people/timhgreen",
        },
      }),
    );
    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("bg-black/40");
    expect(html).toContain("backdrop-blur-md");
    expect(html).toContain("QUIET");
    expect(html).toContain("LOUD");
    expect(html).toContain("ASK");
    expect(html).toContain("Copy");
    expect(html).toContain("Post to LinkedIn");
    expect(html).toContain("Download card PNG");
    expect(html).toContain("edited loud overlay");
    expect(html).toContain("card-silhouette-share-overlay");
  });

  it("uses two phoenix gradient nodes and one italic verb node", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkCardSilhouette, { card: card(), imageMode: true }));
    expect(html.match(/data-phoenix-gradient=/g)).toHaveLength(2);
    expect(html.match(/data-italic-verb=/g)).toHaveLength(1);
  });

  it("does not render raw anti-persona text in the public silhouette", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkCardSilhouette, { card: card(), imageMode: true }));
    expect(html).toContain("owner-visible only");
    expect(html).not.toContain("pure copywriting briefs");
  });

  it("renders the OG frame through next/og without Satori display errors", async () => {
    const response = new ImageResponse(
      React.createElement(NetworkCardOgFrame, { card: card() }),
      { width: 1200, height: 630 },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("renders the Studio channel-tab strip and LinkedIn voice matrix in studio mode", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareModal, {
        card: card(),
        open: true,
        onOpenChange: () => {},
        mode: "studio",
      }),
    );
    expect(html).toContain("aria-label=\"Share Studio\"");
    expect(html).toContain("network-share-studio");
    expect(html).toContain("share-studio-channel-tabs");
    for (const label of ["LinkedIn", "X", "Instagram", "Email signature", "Website badge"]) {
      expect(html).toContain(label);
    }
    // LinkedIn (default active channel) exposes all three voices.
    expect(html).toContain("LOUD");
    expect(html).toContain("QUIET");
    expect(html).toContain("ASK");
  });

  it("keeps compact mode as the default (Brief 260 regression)", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareModal, {
        card: card(),
        open: true,
        onOpenChange: () => {},
        initialVariants: {
          quiet: "quiet https://ditto.partners/people/timhgreen",
          loud: "loud https://ditto.partners/people/timhgreen",
          ask: "ask https://ditto.partners/people/timhgreen",
        },
      }),
    );
    expect(html).toContain("Share profile card");
    expect(html).toContain("Post to LinkedIn");
    expect(html).toContain("Download card PNG");
    expect(html).not.toContain("network-share-studio");
  });

  it("website-badge snippet is byte-identical regardless of card content (AC 9)", () => {
    const a = buildWebsiteBadgeSnippet("timhgreen");
    const b = buildWebsiteBadgeSnippet("timhgreen");
    expect(a).toBe(b);
    expect(a).toContain('href="https://ditto.partners/people/timhgreen?ref=badge"');
    expect(a).toContain('width="200" height="40"');
    expect(a).toContain('alt="Available through Ditto"');
    expect(a).toContain('rel="noopener"');
    expect(a).not.toContain("<script");
    expect(a).not.toContain("<iframe");
    expect(a).not.toContain("onerror");
    // Handle is URL-encoded into the path segment.
    expect(buildWebsiteBadgeSnippet("a b/c")).toContain("/people/a%20b%2Fc?ref=badge");
  });

  it("wires the retry button to trigger a fresh variant fetch", () => {
    const source = readFileSync(path.join(process.cwd(), "packages/web/components/network/share-modal.tsx"), "utf8");
    expect(source).toContain("setRetryAttempt((attempt) => attempt + 1)");
    expect(source).toContain("[card, open, retryAttempt, sessionId, variants]");
  });
});
