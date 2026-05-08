import { describe, expect, it } from "vitest";
import {
  buildFrontDoorPrompt,
  type ChatContext,
} from "./network-chat-prompt";

describe("network chat prompt contexts", () => {
  it("accepts expert and client lane contexts", () => {
    const contexts: ChatContext[] = [
      "front-door",
      "referred",
      "review",
      "expert",
      "client",
    ];

    expect(contexts).toContain("expert");
    expect(contexts).toContain("client");
  });

  it("uses a dedicated expert lane profile-card directive", () => {
    const prompt = buildFrontDoorPrompt("expert");
    const questions = [
      "When somebody hires you, what's the actual thing they're paying you for?",
      "Who's the worst fit for you? I'd rather know that first.",
      "Tell me about a client you'd want more of. What were they like before they hired you?",
      "Three things you're better at than most people in your field. Just three.",
      "What's the line about you that would make somebody say 'oh, I should talk to them'?",
      "Are you actually open for new work right now? It's fine to say no — I won't promote you if you're not.",
    ];

    expect(prompt).toContain("## Your Task: Expert Lane Profile Card Intake");
    expect(prompt).toContain("NetworkProfileCardBlock");
    expect(prompt).toContain("Do not emit an AuthorizationRequestBlock here.");
    expect(prompt).toContain("Worth it if you do this kind of hunting more than twice a year.");

    let lastIndex = -1;
    for (const question of questions) {
      const index = prompt.indexOf(question);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("keeps the client lane on the front-door pass-through until its brief lands", () => {
    const prompt = buildFrontDoorPrompt("client");
    expect(prompt).toContain("## Your Task: Front Door Advisor");
    expect(prompt).toContain("The alex_response tool");
    expect(prompt).toContain("MUST call after every reply");
  });
});
