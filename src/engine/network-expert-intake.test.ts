import { describe, expect, it } from "vitest";
import {
  EXPERT_LANE_QUESTIONS,
  buildNetworkProfileCard,
  isVagueNetworkAntiPersona,
  simpleNetworkHandle,
  wantsNetworkVisibility,
} from "./network-expert-intake";

describe("network expert intake helper", () => {
  it("owns the exact six-question expert sequence", () => {
    expect(EXPERT_LANE_QUESTIONS).toEqual([
      "When somebody hires you, what's the actual thing they're paying you for?",
      "Who's the worst fit for you? I'd rather know that first.",
      "Tell me about a client you'd want more of. What were they like before they hired you?",
      "Three things you're better at than most people in your field. Just three.",
      "What's the line about you that would make somebody say 'oh, I should talk to them'?",
      "Are you actually open for new work right now? It's fine to say no — I won't promote you if you're not.",
    ]);
  });

  it("builds a complete profile card with non-null narrative fallback", () => {
    const card = buildNetworkProfileCard({
      answers: {
        skills: "outbound sequencing, founder messaging, demo coaching",
        hook: "ex-AE who built three GTM teams",
      },
      displayName: "Tim Green",
      greeterName: "Mira",
      handle: "Tim Green",
      visible: true,
    });

    expect(card.handle).toBe("timgreen");
    expect(card.greeterCuratedBy).toBe("mira");
    expect(card.narrativeMd).toBe("ex-AE who built three GTM teams");
    expect(card.signalDots.filter((dot) => dot.filled)).toHaveLength(2);
    expect(card.badges.map((badge) => badge.label)).toEqual([
      "outbound sequencing",
      "founder messaging",
      "demo coaching",
    ]);
  });

  it("normalizes handles and evaluates vague anti-persona and visibility answers", () => {
    expect(simpleNetworkHandle(" Tim H. Green! ")).toBe("timhgreen");
    expect(isVagueNetworkAntiPersona("not sure")).toBe(true);
    expect(isVagueNetworkAntiPersona("teams shopping for free advice")).toBe(false);
    expect(wantsNetworkVisibility("yeah, I'm open")).toBe(true);
    expect(wantsNetworkVisibility("not taking new work")).toBe(false);
  });
});
