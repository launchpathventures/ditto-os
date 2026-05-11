import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  withNetworkDbTransaction,
  type NetworkDbTransaction,
} from "../db/network-db-test-helpers";
import * as networkSchema from "@ditto/core/db/network";
import type { JobRequestCardBlock, NetworkProfileCardBlock } from "./content-blocks";
import { createCompletion } from "./llm";
import { matchOnNetwork } from "./network-match";

vi.mock("./llm", () => ({
  createCompletion: vi.fn(),
  extractText: (content: Array<{ type: string; text?: string }>) =>
    content.flatMap((block) => block.type === "text" ? [block.text ?? ""] : []).join(""),
  extractToolUse: (content: Array<Record<string, unknown>>) =>
    content.filter((block) => block.type === "tool_use"),
}));

const mockedCreateCompletion = vi.mocked(createCompletion);

function net(fn: (tx: NetworkDbTransaction) => Promise<void>): () => Promise<void> {
  return () => withNetworkDbTransaction(fn);
}

function profile(handle: string, overrides: Partial<NetworkProfileCardBlock> = {}): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle,
    name: `Candidate ${handle}`,
    portraitUrl: null,
    cityLabel: null,
    oneLineRole: "GTM operator who can build outbound and touch the CRM",
    signalDots: [],
    badges: [{ label: "Outbound", color: "mint" }],
    narrativeMd: "Built outbound systems and cleaned up revenue operations.",
    antiPersonaMd: null,
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-10T00:00:00.000Z",
    visibility: "public",
    shareUrl: `https://ditto.partners/people/${handle}`,
    ogImageUrl: `https://ditto.partners/people/${handle}/opengraph-image`,
    ...overrides,
  };
}

