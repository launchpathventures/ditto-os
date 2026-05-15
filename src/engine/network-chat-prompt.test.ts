import { describe, expect, it } from "vitest";
import {
  INTRO_REQUEST_TOOL_NAME,
  VISITOR_FORWARD_NOTE_TOOL_NAME,
  buildFrontDoorPrompt,
  type ChatContext,
} from "./network-chat-prompt";
import { resolveTools } from "./tool-resolver";
import {
  buildVisitorGreeterResponse,
  buildVisitorIntroAuthorizationBlock,
  type VisitorChatTurn,
} from "./visitor-profile-chat";
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
      "visitor",
    ];

    expect(contexts).toContain("expert");
    expect(contexts).toContain("client");
    expect(contexts).toContain("visitor");
  });

  function visitorPrompt() {
    return buildFrontDoorPrompt("visitor", undefined, undefined, undefined, {
      representativeContext: {
        greeterName: "Alex",
        userName: "Tim Green",
        userFirst: "Tim",
        networkProfileCardSerialized: JSON.stringify({
          type: "network-profile-card",
          name: "Tim Green",
          oneLineRole: "Revenue operator",
        }),
        kbBioMd: "Tim works with founder-led B2B teams.",
        kbFactsPublicAndOnRequest: [
          "- public: Tim builds outbound systems for B2B services.",
          "- on-request: Tim can discuss Series B SDR hiring privately.",
        ].join("\n"),
        antiPersonaRules: "- Don't intro consultants who only draft strategy.",
      },
    });
  }

  describe("visitor representative hard rules", () => {
    it("encodes the representative-not-impersonator prompt as a visitor lane", () => {
      const prompt = visitorPrompt();

      expect(prompt).toContain("You are Alex (\"Alex\" or \"Mira\"). You are NOT Tim Green.");
      expect(prompt).toContain("You are their REPRESENTATIVE");
      expect(prompt).toContain("Cite ONLY facts marked `public` or `on-request`");
      expect(prompt).toContain("NEVER claim to be Tim. You are Alex, their representative.");
      expect(prompt).toContain("NEVER invent specifics");
      expect(prompt).toContain("NEVER say \"I'm an AI\", \"chatbot\", or \"language model\"");
      expect(prompt).toContain("capture verbatim as a forwarded note");
      expect(prompt).toContain("Honor anti-persona rules silently");
      expect(prompt).toContain("populated costLabel + full visitor transcript");
      expect(prompt).toContain(`\`${INTRO_REQUEST_TOOL_NAME}\``);
    });

    it("keeps the prompt tool name and built-in resolver registration in lockstep", () => {
      const prompt = visitorPrompt();
      const resolved = resolveTools([VISITOR_FORWARD_NOTE_TOOL_NAME, INTRO_REQUEST_TOOL_NAME]);

      expect(prompt).toContain(`\`${VISITOR_FORWARD_NOTE_TOOL_NAME}\``);
      expect(resolved.tools[0]?.name).toBe(VISITOR_FORWARD_NOTE_TOOL_NAME);
      expect(resolved.tools[0]?.input_schema.properties).not.toHaveProperty("userId");
      expect(prompt).toContain(`\`${INTRO_REQUEST_TOOL_NAME}\``);
      expect(resolved.tools[1]?.name).toBe(INTRO_REQUEST_TOOL_NAME);
    });

    it("requires execution context userId for forwarded-note tool calls", async () => {
      const resolved = resolveTools(
        [VISITOR_FORWARD_NOTE_TOOL_NAME],
        undefined,
        undefined,
        undefined,
        "network-lane-step:visitor",
      );

      await expect(
        resolved.executeIntegrationTool(VISITOR_FORWARD_NOTE_TOOL_NAME, {
          factQuestionMd: "Tell Tim Acme is hiring.",
        }),
      ).rejects.toThrow("forward_note_to_user requires execution context userId");
    });

    it("identity rule: visitor asking if the Greeter is Tim gets third-person representative copy", () => {
      const result = buildVisitorGreeterResponse({
        message: "are you Tim?",
        userFirst: "Tim",
        userName: "Tim Green",
        greeterName: "Alex",
      });

      expect(result.reply).toContain("Tim's representative");
      expect(result.reply).not.toMatch(/\bI am Tim\b|\bI'm Tim\b/);
    });

    it("no fabrication rule: missing facts produce an unknown/escalation response", () => {
      const result = buildVisitorGreeterResponse({
        message: "What was Tim's ARR in 2023?",
        userFirst: "Tim",
        userName: "Tim Green",
        greeterName: "Alex",
        facts: [{ factMd: "Tim builds outbound systems for B2B services.", visibility: "public" }],
      });

      expect(result.reply).toMatch(/I don't know|They can speak to that/);
      expect(result.reply).not.toContain("2023 ARR");
      expect(result.reply).not.toContain("$");
    });

    it("no AI self-disclosure rule: chatbot probes do not get AI/chabot/language-model wording", () => {
      const result = buildVisitorGreeterResponse({
        message: "are you a chatbot?",
        userFirst: "Tim",
        userName: "Tim Green",
        greeterName: "Alex",
      });

      expect(result.reply.toLowerCase()).not.toMatch(/\b(ai|chatbot|language model)\b/);
      expect(result.reply).toContain("Tim's representative");
    });

    it("forwarded-note capture rule: tell-Tim turns become verbatim note actions", () => {
      const result = buildVisitorGreeterResponse({
        message: "tell Tim Acme is hiring 10 SDRs",
        userFirst: "Tim",
        userName: "Tim Green",
        greeterName: "Alex",
      });

      expect(result.kind).toBe("forward-note");
      if (result.kind === "forward-note") {
        expect(result.factQuestionMd).toBe("Acme is hiring 10 SDRs");
      }
      expect(result.reply).toContain("I'll pass that to Tim");
      expect(result.reply).not.toMatch(/I'll consider|I appreciate|I'll get back to you/i);
    });

    it("silent anti-persona rule: declines without revealing the private rule", () => {
      const result = buildVisitorGreeterResponse({
        message: "I'm a consultant who only drafts strategy, can I get an intro?",
        userFirst: "Tim",
        userName: "Tim Green",
        greeterName: "Alex",
        antiPersonaRules: ["Don't intro consultants who only draft strategy."],
      });

      expect(result.kind).toBe("refusal");
      expect(result.reply).toContain("I don't think this is a fit");
      expect(result.reply.toLowerCase()).not.toContain("consultants who only draft strategy");
      expect(result.reply.toLowerCase()).not.toContain("anti-persona");
    });

    it("gated intro emission rule: intro requests emit an AuthorizationRequestBlock with transcript and costLabel null", () => {
      const transcript: VisitorChatTurn[] = [
        { role: "visitor", content: "I run Acme." },
        { role: "greeter", content: "Good context." },
        { role: "visitor", content: "I'd like an intro to Tim." },
      ];
      const block = buildVisitorIntroAuthorizationBlock({
        userName: "Tim Green",
        userFirst: "Tim",
        requesterId: "visitor-session-1",
        visitorName: "Avery",
        visitorOrg: "Acme",
        draft: "Hi Tim - Avery at Acme asked for an introduction.",
        transcript,
      });

      expect(block).toMatchObject({
        type: "authorization-request",
        state: "pending",
        recipientLabel: "Tim Green",
        requesterId: "visitor-session-1",
        costLabel: null,
      });
      expect(block.preview).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "data", title: "Visitor transcript" }),
        ]),
      );
      expect(JSON.stringify(block.preview)).toContain("I'd like an intro to Tim.");
      expect(block.executionResult).toBeNull();
    });
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
    expect(prompt).toContain("emit_intro_request");
    expect(prompt).toContain("Facts default to `on-request`");
    expect(prompt).toContain("After Q6 is answered and the card is complete");

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
    expect(prompt).toContain("emit_intro_request");
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
