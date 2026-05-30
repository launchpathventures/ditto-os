import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { NetworkProfileCardBlock } from "./content-blocks";
import {
  GENERATE_SHARE_VARIANTS_TOOL_NAME,
  SHARE_BUDGET_LANGUAGE_PATTERN,
  generateShareVariants,
} from "./generate-share-variants";
import { buildFrontDoorPrompt } from "./network-chat-prompt";
import { createNetworkLaneStepRun } from "./network-step-run";
import { isBuiltInTool } from "./tool-resolver";

const NOW = new Date("2026-05-18T00:00:00.000Z");

function card(overrides: Partial<NetworkProfileCardBlock> = {}): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "operator for founder-led B2B teams",
    signalDots: [{ id: "value", label: "Value", filled: true, color: "canary" }],
    badges: [{ label: "RevOps", color: "canary" }],
    narrativeMd: "I *untangle* sales motion for practical founders.",
    antiPersonaMd: "pure copywriting briefs",
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-13T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/people/timhgreen",
    ogImageUrl: "https://ditto.partners/people/timhgreen/opengraph-image",
    ...overrides,
  };
}

function completionWith(text: string) {
  return async () => ({
    content: [{ type: "text" as const, text }],
    tokensUsed: 10,
    costCents: 1,
    stopReason: "end_turn",
    model: "test",
  });
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "generate-share-variants-"));
}

async function stepRun(): Promise<{ rootDir: string; stepRunId: string }> {
  const rootDir = await tempRoot();
  const stepRunId = await createNetworkLaneStepRun({
    route: "network-share-test",
    rootDir,
    now: NOW,
  });
  return { rootDir, stepRunId };
}

