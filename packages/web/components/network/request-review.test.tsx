import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { saveActiveRequest, type ActiveRequestDraft } from "./request-review";
import { draftActiveRequest } from "./request-intake";
import { RequestCanvas } from "./request-canvas";
import type { RequestIdentity } from "./request-identity-card";

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
    quickAnswerField: null,
    quickAnswers: [],
    ...overrides,
  };
}

function emptyIdentity(): RequestIdentity {
  return { name: "", email: "", orgSite: "", credibility: "" };
}

describe("request canvas", () => {
  it("renders editable request fields, private labels, and mode choice", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestCanvas, {
        draft: draft(),
        onDraftChange: () => {},
        visitorSessionId: "visitor-1",
        identity: emptyIdentity(),
        onIdentityChange: () => {},
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
      React.createElement(RequestCanvas, {
        draft: draft({
          shareableSummary: "Need a CMO with $20k/month budget.",
        }),
        onDraftChange: () => {},
        visitorSessionId: "visitor-1",
        identity: emptyIdentity(),
        onIdentityChange: () => {},
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
