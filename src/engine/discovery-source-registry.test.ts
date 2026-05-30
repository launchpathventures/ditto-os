import { describe, expect, it } from "vitest";
import {
  blocksLinkedInSnippetClaim,
  classifyDiscoverySourceUrl,
  getDiscoverySourceRegistry,
  getDiscoverySourceRegistryEntry,
} from "./discovery-source-registry";

describe("discovery source registry", () => {
  it("defines policy metadata for every Brief 279 source class", () => {
    const entries = getDiscoverySourceRegistry();
    expect(entries.map((entry) => entry.sourceClass)).toEqual(
      expect.arrayContaining([
        "user-provided-url",
        "public-search-result",
        "public-website",
        "public-professional-post",
        "opportunity-portal",
        "referral-list",
        "linkedin-pointer",
        "linkedin-scrape",
      ]),
    );
    for (const entry of entries) {
      expect(entry.collectionMethod).toBeTruthy();
      expect(entry.storagePolicy).toBeTruthy();
      expect(entry.rateLimitPolicy).toBeTruthy();
      expect(entry.invitePolicy).toBeTruthy();
      expect(entry.allowedUse).toEqual(
        expect.objectContaining({
          collect: expect.any(Boolean),
          store: expect.any(Boolean),
          inviteUse: expect.any(Boolean),
        }),
      );
    }
  });

  it("treats LinkedIn as pointer-only unless formal API access exists", () => {
    expect(classifyDiscoverySourceUrl("https://www.linkedin.com/in/example")).toBe("linkedin-pointer");
    expect(blocksLinkedInSnippetClaim("public-search-result", "https://linkedin.com/in/example")).toBe(true);
    expect(getDiscoverySourceRegistryEntry("linkedin-pointer").allowedUse).toMatchObject({
      collect: true,
      store: true,
      inviteUse: false,
    });
    expect(getDiscoverySourceRegistryEntry("linkedin-scrape").allowedUse).toMatchObject({
      collect: false,
      store: false,
      inviteUse: false,
    });
  });
});