describe("generateShareVariants", () => {
  it("rejects missing stepRunId outside test mode", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    await expect(generateShareVariants({ card: card(), completion: completionWith("{}") })).rejects.toThrow("server-minted network-lane stepRunId");
    if (previous === undefined) delete process.env.DITTO_TEST_MODE;
    else process.env.DITTO_TEST_MODE = previous;
  });

  it("returns three non-empty variants ending in the canonical URL", async () => {
    const run = await stepRun();
    const result = await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      completion: completionWith(JSON.stringify({
        quiet: "Tim is precise with RevOps. https://ditto.partners/people/timhgreen",
        loud: "Founders with messy sales systems should meet Tim. https://ditto.partners/people/timhgreen",
        ask: "Who needs a practical RevOps operator? https://ditto.partners/people/timhgreen",
      })),
    });
    expect(Object.keys(result).sort()).toEqual(["ask", "loud", "quiet"]);
    for (const value of Object.values(result)) {
      expect(value.length).toBeGreaterThan(10);
      expect(value.endsWith("https://ditto.partners/people/timhgreen")).toBe(true);
    }
  });

  it("rejects fabricated network-lane stepRunIds before invoking the completion", async () => {
    const rootDir = await tempRoot();
    const completion = vi.fn(completionWith("{}"));

    await expect(
      generateShareVariants({
        rootDir,
        stepRunId: `network-lane-step:share:${randomUUID()}`,
        card: card(),
        completion,
      }),
    ).rejects.toThrow("server-minted network-lane stepRunId");

    expect(completion).not.toHaveBeenCalled();
  });

  it("strips budget language from generated text", async () => {
    const run = await stepRun();
    const result = await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      completion: completionWith(JSON.stringify({
        quiet: "Tim charges $500 hourly. https://ditto.partners/people/timhgreen",
        loud: "Tim is good for a monthly budget. https://ditto.partners/people/timhgreen",
        ask: "Who has the rate for Tim? https://ditto.partners/people/timhgreen",
      })),
    });
    expect(Object.values(result).join("\n")).not.toMatch(SHARE_BUDGET_LANGUAGE_PATTERN);
  });

  it("passes only public KB facts into the prompt", async () => {
    const run = await stepRun();
    let prompt = "";
    await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      kb: [
        { factMd: "Public case study fact.", visibility: "public", status: "active" },
        { factMd: "On-request customer name.", visibility: "on-request", status: "active" },
        { factMd: "Owner-only private fact.", visibility: "off", status: "active" },
      ],
      completion: async (request) => {
        prompt = JSON.stringify(request.messages);
        return completionWith(JSON.stringify({
          quiet: "Public case study fact. https://ditto.partners/people/timhgreen",
          loud: "Public case study fact. https://ditto.partners/people/timhgreen",
          ask: "Public case study fact. https://ditto.partners/people/timhgreen",
        }))();
      },
    });
    expect(prompt).toContain("Public case study fact.");
    expect(prompt).not.toContain("On-request customer name.");
    expect(prompt).not.toContain("Owner-only private fact.");
    expect(prompt).not.toContain("pure copywriting briefs");
  });

  it("keeps tool name parity between prompt directive and resolver", () => {
    const prompt = buildFrontDoorPrompt("expert", undefined, undefined, "text", { omitTemporal: true });
    expect(prompt).toContain(`\`${GENERATE_SHARE_VARIANTS_TOOL_NAME}\``);
    expect(isBuiltInTool(GENERATE_SHARE_VARIANTS_TOOL_NAME)).toBe(true);
  });

  it("defaults to linkedin when channel is omitted (Brief 260 back-compat)", async () => {
    const run = await stepRun();
    const result = await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      completion: completionWith(JSON.stringify({
        quiet: "Tim is precise. https://ditto.partners/people/timhgreen",
        loud: "Founders should meet Tim. https://ditto.partners/people/timhgreen",
        ask: "Who needs Tim? https://ditto.partners/people/timhgreen",
      })),
    });
    expect(Object.keys(result).sort()).toEqual(["ask", "loud", "quiet"]);
  });

  it("short-circuits website-badge to fixed text with no LLM call", async () => {
    const run = await stepRun();
    const completion = vi.fn(completionWith("{}"));
    const result = await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      channel: "website-badge",
      completion,
    });
    expect(completion).not.toHaveBeenCalled();
    expect(result.quiet).toBe(result.loud);
    expect(result.loud).toBe(result.ask);
    expect(result.quiet).toBe("Available through Ditto https://ditto.partners/people/timhgreen");
  });

  it("caps X variants to 280 chars including the trailing URL", async () => {
    const run = await stepRun();
    const long = `${"signal ".repeat(80)}https://ditto.partners/people/timhgreen`;
    const result = await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      channel: "x",
      completion: completionWith(JSON.stringify({ quiet: long, loud: long, ask: long })),
    });
    for (const value of Object.values(result)) {
      expect(value.length).toBeLessThanOrEqual(280);
      expect(value.endsWith("https://ditto.partners/people/timhgreen")).toBe(true);
    }
  });

  it("collapses instagram and email-signature variants to a single line", async () => {
    const run = await stepRun();
    for (const channel of ["instagram", "email-signature"] as const) {
      const result = await generateShareVariants({
        rootDir: run.rootDir,
        stepRunId: run.stepRunId,
        card: card(),
        channel,
        completion: completionWith(JSON.stringify({
          quiet: "Line one.\nLine two.\nhttps://ditto.partners/people/timhgreen",
          loud: "Line one.\nLine two.\nhttps://ditto.partners/people/timhgreen",
          ask: "Line one.\nLine two.\nhttps://ditto.partners/people/timhgreen",
        })),
      });
      for (const value of Object.values(result)) {
        expect(value).not.toContain("\n");
        expect(value.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it("rejects budget language on a non-default channel", async () => {
    const run = await stepRun();
    const result = await generateShareVariants({
      rootDir: run.rootDir,
      stepRunId: run.stepRunId,
      card: card(),
      channel: "x",
      completion: completionWith(JSON.stringify({
        quiet: "Tim charges $500 hourly. https://ditto.partners/people/timhgreen",
        loud: "Tim has a monthly budget. https://ditto.partners/people/timhgreen",
        ask: "Who has the rate? https://ditto.partners/people/timhgreen",
      })),
    });
    expect(Object.values(result).join("\n")).not.toMatch(SHARE_BUDGET_LANGUAGE_PATTERN);
  });
});
