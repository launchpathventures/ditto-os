import { describe, expect, it } from "vitest";
import {
  extractIntentKeywords,
  inferVisitorIntent,
  type IntentShape,
  type VisitorChatTurn,
} from "./visitor-intent-inference";

function turns(...content: string[]): VisitorChatTurn[] {
  return content.map((item) => ({ role: "visitor", content: item }));
}

describe("inferVisitorIntent", () => {
  it("keeps a referred but unengaged visitor in the curious soft state", () => {
    const result = inferVisitorIntent([], ["revenue", "operator"]);
    expect(result.scores.curious).toBeGreaterThan(0);
    expect(result.highlighted).toBeNull();
    expect(result.whisper).toBeNull();
  });

  it.each([
    {
      label: "similar expertise",
      message: "I also work on revenue systems and operator workflows.",
      keywords: ["revenue systems", "operator workflows"],
      expected: "similar-expertise" as IntentShape,
      whisper: "Ditto can build a signal",
    },
    {
      label: "helper seeker",
      message: "Can Tim help with our Series B sales motion?",
      keywords: ["network design"],
      expected: "helper-seeker" as IntentShape,
      whisper: "Ditto can keep watch",
    },
    {
      label: "intro seeker",
      message: "How do I reach Tim for an intro?",
      keywords: ["network design"],
      expected: "intro-seeker" as IntentShape,
      whisper: "consent-gated intro",
    },
  ])("scores $label highest and returns a single winner", ({ message, keywords, expected, whisper }) => {
    const result = inferVisitorIntent(turns(message), keywords);
    expect(result.highlighted).toEqual([expected]);
    expect(result.whisper).toContain(whisper);
    expect(result.scores[expected]).toBeGreaterThanOrEqual(0.6);
  });

  it("returns a dual highlight for a two-way tie", () => {
    const result = inferVisitorIntent(
      turns("I also work on revenue systems, and do you know someone who can help?"),
      ["revenue systems"],
    );
    expect(result.highlighted).toEqual(["helper-seeker", "similar-expertise"]);
    expect(result.whisper).toBe("Sounds like you have a couple of things in mind - pick whichever feels right.");
  });

  it("falls back to all-soft for three-way noisy intent", () => {
    const result = inferVisitorIntent(
      turns("I also work on revenue systems, can Tim help, and how do I reach him for an intro?"),
      ["revenue systems"],
    );
    expect(result.highlighted).toBeNull();
    expect(result.whisper).toBeNull();
  });

  it("decays after one non-reinforcing visitor turn", () => {
    const first = inferVisitorIntent(turns("I also work on revenue systems."), ["revenue systems"]);
    expect(first.highlighted).toEqual(["similar-expertise"]);

    const decayed = inferVisitorIntent(
      turns("I also work on revenue systems.", "Thanks, that's interesting."),
      ["revenue systems"],
    );
    expect(decayed.highlighted).toBeNull();
  });

  it("extracts stable member signal keywords from public copy", () => {
    expect(extractIntentKeywords([
      "Revenue operator for founder-led B2B teams.",
      "Untangles sales motion and partner channels.",
    ])).toEqual(expect.arrayContaining(["revenue", "operator", "founder-led", "sales"]));
  });
});
