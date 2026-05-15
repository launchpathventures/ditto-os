import { describe, expect, it } from "vitest";
import { diffDraftFields, fieldLabel, labelChangedFields } from "./request-diff";
import type { ActiveRequestDraft } from "./request-review";

function draft(overrides: Partial<ActiveRequestDraft> = {}): ActiveRequestDraft {
  return {
    rawNeed: "Need a fractional CMO.",
    outcomeNeeded: "growth",
    idealPerson: "fractional CMO",
    proofRequired: "B2B SaaS",
    badFit: "agency",
    urgency: "this quarter",
    geography: "UK",
    commercialShape: "paid advisory",
    successOutcome: "hired",
    outcomeValueHint: "$20k/month",
    budgetPrivate: "$20k/month",
    budgetShareableLabel: "",
    shareableSummary: "Need a CMO in the UK.",
    privateNotes: "",
    sourcesAllowed: "both",
    contactPolicy: "ask-before-contact",
    mode: "manual-search",
    missingFields: [],
    ...overrides,
  };
}

describe("diffDraftFields", () => {
  it("returns empty when nothing changed", () => {
    const a = draft();
    const b = draft();
    expect(diffDraftFields(a, b)).toEqual([]);
  });

  it("returns empty when before is null (initial draft)", () => {
    expect(diffDraftFields(null, draft())).toEqual([]);
  });

  it("lists only fields whose trimmed text changed", () => {
    const before = draft();
    const after = draft({
      idealPerson: "fractional CMO with climate exp",
      geography: "Lisbon or remote",
    });
    expect(diffDraftFields(before, after).sort()).toEqual(["geography", "idealPerson"]);
  });

  it("ignores whitespace-only differences", () => {
    const before = draft({ geography: "UK" });
    const after = draft({ geography: " UK  " });
    expect(diffDraftFields(before, after)).toEqual([]);
  });
});

describe("labelChangedFields / fieldLabel", () => {
  it("returns labels with natural joining", () => {
    expect(labelChangedFields([])).toBe("");
    expect(labelChangedFields(["geography"])).toBe("geography");
    expect(labelChangedFields(["geography", "idealPerson"])).toBe(
      "geography and ideal person",
    );
    expect(labelChangedFields(["geography", "idealPerson", "proofRequired"])).toBe(
      "geography, ideal person, and proof",
    );
  });

  it("maps every tracked field to a readable label", () => {
    expect(fieldLabel("outcomeNeeded")).toBe("outcome");
    expect(fieldLabel("budgetPrivate")).toBe("private budget");
  });
});
