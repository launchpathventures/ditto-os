import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  NetworkManualSearchResult,
  PersistedPossibleConnection,
} from "@/lib/engine";
import { SearchResultsPanel } from "./search-results-panel";
import { PossibleConnectionCard } from "./possible-connection-card";
import { SearchBox } from "./search-box";

function connection(
  partial: Partial<PersistedPossibleConnection> = {},
): PersistedPossibleConnection {
  return {
    id: "pc-1",
    proposalKey: "pc:abc",
    source: "ditto-member",
    personId: "priya-ops",
    displayName: "Priya Shah",
    headline: "Marketplace operations lead",
    canonicalUrl: null,
    isDittoMember: true,
    whyThisFits: "Rebuilt supply liquidity for a messy two-sided marketplace.",
    whyNow: "You're looking for marketplace operations help.",
    evidence: [
      {
        sourceLabel: "Ditto member signal",
        url: null,
        snippet: "Scaled supply ops for a regional marketplace.",
        claimId: "priya-ops",
      },
    ],
    risks: ["Geography unconfirmed — request asks for Europe."],
    confidence: "high",
    networkHealthFlags: [],
    nextAction: "save",
    introEligibility: "consent-unavailable",
    recommended: true,
    notRecommendedReason: null,
    scrubApplied: false,
    ...partial,
  };
}

function result(
  partial: Partial<NetworkManualSearchResult> = {},
): NetworkManualSearchResult {
  return {
    searchRunId: "run-1",
    mode: "both",
    query: "marketplace ops",
    webSearchAvailable: true,
    partial: false,
    scrubApplied: false,
    connections: [connection()],
    webUnavailableNotice: null,
    ...partial,
  };
}

describe("SearchResultsPanel", () => {
  it("renders the loading state", () => {
    const html = renderToStaticMarkup(
      <SearchResultsPanel result={null} loading />,
    );
    expect(html).toContain("search-results-loading");
    expect(html).toContain("possible connections");
  });

  it("renders the empty state with refine guidance", () => {
    const html = renderToStaticMarkup(
      <SearchResultsPanel result={result({ connections: [] })} />,
    );
    expect(html).toContain("search-results-empty");
    expect(html).toContain("Nothing strong enough");
  });

  it("renders the success state with a Possible Connection card", () => {
    const html = renderToStaticMarkup(
      <SearchResultsPanel result={result()} />,
    );
    expect(html).toContain("search-results-panel");
    expect(html).toContain("possible-connection-card");
    expect(html).toContain("Priya Shah");
    expect(html).toContain("Why this fits");
  });

  it("renders the partial state banner", () => {
    const html = renderToStaticMarkup(
      <SearchResultsPanel result={result({ partial: true })} />,
    );
    expect(html).toContain("search-results-partial");
  });

  it("renders the public-web-unavailable banner", () => {
    const html = renderToStaticMarkup(
      <SearchResultsPanel
        result={result({
          webSearchAvailable: false,
          webUnavailableNotice: "Public web search isn't available right now.",
        })}
      />,
    );
    expect(html).toContain("search-results-web-unavailable");
    expect(html).toContain("Public web search isn");
    expect(html).toContain("available right now");
  });
});

describe("PossibleConnectionCard", () => {
  it("shows evidence provenance, risks, and consent-safe actions", () => {
    const html = renderToStaticMarkup(
      <PossibleConnectionCard connection={connection()} />,
    );
    expect(html).toContain("Ditto member signal");
    expect(html).toContain("Geography unconfirmed");
    expect(html).toContain("Save to request");
    expect(html).not.toContain("Ask if open");
  });

  it("surfaces not-recommended copy for a suppressed result", () => {
    const html = renderToStaticMarkup(
      <PossibleConnectionCard
        connection={connection({
          recommended: false,
          notRecommendedReason:
            "Not currently recommended — this person is blocked for this network.",
          nextAction: "not-a-fit",
        })}
      />,
    );
    expect(html).toContain("Not currently recommended");
  });

  it("offers an invitation-candidate action only for non-members", () => {
    const member = renderToStaticMarkup(
      <PossibleConnectionCard connection={connection()} />,
    );
    expect(member).not.toContain("Flag to invite later");
    const nonMember = renderToStaticMarkup(
      <PossibleConnectionCard
        connection={connection({
          source: "public-web",
          isDittoMember: false,
          personId: null,
        })}
      />,
    );
    expect(nonMember).toContain("Flag to invite later");
  });
});

describe("SearchBox", () => {
  it("renders the scope selector and a no-contact reassurance", () => {
    const html = renderToStaticMarkup(<SearchBox onSubmit={() => {}} />);
    expect(html).toContain("network-search-box");
    expect(html).toContain("Ditto members only");
    expect(html).toContain("contacted without your say-so");
  });
});
