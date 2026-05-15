import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestReview, saveActiveRequest, type ActiveRequestDraft } from "./request-review";
import { draftActiveRequest } from "./request-intake";

function draft(overrides: Partial<ActiveRequestDraft> = {}): ActiveRequestDraft {
  return {
    rawNeed: "Need a fractional CMO for a climate startup.",
    outcomeNeeded: "climate startup growth",
    idealPerson: "fractional CMO",
    proofRequired: "B2B SaaS proof",
    badFit: "pure brand agency",
    urgency: "this quarter",
    geography: "UK or Europe",
    commercialShape: "paid advisory",
    successOutcome: "CMO found",
    outcomeValueHint: "$20k/month",
    budgetPrivate: "$20k/month",
    budgetShareableLabel: "",
    shareableSummary: "Need a fractional CMO in Europe.",
    privateNotes: "$20k/month budget",
    sourcesAllowed: "both",
    contactPolicy: "ask-before-contact",
    mode: "manual-search",
    missingFields: [],
    ...overrides,
  };
}

describe("request review components", () => {
  it("renders editable request fields, private labels, and mode choice", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestReview, {
        initialDraft: draft(),
        visitorSessionId: "visitor-1",
      }),
    );

    expect(html).toContain("Outcome");
    expect(html).toContain("Ideal person");
    expect(html).toContain("Private budget");
    expect(html).toContain("private");
    expect(html).toContain("Search now");
    expect(html).toContain("Keep watch");
    expect(html).toContain("Do both");
  });

  it("scrubs private fields from match-facing preview", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestReview, {
        initialDraft: draft({
          shareableSummary: "Need a CMO with $20k/month budget.",
        }),
        visitorSessionId: "visitor-1",
      }),
    );

    expect(html).toContain("[private]");
  });

  it("draft and save HTTP helpers never send caller-supplied stepRunId", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ draft: draft(), request: { id: "request-1", status: "active" } }),
    })) as unknown as typeof fetch;

    await draftActiveRequest({
      rawNeed: "Need a fractional CMO",
      visitorSessionId: "visitor-1",
      fetchImpl,
    });
    await saveActiveRequest({
      draft: draft(),
      visitorSessionId: "visitor-1",
      publish: true,
      fetchImpl,
    });

    const calls = (fetchImpl as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls;
    for (const [, init] of calls) {
      expect(JSON.parse(init.body)).not.toHaveProperty("stepRunId");
    }
  });
});
