import { describe, expect, it } from "vitest";
import { extractIdentityFromMessage } from "./request-identity-extract";
import type { RequestIdentity } from "./request-identity-card";

const EMPTY: RequestIdentity = { name: "", email: "", orgSite: "", credibility: "" };
const IDENTITY_STEP = { inIdentityStep: true };

describe("extractIdentityFromMessage", () => {
  it("pulls an email and reports it as changed", () => {
    const result = extractIdentityFromMessage("Reach me at alex@launchpath.co", EMPTY);
    expect(result.identity.email).toBe("alex@launchpath.co");
    expect(result.changed).toContain("email");
  });

  it("pulls a name from an 'I'm ___' intro", () => {
    const result = extractIdentityFromMessage("I'm Alex Rivers, founder.", EMPTY);
    expect(result.identity.name).toBe("Alex Rivers");
    expect(result.changed).toContain("name");
  });

  it("pulls a site/domain that isn't ditto when on the identity step", () => {
    const result = extractIdentityFromMessage(
      "My company is launchpath.co",
      EMPTY,
      IDENTITY_STEP,
    );
    expect(result.identity.orgSite).toBe("launchpath.co");
    expect(result.changed).toContain("orgSite");
  });

  it("captures a credibility phrase when on the identity step", () => {
    const result = extractIdentityFromMessage(
      "I'm a GTM lead at a climate startup raising seed.",
      EMPTY,
      IDENTITY_STEP,
    );
    expect(result.changed).toContain("credibility");
    expect(result.identity.credibility.toLowerCase()).toContain("gtm");
  });

  it("does not overwrite fields that are already populated", () => {
    const seeded: RequestIdentity = {
      name: "Alex Rivers",
      email: "alex@launchpath.co",
      orgSite: "launchpath.co",
      credibility: "",
    };
    const result = extractIdentityFromMessage(
      "I'm Bob, reach me at bob@bobs.net at example.com",
      seeded,
    );
    expect(result.identity.name).toBe("Alex Rivers");
    expect(result.identity.email).toBe("alex@launchpath.co");
    expect(result.identity.orgSite).toBe("launchpath.co");
    expect(result.changed).not.toContain("name");
    expect(result.changed).not.toContain("email");
  });

  it("ignores ditto-suffixed sites", () => {
    const result = extractIdentityFromMessage(
      "My space is yourname.ditto.you",
      EMPTY,
      IDENTITY_STEP,
    );
    expect(result.identity.orgSite).toBe("");
  });

  it("does NOT extract a name from a need-step answer like 'Two prior 0→1 launches'", () => {
    // Regression: the bare leading-capitalized-word pattern used to match "Two" as a name.
    const result = extractIdentityFromMessage("Two prior 0→1 launches", EMPTY);
    expect(result.changed).toEqual([]);
    expect(result.identity.name).toBe("");
  });

  it("does NOT extract identity from a need-step answer without strong signals", () => {
    const result = extractIdentityFromMessage("Fractional CMO, climate background", EMPTY);
    expect(result.changed).toEqual([]);
  });

  it("does extract from a comma-name pattern when on the identity step", () => {
    const result = extractIdentityFromMessage(
      "Alex Rivers, founder raising seed",
      EMPTY,
      IDENTITY_STEP,
    );
    expect(result.identity.name).toBe("Alex Rivers");
    expect(result.changed).toContain("name");
  });

  it("extracts when the message contains an email even outside the identity step", () => {
    const result = extractIdentityFromMessage(
      "Reach me at alex@launchpath.co — I'm Alex Rivers",
      EMPTY,
    );
    expect(result.identity.email).toBe("alex@launchpath.co");
    expect(result.identity.name).toBe("Alex Rivers");
  });
});
