import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoveryCandidateQueue } from "./discovery-candidate-queue";

describe("DiscoveryCandidateQueue", () => {
  it("renders evidence, risk flags, draft state, and operator controls", () => {
    const html = renderToStaticMarkup(
      <DiscoveryCandidateQueue
        token="admin-token"
        initialCandidates={[
          {
            id: "cand-1",
            status: "queued",
            channel: "email",
            sourceClass: "public-website",
            totalScore: 87,
            superconnectorFit: 90,
            activeOpportunityFit: 80,
            activeRequestFit: 75,
            sourceConfidence: 100,
            inviteRisk: 90,
            networkHealth: 90,
            riskFlags: ["review-contact-path"],
            suppressionReasons: [],
            inviteReason: "Rina has source-backed marketplace AI workflow proof.",
            proposedSubject: "A quick source-backed Ditto Network profile check",
            proposedBody: null,
            createdAt: "2026-05-18T12:00:00.000Z",
            profile: {
              id: "profile-1",
              displayName: "Rina Patel",
              headline: "Marketplace operator",
              canonicalUrl: "https://rina.example.com",
              sourceSummary: "Marketplace operator with AI workflow proof.",
              status: "internal",
            },
            claims: [
              {
                id: "claim-1",
                claimText: "Marketplace operator with AI workflow proof",
                evidenceSnippet: "Rina writes about marketplace AI workflow operations.",
                sourceLabel: "Rina website",
                sourceUrl: "https://rina.example.com",
                confidence: "high",
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("Rina Patel");
    expect(html).toContain("Marketplace operator with AI workflow proof");
    expect(html).toContain("review-contact-path");
    expect(html).toContain("Approve");
    expect(html).toContain("Send");
    expect(html).toContain("Suppress");
  });
});
