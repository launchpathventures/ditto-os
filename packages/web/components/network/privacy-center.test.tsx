import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { PrivacyCenter } from "./privacy-center";
import {
  PRIVACY_CENTER_SECTIONS,
  PRIVACY_SECTION_STATES,
  PRIVACY_SECTION_STATE_COPY,
  createDiscoveryPrivacyCenterData,
  type PrivacyCenterData,
} from "./privacy-center-data";

function profileCard(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "avery-ops",
    name: "Avery Stone",
    portraitUrl: null,
    cityLabel: "London",
    oneLineRole: "Marketplace operations operator",
    signalDots: [{ label: "Ops", value: "supply liquidity", color: "mint" }],
    badges: [{ label: "operator", color: "lavender" }],
    narrativeMd: "Avery helps marketplace teams fix liquidity.",
    antiPersonaMd: "NO_LEAK_ANTI_PERSONA_TEXT",
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-18T00:00:00.000Z",
    visibility: "public",
    shareUrl: "/people/avery-ops",
    ogImageUrl: "/api/v1/network/people/avery/card-png",
  };
}

function data(): PrivacyCenterData {
  return {
    identity: {
      viewerLabel: "Avery Stone",
      subjectType: "public-profile",
      subjectId: "user-1",
      sessionId: "session-1",
      userId: "user-1",
      emailMasked: "a***@example.com",
      verified: true,
    },
    memberSignalId: "signal-1",
    profileCard: profileCard(),
    profilePaused: false,
    sources: [
      {
        id: "source-1",
        label: "Website",
        type: "website",
        url: "https://example.com",
        status: "found",
        claimsDerived: 2,
        evidenceSnippet: "Public case study.",
      },
    ],
    claims: [
      {
        id: "claim-public",
        section: "knownFor",
        claimText: "Visible public claim",
        sourceLabel: "Website",
        sourceUrl: "https://example.com",
        sourceType: "website",
        evidenceSnippet: "Public evidence",
        confidence: "high",
        visibility: "public",
        approvalState: "approved",
      },
      {
        id: "claim-on-request-approved",
        section: "openTo",
        claimText: "Visible on-request claim",
        sourceLabel: "Website",
        sourceType: "website",
        evidenceSnippet: "Approved evidence",
        confidence: "medium",
        visibility: "on-request",
        approvalState: "approved",
        viewerApprovedOnRequest: true,
      },
      {
        id: "claim-private",
        section: "proof",
        claimText: "NO_LEAK_PRIVATE_CLAIM",
        sourceLabel: "Private note",
        sourceType: "pasted_text",
        evidenceSnippet: "NO_LEAK_PRIVATE_EVIDENCE",
        confidence: "low",
        visibility: "private",
        approvalState: "approved",
      },
      {
        id: "claim-hidden",
        section: "notAFitFor",
        claimText: "NO_LEAK_HIDDEN_CLAIM",
        sourceLabel: "Hidden note",
        sourceType: "pasted_text",
        evidenceSnippet: "NO_LEAK_HIDDEN_EVIDENCE",
        confidence: "low",
        visibility: "hidden",
        approvalState: "hidden",
      },
      {
        id: "claim-suggested",
        section: "canHelpWith",
        claimText: "NO_LEAK_UNAPPROVED_ON_REQUEST",
        sourceLabel: "Draft source",
        sourceType: "inference",
        evidenceSnippet: "NO_LEAK_UNAPPROVED_EVIDENCE",
        confidence: "low",
        visibility: "on-request",
        approvalState: "suggested",
      },
    ],
    requests: [
      {
        id: "request-1",
        status: "active",
        mode: "both",
        title: "Find a marketplace operator",
        summary: "Public summary only.",
        updatedAt: "2026-05-18",
      },
    ],
    watches: [
      {
        id: "watch-1",
        status: "watched",
        displayName: "Priya Shah",
        headline: "Marketplace ops",
        requestId: "request-1",
        confidence: "high",
        updatedAt: "2026-05-18",
      },
    ],
    introductions: [
      {
        id: "intro-1",
        counterpart: "Requester",
        date: "2026-05-18",
        state: "refused-by-greeter",
        refusalReason: "anti-persona",
      },
    ],
    blocks: [
      {
        id: "block-1",
        kind: "pattern",
        value: "*@blocked.example",
        reasonCode: "user-block",
        createdAt: "2026-05-18",
      },
    ],
    exportSubjectType: "public-profile",
    exportSubjectId: "user-1",
    deleteSubjectType: "public-profile",
    deleteSubjectId: "user-1",
    deleteRecoveryDays: 30,
    permanentStubYears: 2,
    profileUrlBehavior: "410",
  };
}

