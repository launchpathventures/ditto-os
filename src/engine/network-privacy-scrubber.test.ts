import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import type { NetworkProfileCardBlock } from "./content-blocks";
import {
  NETWORK_PRIVACY_SURFACES,
  scrubForSurface,
} from "./network-privacy-scrubber";

const PRIVATE_TEXT = "Private acquisition target";
const HIDDEN_TEXT = "Hidden investor concern";
const ON_REQUEST_TEXT = "On-request customer name";
const ANTI_PERSONA_TEXT = "enterprise procurement committees";

function card(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "priya-ops",
    name: "Priya Shah",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "Marketplace operations lead",
    signalDots: [{ id: "proof", label: "Proof", filled: true, color: "canary" }],
    badges: [{ label: "ops", color: "mint" }],
    narrativeMd: "Publicly trusted for marketplace operations.",
    antiPersonaMd: ANTI_PERSONA_TEXT,
    greeterCuratedBy: "mira",
    lastUpdatedAt: "2026-05-18T00:00:00.000Z",
    visibility: "public",
    shareUrl: "/people/priya-ops",
    ogImageUrl: "/people/priya-ops/opengraph-image",
  };
}

function payload() {
  return {
    profile: card(),
    claims: [
      {
        id: "public-claim",
        visibility: "public",
        claimText: "Public marketplace operations proof",
      },
      {
        id: "private-claim",
        visibility: "private",
        claimText: PRIVATE_TEXT,
      },
      {
        id: "hidden-claim",
        visibility: "hidden",
        claimText: HIDDEN_TEXT,
      },
      {
        id: "on-request-claim",
        visibility: "on-request",
        claimText: ON_REQUEST_TEXT,
      },
    ],
    summary: [
      "Public marketplace operations proof.",
      PRIVATE_TEXT,
      HIDDEN_TEXT,
      ON_REQUEST_TEXT,
      ANTI_PERSONA_TEXT,
    ].join(" "),
  };
}

describe("scrubForSurface", () => {
  it.each(NETWORK_PRIVACY_SURFACES)(
    "scrubs private, hidden, on-request, and anti-persona data from %s",
    (surface) => {
      const result = scrubForSurface(payload(), {
        surface,
        viewerContext: { viewerType: "visitor" },
      });

      const serialized = JSON.stringify(result.payload);
      expect(serialized).toContain("Public marketplace operations proof");
      expect(serialized).not.toContain(PRIVATE_TEXT);
      expect(serialized).not.toContain(HIDDEN_TEXT);
      expect(serialized).not.toContain(ON_REQUEST_TEXT);
      expect(serialized).not.toContain(ANTI_PERSONA_TEXT);
      expect(result.payload?.profile.antiPersonaMd).toBeNull();
      expect(result.payload?.claims).toEqual([
        {
          id: "public-claim",
          visibility: "public",
          claimText: "Public marketplace operations proof",
        },
      ]);
      expect(result.scrubDecision.withheldByReason.private).toBe(1);
      expect(result.scrubDecision.withheldByReason.hidden).toBe(1);
      expect(result.scrubDecision.withheldByReason.onRequest).toBe(1);
      expect(result.scrubDecision.withheldByReason.antiPersona).toBe(1);
    },
  );

  it("allows on-request claims only when approved for this viewer", () => {
    const result = scrubForSurface(payload(), {
      surface: "public-profile",
      viewerContext: {
        viewerType: "approved-viewer",
        approvedClaimIds: ["on-request-claim"],
      },
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).toContain(ON_REQUEST_TEXT);
    expect(serialized).not.toContain(PRIVATE_TEXT);
    expect(serialized).not.toContain(HIDDEN_TEXT);
    expect(serialized).not.toContain(ANTI_PERSONA_TEXT);
    expect(result.scrubDecision.approvedOnRequest).toBe(1);
  });

  it("keeps owner context intact for owner-visible data", () => {
    const result = scrubForSurface(payload(), {
      surface: "public-profile",
      viewerContext: { viewerType: "owner" },
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).toContain(PRIVATE_TEXT);
    expect(serialized).toContain(HIDDEN_TEXT);
    expect(serialized).toContain(ON_REQUEST_TEXT);
    expect(serialized).toContain(ANTI_PERSONA_TEXT);
    expect(result.scrubDecision.withheldTotal).toBe(0);
  });

  it("is pure and deterministic", () => {
    const source = readFileSync(
      new URL("./network-privacy-scrubber.ts", import.meta.url),
      "utf-8",
    );
    expect(source).not.toContain("networkDb");
    expect(source).not.toContain("../db");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("fs/");

    const first = scrubForSurface(payload(), {
      surface: "claim-invite",
      viewerContext: { viewerType: "visitor" },
    });
    const second = scrubForSurface(payload(), {
      surface: "claim-invite",
      viewerContext: { viewerType: "visitor" },
    });
    expect(second).toEqual(first);
  });
});
