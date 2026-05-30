import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitorCtaStrip } from "./visitor-cta-strip";

describe("VisitorCtaStrip", () => {
  it("renders every CTA as clickable and highlights inferred intent only", () => {
    const html = renderToStaticMarkup(
      React.createElement(VisitorCtaStrip, {
        handle: "timhgreen",
        userFirst: "Tim",
        referralChannel: "linkedin",
        intentInference: {
          highlighted: ["similar-expertise"],
          whisper: "You seem to be in a similar space - Ditto can build a signal for you too.",
          scores: {
            curious: 0.2,
            "similar-expertise": 0.72,
            "helper-seeker": 0,
            "intro-seeker": 0,
          },
        },
        sessionId: "visitor-session",
        onAsk: () => {},
        onIntro: () => {},
      }),
    );

    expect(html).toContain("Ask Ditto about me");
    expect(html).toContain("Request an intro");
    expect(html).toContain("Build your own signal");
    expect(html).toContain("Create a request");
    expect(html).toContain("Ditto can build a signal");
    expect(html).toContain("bg-[#fff7d7]");
    expect(html).not.toContain("disabled");
    expect(html).toContain("data-intent-shape=\"similar-expertise\"");
    expect(html).toContain("data-referral-channel=\"linkedin\"");
  });

  it("shows referral context before chat intent is inferred", () => {
    const html = renderToStaticMarkup(
      React.createElement(VisitorCtaStrip, {
        handle: "timhgreen",
        userFirst: "Tim",
        referralChannel: "badge",
        intentInference: null,
        sessionId: "visitor-session",
        onAsk: () => {},
        onIntro: () => {},
      }),
    );

    expect(html).toContain("Tim shared this on badge.");
  });
});
