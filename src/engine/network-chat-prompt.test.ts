import { describe, expect, it } from "vitest";
import {
  buildFrontDoorPrompt,
  type ChatContext,
} from "./network-chat-prompt";
import {
  CLIENT_LANE_QUESTIONS,
  buildClientLaneResolutionTurns,
  buildJobRequestCard,
  wantsOffNetworkScout,
} from "./network-client-intake";

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
    expect(prompt).toContain("extract_kb_facts");
    expect(prompt).toContain("record_voice_intake");
    expect(prompt).toContain("Facts default to `on-request`");

    let lastIndex = -1;
    for (const question of questions) {
      const index = prompt.indexOf(question);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("uses a dedicated client lane Q1-Q6 opportunity-brief directive", () => {
    const prompt = buildFrontDoorPrompt("client");
    expect(prompt).toContain("## Your Task: Client Lane Opportunity Brief Intake");
    expect(prompt).toContain("JobRequestCardBlock");
    expect(prompt).toContain("budgetShape");
    expect(prompt).toContain("NEVER put the budget value on shareable or candidate-visible surfaces");
    expect(prompt).toContain("scoutOptIn");
    expect(prompt).toContain("matchOnNetwork");
    expect(prompt).toContain("two distinct turns");
    expect(prompt).toContain("scout_off_network");
    expect(prompt).toContain("public source URL");
    expect(prompt).not.toContain("## Your Task: Front Door Advisor");

    let lastIndex = -1;
    for (const question of CLIENT_LANE_QUESTIONS) {
      const index = prompt.indexOf(question);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("builds a client JobRequestCard with lastUpdatedAt and v1 curator parity", () => {
    const card = buildJobRequestCard({
      greeter: "mira",
      now: new Date("2026-05-10T10:00:00.000Z"),
      answers: {
        jtbd: "I need someone to ramp outbound",
        referenceShape: "Jake built the sequence and cleaned up HubSpot",
        antiPersonaMd: "pure copywriters",
        successCriteria: "5 booked calls per week by day 30",
        budgetShape: "$8-12k/month, 3-month commitment",
        scoutOptIn: "yes, scan off-network too",
      },
    });

    expect(card).toMatchObject({
      type: "job-request-card",
      jtbd: "I need someone to ramp outbound",
      referenceShape: "Jake built the sequence and cleaned up HubSpot",
      antiPersonaMd: "pure copywriters",
      successCriteria: "5 booked calls per week by day 30",
      budgetShape: {
        ballpark: "$8-12k/month, 3-month commitment",
        cadence: "monthly",
      },
      scoutOptIn: true,
      greeterCuratedBy: "mira",
      matchCuratedBy: "mira",
      lastUpdatedAt: "2026-05-10T10:00:00.000Z",
    });
  });

  it("models the required two-turn client-lane resolution pathway", () => {
    const card = buildJobRequestCard({
      greeter: "alex",
      now: new Date("2026-05-10T10:00:00.000Z"),
      answers: {
        jtbd: "Find a CRM-touch outbound operator",
        budgetShape: "$8-12k/month",
        scoutOptIn: "stick with people already in",
      },
    });
    const turns = buildClientLaneResolutionTurns({
      card,
      framingSentence: "Three I'd put forward — all have the CRM-touch shape you described.",
    });

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      role: "assistant",
      block: { type: "job-request-card" },
    });
    expect(turns[1]).toMatchObject({
      role: "assistant",
      content: "Three I'd put forward — all have the CRM-touch shape you described.",
    });
  });

  it("parses scout opt-in without treating every 'not' as a refusal", () => {
    expect(wantsOffNetworkScout("not just on-network, scan outside too")).toBe(true);
    expect(wantsOffNetworkScout("stick with people already in")).toBe(false);
    expect(wantsOffNetworkScout("do not scan outside")).toBe(false);
  });
});