function job(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound with someone who can touch the CRM",
    referenceShape: "A contractor previously built sequences and fixed HubSpot.",
    antiPersonaMd: "pure copywriter",
    successCriteria: "5 booked discovery calls per week by day 30",
    budgetShape: {
      ballpark: "$8-12k/month",
      cadence: "monthly",
    },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

function llmCandidates(candidates: Array<{
  handle: string;
  rationaleMd?: string;
  fitConfidence?: string;
}>) {
  mockedCreateCompletion.mockResolvedValueOnce({
    content: [
      {
        type: "tool_use",
        id: "match-1",
        name: "network_match_result",
        input: {
          candidates: candidates.map((candidate) => ({
            rationaleMd: `${candidate.handle} matches the requested shape.`,
            fitConfidence: "high",
            ...candidate,
          })),
        },
      },
    ],
    tokensUsed: 10,
    costCents: 1,
    stopReason: "tool_use",
    model: "mock",
  });
}

function lastPromptPayload(): { candidates: Array<{ handle: string }> } {
  const request = mockedCreateCompletion.mock.calls.at(-1)?.[0];
  const content = request?.messages[0]?.content;
  if (typeof content !== "string") throw new Error("missing prompt payload");
  return JSON.parse(content) as { candidates: Array<{ handle: string }> };
}

beforeEach(() => {
  mockedCreateCompletion.mockReset();
});

describe("matchOnNetwork", () => {
  it("excludes wantsVisibility=false users from prompt and results", net(async (tx) => {
    await tx.insert(networkSchema.networkUsers).values([
      {
        email: "visible@example.com",
        name: "Visible Candidate",
        handle: "visible",
        wantsVisibility: true,
        card: profile("visible"),
      },
      {
        email: "hidden@example.com",
        name: "Hidden Candidate",
        handle: "hidden",
        wantsVisibility: false,
        card: profile("hidden"),
      },
    ]);
    llmCandidates([
      { handle: "hidden" },
      { handle: "visible", fitConfidence: "medium" },
    ]);

    const result = await matchOnNetwork(job({ antiPersonaMd: "strategy deck" }), {
      sampleLimit: 200,
      db: tx,
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    expect(lastPromptPayload().candidates.map((candidate) => candidate.handle)).toEqual(["visible"]);
    expect(result.map((candidate) => candidate.handle)).toEqual(["visible"]);
    expect(result[0]).toMatchObject({
      fitConfidence: "medium",
      computedAt: "2026-05-10T12:00:00.000Z",
      source: "on-network",
    });
  }));

  it("honors anti-persona silently by excluding matching candidates", net(async (tx) => {
    await tx.insert(networkSchema.networkUsers).values([
      {
        email: "operator@example.com",
        name: "Operator",
        handle: "operator",
        wantsVisibility: true,
        card: profile("operator"),
      },
      {
        email: "copywriter@example.com",
        name: "Copywriter",
        handle: "copywriter",
        wantsVisibility: true,
        card: profile("copywriter", {
          oneLineRole: "Pure copywriter for landing pages",
          narrativeMd: "Writes copy and does not touch CRM systems.",
        }),
      },
    ]);
    llmCandidates([
      { handle: "copywriter", rationaleMd: "Pure copywriter." },
      { handle: "operator", rationaleMd: "Mira: Has the CRM-touch shape you described." },
    ]);

    const result = await matchOnNetwork(job({ antiPersonaMd: "pure copywriter" }), {
      sampleLimit: 200,
      db: tx,
    });

    expect(lastPromptPayload().candidates.map((candidate) => candidate.handle)).toEqual(["operator"]);
    expect(result.map((candidate) => candidate.handle)).toEqual(["operator"]);
    expect(result[0]?.rationaleMd).not.toMatch(/pure copywriter/i);
  }));

  it("caps returned candidates at five and normalizes fitConfidence", net(async (tx) => {
    await tx.insert(networkSchema.networkUsers).values(
      Array.from({ length: 6 }, (_, index) => ({
        email: `candidate-${index}@example.com`,
        name: `Candidate ${index}`,
        handle: `candidate-${index}`,
        wantsVisibility: true,
        card: profile(`candidate-${index}`),
      })),
    );
    llmCandidates([
      { handle: "candidate-0", fitConfidence: "high" },
      { handle: "candidate-1", fitConfidence: "medium" },
      { handle: "candidate-2", fitConfidence: "low" },
      { handle: "candidate-3", fitConfidence: "invalid" },
      { handle: "candidate-4", fitConfidence: "high" },
      { handle: "candidate-5", fitConfidence: "high" },
    ]);

    const result = await matchOnNetwork(job({ antiPersonaMd: "strategy deck" }), {
      sampleLimit: 200,
      db: tx,
    });

    expect(result).toHaveLength(5);
    expect(result.map((candidate) => candidate.fitConfidence)).toEqual([
      "high",
      "medium",
      "low",
      "medium",
      "high",
    ]);
  }));

  it("samples the 200 most recently updated listed Selfs", net(async (tx) => {
    const base = new Date("2026-05-10T00:00:00.000Z").getTime();
    await tx.insert(networkSchema.networkUsers).values(
      Array.from({ length: 250 }, (_, index) => ({
        email: `sample-${index}@example.com`,
        name: `Sample ${index}`,
        handle: `sample-${index}`,
        wantsVisibility: true,
        card: profile(`sample-${index}`),
        updatedAt: new Date(base + index * 1000),
      })),
    );
    llmCandidates([
      { handle: "sample-49" },
      { handle: "sample-50" },
      { handle: "sample-249" },
    ]);

    const result = await matchOnNetwork(job({ antiPersonaMd: "strategy deck" }), {
      sampleLimit: 500,
      db: tx,
    });
    const handles = lastPromptPayload().candidates.map((candidate) => candidate.handle);

    expect(handles).toHaveLength(200);
    expect(handles).toContain("sample-249");
    expect(handles).toContain("sample-50");
    expect(handles).not.toContain("sample-49");
    expect(result.map((candidate) => candidate.handle)).toEqual(["sample-50", "sample-249"]);
  }));

  it("returns [] without calling the LLM when there are no visible candidates", net(async (tx) => {
    await tx.insert(networkSchema.networkUsers).values({
      email: "hidden@example.com",
      name: "Hidden Candidate",
      handle: "hidden",
      wantsVisibility: false,
      card: profile("hidden"),
    });

    const result = await matchOnNetwork(job(), {
      sampleLimit: 200,
      db: tx,
    });

    expect(result).toEqual([]);
    expect(mockedCreateCompletion).not.toHaveBeenCalled();
  }));
});