describe("PrivacyCenter", () => {
  it("renders sources, visible claims, and no private or anti-persona text", () => {
    const html = renderToStaticMarkup(<PrivacyCenter data={data()} />);

    expect(html).toContain("Website");
    expect(html).toContain("Remove from future reasoning");
    expect(html).toContain("Visible public claim");
    expect(html).toContain("Visible on-request claim");
    expect(html).toContain("Edit");
    expect(html).toContain("Delete claim");
    expect(html).toContain("Add filter");
    expect(html).not.toContain("NO_LEAK_PRIVATE_CLAIM");
    expect(html).not.toContain("NO_LEAK_PRIVATE_EVIDENCE");
    expect(html).not.toContain("NO_LEAK_HIDDEN_CLAIM");
    expect(html).not.toContain("NO_LEAK_UNAPPROVED_ON_REQUEST");
    expect(html).not.toContain("NO_LEAK_ANTI_PERSONA_TEXT");
    expect(html).toContain("private, hidden, or unapproved");
  });

  it("distinguishes reversible pause from destructive delete", () => {
    const html = renderToStaticMarkup(<PrivacyCenter data={data()} />);

    expect(html).toContain("Pause public profile");
    expect(html).toContain('data-action-kind="reversible"');
    expect(html).toContain("Delete public projection");
    expect(html).toContain('data-action-kind="destructive"');
    expect(html).toContain("Pause is reversible");
  });

  it("renders export as status plus action and never as an artifact block", () => {
    const html = renderToStaticMarkup(<PrivacyCenter data={data()} />);

    expect(html).toContain('data-export-flow="status-card-action-block"');
    expect(html).toContain("Privacy export");
    expect(html).toContain("Verify and export");
    expect(html).not.toContain('type="artifact"');
    expect(html).not.toContain("ArtifactBlock");
  });

  it("states the ratified delete retention window and HTTP 410 behavior", () => {
    const html = renderToStaticMarkup(<PrivacyCenter data={data()} />);

    expect(html).toContain("recoverable for 30 days");
    expect(html).toContain("2 years");
    expect(html).toContain("HTTP 410");
  });

  it("renders the Discovery Profile self-service with four equally weighted exits", () => {
    const html = renderToStaticMarkup(
      <PrivacyCenter
        data={createDiscoveryPrivacyCenterData({
          subjectId: "discovery-1",
          emailMasked: "d***@example.com",
          claimToken: "claim-token-1",
        })}
      />,
    );

    const exitCount = (html.match(/data-testid="discovery-exit"/g) ?? []).length;
    const equalCount = (html.match(/data-weight="equal"/g) ?? []).length;
    expect(html).toContain("Original to Ditto");
    expect(exitCount).toBe(4);
    expect(equalCount).toBe(4);
    expect(html).toContain("Claim and correct");
    expect(html).toContain('data-action="claim"');
    expect(html).toContain("Decline contact");
    expect(html).toContain('data-action="decline"');
    expect(html).toContain("Suppress future use");
    expect(html).toContain('data-action="suppress"');
    expect(html).toContain("Delete profile");
    expect(html).toContain('data-action="delete"');
    expect(html).not.toContain("Sealed refusal logic");
    expect(html).not.toContain("NO_LEAK_ANTI_PERSONA_TEXT");
  });

  it("defines all five states for every section and renders state overrides", () => {
    for (const section of PRIVACY_CENTER_SECTIONS) {
      expect(Object.keys(PRIVACY_SECTION_STATE_COPY[section.key]).sort()).toEqual(
        [...PRIVACY_SECTION_STATES].sort(),
      );
    }

    const html = renderToStaticMarkup(
      <PrivacyCenter
        data={data()}
        sectionStates={{
          mirror: "loading",
          sources: "empty",
          claims: "error",
          profile: "partial",
          requests: "success",
        }}
      />,
    );

    expect(html).toContain('data-section-state="loading"');
    expect(html).toContain('data-section-state="empty"');
    expect(html).toContain('data-section-state="error"');
    expect(html).toContain('data-section-state="partial"');
    expect(html).toContain('data-section-state="success"');
  });
});
