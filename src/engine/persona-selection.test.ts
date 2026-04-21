/**
 * Persona Selection Flow Tests (Brief 152)
 *
 * Covers:
 * - buildFrontDoorPrompt dispatches to Alex vs Mira voice specs
 * - intro mode produces a card-greeting prompt (no process stages, no funnel)
 * - interview mode strips funnel flags and skips process stages
 * - main mode preserves existing Alex behaviour when no persona specified
 * - persona-voice dispatcher returns the right voice for each persona
 */

import { describe, it, expect } from "vitest";

describe("buildFrontDoorPrompt — persona dispatch", () => {
  it("builds the Alex prompt when personaId is alex", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "alex",
    });
    expect(prompt).toContain("Alex");
    expect(prompt).toContain("Australian");
    // Alex's signature phrasing should be loaded
    expect(prompt).toContain("mate");
  });

  it("builds the Mira prompt when personaId is mira", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "mira",
    });
    expect(prompt).toContain("Mira");
    expect(prompt).toContain("British");
    // Mira's sign-off should appear in the persona header
    expect(prompt).toContain("— Mira");
    // Mira-specific character cues
    expect(prompt).toMatch(/precise|thoughtful|measured/i);
  });

  it("defaults to Alex when no persona is provided (back-compat)", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door");
    expect(prompt).toContain("Alex");
    expect(prompt).not.toContain("## Your Identity: Mira from Ditto");
  });

  it("does not leak Alex's character into Mira's prompt", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "mira",
    });
    // The Alex identity header must not appear in Mira's prompt.
    expect(prompt).not.toContain("## Your Identity: Alex from Ditto");
    // "G'day" is Alex's signature — must not appear in Mira's voice.
    expect(prompt).not.toContain("G'day");
  });
});

describe("buildFrontDoorPrompt — intro mode", () => {
  it("loads the card-greeting process block, not the front-door process", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "alex",
      promptMode: "intro",
    });
    expect(prompt).toContain("Your Task: Card Introduction");
    expect(prompt).not.toContain("Your Task: Front Door Advisor");
    expect(prompt).not.toContain("REFLECT & PROPOSE");
    expect(prompt).not.toContain("Process Stages");
  });

  it("forbids asking questions in intro mode", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "alex",
      promptMode: "intro",
    });
    expect(prompt).toMatch(/DO NOT ask questions/i);
  });

  it("skips visitor context and temporal block in intro mode", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door",
      { email: "tim@example.com", name: "Tim" },
      undefined, undefined,
      { personaId: "alex", promptMode: "intro" },
    );
    expect(prompt).not.toContain("Visitor Context");
    expect(prompt).not.toContain("Current Time");
  });
});

describe("buildFrontDoorPrompt — interview mode", () => {
  it("loads the interview process block, not the front-door process", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "mira",
      promptMode: "interview",
    });
    expect(prompt).toContain("Your Task: First Meeting");
    expect(prompt).not.toContain("Your Task: Front Door Advisor");
    expect(prompt).not.toContain("REFLECT & PROPOSE");
  });

  it("explicitly forbids funnel advancement flags in interview mode", async () => {
    const { buildFrontDoorPrompt } = await import("./network-chat-prompt");
    const prompt = buildFrontDoorPrompt("front-door", undefined, undefined, undefined, {
      personaId: "alex",
      promptMode: "interview",
    });
    expect(prompt).toContain("requestName=false");
    expect(prompt).toContain("requestEmail=false");
    expect(prompt).toContain("done=false");
    expect(prompt).toContain("detectedMode=null");
  });
});

describe("persona-voice dispatcher", () => {
  it("returns distinct chat voice specs for each persona", async () => {
    const { getPersonaChatVoice } = await import("./persona-voice");
    const alex = getPersonaChatVoice("alex");
    const mira = getPersonaChatVoice("mira");
    expect(alex).not.toEqual(mira);
    expect(alex).toContain("Australian");
    expect(mira).toContain("British");
  });

  it("returns distinct email prompts for each persona", async () => {
    const { getPersonaEmailPrompt } = await import("./persona-voice");
    const alex = getPersonaEmailPrompt("alex");
    const mira = getPersonaEmailPrompt("mira");
    expect(alex).not.toEqual(mira);
    expect(alex).toContain('Sign off as "— Alex"');
    expect(mira).toContain('Sign off as "— Mira"');
  });

  it("falls back to Alex when personaId is null/undefined (back-compat)", async () => {
    const { getPersonaEmailPrompt } = await import("./persona-voice");
    const fallbackNull = getPersonaEmailPrompt(null);
    const fallbackUndef = getPersonaEmailPrompt(undefined);
    const alex = getPersonaEmailPrompt("alex");
    expect(fallbackNull).toEqual(alex);
    expect(fallbackUndef).toEqual(alex);
  });
});
