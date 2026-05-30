import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MemberSignalSourceIntake,
  memberSignalLimitedSourceCopy,
} from "./member-signal-source-intake";
import {
  MemberSignalReview,
  publicMemberSignalClaims,
  type MemberSignalClaimRow,
} from "./member-signal-review";
import { MemberSignalProvenance } from "./member-signal-provenance";

function claims(): MemberSignalClaimRow[] {
  return [
    {
      id: "claim-public",
      section: "knownFor",
      claimText: "Turns messy RevOps into operating rhythm.",
      sourceType: "pasted_text",
      sourceLabel: "Bio",
      sourceId: "source-1",
      evidenceSnippet: "I fix RevOps handoffs.",
      confidence: "medium",
      visibility: "public",
      approvalState: "approved",
    },
    {
      id: "claim-on-request",
      section: "openTo",
      claimText: "Open to advisory work.",
      sourceType: "inference",
      sourceLabel: "inferred by Ditto",
      sourceId: "source-1",
      evidenceSnippet: "Bio: advisory work.",
      confidence: "low",
      visibility: "on-request",
      approvalState: "approved",
    },
    {
      id: "claim-suggested",
      section: "proof",
      claimText: "Proof source to review.",
      sourceType: "website",
      sourceLabel: "Website",
      sourceUrl: "https://example.com",
      sourceId: "source-2",
      evidenceSnippet: "Example proof.",
      confidence: "low",
      visibility: "on-request",
      approvalState: "suggested",
    },
  ];
}

describe("Member Signal components", () => {
  it("renders source intake for LinkedIn, website, X, Instagram, other URL, pasted text, and import", () => {
    const html = renderToStaticMarkup(
      React.createElement(MemberSignalSourceIntake, { sessionId: "expert-session" }),
    );

    expect(html).toContain("LinkedIn");
    expect(html).toContain("Website");
    expect(html).toContain("X");
    expect(html).toContain("Instagram");
    expect(html).toContain("Add another URL");
    expect(html).toContain("Pasted text");
    expect(html).toContain("Import text");
    expect(html).toContain("Read sources");
  });

  it("has clear limited-source fallback copy for constrained platforms", () => {
    expect(memberSignalLimitedSourceCopy("linkedin")).toMatch(/public bio/i);
    expect(memberSignalLimitedSourceCopy("instagram")).toMatch(/upload screenshots/i);
  });

  it("renders review controls for provenance, visibility, approve, edit, and hide", () => {
    const html = renderToStaticMarkup(
      React.createElement(MemberSignalReview, { claims: claims(), sessionId: "expert-session" }),
    );

    expect(html).toContain("Approve your profile");
    expect(html).toContain("Needs approval");
    expect(html).toContain("Public");
    expect(html).toContain("On-request");
    expect(html).toContain("Private");
    expect(html).toContain("Hidden");
    expect(html).toContain("Approve");
    expect(html).toContain("Edit");
    expect(html).toContain("Hide");
    expect(html).toContain("Approve all public suggestions");
    expect(html).toContain("Bio");
    expect(html).toContain("inferred by Ditto");
  });

  it("filters public rendering down to approved public claims only", () => {
    expect(publicMemberSignalClaims(claims()).map((claim) => claim.id)).toEqual(["claim-public"]);
  });

  it("renders provenance chips with source and confidence", () => {
    const html = renderToStaticMarkup(
      React.createElement(MemberSignalProvenance, {
        sourceLabel: "Website",
        sourceUrl: "https://example.com",
        confidence: "medium",
      }),
    );
    expect(html).toContain("Website");
    expect(html).toContain("medium");
  });
});
