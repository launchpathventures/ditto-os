import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestChatRail, type RequestChatMessage } from "./request-chat-rail";
import type { ConversationStep } from "./request-step-engine";

const NEED_STEP: ConversationStep = {
  kind: "need",
  field: "idealPerson",
  index: 2,
  total: 9,
  label: "Ideal person",
  lead: "Got it. Now — who could change that?",
  question: "What kind of person could shift this outcome?",
  examples: ["Fractional CMO, climate background", "Seed-stage operator", "Board-level advisor"],
};

const READY_STEP: ConversationStep = {
  kind: "ready",
  index: 9,
  total: 9,
  label: "Ready",
  lead: "Everything's locked.",
  question: "Hit publish below when you're ready, or keep editing the brief.",
  examples: [],
};

const SKIPPABLE_STEP: ConversationStep = {
  kind: "need",
  field: "geography",
  index: 5,
  total: 9,
  label: "Geography",
  lead: "Where should they sit?",
  question: "Any geography that matters?",
  examples: ["UK or Europe", "Remote OK"],
  skipLabel: "Skip — geography doesn't matter",
};

describe("RequestChatRail", () => {
  it("renders Mira and the message log without repeating the prompt summary", () => {
    const messages: RequestChatMessage[] = [
      { id: "m1", role: "assistant", content: "I drafted what I heard." },
      { id: "m2", role: "user", content: "Add: prefers Lisbon-based candidates." },
    ];
    const html = renderToStaticMarkup(
      React.createElement(RequestChatRail, {
        messages,
        originalNeed: "Need a fractional CMO for a climate startup.",
        step: NEED_STEP,
        onSend: () => {},
        refining: false,
        error: null,
      }),
    );
    expect(html).not.toContain("Original request");
    expect(html).toContain("I drafted what I heard.");
    expect(html).toContain("Add: prefers Lisbon-based candidates.");
    expect(html).toContain("Mira");
  });

  it("shows the step indicator and progress for an in-progress step", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestChatRail, {
        messages: [],
        originalNeed: "Need a fractional CMO.",
        step: NEED_STEP,
        onSend: () => {},
        refining: false,
        error: null,
      }),
    );
    expect(html).toContain("Step 2 of 9");
    expect(html).toContain("Ideal person");
  });

  it("renders per-step example chips", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestChatRail, {
        messages: [],
        originalNeed: "Need a fractional CMO.",
        step: NEED_STEP,
        onSend: () => {},
        refining: false,
        error: null,
      }),
    );
    expect(html).toContain("Suggested from analysis");
    expect(html).toContain("Fractional CMO, climate background");
    expect(html).toContain("Seed-stage operator");
    expect(html).toContain("Board-level advisor");
  });

  it("renders the skip affordance when the step provides a skipLabel and an onSkip handler", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestChatRail, {
        messages: [],
        originalNeed: "Need a CMO.",
        step: SKIPPABLE_STEP,
        onSend: () => {},
        onSkip: () => {},
        refining: false,
        error: null,
      }),
    );
    expect(html).toContain("Skip — geography doesn&#x27;t matter");
  });

  it("renders the locked-and-ready state when step.kind is ready", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestChatRail, {
        messages: [],
        originalNeed: "Need a CMO.",
        step: READY_STEP,
        onSend: () => {},
        refining: false,
        error: null,
      }),
    );
    expect(html).toContain("Brief is ready");
    expect(html).toContain("Locked");
    expect(html).not.toContain("Try one of these");
  });
});
