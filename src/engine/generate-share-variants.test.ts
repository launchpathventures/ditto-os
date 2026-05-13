import { describe, expect, it } from "vitest";
import type { NetworkProfileCardBlock } from "./content-blocks";
import {
  GENERATE_SHARE_VARIANTS_TOOL_NAME,
  SHARE_BUDGET_LANGUAGE_PATTERN,
  generateShareVariants,
} from "./generate-share-variants";
import { buildFrontDoorPrompt } from "./network-chat-prompt";
import { isBuiltInTool } from "./tool-resolver";

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

describe("generateShareVariants", () => {
  it("rejects missing stepRunId outside test mode", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    await expect(generateShareVariants({ card: card(), completion: completionWith("{}") })).rejects.toThrow("generate_share_variants requires stepRunId");
    if (previous === undefined) delete process.env.DITTO_TEST_MODE;
    else process.env.DITTO_TEST_MODE = previous;
  });

  it("returns three non-empty variants ending in the canonical URL", async () => {
    const result = await generateShareVariants({
      stepRunId: "network-lane-step:share",
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

  it("strips budget language from generated text", async () => {
    const result = await generateShareVariants({
      stepRunId: "network-lane-step:share",
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
    let prompt = "";
    await generateShareVariants({
      stepRunId: "network-lane-step:share",
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
  });

  it("keeps tool name parity between prompt directive and resolver", () => {
    const prompt = buildFrontDoorPrompt("expert", undefined, undefined, "text", { omitTemporal: true });
    expect(prompt).toContain(`\`${GENERATE_SHARE_VARIANTS_TOOL_NAME}\``);
    expect(isBuiltInTool(GENERATE_SHARE_VARIANTS_TOOL_NAME)).toBe(true);
  });
});
