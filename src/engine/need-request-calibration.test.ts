import { describe, expect, it } from "vitest";
import { draftNeedRequest } from "./need-request-draft";
import {
  buildNeedRequestQuickAnswers,
  determineNeedRequestMissingFields,
  draftNeedRequestFromText,
  draftNeedRequestWithLlm,
  nextNeedRequestQuestions,
} from "./need-request-calibration";

describe("need request calibration", () => {
  it("drafts a structured request from a one-line need", async () => {
    const draft = await draftNeedRequest({
      stepRunId: "network-lane-step:test",
      rawNeed: "Need a fractional CMO for a climate startup, B2B SaaS, UK or Europe, paid advisory.",
      now: new Date("2026-05-14T00:00:00.000Z"),
    });

    expect(draft.outcomeNeeded).toContain("a climate startup");
    expect(draft.idealPerson).toContain("fractional CMO");
    expect(draft.geography.toLowerCase()).toContain("uk");
    expect(draft.commercialShape.toLowerCase()).toContain("paid");
    expect(draft.proofRequired.toLowerCase()).toContain("b2b");
    expect(draft.mode).toBe("manual-search");
    expect(draft.contactPolicy).toBe("ask-before-contact");
    expect(draft.jobRequestCard.type).toBe("job-request-card");
  });

  it("refuses draft_need_request without stepRunId outside test mode", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    await expect(
      draftNeedRequest({ rawNeed: "Need a marketplace operator." }),
    ).rejects.toThrow("draft_need_request requires stepRunId");
    process.env.DITTO_TEST_MODE = previous;
  });

  it("skips calibration questions for fields already present", () => {
    const draft = draftNeedRequestFromText({
      rawNeed:
        "Need a fractional CMO for B2B SaaS in Europe, paid advisory, proof they have scaled ARR before.",
    });

    expect(draft.missingFields).not.toContain("proofRequired");
    expect(draft.missingFields).not.toContain("commercialShape");
    expect(draft.missingFields.length).toBeLessThan(3);
  });

  it("understands looking-for requests as target person plus outcome", () => {
    const draft = draftNeedRequestFromText({
      rawNeed: "Looking for a lead agentic engineer to help me build custom real estate crms",
    });

    expect(draft.idealPerson).toBe("lead agentic engineer");
    expect(draft.outcomeNeeded).toBe("build custom real estate CRMs");
    expect(draft.proofRequired).toBe("");
    expect(draft.missingFields).toContain("proofRequired");
    expect(draft.quickAnswerField).toBe("proofRequired");
    expect(draft.quickAnswers).toEqual([
      "Shipped production AI agents",
      "Built CRM workflows before",
      "Real estate domain proof",
    ]);
    expect(draft.shareableSummary).toBe("Looking for lead agentic engineer to build custom real estate CRMs.");
  });

  it("understands direct role-to-outcome requests without a looking-for prefix", () => {
    const draft = draftNeedRequestFromText({
      rawNeed: "Lead agentic engineer to help me build custom crm for real estate agency",
    });

    expect(draft.idealPerson).toBe("Lead agentic engineer");
    expect(draft.outcomeNeeded).toBe("build custom CRM for real estate agency");
    expect(draft.shareableSummary).toBe("Looking for Lead agentic engineer to build custom CRM for real estate agency.");
  });

  it("cleans obvious typos and requester phrasing before building the working brief", () => {
    const draft = draftNeedRequestFromText({
      rawNeed: "Lead agentic engieenr to help my agency deliver custom CRMs for real estate clients",
    });

    expect(draft.rawNeed).toContain("engieenr");
    expect(draft.idealPerson).toBe("Lead agentic engineer");
    expect(draft.outcomeNeeded).toBe("deliver custom CRMs for real estate clients");
    expect(draft.successOutcome).toBe("deliver custom CRMs for real estate clients");
    expect(draft.outcomeValueHint).toBeNull();
    expect(draft.shareableSummary).toBe(
      "Looking for Lead agentic engineer to deliver custom CRMs for real estate clients.",
    );
    expect(draft.shareableSummary).not.toContain("engieenr");
  });

  it("returns next-best questions only for missing fields", () => {
    const missing = determineNeedRequestMissingFields({
      outcomeNeeded: "",
      idealPerson: "marketplace ops expert",
      proofRequired: "",
      commercialShape: "paid advisory",
      successOutcome: "",
      shareableSummary: "Need marketplace ops expert.",
    });

    expect(nextNeedRequestQuestions(missing)).toEqual([
      "What outcome would make this a success?",
      "What proof would make someone credible?",
      "What would make this connection worth it?",
    ]);
  });

  it("builds analysis-derived quick answers for the active missing field", () => {
    expect(buildNeedRequestQuickAnswers({
      rawNeed: "Looking for a lead agentic engineer to help me build custom real estate crms",
      outcomeNeeded: "build custom real estate crms",
      idealPerson: "lead agentic engineer",
      commercialShape: "",
    }, "proofRequired")).toEqual([
      "Shipped production AI agents",
      "Built CRM workflows before",
      "Real estate domain proof",
    ]);
  });

  it("uses an LLM draft when available instead of only local regex extraction", async () => {
    const draft = await draftNeedRequestWithLlm({
      rawNeed: "Need people who know payments partnerships for vertical SaaS companies.",
      completion: async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            outcomeNeeded: "Build a payments partnership shortlist for vertical SaaS.",
            idealPerson: "Payments partnership operators with vertical SaaS experience.",
            proofRequired: "Has launched embedded payments partnerships.",
            commercialShape: "research intro",
            successOutcome: "A shortlist of credible people and companies to approach.",
            shareableSummary: "Looking for payments partnership operators with vertical SaaS experience.",
            sourcesAllowed: "both",
            contactPolicy: "ask-before-contact",
            mode: "manual-search",
            quickAnswers: [
              "Launched embedded payments",
              "Vertical SaaS operator",
              "Partner references available",
            ],
          }),
        }],
        tokensUsed: 120,
        costCents: 1,
        stopReason: "stop",
        model: "test",
      }),
    });

    expect(draft.outcomeNeeded).toBe("Build a payments partnership shortlist for vertical SaaS.");
    expect(draft.idealPerson).toContain("Payments partnership operators");
    expect(draft.shareableSummary).toContain("payments partnership operators");
    expect(draft.quickAnswers).toEqual([
      "Launched embedded payments",
      "Vertical SaaS operator",
      "Partner references available",
    ]);
    expect(draft.missingFields).not.toContain("outcomeNeeded");
  });
});
