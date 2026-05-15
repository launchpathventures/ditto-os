import { describe, expect, it } from "vitest";
import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RequestBriefFocus,
  RequestAnalysisTrace,
  RequestAnalysisTransition,
  buildRequestAnalysisRows,
} from "./request-analysis";
import type { ActiveRequestDraft } from "./request-review";

const DRAFT: ActiveRequestDraft = {
  rawNeed: "Need a fractional CMO for a climate startup, B2B SaaS, UK or Europe, paid advisory.",
  outcomeNeeded: "Find a fractional CMO for a climate startup.",
  idealPerson: "Fractional CMO with B2B SaaS and climate experience.",
  proofRequired: "Has scaled B2B SaaS go-to-market.",
  badFit: "Large agencies.",
  urgency: "This quarter.",
  geography: "UK or Europe.",
  commercialShape: "Paid advisory.",
  successOutcome: "A credible advisor starts within the quarter.",
  outcomeValueHint: "paid advisory",
  budgetPrivate: "Budget is private.",
  budgetShareableLabel: "",
  shareableSummary: "Looking for a fractional CMO with B2B SaaS and climate experience.",
  privateNotes: "Avoid anyone who only does brand.",
  sourcesAllowed: "both",
  contactPolicy: "ask-before-contact",
  mode: "both",
  missingFields: ["shareableSummary"],
  quickAnswerField: "shareableSummary",
  quickAnswers: ["Looking for a fractional CMO", "Keep it high level"],
};

const TYPO_DRAFT: ActiveRequestDraft = {
  ...DRAFT,
  rawNeed: "Lead agentic engieenr to help my agency deliver custom CRMs for real estate clients",
  outcomeNeeded: "deliver custom CRMs for real estate clients",
  idealPerson: "Lead agentic engineer",
  proofRequired: "Has shipped production AI agents and CRM workflows.",
  commercialShape: "Contract build",
  successOutcome: "A credible technical lead can scope and start the build.",
  shareableSummary:
    "Looking for a lead agentic engineer to deliver custom CRMs for real estate clients.",
};

describe("request analysis UI", () => {
  it("shows the seeded transition instead of another intake form", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestAnalysisTransition, {
        rawNeed: DRAFT.rawNeed,
      }),
    );
    expect(html).toContain("Preparing your research brief.");
    expect(html).toContain("Ditto Network");
    expect(html).toContain("Ditto&#x27;s network research agent");
    expect(html.match(/Hi, I&#x27;m Mira/g)).toHaveLength(1);
    expect(html).toContain("Original request");
    expect(html).toContain("Cleaned working read");
    expect(html).toContain("Build search angles");
    expect(html).not.toContain("<textarea");
  });

  it("keeps the transition card fixed while auto-scrolling Mira narration", () => {
    const source = [
      "packages/web/components/network/request-analysis.tsx",
      "packages/web/components/network/request-intake.tsx",
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source).toContain("messagesViewportRef");
    expect(source).toContain("viewport.scrollTo");
    expect(source).toContain("h-[min(760px,calc(100dvh-128px))]");
    expect(source).toContain("analysisDraft");
  });

  it("shows the enriched draft interpretation during transition once analysis returns", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestAnalysisTransition, {
        rawNeed: TYPO_DRAFT.rawNeed,
        draft: TYPO_DRAFT,
      }),
    );

    expect(html).toContain("Original request");
    expect(html).toContain("engieenr");
    expect(html).toContain("Cleaned working read");
    expect(html).toContain("agentic engineer");
    expect(html).toContain("deliver custom CRMs for real estate clients");
    expect(html).toContain("Enriched");
  });

  it("summarises the extracted brief, privacy split, and background task plan", () => {
    const rows = buildRequestAnalysisRows({ rawNeed: DRAFT.rawNeed, draft: DRAFT });
    expect(rows.map((row) => row.label)).toEqual([
      "Input received",
      "What Mira extracted",
      "Privacy split",
      "Background task plan",
      "Next calibration",
    ]);
    expect(rows.find((row) => row.id === "privacy")?.detail).toContain("budget");
    expect(rows.find((row) => row.id === "route")?.detail).toContain("search now and keep watch");
  });

  it("renders a visible analysis trace after the draft exists", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestAnalysisTrace, {
        rawNeed: DRAFT.rawNeed,
        draft: DRAFT,
      }),
    );
    expect(html).toContain("Analysis trace");
    expect(html).toContain("How the request is being worked");
    expect(html).toContain("Privacy split");
    expect(html).toContain("Background task plan");
  });

  it("renders a distilled brief focus instead of the whole editor", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestBriefFocus, {
        draft: DRAFT,
        onOpenEditor: () => {},
      }),
    );
    expect(html).toContain("Working research brief");
    expect(html).toContain("Search target");
    expect(html).toContain("Evidence to verify");
    expect(html).toContain("Review full brief");
  });
});
