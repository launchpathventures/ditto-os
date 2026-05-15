import { describe, expect, it } from "vitest";
import { deriveCurrentStep, TOTAL_STEPS } from "./request-step-engine";
import type { ActiveRequestDraft } from "./request-review";
import type { RequestIdentity } from "./request-identity-card";

function makeDraft(overrides: Partial<ActiveRequestDraft> = {}): ActiveRequestDraft {
  return {
    rawNeed: "",
    outcomeNeeded: "",
    idealPerson: "",
    proofRequired: "",
    badFit: "",
    urgency: "",
    geography: "",
    commercialShape: "",
    successOutcome: "",
    outcomeValueHint: "",
    budgetPrivate: "",
    budgetShareableLabel: "",
    shareableSummary: "",
    privateNotes: "",
    sourcesAllowed: "both",
    contactPolicy: "ask-before-intro",
    mode: "background-watch",
    missingFields: [],
    ...overrides,
  };
}

const EMPTY_IDENTITY: RequestIdentity = { name: "", email: "", orgSite: "", credibility: "" };

const COMPLETE_IDENTITY: RequestIdentity = {
  name: "Alex Rivers",
  email: "alex@launchpath.co",
  orgSite: "launchpath.co",
  credibility: "Founder raising seed",
};

const FILLED_NEEDS: Partial<ActiveRequestDraft> = {
  outcomeNeeded: "Hire a fractional CMO",
  idealPerson: "Climate B2B SaaS GTM lead",
  proofRequired: "Two prior 0→1 launches",
  commercialShape: "Paid advisory",
  geography: "UK or Europe",
  urgency: "This quarter",
  badFit: "Big agencies",
};

describe("deriveCurrentStep", () => {
  it("returns outcomeNeeded first when nothing is filled", () => {
    const step = deriveCurrentStep(makeDraft(), EMPTY_IDENTITY, {
      mode: null,
      modeConfirmed: false,
    });
    expect(step.kind).toBe("need");
    expect(step.field).toBe("outcomeNeeded");
    expect(step.index).toBe(1);
    expect(step.total).toBe(TOTAL_STEPS);
  });

  it("advances to idealPerson once outcomeNeeded is filled", () => {
    const step = deriveCurrentStep(
      makeDraft({ outcomeNeeded: "Hire a fractional CMO" }),
      EMPTY_IDENTITY,
      { mode: null, modeConfirmed: false },
    );
    expect(step.kind).toBe("need");
    expect(step.field).toBe("idealPerson");
    expect(step.index).toBe(2);
  });

  it("skips over any need fields already filled and returns the next empty one", () => {
    const step = deriveCurrentStep(
      makeDraft({
        outcomeNeeded: "Hire a fractional CMO",
        idealPerson: "Climate B2B SaaS GTM lead",
        proofRequired: "Two prior 0→1 launches",
      }),
      EMPTY_IDENTITY,
      { mode: null, modeConfirmed: false },
    );
    expect(step.kind).toBe("need");
    expect(step.field).toBe("commercialShape");
    expect(step.index).toBe(4);
  });

  it("moves to the identity step once all need fields are filled", () => {
    const step = deriveCurrentStep(makeDraft(FILLED_NEEDS), EMPTY_IDENTITY, {
      mode: null,
      modeConfirmed: false,
    });
    expect(step.kind).toBe("identity");
    expect(step.index).toBe(TOTAL_STEPS - 1);
  });

  it("moves to the mode step once identity is complete enough", () => {
    const step = deriveCurrentStep(makeDraft(FILLED_NEEDS), COMPLETE_IDENTITY, {
      mode: null,
      modeConfirmed: false,
    });
    expect(step.kind).toBe("mode");
    expect(step.index).toBe(TOTAL_STEPS);
  });

  it("returns the ready step once everything is locked", () => {
    const step = deriveCurrentStep(makeDraft(FILLED_NEEDS), COMPLETE_IDENTITY, {
      mode: "both",
      modeConfirmed: true,
    });
    expect(step.kind).toBe("ready");
    expect(step.index).toBe(TOTAL_STEPS);
    expect(step.examples).toEqual([]);
  });

  it("provides a skipLabel on optional steps but not on required ones", () => {
    const outcomeStep = deriveCurrentStep(makeDraft(), EMPTY_IDENTITY, {
      mode: null,
      modeConfirmed: false,
    });
    expect(outcomeStep.skipLabel).toBeUndefined();

    const geoStep = deriveCurrentStep(
      makeDraft({
        outcomeNeeded: "Hire a fractional CMO",
        idealPerson: "Climate B2B SaaS GTM lead",
        proofRequired: "Two prior 0→1 launches",
        commercialShape: "Paid advisory",
      }),
      EMPTY_IDENTITY,
      { mode: null, modeConfirmed: false },
    );
    expect(geoStep.field).toBe("geography");
    expect(geoStep.skipLabel).toBeDefined();
  });

  it("includes pre-populated examples on need steps", () => {
    const step = deriveCurrentStep(makeDraft(), EMPTY_IDENTITY, {
      mode: null,
      modeConfirmed: false,
    });
    expect(step.examples.length).toBeGreaterThan(0);
  });

  it("rotates the example pool when the step advances", () => {
    const outcomeStep = deriveCurrentStep(makeDraft(), EMPTY_IDENTITY, {
      mode: null,
      modeConfirmed: false,
    });
    const idealStep = deriveCurrentStep(
      makeDraft({ outcomeNeeded: "Hire a fractional CMO" }),
      EMPTY_IDENTITY,
      { mode: null, modeConfirmed: false },
    );
    expect(outcomeStep.examples).not.toEqual(idealStep.examples);
  });
});
